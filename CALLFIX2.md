# CALLFIX2 — Call overlay remote-audio bug (2026-10-17)

## The bug (code-proven)

`src/components/CallOverlay.tsx` attached the remote stream **only** to the
`<video>` element that exists in the **video-call** branch of the overlay:

```tsx
useEffect(() => {
  const el = remoteVideoRef.current;
  if (el) el.srcObject = call.remoteStream;
}, [call.remoteStream, call.phase]);
```

In an **audio call** that `<video>` element never renders, so
`remoteVideoRef.current` was `null` and the stream was never attached to any
playing element. The component contained **no `<audio>` element at all**.

Result: audio-call users could NEVER hear the other side — on ANY network,
including the same Wi-Fi. This matched Maruf's report exactly ("একই ওয়াইফাই-তে
ছিলাম তারপরেও কথা বলতে পারিনি"): the earlier TURN fix (CALLFIX.md) addressed
ICE transport, but audio calls were broken at the UI layer before media could
even be heard.

## The fix (CallOverlay.tsx only — nothing else touched)

1. **Dedicated remote-audio element.** Added `remoteAudioRef` on an
   `<audio autoPlay>` element that is mounted for the whole dialog (so it
   exists across outgoing → in-call → incoming phases). An attach effect sets
   `el.srcObject = call.remoteStream` when `call.callType === 'audio'`, and
   sets it to `null` when the call type is `'video'` — so the stream never
   plays twice (once on `<audio>`, once on the remote `<video>`). Detach on
   phase change / unmount mirrors the existing pattern.
2. **Autoplay-policy hardening for BOTH elements.** After every `srcObject`
   attach, `el.play().catch(...)` runs. If the browser rejects playback (tab
   never interacted, mobile restrictions), a `needsTapToPlay` flag surfaces a
   **"🔊 Tap for sound"** button at the bottom of the call card (amber
   palette, consistent with the existing slate/amber styling). Its click calls
   `play()` on the active remote element (audio element for voice calls, the
   remote `<video>` for video calls) and hides the button once playing
   succeeds. The flag resets on every phase/callType change so each call gets
   a fresh attempt.
3. **No changes** to `useCall.ts`, signaling, the ICE/TURN config from
   CALLFIX.md, timers, or call-log rules.

## Verification results

- `npx tsc --noEmit`: zero errors in `src/` (only the pre-existing Deno
  edge-function modules and `vite.artifact.config.ts` quirks remain).
- `npm run build`: clean, 2.13 s.
- `scripts/sanity-auth.ts`: ALL SANITY CHECKS PASSED.
- `scripts/sanity-time.ts`: 20 passed, 0 failed.

## Honest limit

Real two-device media proof is Maruf's retest (audio call AND video call on
two devices). The sandbox cannot prove WebRTC media at all — a trickle-ice
probe gathered zero candidates of any type in this environment — so in-call
audio/video remains machine-unproven until he tests the published build.
