/**
 * useCall.ts — Voice/video call signaling hook for PawMatch (W2).
 *
 * Signaling runs over Supabase Realtime broadcast channels named
 * `call:<conversationId>`. NO database writes are made here; this hook is
 * deliberately separate from the chat-message flows so it cannot disturb
 * messaging stability.
 *
 * Ring-anywhere (CallContext round): the caller ALSO publishes the invite on
 * the callee's personal broadcast channel `user:<calleeId>` (event
 * `user-invite`), so one App-level machine receives the invite on ANY screen —
 * no per-conversation subscription needed to start ringing. Invites carry an
 * `inviteId` so the same invite arriving on both channels is processed once
 * (no spurious 'busy').
 *
 * One active call max per hook instance. Only the original caller ever
 * writes a calllog attachment (via the `onCallLog` callback, which App
 * routes into onSendMessage); busy / no-answer-timeout-on-callee produce
 * no logs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { Conversation, MessageAttachment } from '../types';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'in-call';
export type CallKind = 'audio' | 'video';

export interface CallState {
  phase: CallPhase;
  callType: CallKind | null;
  peerId: string | null;
  peerName: string;
  /** Carried from the invite payload; the overlay renders initials (unchanged). */
  peerAvatar: string | null;
  conversationId: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  /** Seconds elapsed: ring time while outgoing, talk time once in-call.
   *  Maintained in a ref (no re-render); CallOverlay runs its own 1s display
   *  timer so an App-level provider never re-renders once per second. */
  seconds: number;
  error: string | null;
}

export interface UseCallParams {
  currentUser: { id: string; name: string; avatar?: string };
  conversations: Conversation[];
  onCallLog: (conversationId: string, attachment: MessageAttachment) => void;
  /**
   * Test seam. Production callers omit it and the module-level Supabase
   * client is used (identical behavior to before).
   */
  overrides?: {
    /** Realtime client to use instead of the shared one (null = local/offline). */
    client?: SupabaseClient | null;
    /** No-answer timeout override (default 30_000). */
    noAnswerTimeoutMs?: number;
  };
}

export type StartCallResult = 'started' | 'unavailable' | 'busy-local';

type SignalEvent =
  | 'invite'
  | 'accept'
  | 'offer'
  | 'answer'
  | 'ice'
  | 'reject'
  | 'busy'
  | 'end';

