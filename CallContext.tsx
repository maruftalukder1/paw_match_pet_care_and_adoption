/**
 * CallContext.tsx — App-level single source of truth for calls + presence.
 *
 * ONE useCall instance is mounted here (never per-view), so there is exactly
 * one call state machine and at most one RTCPeerConnection in the whole app.
 * ONE <CallOverlay> is rendered at the App root (fixed overlay — it can never
 * shift the chat pane).
 *
 * Ring-anywhere: the machine subscribes to the user's personal channel
 * `user:<myId>` (see useCall.ts), so an invite rings on ANY screen. Accepting
 * from the overlay navigates to the chat tab and opens the conversation; the
 * per-conversation handshake (offer/answer/ICE on `call:<convId>`) then runs
 * on the already-subscribed channels — no double-subscribe, no missed steps.
 *
 * Presence: one global channel `pawmatch-presence`, tracked per user id while
 * logged in + live mode. Only real presence is ever exposed — never seeded or
 * faked. Local (offline) mode: no tracking, everything reads as offline.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { useCall, type CallKind, type StartCallResult, type CallState } from './useCall';
import type { Conversation, MessageAttachment } from '../types';
import CallOverlay from '../components/CallOverlay';

/** Stable call actions + presence — safe to consume anywhere in the tree. */
export interface CallActions {
  canCall: boolean;
  startCall: (conversationId: string, callType: CallKind) => StartCallResult;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  /** Online user ids from the live presence channel. Empty in local mode. */
  onlineIds: Set<string>;
  /** True when presence tracking is active (logged in + live mode). */
  presenceLive: boolean;
}

const CallContext = createContext<CallActions | null>(null);
const CallStateContext = createContext<CallState | null>(null);

/** Stable actions + presence. Throws outside <CallProvider>. */
export function useCallContext(): CallActions {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCallContext must be used inside <CallProvider>');
  return ctx;
}

/** Live call render-state (changes on phase transitions, never per-second). */
export function useCallState(): CallState {
  const ctx = useContext(CallStateContext);
  if (!ctx) throw new Error('useCallState must be used inside <CallProvider>');
  return ctx;
}

export const PRESENCE_CHANNEL = 'pawmatch-presence';

export interface PresenceInfo {
  onlineIds: Set<string>;
  presenceLive: boolean;
}

/**
 * Tracks this user's presence on the single global channel and exposes the
 * set of online user ids. Cheap by design: one channel, track on login,
 * untrack on logout/unmount (+ best-effort untrack on tab close; the server
 * also expires stale presence via heartbeat, so a missed unload self-heals).
 */
export function usePresence(
  userId: string | null,
  live: boolean,
  client: SupabaseClient | null = supabase,
): PresenceInfo {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!live || !userId || !client) {
      setOnlineIds(new Set());
      return;
    }
    const ch: RealtimeChannel = client.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: userId } },
    });
    const sync = () => {
      const state = ch.presenceState();
      setOnlineIds((prev) => {
        const next = new Set<string>(Object.keys(state));
        if (next.size === prev.size) {
          let same = true;
          for (const id of next) {
            if (!prev.has(id)) {
              same = false;
              break;
            }
          }
          if (same) return prev; // no visible change → no re-render
        }
        return next;
      });
    };
    ch.on('presence', { event: 'sync' }, sync);
    ch.on('presence', { event: 'join' }, sync);
    ch.on('presence', { event: 'leave' }, sync);
    void ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await ch.track({ user_id: userId, online_at: new Date().toISOString() });
        } catch {
          /* presence is best-effort; calls work without it */
        }
      }
    });
    const onUnload = () => {
      try {
        void ch.untrack();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      try {
        void ch.untrack();
      } catch {
        /* ignore */
      }
      void client.removeChannel(ch);
      setOnlineIds(new Set());
    };
  }, [live, userId, client]);

  const presenceLive = live && userId != null && client != null;
  return { onlineIds, presenceLive };
}

interface CallProviderProps {
  children: React.ReactNode;
  currentUser: { id: string; name: string; avatar?: string } | null;
  conversations: Conversation[];
  onCallLog: (conversationId: string, attachment: MessageAttachment) => void;
  /** Fired when the user accepts an incoming call: open that conversation. */
  onIncomingAccepted?: (conversationId: string) => void;
  /**
   * Test seam (mirrors useCall overrides). Production omits it and the
   * module-level Supabase client is used.
   */
  overrides?: {
    client?: SupabaseClient | null;
    noAnswerTimeoutMs?: number;
  };
}

/**
 * Mounts the single call machine + presence tracking and renders the one
 * <CallOverlay> at the App root. Children re-render only when App re-renders
 * them — call seconds tick silently in the machine (the overlay runs its own
 * display timer), so an active call never re-renders the tree once per second.
 */
export function CallProvider({
  children,
  currentUser,
  conversations,
  onCallLog,
  onIncomingAccepted,
  overrides,
}: CallProviderProps) {
  // Which realtime client drives signaling + presence. Defaults to the
  // module-level shared client; tests may inject a mock (or null = offline).
  const liveClient = overrides?.client !== undefined ? overrides.client : supabase;
  const live = liveClient != null;

  // Single source of truth: one machine for the whole app. Logged-out → the
  // same inert 'anon' identity ChatSystem used before (no inbox, no presence).
  const machine = useCall({
    currentUser: currentUser ?? { id: 'anon', name: 'Guest' },
    conversations,
    onCallLog,
    overrides: { client: liveClient, noAnswerTimeoutMs: overrides?.noAnswerTimeoutMs },
  });

  const { onlineIds, presenceLive } = usePresence(currentUser?.id ?? null, live, liveClient);

  // Ref-mirror so the overlay's Accept handler reads the CURRENT machine
  // state (not a stale render closure) when deciding to navigate.
  const callRef = useRef(machine.call);
  callRef.current = machine.call;
  const onIncomingAcceptedRef = useRef(onIncomingAccepted);
  onIncomingAcceptedRef.current = onIncomingAccepted;

  const handleOverlayAccept = useCallback(() => {
    const st = callRef.current;
    const convId = st.phase === 'incoming' ? st.conversationId : null;
    machine.acceptCall();
    // Accept from ANY screen: jump to the chat tab with this conversation
    // open; the handshake continues on the already-subscribed call channel.
    if (convId) onIncomingAcceptedRef.current?.(convId);
  }, [machine.acceptCall]);

  // machine.* actions are stable useCallbacks (see useCall.ts); onlineIds only
  // changes identity when the online set actually changes.
  const actions = useMemo<CallActions>(
    () => ({
      canCall: machine.canCall,
      startCall: machine.startCall,
      acceptCall: machine.acceptCall,
      declineCall: machine.declineCall,
      endCall: machine.endCall,
      toggleMute: machine.toggleMute,
      toggleCamera: machine.toggleCamera,
      onlineIds,
      presenceLive,
    }),
    [
      machine.canCall,
      machine.startCall,
      machine.acceptCall,
      machine.declineCall,
      machine.endCall,
      machine.toggleMute,
      machine.toggleCamera,
      onlineIds,
      presenceLive,
    ],
  );

  return (
    <CallContext.Provider value={actions}>
      <CallStateContext.Provider value={machine.call}>
        {children}
        <CallOverlay
          call={machine.call}
          onAccept={handleOverlayAccept}
          onDecline={machine.declineCall}
          onEnd={machine.endCall}
          onToggleMute={machine.toggleMute}
          onToggleCamera={machine.toggleCamera}
        />
      </CallStateContext.Provider>
    </CallContext.Provider>
  );
}
