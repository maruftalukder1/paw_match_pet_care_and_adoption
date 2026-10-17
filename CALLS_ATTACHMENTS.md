# Calls & Attachments — Build Summary and W4 Verification (2026-10-14)

## What was built (W1–W3)

**Attachments (W1/W3)**
- `MessageAttachment` type (`src/types.ts`): `kind: 'image' | 'audio' | 'file' | 'calllog'`,
  with `dataUrl`, `name`, `mime`, `sizeBytes`, `durationSec`, `callType`, `outcome`.
- Adapter mapping (`src/lib/dataAdapter.ts`): `rowToMessage` null-safely maps the
  `attachment` jsonb column (keeps only known kinds/fields); schema updated
  (`supabase/schema.sql`: `attachment jsonb not null default '{}'`).
- App send plumbing (`src/App.tsx` `handleSendMessage(convId, content, attachment?)`):
  builds the message, updates state, persists via the adapter, notifies the receiver.
- `MessageAttachment.tsx`: image bubble (click → lightbox dialog, close button),
  audio bubble (`<audio controls>` + mm:ss duration), file chip (name, size,
  `Download` anchor with `download` attr), centered call-log pills
  ("Video call · 0:07", "Audio call · declined", "… · missed").
- `ChatSystem.tsx`: paperclip attach menu (Photo → JPEG data-URL, maxDim 1200, ≤8 MB;
  File → data-URL, ≤2 MB), mic voice recorder (MediaRecorder → preview bar with
  timer → Send/Discard), attachment bubbles rendered in the stream.

**Calls (W2/W3)**
- `src/lib/useCall.ts`: WebRTC voice/video calls signaled over Supabase Realtime
  broadcast channels `call:<conversationId>` (events: invite/accept/offer/answer/
  ice/reject/busy/end). STUN-only ICE (`stun.l.google.com`, `stun1.l.google.com`).
  Rules: only the original caller ever writes a call-log (via `onCallLog` →
  `onSendMessage(convId, '', calllogAttachment)`); completed calls log with duration;
  declined/unanswered log `declined`/`missed`; busy and caller-cancel write nothing;
  30 s no-answer timeout on the caller side.
- `CallOverlay.tsx`: fixed-position overlay (never shifts the chat pane) with
  outgoing ("Calling …"), incoming ("Incoming video/voice call", Accept/Decline),
  in-call (remote video + local PiP, or avatar + equalizer for audio), and error states.
- `ChatSystem.tsx`: header audio/video buttons (enabled only when `canCall`, i.e.
  Supabase configured), overlay wired to the hook.

## W4 fixes (trivial, no structural changes)

1. **`src/lib/dataAdapter.ts` — `persistMessage` regression fix.** W3's version always
   sent `attachment: msg.attachment ?? null`. PostgREST rejects unknown columns even
   when null, so while the live `chat_messages.attachment` column was missing, **every**
   live message insert (including plain text) would have failed with 42703. Now the key
   is included only when the message actually has an attachment:
   `...(msg.attachment ? { attachment: msg.attachment } : {})`. Text works regardless of
   column state; attachments persist once the column exists.
2. **`src/lib/useCall.ts` — DEV-only `window.__pawCallDiag()` test hook** (phase,
   callType, seconds, connectionState, signalingState, iceConnectionState,
   local/remote track kinds), following the existing `__pawInjectReceived` pattern in
   `App.tsx`. Guarded by `import.meta.env.DEV`; verified stripped from the production
   build. Useful for any future headless call verification.

`npm run build` ✅, `npx tsc --noEmit` ✅ 0 errors (before and after the fixes).

## Test 1 — attachments click-through, LOCAL mode (keyless build) — 15/15 PASS

Built the app with no Supabase env into `/tmp/pm-keyless` (production `dist/` untouched),
served via `vite preview :4174`, drove headless Chromium (fresh profile, fake media
flags) over raw CDP. Logged in as adopter via seeded session, opened a conversation.

| Step | Result |
|---|---|
| (a) text send → bubble in stream | PASS |
| (b1) photo via paperclip menu → image bubble renders | PASS |
| (b2) click photo → lightbox (`role=dialog`, "Photo viewer") opens | PASS |
| (b3) close button → lightbox closes | PASS |
| (c1) mic → recording bar appears | PASS |
| (c2) stop → preview with `<audio>`, timer showed `00:03` | PASS |
| (c3) Send → audio bubble with controls | PASS |
| (c4) duration badge `0:03` | PASS |
| (d1) file attach → chip with Download link | PASS |
| (d2) link is `data:text/plain;base64,…` with `download="w4-test-doc.txt"` | PASS |
| (e1–e4) reload → text, photo, audio, file ALL persist (localStorage) | PASS |
| uncaught console errors | 0 |

## Test 2 — two-client call test, LIVE mode — environmentally blocked, partial evidence

