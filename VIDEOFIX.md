# VIDEOFIX — video-call repair + WhatsApp-style in-call options + messaging frame-drop fix

Date: 2026-10-18. Maruf's field report (real devices): on a video call, NEITHER
his own video NOR the other side's video is visible. Audio calls work. He also
asked for in-call options like WhatsApp (speaker toggle named explicitly) and
reported frame drops while typing in the messaging UI.

## PART 1 — Video diagnosis (read end-to-end, suspects in order)

**Suspect 1 — call buttons passing the wrong callType: CLEARED.**
`src/components/ChatSystem.tsx:944` — the video button calls
`handleCallButton('video')`, which calls `startCall(selectedConvId, kind)`
(`ChatSystem.tsx:126-132`). The kind flows correctly.

**Suspect 2 — useCall.ts media/signaling for video: CLEARED.**
`src/lib/useCall.ts`:
- `acquireMedia('video')` requests `{ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }` (line ~460). `ideal` constraints cannot throw OverconstrainedError.
- Caller: `setupCaller` adds ALL local tracks (audio+video) to the PC before creating the offer.
- Callee: `acceptCall` acquires with `kind = st.callType ?? 'audio'` (invite carries callType on both the `call:` channel and the `user:` ring-anywhere channel); `setupCallee` adds all tracks before answering.
- `ontrack` → `setRemoteStream` with the `e.streams[0] ?? new MediaStream([e.track])` fallback (FULL_AUDIT fix).

**Suspect 3 — CallOverlay render/attach: TWO REAL DEFECTS FOUND AND FIXED.**

(a) **No self-view while ringing (proven UX gap).** During `outgoing` and
`incoming` phases a video call rendered ONLY the peer avatar — the local
camera preview existed solely in the in-call branch. From the moment Maruf
tapped the video-call button, his own video was literally not on screen
("আমার ভিডিওটা দেখা যাইতেছে না" is true from second zero). WhatsApp shows
your camera immediately.

(b) **Fragile remote-video mounting (most probable functional cause).** The
remote `<video>` element was created ONLY when `call.remoteStream` became
non-null, inside an `AnimatePresence mode="wait"` tree — stream attach raced
element creation, and the local preview relied on the `autoPlay` attribute
alone (unreliable on some mobile browsers; no explicit `play()`).

**Suspect 4 — CSS/visibility: no zero-size/cover issue found** (`h-72 w-full`,
`object-cover`, PiP `h-28 w-20` — all sane).

**Fixes (`src/components/CallOverlay.tsx`, rewritten):**
1. Remote and local `<video>` elements are now ALWAYS mounted during video
   calls (all phases: outgoing/incoming/in-call) and hidden with `invisible`
   until a track arrives — attach can never race creation.
2. Local preview PiP now shows during outgoing (caller sees own camera while
   ringing) and incoming (placeholder until Accept turns the camera on).
3. Explicit `play()` on the local preview after attach (not just the attribute).
4. Honest track states: if a remote stream arrives with NO video tracks
   (audio-only SDP), the UI shows "Video unavailable from {name}" instead of
   a black box; same for a trackless local preview.
5. Remote attach keeps the CALLFIX2 audio-element separation and the
   tap-for-sound fallback.

**Environmental note:** the live bundle at www.xdeveloper.tech was verified to
contain the video branch ("Video call" marker present) plus both call fixes —
so this was not a stale deploy. If ICE connects (audio works ⇒ it does), both
media directions ride the same peer connection, so a video-only blackout
points at the render/track layer addressed above.

## PART 2 — WhatsApp-style in-call options

`src/lib/useCall.ts` (machine) + `src/lib/CallContext.tsx` (wiring) +
`src/components/CallOverlay.tsx` (UI):

1. **Speaker / audio-output toggle** — `enumerateDevices()` lists
   `audiooutput` devices; the choice is applied via `setSinkId` on the live
   remote element(s) and persisted in localStorage. Cycles through outputs on
   tap. HONEST LIMITS: needs `setSinkId` support (Chrome/Edge desktop +
   Android) AND 2+ outputs; on iOS Safari or single-output devices the button
   renders disabled with an explanatory tooltip instead of pretending.
   Platform truth: mobile browsers expose one "Default" route — the OS, not
   the web page, decides earpiece vs loudspeaker. This answers Maruf's
   complaint ("sound always comes out of the loudspeaker, no option") within
   what the web platform actually allows.
