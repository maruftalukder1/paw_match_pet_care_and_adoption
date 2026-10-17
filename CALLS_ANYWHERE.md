# Ring-Anywhere Calls + Presence — Build & Verification (2026-10-14, Worker 2)

**Scope:** one App-level call state machine (ring on any screen) + real presence.
**Out of scope (untouched):** auth, messaging pane behavior, attachments, profile, CSV,
published artifact, GitHub.

## ⚠️ Environment incident — READ FIRST (blocks republishing)

- **`.env.local` is MISSING from `pawmatch-v2/`** (verified absent 2026-10-14 ~18:3x +06;
  searched `/tmp`, `~/workspace`, project tree). Other workers are active right now
  (vite preview/dev servers + test scripts running); one of them very likely moved it
  aside for a keyless build per the PERFECTION_PASS pattern and has not restored it yet.
- Consequence 1: **my `npm run build` produced a KEYLESS (local-mode) `dist/`**,
  overwriting the previous Supabase-enabled production build. The anon key is not
  recoverable from anywhere I can see (memory: "stored only in pawmatch-v2/.env.local").
  **Do NOT republish from the current `dist/` — rebuild with keys once `.env.local`
  is back.**
- Consequence 2: the planned **live-protocol test** (two node supabase-js clients proving
  `user:<id>` broadcast + `pawmatch-presence` over real Supabase realtime) is **blocked**
  — I have the project URL from memory but not the anon key, and I did not go hunting
  for it. State-machine verification below is therefore at the "states/signaling only"
  depth the brief allowed for exactly this situation.

## What was built

### A) Ring anywhere — one App-level state machine

**`src/lib/useCall.ts`** (extended, backward compatible)
- `SignalPayload` gains `inviteId?` + `fromAvatar?`; new exported `UserInvitePayload`
  `{fromId, fromName, fromAvatar?, conversationId, callType, inviteId}`.
- `CallState` gains `peerAvatar` (carried from invite; overlay still renders initials).
- **Dual-channel invite:** `startCall` generates one `inviteId` and publishes the invite
  on BOTH `call:<convId>` (existing) and the callee's personal `user:<calleeId>`
  (broadcast event `user-invite`, lazy per-peer channel, best-effort).
- **Inbox listener:** subscribes `user:<myId>` (logged-in + live only; skipped for
  `anon`/local mode), converts `user-invite` → the same `handleSignal` path.
- **Dedupe:** `seenInvitesRef` — the same invite arriving on both channels is processed
  once; without this the second copy would reply a spurious `busy` and kill the call.
  Busy replies still fire for genuinely different invites while non-idle.
- **Silent ticker:** seconds now bump in `stateRef` only (calllog duration + DEV diag);
  no `setCall` per second. `CallOverlay` runs its own 1 s display timer. An App-level
  provider therefore never re-renders the tree once per second during a call.
- All public actions (`startCall/acceptCall/declineCall/endCall/toggleMute/toggleCamera`)
  are stable `useCallback`s → the provider memoizes them; consumers re-render only on
  phase transitions or real presence changes.
- Test seams (production behavior unchanged when omitted): `overrides.client` and
  `overrides.noAnswerTimeoutMs`.
- No-answer timeout: still exactly one timer per call (30 s default), cleared on
  accept/reject/busy/end; fires once → a single `missed` log. Timeout also still sends
  `end` on the call channel so a ringing callee clears.

**`src/lib/CallContext.tsx`** (new)
- `CallProvider`: mounts the **single** `useCall` instance for the whole app (one
  machine, max one `RTCPeerConnection`), renders **one** fixed `<CallOverlay>` at the
  App root (never shifts the chat pane), and runs presence tracking.
- `useCallContext()` → stable actions + `onlineIds: Set<string>` + `presenceLive`.
  `useCallState()` → render state for the overlay only.
- Accept-from-anywhere: overlay Accept → `machine.acceptCall()` + `onIncomingAccepted(convId)`.
  The handshake then runs on the already-subscribed `call:<convId>` channels — no
  double-subscribe, no missed invite→accept→offer step (proven in S6).
- Presence: `usePresence(userId, live, client?)` — one global channel
  `pawmatch-presence`, `track` on login+live, `untrack` on logout/unmount, best-effort
  `untrack` on `beforeunload` (documented; server heartbeat expiry self-heals a missed
  unload). Equality-guarded `setOnlineIds` → no re-render storms. Local mode: no-op,
  everything reads offline.

**`src/components/CallOverlay.tsx`**
- Own 1 s display timer (`dispSecs`, reset per phase); `fmt(call.seconds)` →
  `fmt(dispSecs)` in the 3 display spots. Render output identical.

**`src/components/ChatSystem.tsx`**
- Local `useCall` + local `<CallOverlay>` **removed**; consumes `useCallContext()`
  (`canCall`, `startCall`, `onlineIds`, `presenceLive`). Call buttons/UX identical.
