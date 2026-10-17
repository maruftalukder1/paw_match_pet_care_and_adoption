# PawMatch — Enhancement Round (pets live sync, ring-anywhere calls + presence, typing + read receipts, code splitting)

**Date:** 2026-10-14 · **Working copy:** `hidden_files/pawmatch-v2/`
**Coordinator note:** the implementation workers finished but the coordinator died before the final verification/report. This file was written by the verification subagent after re-verifying everything in the tree. Build: `npm run build` ✅ · `npx tsc --noEmit` 0 errors ✅ · `sanity-auth.ts` ALL PASSED ✅ · `sanity-time.ts` 20/20 ✅.

---

## 0. Research takeaways

**[researched]** A light web scan of current Supabase + WebRTC practice (community guides, e.g. Supabase Realtime broadcast signaling spikes) confirms the architecture the workers chose is the standard zero-cost pattern:
- WebRTC SDP offer/answer and ICE candidates travel over **Supabase Realtime `broadcast` channels** (transient WebSocket rooms, never written to Postgres — writing signaling to a table adds seconds of latency).
- Media itself is peer-to-peer; only signaling metadata passes through Supabase.
- Google's public STUN servers (`stun.l.google.com:19302`) are the free NAT-traversal default; symmetric/mobile NATs need a TURN relay (paid).
- Presence via Supabase Presence (track/untrack on a shared channel) is the standard online-indicator mechanism.
- Typing indicators ride their own lightweight broadcast channel, throttled sender-side, with receiver-side expiry so a lost "stopped" event can never stick.

**[inferred from the implementation]** The workers additionally: (a) split invites across BOTH the per-conversation `call:<id>` channel and a per-user `user:<id>` inbox so calls ring on any screen (dedupe by invite id); (b) fixed caller/callee roles to avoid WebRTC glare; (c) kept typing traffic under the shared client's `eventsPerSecond: 10` cap (1 event / 800 ms ≈ 1.25/s, ~8× headroom); (d) made presence strictly real — never seeded or faked, empty in local mode.

---

## 1. What shipped (per item, with files)

### 1a. Pets live sync — the shared DB is now the source of truth for pet listings
- `src/lib/petMappers.ts` (new, 115 lines): pure `rowToPet` / `petToRow` for `public.pets` (snake_case ↔ camelCase). `rowToPet` is tolerant on the way in (unknown enum → sensible default, never crashes); `petToRow` coerces every CHECK-constrained field (species/gender/size/energy/status/owner_role) so the DB can never reject a write. No supabase import by design → unit-testable in plain node.
- `src/lib/dataAdapter.ts`: new `loadPets()` (ordered by `date_added`, `nullsFirst: false`), `persistPetCreate` (INSERT), `persistPetUpdate` (upsert), `persistPetDelete` (DELETE — anon policies allow it in the demo project), `subscribePets()` (INSERT/UPDATE/DELETE on the `pawmatch-pets` channel, parsed via `rowToPet`). `writePetRow` retries once WITHOUT the `tags` key if the live table predates the tags migration (PGRST204/42703) — the listing still lands.
- `supabase/schema.sql`: `pets` added to the `supabase_realtime` publication (idempotent), `tags text[] not null default '{}'` with idempotent migration, plus the `attachment jsonb` column on `chat_messages` from the previous round.
- `src/App.tsx`: live-mode bootstrap merges DB pets on boot (dedupe by id — realtime inserts that beat the load are kept, nothing doubled); `subscribePets` merges insert/update/delete by id with no reload; optimistic writes with an honest `unsynced` flag + toast on server failure (delete restores the row locally if the server delete fails).
- RLS check (source): anon `select/insert/update/delete` on `public.pets` are all demo-open (`using (true)`), so the adapter's delete path works without a service key.

### 1b. Ring-anywhere calls + presence
- `src/lib/useCall.ts`: the invite is now ALSO published on the callee's personal broadcast inbox `user:<calleeId>` (dedupe by invite id across `call:` + `user:` channels), so an incoming call rings on ANY screen. 30 s no-answer timeout → exactly one missed-call log (written only by the caller); busy auto-response; `__pawCallDiag` DEV-only test hook (verified stripped from production).
- `src/lib/CallContext.tsx` (new, 252 lines): ONE `useCall` instance at the App root (never per-view), ONE `<CallOverlay>` rendered at the root (fixed overlay — can never shift the chat pane), personal-channel subscription for the logged-in user, `onIncomingAccepted` navigates to the chat tab with the conversation open, and `usePresence()` tracks the user on the single `pawmatch-presence` channel (track on login, untrack on logout/unmount + `beforeunload`; stale presence expires via server heartbeat).
- `src/components/ChatSystem.tsx`: green presence dot on conversation rows from `onlineIds` (line ~115), call buttons use `useCallContext()`.
- `src/App.tsx`: `<CallProvider currentUser conversations onCallLog onIncomingAccepted>` wraps the tree; call logs route through `handleSendMessage(convId, '', attachment)`.