2. **Flip camera** — `getUserMedia({ facingMode: { exact } })` with soft
   fallback, `RTCRtpSender.replaceTrack` (no renegotiation), old track
   stopped, mic track preserved, local preview updates. Disabled while screen
   sharing.
3. **Screen share** — `getDisplayMedia` video track replaces the camera track;
   mic stays live; toggling off (or the browser's own stop button via
   `track.onended`) restores the camera. Button only renders where
   `getDisplayMedia` exists (desktop-oriented).
4. **Picture-in-picture** — `requestPictureInPicture()` on the remote video
   where `document.pictureInPictureEnabled`; exits automatically on call end;
   `leavepictureinpicture` keeps button state honest.
5. Kept: mute, camera on/off, end call, tap-for-sound fallback. Controls sit
   in a wrapping bottom bar with 48px touch targets (safe at 360px).

## PART 3 — Messaging frame-drop fix

Maruf: typing in chat stutters ("ফ্রেম ড্রপ", the writing part).
Root cause: the composer input lives in `ChatSystem`, so EVERY keystroke
re-rendered the entire chat tree — all message bubbles (framer-motion divs,
photo/file attachments, avatars) — on phones with image messages this is
real jank. The scroll machinery and typing throttle were already disciplined;
the render cost was the problem.
Fix: new `src/components/ChatMessageStream.tsx` — the message list extracted
into a `React.memo` component (stable props: memoized entries, stable
callbacks via `useCallback` for `jumpToLatest`/`updateStickiness`). Keystrokes
now re-render only the composer. No visual or behavioral change.

## Verification (all green)

- `npx tsc --noEmit`: **0 errors in src/** (only the pre-existing scripts/
  vite.artifact.config.ts quirks)
- `npm run build`: clean (2.58s); live build contains the Supabase URL
- `sanity-auth`: ALL PASSED · `sanity-time`: 20/20
- Unit: symptom-rules, video-analysis, fullsync-mappers (29/29),
  typing-throttle — all pass
- `design-pass-sweep.cjs`: **SWEEP ALL PASS** (9 views × desktop/mobile,
  0px overflow, 0 errors)
- `msgfix-local-e2e` (keyless build): ALL PASSED · `fullsync-local-e2e`
  (keyless): ALL PASSED
- `authfix2-e2e` (live build): **30/30 PASSED**
- Live-DB hygiene after the runs: Jaann `password_hash` = `user123_hash` ✓,
  Bruno photo = original Unsplash URL ✓ (the D1/D3 tests' mutations are
  self-restoring / were verified clean)
- NOTE: the local e2e suites need a KEYLESS build (`.env.local` moved aside);
  `authfix2-e2e` needs the LIVE build (it checks the Live badge + the
  live-only recovery-hash path). The first msgfix failure during this round
  was exactly this build-flavor mismatch, not a code regression.

## What only Maruf's device retest can prove

Real two-device video (both directions), speaker-button behavior on his
phones, flip camera, and whether the "Video unavailable" honesty states ever
appear. The sandbox cannot do WebRTC/UDP (trickle-ice gathers zero candidates
here), so in-call media is machine-unprovable as before.

## Files changed (source only — NOT published, GitHub untouched)

- `src/lib/useCall.ts` — CallState: `isScreenSharing`, `audioOutputs`,
  `audioOutputDeviceId`; actions: `flipCamera`, `toggleScreenShare`,
  `setAudioOutputDevice`, `refreshAudioOutputs`; teardown stops display
  tracks; DEV diag extended
- `src/lib/CallContext.tsx` — new actions in `CallActions`, passed to the overlay
- `src/components/CallOverlay.tsx` — rewritten per above
- `src/components/ChatSystem.tsx` — stream extracted; `jumpToLatest`/
  `updateStickiness` stabilized; orphaned imports removed
- `src/components/ChatMessageStream.tsx` — NEW (memoized message list)
- `pawmatch-v2/VIDEOFIX.md` — this report
- Final state: `.env.local` restored, `dist/` rebuilt as the LIVE build,
  preview server stopped