- Presence UI (real data only): conversation rows get a presence dot on the avatar
  (green/grey) + tiny `Online`/`Offline` label next to the name (live mode only);
  chat header status line replaced — the old line claimed "Online — messages sync live"
  for everyone; now green `Online` / grey `Offline` from the live channel, **no label
  at all in local mode**. Never any "last seen" (we don't track it — per spec).
- Scroll machinery, fixed heights, attachments, typing: untouched (grep-verified).

**`src/App.tsx`** (surgical, 3 edits — other workers are editing this file concurrently)
- Import `CallProvider`; wrap the whole return tree; pass `currentUser`,
  `computedConversations`, `onCallLog=(convId,att)=>handleSendMessage(convId,'',att)`,
  `onIncomingAccepted=(convId)=>{ setActiveConversationId(convId); setActiveTab('chat'); }`.
- No views moved, no imports reordered.

### B) Presence
- As above: single `pawmatch-presence` channel, per-user-id keys, exposed via context.
- UI: dots + Online/Offline in list rows and chat header. Offline = grey dot; no
  invented timestamps, no seeded data — local mode shows grey dot / no label.

## Test evidence

`npm run build` ✅ · `npx tsc --noEmit` ✅ 0 errors ·
`sanity-auth.ts` → ALL PASSED ✅ · `sanity-time.ts` → 20/20 ✅

**State-machine suite** — real `useCall`/`CallProvider`/`usePresence` code in headless
Chromium (fake media devices, deterministic fake `RTCPeerConnection`, in-page mock
realtime bus; harness files deleted after the run). **8/8 PASS**, zero page errors
(one benign favicon 404):

| # | Scenario | Observed |
|---|----------|----------|
| S1 | Ring-anywhere: callee's `call:conv-1` inbound blackholed ("another tab") | B reached `incoming` (peerName Alice, video, conv-1) via `user:u-b` alone; A stayed `outgoing` (no spurious busy); B decline → A `idle`, exactly 1 `declined` log by caller, callee wrote nothing |
| S2 | Dedupe + accept→offer→answer→in-call→end | Dual-channel invite → single `incoming` (A stayed `outgoing` = no busy storm); bus shows `u-a:offer`, `u-b:answer`; both `in-call`; end → both `idle`, exactly 1 `completed` log (with `durationSec`) by caller only |
| S3 | Busy | C invited busy-ringing B → C got exactly one `busy`, error "…are on another call right now.", zero logs anywhere; B kept A's invite |
| S4 | No-answer (1.2 s test timeout) | A `idle` + "No answer from …", exactly 1 `missed` audio log; B cleared to `idle`; still exactly 1 log after +1.5 s (timer fires once) |
| S5 | Caller cancel | Both `idle`, zero logs |
| S6 | Provider accept-from-anywhere | B's App-root overlay showed "Incoming video call" with caller name while B "on another tab"; clicking Accept → `onIncomingAccepted('conv-1')`, B sent `accept` on `call:conv-1`, both reached `in-call` |
| S7 | Presence | A tracked → both maps contain `u-a`,`u-b`, `presenceLive=true`; B untrack ("tab close") → A's map drops `u-b`, keeps `u-a` |
| S0 | ChatSystem regression (local mode) | Rendered; no Online/Offline labels (honest local mode); typed+sent "hello smoke" → `onSendMessage` fired once with exact text; shell height 601.562px unchanged; `window.scrollY` 0 |

**Regression greps:** no `window.scrollTo`/`scrollIntoView` in any new/modified file
(only pre-existing footer hits in App.tsx); chat-shell height classes byte-identical;
auth/attachments/profile/CSV code paths untouched.

## Honest limitations

1. **Live realtime transport NOT proven this round** — blocked by the missing
   `.env.local` (no anon key). The mock bus faithfully models broadcast `self:false`
   fan-out and presence sync, but the real `user:<id>` / `pawmatch-presence` channels
   should get one live smoke test once keys are back (subscribe + one invite + one
   track/presenceState read).
2. **In-call media still not machine-proven** — same sandbox UDP/WSS block as W4;
   signaling, overlays, timeout, and logging are verified; `connected` + remote video
   still need two real devices (unchanged from CALLS_ATTACHMENTS.md; STUN-only caveat
   stands).
3. **Cross-device/app-closed** → caller gets the 30 s no-answer → one `missed` log
   (S4 proves the timer; the "device never subscribed" half is by construction).
4. `dist/` is currently a **keyless build** — rebuild with keys before republishing.

## Files changed
- `src/lib/useCall.ts` — dual-channel invite, inbox listener, dedupe, silent ticker, stable actions, test seams
- `src/lib/CallContext.tsx` — **new**: `CallProvider`, `useCallContext`, `useCallState`, `usePresence`
- `src/components/CallOverlay.tsx` — overlay-local seconds display timer
- `src/components/ChatSystem.tsx` — context consumption, presence dots/labels, overlay removal
- `src/App.tsx` — `CallProvider` wrap (3 surgical edits)
- `CALLS_ANYWHERE.md` — this report