**Hard environmental blockers found (verified, not assumed):**
- The sandbox egress proxy lets node/curl reach Supabase, but **Chromium cannot**:
  raw `wss://…/realtime/v1/websocket` from the page → immediate `error` (with and without
  apikey); `fetch` to REST → `Failed to fetch`; CDP Network shows
  `ERR_TUNNEL_CONNECTION_FAILED` (after fixing `ERR_NO_SUPPORTED_PROXIES` by stripping
  `user:pass@` from `--proxy-server` and adding a CDP 407 handler — no auth challenge
  ever fires). The app degrades honestly: `[PawMatch] Realtime subscribe error: Error:
  channel error: transport failure` on both contexts.
- **UDP is blocked at the OS level** (`send EPERM` on 127.0.0.1 loopback) → ICE can
  never complete here: in-page pc1/pc2 loopback gathered 6+4 candidates, both sides stuck
  at `iceConnectionState: checking`, `connectionState: connecting`, no succeeded pair,
  remote video `0x0 readyState=0`.

So cross-client signaling (invite/accept/offer/answer/ICE), in-call `connected` state,
remote video frames, accept/decline flows, and realtime message push **could not be
exercised from this sandbox**. The full two-client script is saved at `/tmp/w4-test2.cjs`
(adapted version); re-run it from an unrestricted network for the decisive pass — the
assertions to expect there: video accept → `connectionState: 'connected'` on both,
remote `videoWidth/videoHeight > 0` + `readyState >= 2`; B ends → A's overlay closes and
exactly one "Video call · m:ss" pill; audio accept → equalizer + connected; decline →
A's overlay closes + exactly one "Audio call · declined" pill; text A→B/B→A via realtime.

**What WAS verified in live mode** (dev-mode build with keys + `__pawCallDiag`, real-form
logins `jaann@pawmatch.com/user123` and `admin/admin`, shared `conv-admin-1` opened in
both contexts — A saw 4 convs, B's Direct Inquiries saw 1):

- A starts VIDEO call → `phase: 'outgoing'`, `localTracks: ["audio","video"]`
  (fake devices acquired), "Calling" overlay renders. (17/23 checks passed overall)
- 30 s no-answer timeout → A back to `idle`, overlay shows
  "No answer from Admin Supervisor (Adoption Desk).", and a **missed video call-log pill
  appears EXACTLY ONCE** in A's stream (`"Video call · missed…"`, count = 1).
- A starts AUDIO call, cancels before timeout → back to `idle`, overlay closes,
  **no call-log written** (pill count 1 → 1; correct per spec — only answered calls log).
- Scroll/pane stability: `window.scrollY` 0 → 0, `chat-shell` height 558 → 558 across send.
- Console errors on A (11) / B (16) were all `transport failure` (realtime) and
  `[PawMatch] Notification persist failed` (REST unreachable) — i.e. the app honestly
  reporting the blocked network, no app-code crashes.

**Mid-test schema event (important):** at the start of Test 2 the live
`chat_messages.attachment` column did **not** exist (`42703 column … does not exist` on
a direct REST probe). During the run the parallel task's ALTER TABLE landed — a later
REST insert *with* the attachment key succeeded and the row reads back `attachment:
null`. The original "column missing" caveat is therefore **resolved**; attachment and
call-log rows will persist live once the client can reach the DB. Zero rows with
non-null attachment currently exist in the live table (verified).

## Limitations (honest)

- STUN-only NAT traversal — symmetric/mobile NATs need a TURN server (not configured).
- Live attachment/call-log persistence: column now exists (verified via REST), but no
  end-to-end live write was observable from this sandbox (browser→Supabase blocked).
- Two-client signaling, accept/decline, in-call media, realtime push: **not verified** —
  blocked by the sandbox proxy (no browser→Supabase traffic) and OS-level UDP block.
  Must be re-run from an unrestricted network; `/tmp/w4-test2.cjs` is ready.
- Fake-media tests prove the signaling UI + media acquisition path, not real-device
  audio/video quality.
- The voice-recording test used a fake mic; MediaRecorder produced a genuine 3 s blob
  with a correct duration badge.

## Cleanup / final state

- Deleted test media (`/tmp/w4-test-photo.png`, `/tmp/w4-test-doc.txt`).
- Live DB: the app's test messages never reached it (no network from the browser), so no
  app-generated spam. My only writes were two clearly labeled REST probe rows —
  `chat_messages/w4-probe-1` ("w4 probe row - delete me", in `conv-admin-1`) and
  `notifications/w4-probe-n1`. The anon role has **no DELETE policy** on those tables,
  so I could not remove them (DELETE returns 204 but rows remain). Please delete via
  the Supabase dashboard / service role.
- `dist/` restored to the **production Supabase-enabled build** (keys embedded, DEV
  hook stripped, both W4 fixes included — verified by grepping the bundle).
  `.env.local` untouched. Preview servers stopped. No keyless dist was committed.
