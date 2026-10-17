// Unit tests for the typing-indicator cost discipline (worker 3).
// Exercises the REAL production code: TypingSender, shouldSendTyping,
// isTypingFresh, pruneExpired from src/lib/useTyping.ts.
// Run: npx tsx scripts/test-typing-throttle.ts   (exit 0 = all pass)
import {
  TypingSender,
  shouldSendTyping,
  isTypingFresh,
  pruneExpired,
  TYPING_THROTTLE_MS,
  TYPING_EXPIRY_MS,
  type TypingPeer,
} from '../src/lib/typingProtocol';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
}

type Sent = { convId: string; typing: boolean; at: number };
function makeSender(): { s: TypingSender; sent: Sent[] } {
  const sent: Sent[] = [];
  const s = new TypingSender((convId, typing) => {
    // Capture the send time from the harness clock (passed via onInput's now).
    sent.push({ convId, typing, at: 0 });
  });
  return { s, sent };
}

// 1) Rapid keystrokes are throttled: 50 keystrokes over 2 s -> ~3 sends.
{
  const { s, sent } = makeSender();
  const times: number[] = [];
  let t = 0;
  // patch 'at' by wrapping: record the clock we pass in
  const origOnInput = s.onInput.bind(s);
  const sentTimes: number[] = [];
  const spy = new TypingSender((c, ty) => {
    sent.push({ convId: c, typing: ty, at: 0 });
    sentTimes.push(t);
  });
  for (let i = 0; i < 50; i++) {
    t = i * 40; // 40 ms between keystrokes, 2 s total
    spy.onInput('conv-1', true, t);
  }
  check('rapid keystrokes throttled (50/2s)', sent.length <= 4 && sent.length >= 2, `sends=${sent.length}`);
  check('all typing events', sent.every((e) => e.typing === true), '');
  const gaps = sentTimes.slice(1).map((x, i) => x - sentTimes[i]);
  check('min gap between sends >= 800ms', gaps.every((g) => g >= TYPING_THROTTLE_MS), `gaps=${gaps.join(',')}`);
  const rate = sent.length / 2; // sends per second over the 2 s window
  check('peak rate well under realtime cap (10/s)', rate < 10, `${rate.toFixed(2)}/s`);
  void origOnInput;
  void times;
}

// 2) Single 'stopped' when input empties; further empties send nothing.
{
  const sent: Sent[] = [];
  const s = new TypingSender((convId, typing) => sent.push({ convId, typing, at: 0 }));
  s.onInput('conv-1', true, 0);
  s.onInput('conv-1', true, 100);
  s.onInput('conv-1', false, 200); // clear
  s.onInput('conv-1', false, 300); // still empty
  s.onInput('conv-1', false, 10_000); // long after
  const stopped = sent.filter((e) => !e.typing);
  check("exactly one 'stopped' on empty", stopped.length === 1, `stopped=${stopped.length}`);
}

// 3) stop() with no active typing -> no sends.
{
  const sent: Sent[] = [];
  const s = new TypingSender((convId, typing) => sent.push({ convId, typing, at: 0 }));
  s.stop();
  s.stop('conv-x');
  check('stop() while idle sends nothing', sent.length === 0, `sends=${sent.length}`);
}

// 4) stop() targets the conversation that owns the active typing state.
{
  const sent: Sent[] = [];
  const s = new TypingSender((convId, typing) => sent.push({ convId, typing, at: 0 }));
  s.onInput('conv-9', true, 0);
  s.stop(); // no explicit conv -> uses typingConv
  check('stop() uses active conv id', sent.length === 2 && sent[1].convId === 'conv-9' && !sent[1].typing, JSON.stringify(sent));
}

// 5) Expiry: fresh at 2.4 s, gone after 2.5 s.
{
  const peer: TypingPeer = { conversationId: 'c1', senderId: 'u2', senderName: 'B', at: 1000 };
  const peers: Record<string, TypingPeer> = { c1: peer };
  const early = pruneExpired(peers, 1000 + TYPING_EXPIRY_MS - 100);
  check('entry fresh at 2.4s', early.next.c1 !== undefined && early.changed === false, '');
  const late = pruneExpired(peers, 1000 + TYPING_EXPIRY_MS + 100);
  check('entry expired at 2.6s', late.next.c1 === undefined && late.changed === true, '');
  check('isTypingFresh boundary', isTypingFresh(1000, 1000 + TYPING_EXPIRY_MS - 1) && !isTypingFresh(1000, 1000 + TYPING_EXPIRY_MS), '');
}

// 6) shouldSendTyping pure rule.
{
  check('throttle rule', shouldSendTyping(0, 799) === false && shouldSendTyping(0, 800) === true && shouldSendTyping(0, 5000) === true, '');
}

// 7) Sustained typing over 5 s: <= 8 events (5000/800 = 6.25 + first).
{
  const sent: Sent[] = [];
  const s = new TypingSender((convId, typing) => sent.push({ convId, typing, at: 0 }));
  for (let i = 0; i < 60; i++) s.onInput('conv-1', true, i * 84); // ~5 s
  check('5s sustained typing <= 8 events', sent.length <= 8, `sends=${sent.length}`);
}

console.log(failures === 0 ? '\nALL TYPING TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 2);
