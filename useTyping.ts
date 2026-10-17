/**
 * useTyping.ts — typing-indicator plumbing for PawMatch (typing + read receipts round).
 *
 * Pattern mirrors useCall.ts exactly: per-conversation Supabase Realtime
 * broadcast channels named `typing:<conversationId>` (event 'typing'), kept
 * entirely separate from the chat-message flows and the call-signaling
 * channels so it cannot disturb messaging stability. No database writes.
 *
 * COST DISCIPLINE
 * - The shared client sets `realtime.params.eventsPerSecond: 10`. The local
 *   side emits at most 1 typing event per 800 ms while text is being
 *   entered (~1.25/s, ~8x under the cap).
 * - No typing events at all in local (keyless) mode: every public method is
 *   a no-op and no channels are opened (receivers get nothing either).
 * - When the input empties, a message is sent, or the conversation changes,
 *   exactly ONE 'stopped' event goes out. Receivers ALSO expire entries
 *   after 2.5 s without a refresh, so a lost 'stopped' can never stick.
 * - Receivers run a single 1 s sweep interval and only setState when an
 *   entry actually expired (no render churn).
 *
 * PRIVACY
 * - Payloads carry only {senderId, senderName, convId, typing} — no message
 *   content. Receivers ignore their own echo and anything whose sender is
 *   not a participant of that conversation, so a typing event can never be
 *   seen outside the conversation's participants.
 * - The UI indicators never touch the scroll machinery (fixed-height slots,
 *   no auto-scroll triggers).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseEnabled } from './supabaseClient';
import type { Conversation } from '../types';
import {
  TypingSender,
  pruneExpired,
  type TypingPeer,
} from './typingProtocol';

interface TypingPayload {
  senderId: string;
  senderName: string;
  convId: string;
  /** false = the sender stopped typing. */
  typing: boolean;
}

export interface UseTypingParams {
  currentUser: { id: string; name: string } | null;
  conversations: Conversation[];
}

export function useTyping({ currentUser, conversations }: UseTypingParams) {
  // conversationId -> the other participant's latest typing event.
  // Conversations are 1:1, so one entry per conversation is sufficient.
  const [typingPeers, setTypingPeers] = useState<Record<string, TypingPeer>>({});

  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const conversationsRef = useRef<Conversation[]>(conversations);
  const currentUserRef = useRef(currentUser);
  /** The real sender; the hook's public methods delegate to it. */
  const senderRef = useRef<TypingSender | null>(null);

  conversationsRef.current = conversations;
  currentUserRef.current = currentUser;

  const sendEvent = useCallback((convId: string, typing: boolean) => {
    const me = currentUserRef.current;
    if (!isSupabaseEnabled || !supabase || !me) return; // local mode: no-op
    const ch = channelsRef.current.get(convId);
    if (!ch) return;
    const payload: TypingPayload = {
      senderId: me.id,
      senderName: me.name,
      convId,
      typing,
    };
    void ch.send({ type: 'broadcast', event: 'typing', payload });
  }, []);

  if (!senderRef.current) {
    senderRef.current = new TypingSender((convId, typing) => sendEvent(convId, typing));
  }

  /**
   * Call on every composer input change. Throttled by the sender machine:
   * at most one 'typing' broadcast per 800 ms while there is text; when the
   * text empties, exactly one 'stopped' goes out (local mode: no-op).
   */
  const notifyTyping = useCallback((convId: string, hasText: boolean) => {
    senderRef.current?.onInput(convId, hasText, Date.now());
  }, []);

  /**
   * Emit a single 'stopped' — call on send and on conversation switch.
   * Targets the conversation that owns our active typing state.
   */
  const notifyStopped = useCallback((convId?: string) => {
    senderRef.current?.stop(convId);
  }, []);

  // ---- receiver side -------------------------------------------------
  const handleTyping = useCallback((p: TypingPayload) => {
    const me = currentUserRef.current;
    if (!p || typeof p !== 'object') return;
    // 1) Ignore our own echo (belt) and strangers (suspenders).
    if (!me || p.senderId === me.id) return;
    const conv = conversationsRef.current.find((c) => c.id === p.convId);
    if (!conv || !conv.participantIds.includes(p.senderId)) return;
    // 2) Sender must be the OTHER participant of this conversation.
    const myIdx = conv.participantIds.findIndex((id) => id === me.id);
    if (myIdx !== -1 && conv.participantIds[1 - myIdx] !== p.senderId) return;

    if (!p.typing) {
      setTypingPeers((prev) => {
        const cur = prev[p.convId];
        if (!cur || cur.senderId !== p.senderId) return prev; // nothing to clear
        const next = { ...prev };
        delete next[p.convId];
        return next;
      });
      return;
    }
    setTypingPeers((prev) => ({
      ...prev,
      [p.convId]: {
        conversationId: p.convId,
        senderId: p.senderId,
        senderName: p.senderName || 'Someone',
        at: Date.now(),
      },
    }));
  }, []);

  // One broadcast channel per conversation: `typing:<conversationId>`.
  const convKey = conversations.map((c) => c.id).join(',');
  const myId = currentUser?.id ?? '';
  useEffect(() => {
    if (!isSupabaseEnabled || !supabase) return; // local mode: no channels
    const client = supabase; // keep the non-null narrowing for the cleanup closure
    const subs = new Map<string, RealtimeChannel>();
    for (const conv of conversationsRef.current) {
      const ch = client.channel(`typing:${conv.id}`, {
        config: { broadcast: { self: false } },
      });
      ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
        handleTyping(payload as TypingPayload);
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
  }, [convKey, myId]);

  // Expiry sweep: drop entries with no refresh inside TYPING_EXPIRY_MS.
  // Single interval; setState fires only when something actually expired.
  useEffect(() => {
    if (!isSupabaseEnabled) return;
    const t = window.setInterval(() => {
      setTypingPeers((prev) => {
        const { next, changed } = pruneExpired(prev, Date.now());
        return changed ? next : prev;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // DEV-ONLY test hook (stripped from production builds by import.meta.env.DEV):
  // lets the headless typing test drive the receiver path deterministically
  // without a live Realtime connection, following the existing
  // __pawInjectReceived / __pawCallDiag pattern. Production builds never
  // define it.
  if (import.meta.env.DEV) {
    (
      window as unknown as Record<string, unknown>
    ).__pawInjectTyping = (
      convId: string,
      senderId: string,
      senderName: string,
      typing: boolean = true
    ) => {
      handleTyping({ senderId, senderName, convId, typing });
      return true;
    };
  }

  return { typingPeers, notifyTyping, notifyStopped };
}