### 1c. Typing indicators + read receipts
- `src/lib/typingProtocol.ts` (new, 100 lines, zero imports): pure `shouldSendTyping` / `isTypingFresh` / `pruneExpired` / `TypingSender` state machine. Cost discipline: ≤1 typing broadcast per 800 ms while text is entered; exactly one `stopped` on empty/send/conversation-switch; receivers expire entries after 2500 ms.
- `src/lib/useTyping.ts` (new): per-conversation broadcast channels `typing:<conversationId>` (self:false), sender + receiver sides, local mode = full no-op (no channels, no events), receiver ignores own echo and non-participants, single 1 s expiry sweep with setState only on change, DEV-only `__pawInjectTyping` hook (verified stripped from production).
- `src/components/ChatSystem.tsx`: typing preview in the conversation list row (fixed-height slot — row height cannot change) and in the chat header (`data-testid="typing-header"`, fixed `h-4`); composer input calls `notifyTyping` on change, `notifyStopped` on send/switch.
- Read receipts: `dataAdapter.markConversationRead()` flips `is_read` only on rows where `receiver_id = readerId` (a client can never forge receipts for others); `subscribeMessages` listens for UPDATEs and the App applies them ONLY to the reader's own sent messages (idempotent). The UPDATE handler tolerates missing `payload.old` (default replica identity) by design.

### 1d. Code splitting (React.lazy)
- `src/App.tsx`: `ProfileView` and `AdminDashboard` are `React.lazy(() => import(...))` inside `<Suspense>` with `LazyPawFallback` (new `src/components/LazyPawFallback.tsx`, paw animation). Auth rules untouched.

### 1e. Timezone bug fix (by Pip, before this verification)
`src/utils/time.ts`: `addDaysISO`/`todayISO` used UTC dates — in UTC+ timezones like Asia/Dhaka, `toISOString()` shifts the day (e.g. 2 AM Dhaka → "yesterday" in UTC). Fixed with `toLocalISODate()` (local `getFullYear/getMonth/getDate`); call sites swapped in `App.tsx`, `PetManager.tsx`, `LostFoundView.tsx`, `petMappers.ts`. `sanity-time.ts`: **20/20**. This verifier did not touch it.

---

## 2. Bundle evidence (production build, `dist/`)

| Chunk | Raw | Gzip | Loaded |
|---|---|---|---|
| `index-BPdMAB3s.js` (initial) | 648.83 kB | 184.63 kB | on first paint |
| `ProfileView-CWq248fp.js` | 13.93 kB | 3.51 kB | on demand (My Profile) |
| `AdminDashboard-D4wlH5mx.js` | 18.71 kB | 3.69 kB | on demand (Admin Panel) |
| `index-CMfy7U7Z.css` | 73.80 kB | 12.15 kB | on first paint |

Browser-verified: initial page load requests ONLY `index-*.js` (no lazy chunks); opening My Profile loads `ProfileView-*.js`; opening Admin Panel loads `AdminDashboard-*.js`.
Honest note: the initial chunk is ~79 kB larger than the pre-round ~570 kB monolith — the calls/typing/signaling code landed in it; only ProfileView + AdminDashboard were split out. The remaining split candidates (ChatSystem, PetListings, LandingPage) are still in the main chunk.

---

## 3. Test evidence (exact observed states)

### 3a. Unit tests (tsx, plain node) — 27/27 PASS
- petMappers: seed-row round trip (photo URL, quotes/newlines in description, tags array), all 7 CHECK-constraint coercions (dragon→other, X→Male, huge→medium, hyper→moderate, Gone→Available, alien→owner, NaN age→0), null-tolerant `rowToPet({})` (name defaults, id falls back to a string).
- typingProtocol: throttle boundary (799 ms blocks, 800 ms allows), expiry boundary, prune drops/keeps correctly, `TypingSender` sends exactly 2 typing events for 3 inputs (throttled) and exactly 1 `stopped` on empty, `stop()` idempotent.

### 3b. Production-build browser tests (served `dist`, local/keyless mode) — all PASS, zero JS errors
- Boot: clean, branded title "PawMatch — Local Pet Care & Adoption Matchmaker", badge reads "Local".
- Code splitting: initial load excludes both lazy chunks (verified via response capture); ProfileView chunk loads on opening My Profile; AdminDashboard chunk loads on opening Admin Panel.
- Messaging: text send renders; `window.scrollY` 0→0 across send (no page jump).
- Attachments (photo): attach popover opens → file pick → preview → sent photo renders as an image bubble → **persists across full page reload** (localStorage).
- Profile: view renders (avatar upload, My Pets); edits covered in the previous round.
- Auth: wrong password → "Attempt 1 of 3 before account lock" ✅; `admin/admin` login works ✅; admin user menu contains **Admin Panel** ✅; adopter menu has no Admin item (verified earlier round, re-confirmed code-gated in `Header.tsx`); logout sticks after reload ✅.
- Admin panel renders fully ("PAWMATCH GOVERNANCE & MODERATION CONSOLE", export cards, stats).