interface SignalPayload {
  event: SignalEvent;
  to: string;
  fromId: string;
  fromName: string;
  fromAvatar?: string;
  convId: string;
  callType?: CallKind;
  /** Ring-anywhere dedupe: same invite arriving on `call:` and `user:` channels. */
  inviteId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * Payload published on the callee's personal channel `user:<calleeId>`
 * (broadcast event `user-invite`) so the invite rings on ANY screen.
 */
export interface UserInvitePayload {
  fromId: string;
  fromName: string;
  fromAvatar?: string;
  conversationId: string;
  callType: CallKind;
  inviteId: string;
}

const NO_ANSWER_TIMEOUT_MS = 30_000;
/** How long a 'disconnected' state may persist before we attempt an ICE restart. */
const DISCONNECT_GRACE_MS = 5_000;

/**
 * STUN is not enough on its own: behind carrier-grade / symmetric NAT —
 * common on Bangladeshi mobile networks — STUN-only ICE cannot find a
 * peer-to-peer path, so signaling (ring/accept) works but media stays
 * silent. The Open Relay entries below are free community TURN relays
 * (no account needed); when a direct path fails, media is relayed through
 * them. Demo-grade: a production deployment should use dedicated TURN
 * credentials (e.g. its own coturn or a paid allocation).
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

const MEDIA_UNAVAILABLE_ERROR =
  'Microphone/camera unavailable — you can send a voice message instead.';

const IDLE_CALL: CallState = {
  phase: 'idle',
  callType: null,
  peerId: null,
  peerName: '',
  peerAvatar: null,
  conversationId: null,
  localStream: null,
  remoteStream: null,
  muted: false,
  cameraOff: false,
  seconds: 0,
  error: null,
};

function makeInviteId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the fallback */
  }
  return `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function stopTracks(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* already stopped */
    }
  }
}

export function useCall({ currentUser, conversations, onCallLog, overrides }: UseCallParams) {
  const [call, setCall] = useState<CallState>(IDLE_CALL);

  // Which realtime client drives signaling. Defaults to the module-level
  // shared client; tests may inject a mock (or null for offline).
  const liveClient = overrides?.client !== undefined ? overrides.client : supabase;
  const live = liveClient != null;
  const noAnswerMs = overrides?.noAnswerTimeoutMs ?? NO_ANSWER_TIMEOUT_MS;

  // Refs mirror everything the async/signaling closures need, so handlers
  // never read stale render state.
  const stateRef = useRef<CallState>(IDLE_CALL);
  const currentUserRef = useRef(currentUser);
  const conversationsRef = useRef<Conversation[]>(conversations);
  const onCallLogRef = useRef(onCallLog);
  const liveClientRef = useRef(liveClient);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  /** Outbound `user:<peerId>` channels (lazy, one per callee). */
  const userChannelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const inboxChannelRef = useRef<RealtimeChannel | null>(null);
  const noAnswerTimerRef = useRef<number | null>(null);
  const tickerRef = useRef<number | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  /** True while our own accept is acquiring media — guards double-tap Accept. */
  const acceptInFlightRef = useRef(false);
  /** inviteIds already processed — dedupes the dual-channel (call:/user:) invite. */
  const seenInvitesRef = useRef<Set<string>>(new Set());
  /** True when this side placed the call — only the caller writes calllogs. */
  const isCallerRef = useRef(false);
  /**
   * ICE-restart hardening: at most ONE pc.restartIce() per peer connection
   * (reset when a new PC is created). A second 'failed' therefore surfaces
   * the failure instead of looping forever.
   */
  const iceRestartedRef = useRef(false);
  /** Grace timer for transient 'disconnected' states before we treat them as failure. */
  const disconnectGraceRef = useRef<number | null>(null);

  currentUserRef.current = currentUser;
  conversationsRef.current = conversations;
  onCallLogRef.current = onCallLog;
  liveClientRef.current = liveClient;

  const patch = useCallback((p: Partial<CallState>) => {
    stateRef.current = { ...stateRef.current, ...p };
    setCall(stateRef.current);
  }, []);

  const setLocalStream = useCallback(
    (stream: MediaStream | null) => {
      localStreamRef.current = stream;
      patch({ localStream: stream });
    },
    [patch],
  );

  const setRemoteStream = useCallback(
    (stream: MediaStream | null) => {
      remoteStreamRef.current = stream;
      patch({ remoteStream: stream });
    },
    [patch],
  );

  const clearNoAnswerTimer = useCallback(() => {
    if (noAnswerTimerRef.current !== null) {
      window.clearTimeout(noAnswerTimerRef.current);
      noAnswerTimerRef.current = null;
    }
  }, []);

  /** Cancel a pending 'disconnected' grace period (healthy again or torn down). */
  const clearDisconnectGrace = useCallback(() => {
    if (disconnectGraceRef.current !== null) {
      window.clearTimeout(disconnectGraceRef.current);
      disconnectGraceRef.current = null;
    }
  }, []);

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const startTicker = useCallback(() => {
    stopTicker();
    // SILENT ticker: bumps stateRef.seconds for calllog duration + DEV diag,
    // but never setCall. The overlay runs its own 1s display timer, so an
    // App-level provider is not re-rendered once per second during a call.
    tickerRef.current = window.setInterval(() => {
      stateRef.current = { ...stateRef.current, seconds: stateRef.current.seconds + 1 };
    }, 1000);
  }, [stopTicker]);

  const sendSignal = useCallback((convId: string, payload: SignalPayload) => {
    const ch = channelsRef.current.get(convId);
    if (!ch) return;
    void ch.send({ type: 'broadcast', event: 'signal', payload });
  }, []);

  const basePayload = useCallback(
    (convId: string, to: string, event: SignalEvent): SignalPayload => {
      const me = currentUserRef.current;
      return { event, to, fromId: me.id, fromName: me.name, fromAvatar: me.avatar, convId };
    },
    [],
  );

  /**
   * Lazy outbound channel for a peer's personal inbox `user:<peerId>`.
   * Kept open for the hook's lifetime; removed on unmount.
   */
  const getUserChannel = useCallback(
    async (userId: string): Promise<RealtimeChannel | null> => {
      const client = liveClientRef.current;
      if (!client) return null;
      const key = `user:${userId}`;
      let ch = userChannelsRef.current.get(key);
      if (!ch) {
        ch = client.channel(key, { config: { broadcast: { self: false } } });
        userChannelsRef.current.set(key, ch);
        try {
          await ch.subscribe();
        } catch {
          /* best effort — the call:<conv> invite is authoritative */
        }
      }
      return ch;
    },
    [],
  );

  /**
   * Ring-anywhere invite: best-effort publish on the callee's personal
   * channel. Failure is silent — the `call:<conv>` invite still rings
   * wherever that conversation channel is subscribed.
   */
  const sendUserInvite = useCallback(
    async (peerId: string, payload: UserInvitePayload): Promise<void> => {
      try {
        const ch = await getUserChannel(peerId);
        if (!ch) return;
        await ch.send({ type: 'broadcast', event: 'user-invite', payload });
      } catch {
        /* best effort */
      }
    },
    [getUserChannel],
  );

  const writeLog = useCallback(
    (conversationId: string, attachment: MessageAttachment) => {
      onCallLogRef.current(conversationId, attachment);
    },
    [],
  );

  /** Full media/pc/timer teardown. Does NOT touch the `call` state itself. */
  const teardown = useCallback(() => {
    clearNoAnswerTimer();
    stopTicker();
    clearDisconnectGrace();
    iceRestartedRef.current = false;
    acceptInFlightRef.current = false;
    pendingIceRef.current = [];
    stopTracks(localStreamRef.current);
    localStreamRef.current = null;
    // Remote tracks belong to the peer; closing the PC releases them.
    remoteStreamRef.current = null;
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        /* already closed */
      }
      pcRef.current = null;
    }
  }, [clearNoAnswerTimer, clearDisconnectGrace, stopTicker]);

  const resetCall = useCallback(
    (error: string | null = null) => {
      patch({
        ...IDLE_CALL,
        error,
      });
    },
    [patch],
  );

  // ---- internal end (shared by public endCall + failure paths) ----
  const doEnd = useCallback(
    (preserveError: string | null) => {
      const st = stateRef.current;
      if (st.phase === 'idle' && !st.error && !preserveError) return;
      const wasInCall = st.phase === 'in-call';
      const wasCaller = isCallerRef.current;
      const { peerId, conversationId, callType, seconds } = st;
      // Callee declining an unanswered incoming invite → send 'reject',
      // not 'end' (so the caller logs 'declined', not 'completed').
      if (peerId && conversationId) {
        if (st.phase === 'incoming') {
          sendSignal(conversationId, basePayload(conversationId, peerId, 'reject'));
        } else if (st.phase === 'outgoing' || wasInCall) {
          sendSignal(conversationId, basePayload(conversationId, peerId, 'end'));
        }
      }
      // Only the original caller writes a calllog, and only for a call
      // that was actually answered (completed).
      if (wasInCall && wasCaller && conversationId) {
        writeLog(conversationId, {
          kind: 'calllog',
          callType: callType ?? 'audio',
          outcome: 'completed',
          durationSec: seconds,
        });
      }
      isCallerRef.current = false;
      teardown();
      resetCall(preserveError);
    },
    [basePayload, resetCall, sendSignal, teardown, writeLog],
  );

  const flushPendingIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || pendingIceRef.current.length === 0) return;
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const c of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* stale candidate */
      }
    }
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string, convId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      // One ICE restart is allowed per peer connection; a fresh PC resets it.
      iceRestartedRef.current = false;

      /**
       * One-shot ICE restart for a struggling connection: restarts ICE
       * gathering on the SAME peer connection and, for the caller, sends a
       * fresh offer so both sides renegotiate through a (usually
       * TURN-relayed) path. Returns false when a restart was already
       * attempted — the caller then surfaces the failure instead of looping.
       */
      const attemptIceRestart = (): boolean => {
        if (iceRestartedRef.current || pcRef.current !== pc) return false;
        iceRestartedRef.current = true;
        try {
          pc.restartIce();
        } catch {
          return false;
        }
        if (isCallerRef.current) {
          const st = stateRef.current;
          if (st.peerId && st.conversationId) {
            const { peerId: pId, conversationId: cId } = st;
            void (async () => {
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendSignal(cId, {
                  ...basePayload(cId, pId, 'offer'),
                  sdp: offer,
                });
              } catch {
                doEnd('Connection lost — the call has ended.');
              }
            })();
          }
        }
        return true;
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(convId, {
            ...basePayload(convId, peerId, 'ice'),
            candidate: e.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = (e) => {
        // Most browsers populate e.streams[0] for addTrack(track, stream);
        // the fallback covers track events that arrive without a stream
        // (seen on some mobile browsers) so the remote view never stays
        // black despite a connected call.
        const stream = e.streams[0] ?? (e.track ? new MediaStream([e.track]) : null);
        if (stream) setRemoteStream(stream);
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          // Healthy (or recovered) — cancel any pending disconnect grace.
          clearDisconnectGrace();
          return;
        }
        if (state === 'failed') {
          if (!attemptIceRestart()) {
            // Restart already tried (or the PC is stale) — surface it.
            doEnd('Connection lost — the call has ended.');
          }
          return;
        }
        if (state === 'disconnected') {
          // Brief blips are normal while ICE re-checks; act only if the
          // connection stays down past a short grace period.
          clearDisconnectGrace();
          disconnectGraceRef.current = window.setTimeout(() => {
            disconnectGraceRef.current = null;
            if (
              pcRef.current === pc &&
              (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')
            ) {
              if (!attemptIceRestart()) {
                doEnd('Connection lost — the call has ended.');
              }
            }
          }, DISCONNECT_GRACE_MS);
          return;
        }
        // 'new' / 'connecting' / 'closed': nothing to do here.
      };
      return pc;
    },
    [basePayload, clearDisconnectGrace, doEnd, sendSignal, setRemoteStream],
  );

  const acquireMedia = useCallback(async (kind: CallKind): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('media devices unavailable');
    }
    const constraints: MediaStreamConstraints =
      kind === 'video'
        ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { audio: true, video: false };
    return navigator.mediaDevices.getUserMedia(constraints);
  }, []);

  // ---- caller: no answer within 30s ----
  const handleNoAnswer = useCallback(() => {
    const st = stateRef.current;
    if (st.phase !== 'outgoing' || !st.conversationId || !st.peerId) return;
    // Tell the callee to clear their incoming overlay.
    sendSignal(st.conversationId, basePayload(st.conversationId, st.peerId, 'end'));
    writeLog(st.conversationId, {
      kind: 'calllog',
      callType: st.callType ?? 'audio',
      outcome: 'missed',
    });
    isCallerRef.current = false;
    teardown();
    resetCall(`No answer from ${st.peerName || 'them'}.`);
  }, [basePayload, resetCall, sendSignal, teardown, writeLog]);

  // ---- caller: accept received → create offer ----
  const setupCaller = useCallback(
    async (p: SignalPayload) => {
      const st = stateRef.current;
      const stream = localStreamRef.current;
      if (!stream || !st.peerId || !st.conversationId) return;
      try {
        const pc = createPeerConnection(st.peerId, st.conversationId);
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(st.conversationId, {
          ...basePayload(st.conversationId, st.peerId, 'offer'),
          sdp: offer,
        });
      } catch {
        doEnd('Could not start the call — please try again.');
      }
    },
    [basePayload, createPeerConnection, doEnd, sendSignal],
  );

  /**
   * Callee side of an ICE-restart re-offer: the caller re-offers on the SAME
   * peer connection, so the re-offer is answered on that live PC instead of
   * building a fresh one (which would drop the restarted ICE gathering).
   */
  const handleReoffer = useCallback(
    async (sdp: RTCSessionDescriptionInit) => {
      const pc = pcRef.current;
      const st = stateRef.current;
      if (!pc || !st.peerId || !st.conversationId) return;
      try {
        await pc.setRemoteDescription(sdp);
        await flushPendingIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(st.conversationId, {
          ...basePayload(st.conversationId, st.peerId, 'answer'),
          sdp: answer,
        });
      } catch {
        doEnd('Connection lost — the call has ended.');
      }
    },
    [basePayload, doEnd, flushPendingIce, sendSignal],
  );

  // ---- callee: offer received → create answer ----
  const setupCallee = useCallback(
    async (p: SignalPayload) => {
      const st = stateRef.current;
      if (!p.sdp || !st.peerId || !st.conversationId) return;
      const stream = localStreamRef.current; // acquired in acceptCall
      try {
        const pc = createPeerConnection(st.peerId, st.conversationId);
        await pc.setRemoteDescription(p.sdp);
        await flushPendingIce();
        if (stream) {
          for (const track of stream.getTracks()) pc.addTrack(track, stream);
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(st.conversationId, {
          ...basePayload(st.conversationId, st.peerId, 'answer'),
          sdp: answer,
        });
        // Talk time starts now for the callee.
        patch({ phase: 'in-call', seconds: 0 });
        startTicker();
      } catch {
        doEnd('Could not start the call — please try again.');
      }
    },
    [basePayload, createPeerConnection, doEnd, flushPendingIce, patch, sendSignal, startTicker],
  );

  // ================= signaling dispatch =================
  const handleSignal = useCallback(
    (p: SignalPayload) => {
      const me = currentUserRef.current;
      if (!p || typeof p !== 'object') return;
      // 1) Must be addressed to me; ignore own echoes and anything else.
      if (p.to !== me.id || p.fromId === me.id) return;
      // 2) Sanity: sender must be the OTHER participant of this conversation.
      const conv = conversationsRef.current.find((c) => c.id === p.convId);
      if (!conv || !conv.participantIds.includes(p.fromId)) return;

      const st = stateRef.current;

      switch (p.event) {
        case 'invite': {
          // Dedupe: the same invite arrives on BOTH `call:<conv>` and
          // `user:<me>` — process it once, or the second copy would reply
          // a spurious 'busy' and tear down the caller's fresh invite.
          if (p.inviteId && seenInvitesRef.current.has(p.inviteId)) return;
          if (st.phase !== 'idle') {
            // Already in a call (or ringing) → tell the caller we're busy.
            sendSignal(p.convId, basePayload(p.convId, p.fromId, 'busy'));
            return;
          }
          if (p.inviteId) {
            seenInvitesRef.current.add(p.inviteId);
            // Cap the set — invites are single-use; 50 is plenty of history.
            if (seenInvitesRef.current.size > 50) {
              const oldest = seenInvitesRef.current.values().next().value;
              if (oldest !== undefined) seenInvitesRef.current.delete(oldest);
            }
          }
          isCallerRef.current = false;
          patch({
            phase: 'incoming',
            callType: p.callType ?? 'audio',
            peerId: p.fromId,
            peerName: p.fromName || 'Someone',
            peerAvatar: p.fromAvatar ?? null,
            conversationId: p.convId,
            muted: false,
            cameraOff: false,
            seconds: 0,
            error: null,
            localStream: null,
            remoteStream: null,
          });
          break;
        }
        case 'accept': {
          // Caller side only. The pcRef guard drops a duplicate 'accept'
          // (double-tap / retransmit) that would otherwise build a second
          // peer connection and leak the first call's tracks.
          if (!isCallerRef.current || st.phase !== 'outgoing' || pcRef.current) return;
          if (p.fromId !== st.peerId) return;
          clearNoAnswerTimer();
          void setupCaller(p);
          break;
        }
        case 'offer': {
          // Callee side only.
          if (isCallerRef.current || p.fromId !== st.peerId || !p.sdp) return;
          if ((st.phase === 'incoming' || st.phase === 'in-call') && pcRef.current) {
            // ICE-restart re-offer on the live connection — answer in place.
            void handleReoffer(p.sdp);
            return;
          }
          if (st.phase !== 'incoming') return;
          void setupCallee(p);
          break;
        }
        case 'answer': {
          // Caller side only: the initial answer (phase 'outgoing'), or the
          // re-answer to our ICE-restart re-offer (phase 'in-call').
          if (!isCallerRef.current || p.fromId !== st.peerId || !p.sdp) return;
          const wasOutgoing = st.phase === 'outgoing';
          if (!wasOutgoing && st.phase !== 'in-call') return;
          const pc = pcRef.current;
          if (!pc) return;
          void (async () => {
            try {
              await pc.setRemoteDescription(p.sdp!);
              await flushPendingIce();
              if (wasOutgoing) {
                // Talk time starts now for the caller.
                patch({ phase: 'in-call', seconds: 0 });
                startTicker();
              }
            } catch {
              doEnd('Could not start the call — please try again.');
            }
          })();
          break;
        }
        case 'ice': {
          const pc = pcRef.current;
          if (!pc || !p.candidate || p.fromId !== st.peerId) return;
          if (st.phase !== 'outgoing' && st.phase !== 'in-call' && st.phase !== 'incoming') return;
          if (pc.remoteDescription) {
            void pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
          } else {
            pendingIceRef.current.push(p.candidate);
          }
          break;
        }
        case 'reject': {
          // Caller side: callee declined.
          if (!isCallerRef.current || st.phase !== 'outgoing') return;
          if (p.fromId !== st.peerId || !st.conversationId) return;
          writeLog(st.conversationId, {
            kind: 'calllog',
            callType: st.callType ?? 'audio',
            outcome: 'declined',
          });
          isCallerRef.current = false;
          teardown();
          resetCall();
          break;
        }
        case 'busy': {
          // Caller side: callee is on another call. Transient message, NO log.
          if (!isCallerRef.current || st.phase !== 'outgoing') return;
          if (p.fromId !== st.peerId) return;
          isCallerRef.current = false;
          teardown();
          resetCall(`${st.peerName || 'They'} are on another call right now.`);
          break;
        }
        case 'end': {
          if (p.fromId !== st.peerId) return;
          const wasInCall = st.phase === 'in-call';
          const wasCaller = isCallerRef.current;
          const convId = st.conversationId;
          const callType = st.callType;
          const seconds = st.seconds;
          isCallerRef.current = false;
          teardown();
          // Only the original caller writes a log, and only for answered calls.
          if (wasInCall && wasCaller && convId) {
            writeLog(convId, {
              kind: 'calllog',
              callType: callType ?? 'audio',
              outcome: 'completed',
              durationSec: seconds,
            });
          }
          resetCall();
          break;
        }
        default:
          break;
      }
    },
    [
      basePayload,
      clearNoAnswerTimer,
      doEnd,
      flushPendingIce,
      handleReoffer,
      patch,
      resetCall,
      sendSignal,
      setupCallee,
      setupCaller,
      startTicker,
      teardown,
      writeLog,
    ],
  );

  // ================= channel subscriptions =================
  // One broadcast channel per conversation: `call:<conversationId>`.
  // Kept entirely separate from chat message flows.
  const convKey = conversations.map((c) => c.id).join(',');
  const myId = currentUser.id;
  useEffect(() => {
    if (!live || !liveClient) return;
    const client = liveClient; // keep the non-null narrowing for the cleanup closure
    const subs = new Map<string, RealtimeChannel>();
    for (const conv of conversationsRef.current) {
      const ch = client.channel(`call:${conv.id}`, {
        config: { broadcast: { self: false } },
      });
      ch.on('broadcast', { event: 'signal' }, ({ payload }) => {
        handleSignal(payload as SignalPayload);
      });
      void ch.subscribe();
      subs.set(conv.id, ch);
    }
    channelsRef.current = subs;
    return () => {
      for (const ch of subs.values()) {
        void client.removeChannel(ch);
      }
      subs.clear();
    };
    // Re-subscribe only when the conversation set or the user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convKey, myId, live, liveClient]);

  // Ring-anywhere inbox: personal channel `user:<myId>` carrying invites
  // published by callers (event `user-invite`). This is what lets a call ring
  // on ANY screen — the App-level machine feeds it into the same state
  // machine as the per-conversation channel. Local mode: no-op.
  useEffect(() => {
    if (!live || !liveClient) return;
    if (!myId || myId === 'anon') return;
    const client = liveClient;
    const ch = client.channel(`user:${myId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on('broadcast', { event: 'user-invite' }, ({ payload }) => {
      const p = payload as UserInvitePayload;
      if (!p || typeof p !== 'object' || !p.fromId || !p.conversationId || !p.inviteId) return;
      const me = currentUserRef.current;
      handleSignal({
        event: 'invite',
        to: me.id,
        fromId: p.fromId,
        fromName: p.fromName || 'Someone',
        fromAvatar: p.fromAvatar,
        convId: p.conversationId,
        callType: p.callType === 'video' ? 'video' : 'audio',
        inviteId: p.inviteId,
      });
    });
    void ch.subscribe();
    inboxChannelRef.current = ch;
    return () => {
      inboxChannelRef.current = null;
      void client.removeChannel(ch);
    };
  }, [live, liveClient, myId, handleSignal]);

  // Best-effort 'end' on unmount if a call is somehow still alive.
  useEffect(() => {
    return () => {
      const st = stateRef.current;
      if ((st.phase === 'in-call' || st.phase === 'outgoing') && st.peerId && st.conversationId) {
        sendSignal(st.conversationId, {
          event: 'end',
          to: st.peerId,
          fromId: currentUserRef.current.id,
          fromName: currentUserRef.current.name,
          convId: st.conversationId,
        });
      }
      clearNoAnswerTimer();
      stopTicker();
      stopTracks(localStreamRef.current);
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          /* ignore */
        }
      }
      // Drop the lazy outbound user:<peer> channels (inbox + call channels
      // are removed by their own effects).
      const client = liveClientRef.current;
      for (const ch of userChannelsRef.current.values()) {
        try {
          if (client) void client.removeChannel(ch);
        } catch {
          /* ignore */
        }
      }
      userChannelsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= public API =================
  // All actions are stable useCallbacks depending only on refs/stable
  // callbacks, so an App-level provider can memoize them and avoid
  // re-rendering consumers on every call-state tick.
  const startCall = useCallback(
    (conversationId: string, callType: CallKind): StartCallResult => {
      if (!live) return 'unavailable';
      if (stateRef.current.phase !== 'idle') return 'busy-local';
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conv) {
        patch({ error: 'Conversation not found.' });
        return 'started';
      }
      const me = currentUserRef.current;
      const idx = conv.participantIds.findIndex((id) => id !== me.id);
      const peerId = conv.participantIds[idx] ?? '';
      const peerName = conv.participantNames[idx] ?? 'Unknown';
      // One inviteId for BOTH channels — the callee dedupes on it.
      const inviteId = makeInviteId();
      isCallerRef.current = true;
      patch({
        phase: 'outgoing',
        callType,
        peerId,
        peerName,
        peerAvatar: null,
        conversationId,
        muted: false,
        cameraOff: false,
        seconds: 0,
        error: null,
        localStream: null,
        remoteStream: null,
      });
      startTicker(); // ring-time timer while outgoing
      void acquireMedia(callType)
        .then((stream) => {
          // User may have cancelled while permission was pending.
          if (stateRef.current.phase !== 'outgoing') {
            stopTracks(stream);
            return;
          }
          setLocalStream(stream);
          sendSignal(conversationId, {
            ...basePayload(conversationId, peerId, 'invite'),
            callType,
            inviteId,
          });
          // Ring-anywhere: ALSO publish on the callee's personal channel so
          // the invite reaches them on any screen, not just this conversation.
          void sendUserInvite(peerId, {
            fromId: me.id,
            fromName: me.name,
            fromAvatar: me.avatar,
            conversationId,
            callType,
            inviteId,
          });
          // Exactly one no-answer timer per call; cleared on accept/reject/
          // busy/end. Fires once → a single 'missed' calllog.
          noAnswerTimerRef.current = window.setTimeout(handleNoAnswer, noAnswerMs);
        })
        .catch(() => {
          // Media failure: friendly error, stay in the overlay (never a black
          // screen), no invite sent, nothing sensitive logged.
          teardown();
          isCallerRef.current = false;
          patch({ ...IDLE_CALL, error: MEDIA_UNAVAILABLE_ERROR });
        });
      return 'started';
    },
    [
      live,
      acquireMedia,
      basePayload,
      handleNoAnswer,
      noAnswerMs,
      patch,
      sendSignal,
      sendUserInvite,
      setLocalStream,
      startTicker,
      teardown,
    ],
  );

  const acceptCall = useCallback(() => {
    const st = stateRef.current;
    if (st.phase !== 'incoming' || !st.conversationId || !st.peerId) return;
    // Double-tap guard: a second tap while media is still being acquired
    // would orphan the first stream (mute would silently stop working).
    if (acceptInFlightRef.current) return;
    acceptInFlightRef.current = true;
    const kind = st.callType ?? 'audio';
    void acquireMedia(kind)
      .then((stream) => {
        if (stateRef.current.phase !== 'incoming') {
          stopTracks(stream);
          return;
        }
        setLocalStream(stream);
        // PeerConnection is created when the caller's offer arrives.
        sendSignal(st.conversationId!, basePayload(st.conversationId!, st.peerId!, 'accept'));
      })
      .catch(() => {
        isCallerRef.current = false;
        teardown();
        patch({ ...IDLE_CALL, error: MEDIA_UNAVAILABLE_ERROR });
      })
      .finally(() => {
        acceptInFlightRef.current = false;
      });
  }, [acquireMedia, basePayload, patch, sendSignal, setLocalStream, teardown]);

  const declineCall = useCallback(() => {
    if (stateRef.current.phase !== 'incoming') return;
    doEnd(null); // incoming branch sends 'reject'
  }, [doEnd]);

  const endCall = useCallback(() => {
    doEnd(null);
  }, [doEnd]);

  const toggleMute = useCallback(() => {
    const muted = !stateRef.current.muted;
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    for (const t of tracks) t.enabled = !muted;
    patch({ muted });
  }, [patch]);

  const toggleCamera = useCallback(() => {
    const cameraOff = !stateRef.current.cameraOff;
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    for (const t of tracks) t.enabled = !cameraOff;
    patch({ cameraOff });
  }, [patch]);

  // DEV-ONLY test hook (stripped from production builds by import.meta.env.DEV):
  // lets the headless two-client call test read the live RTCPeerConnection
  // state and track inventories, following the existing __pawInjectReceived
  // pattern in App.tsx. Production builds never define it.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__pawCallDiag = () => ({
      phase: stateRef.current.phase,
      callType: stateRef.current.callType,
      seconds: stateRef.current.seconds,
      connectionState: pcRef.current?.connectionState ?? null,
      signalingState: pcRef.current?.signalingState ?? null,
      iceConnectionState: pcRef.current?.iceConnectionState ?? null,
      localTracks: localStreamRef.current?.getTracks().map((t) => t.kind) ?? [],
      remoteTracks: remoteStreamRef.current?.getTracks().map((t) => t.kind) ?? [],
    });
  }

  return {
    call,
    /** Live mode (a realtime client is present) — the call buttons' gate. */
    canCall: live,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
  };
}
