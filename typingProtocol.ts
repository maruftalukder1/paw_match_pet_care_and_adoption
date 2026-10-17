/**
 * typingProtocol.ts — pure, framework-independent core of the typing-indicator
 * feature. Zero imports (no import.meta, no React): unit-testable under plain
 * tsx. useTyping.ts (the React hook) builds on this.
 *
 * COST DISCIPLINE
 * - At most one 'typing' broadcast per TYPING_THROTTLE_MS while text is being
 *   entered (~1.25/s — ~8x under the shared client's eventsPerSecond: 10).
 * - When the input empties, a message is sent, or the conversation changes,
 *   exactly ONE 'stopped' event goes out. Receivers ALSO expire entries after
 *   TYPING_EXPIRY_MS without a refresh, so a lost 'stopped' can never stick.
 */

/** Max one broadcast per 800 ms while the user is typing. */
export const TYPING_THROTTLE_MS = 800;
/** Receiver-side expiry: no refresh within this window clears the indicator. */
export const TYPING_EXPIRY_MS = 2500;

export interface TypingPeer {
  conversationId: string;
  senderId: string;
  senderName: string;
  /** Date.now() when the event was received. */
  at: number;
}

/**
 * Pure: may the local user emit another typing event at `now`?
 */
export function shouldSendTyping(lastSentAt: number, now: number): boolean {
  return now - lastSentAt >= TYPING_THROTTLE_MS;
}

/**
 * Pure: is a typing entry received at `receivedAt` still fresh at `now`?
 */
export function isTypingFresh(receivedAt: number, now: number): boolean {
  return now - receivedAt < TYPING_EXPIRY_MS;
}

/**
 * Pure: drop expired typing entries. Returns the pruned map plus whether
 * anything was dropped (the hook uses `changed` to avoid render churn).
 */
export function pruneExpired(
  peers: Record<string, TypingPeer>,
  now: number
): { next: Record<string, TypingPeer>; changed: boolean } {
  let changed = false;
  const next: Record<string, TypingPeer> = {};
  for (const [k, v] of Object.entries(peers)) {
    if (isTypingFresh(v.at, now)) {
      next[k] = v;
    } else {
      changed = true;
    }
  }
  return { next, changed };
}

/**
 * Framework-independent typing sender state machine.
 * Encodes the cost discipline: at most one 'typing' event per
 * TYPING_THROTTLE_MS while text is present; exactly one 'stopped' when the
 * text empties / a send happens / the conversation changes.
 */
export class TypingSender {
  private lastSentAt = -Infinity;
  private typingActive = false;
  private typingConv = '';
  constructor(private send: (convId: string, typing: boolean) => void) {}

  /** Call on every composer input change. */
  onInput(convId: string, hasText: boolean, now: number): void {
    if (!hasText) {
      // Input emptied -> a single 'stopped', then silence.
      if (this.typingActive) {
        this.typingActive = false;
        this.typingConv = '';
        this.send(convId, false);
      }
      return;
    }
    if (shouldSendTyping(this.lastSentAt, now)) {
      this.lastSentAt = now;
      this.typingActive = true;
      this.typingConv = convId;
      this.send(convId, true);
    }
  }

  /** Call on send and on conversation switch. */
  stop(convId?: string): void {
    if (!this.typingActive) return;
    this.typingActive = false;
    const target = convId ?? this.typingConv;
    this.typingConv = '';
    if (target) this.send(target, false);
  }
}