### 3c. Typing receiver (vite dev + DEV hook `__pawInjectTyping`) — 6/6 PASS
- List-row indicator appears for the injected conversation; header indicator appears when that conversation is selected (fixed `h-4` slot); indicator auto-expires after the 2.5 s window; explicit `stopped` clears immediately; a non-participant sender (`u-evil-9`) is ignored; typing into the composer in local mode is a no-op with no errors.

### 3d. Pet add with photo (browser, local mode) — 4/4 PASS
- Shelter login → PetManager → add form → upload photo (preview shows data-URL) → submit → pet appears in Dashboard My Pets, in Find Pets listings, and **persists across reload**.

### 3e. Static verification of live-only paths (cannot run in this sandbox — see §4)
- `loadPets`/`subscribePets`/merge logic in `App.tsx` reviewed: dedupe by id, order-preserving replace on update, delete-by-id race-safe, optimistic writes with `unsynced` rollback.
- `writePetRow` tags-fallback logic reviewed (PGRST204/42703 → retry without `tags`).
- `useCall` personal-channel subscription (line ~665), `CallContext` single-instance + root overlay, `onIncomingAccepted` navigation — reviewed, consistent.
- `subscribeMessages` read-receipt UPDATE handler + `markConversationRead` scoping — reviewed, sound.
- pets DELETE realtime handler uses `payload.old.id`: default Postgres replica identity includes PK columns in `old`, so this works without a FULL-replica-identity migration. No `replica identity` statements exist in `supabase/schema.sql` and none are needed.
- DEV hooks (`__pawInjectTyping`, `__pawCallDiag`) verified absent from the production bundle (`grep -c` → 0 in `dist/assets/index-*.js`).

### 3f. Regression suites
`npx tsc --noEmit` → 0 errors; `scripts/sanity-auth.ts` → ALL PASSED; `scripts/sanity-time.ts` → 20/20. `npm run build` ✅.

---

## 4. Honest limitations — what is NOT proven from here

1. **Live two-client tests are blocked by the sandbox, not by the code.** Playwright Chromium gets `net::ERR_TUNNEL_CONNECTION_FAILED` to `*.supabase.co` (it doesn't use this sandbox's egress proxy; curl/node HTTPS to the same host returns 401 as expected). Additionally, `.env.local` (the Supabase keys) is **missing from the working tree** — only `.env.example` survives; a VM restart wiped it. Without the anon key no authenticated Supabase call is possible from this VM. The `dist/` in the tree is currently a **keyless build** from my verification rebuilds (local mode only) — the published artifact was built WITH keys by the artifact builder, so the live site is unaffected, but any future local `npm run build` here produces a local-mode bundle until the keys are restored (Maruf can re-supply them via the usual takeover flow).
2. **Unverified end-to-end:** pets live sync across two clients (CRUD + 15-seed-pet boot), global ring (B on Dashboard → incoming overlay → accept → in-call), presence green dot appearing/clearing, typing broadcast over the wire, read-receipt flip across clients, and the in-call WebRTC `connected` state with remote media (UDP is blocked here in any case; STUN-only means some mobile/symmetric NATs would need a paid TURN relay). The workers' earlier live probes (with keys, before the wipe) reportedly covered parts of this — I could not re-run them.
3. **Partially split bundle** (§2): main chunk grew; only two views are lazy.
4. A cosmetic pre-existing quirk (from the prior round, unchanged): a newly sent chat message can sort above seed messages whose timestamps are display strings when the local clock is earlier — unrelated to this round.
5. Test-probe rows from the prior round (`chat_messages/w4-probe-1`, `notifications/w4-probe-n1`) were left in the live DB; a dashboard cleanup was dispatched by the parent.

---

## 5. Fixes made by this verifier

None — no bugs were found in the new code. (Several initial test failures were false negatives in my own probe scripts: regexes that didn't match the real copy, e.g. "typing…" vs "is typing", "EXPORT DATA" vs "Export data", and framer-motion submit buttons that need Enter-key submission. All resolved by correcting the probes, not the app.)

---

## 6. Files changed by the enhancement round (source only)

New: `src/lib/petMappers.ts`, `src/lib/CallContext.tsx`, `src/lib/typingProtocol.ts`, `src/lib/useTyping.ts`, `src/components/LazyPawFallback.tsx`, this doc.
Modified: `src/lib/dataAdapter.ts` (pets live path), `src/lib/useCall.ts` (personal channel invite), `src/components/ChatSystem.tsx` (presence dots, typing UI, context hooks), `src/components/CallOverlay.tsx`, `src/App.tsx` (lazy views, CallProvider, pets bootstrap, receipts), `src/utils/time.ts` (timezone fix), `supabase/schema.sql` (pets realtime, tags, attachment columns), `src/types.ts` (attachment/calllog, `unsynced`).
Never touched: the published artifact, GitHub.
