# SCROLLFIX2 — Chat pane scroll-jump / selection ping-pong fix (2026-11-04)

**Status: fixed in master source, verified locally. NOT published (parent publishes).**

## The reported bug

Admin on xdeveloper.tech (desktop ~1366×768) opens the Jaann Rahman thread;
the pane repeatedly snaps between the top of history and the bottom and will
not stay where he scrolls it. The user's 2.6 s video shows the rest of the
signature: seed-state counts ("Direct Inquiries (1)" / "All Chats (4)"), the
pane displaying **conv-1** (Jaann ↔ Bruno's Caretaker — a thread Admin does
not participate in), and within ~1 s both conv-1's tail and conv-admin-1's
single message visible in one continuous stream (AnimatePresence overlap),
then the view at the top.

## Root cause — PROVEN by measurement, not inferred

Two selection authorities inside `ChatSystem` fight from the moment it
mounts, whenever the parent's `activeConversationId` differs from
ChatSystem's own initial selection:

1. `selectedConvId` initializer: parent id if visible, else
   `visibleConversations[0]` — for Admin that is `conv-admin-1` (parent
   default is `'conv-1'`, which is not in Admin's inbox list).
2. The **select effect** applies the parent's id (`conv-1`) and reports it
   upward via `onSelectConversation`.
3. The **mark-read effect** fires on mount for the initializer's pick
   (`prevSelectedRef` started at `''`), reporting `conv-admin-1` upward.
   The parent flips `activeConversationId` to `conv-admin-1`.
4. Next render the select effect applies `conv-admin-1` (the single-value
   `appliedInitialIdRef` guard sees a *different* value, so it passes),
   while the mark-read effect now reports `conv-1`. The parent flips back.
5. Repeat forever — an exact A→B→A alternation defeats the single-value
   guard by construction. Every flip also triggers App's `loadMessages`
   server refresh (live mode) and the auto-scroll effect's `convChanged`
   branch: an instant `scrollTop = scrollHeight`.

### Measured BEFORE (live flavor, 1366×768, admin, no input after opening Messages)

Harness: `scripts/chat-scroll/scrollfix2-measure.cjs` (new), data in
`/tmp/scrollfix2-live-before.json` (862 samples @150 ms, 130 s):

- `loadMessages` GETs alternate `conv-1` / `conv-admin-1` in perfect
  metronome counts — Phase A (25 s): 706 / 702; whole run: **~7,900 GETs**,
  total Supabase requests **18,974 in 130 s** (~28 selection flips/sec,
  still raging in the final phase — it never settles).
- **2,419 programmatic `scrollTop` sets**, 100% of app sets from the
  auto-scroll effect in ChatSystem (the only other 2 sets were the
  harness's own deliberate parks).
- Pane `scrollTop` oscillated **230 ↔ 345** continuously (283 jumps
  > 60 px across phases); a deliberate park at 155 was instantly
  overridden — post-park values were only ever 230/345. The pane cannot
  be parked anywhere.
- The stream's rendered children stayed a permanent 8-node overlap
  (both threads' bubbles co-mounted via AnimatePresence) — exactly the
  blended stream in the user's video frames.
- One mark-read PATCH fired at mount for `conv-admin-1` (the initializer
  fallback being reported upward) — the loop's first shot, −0.1 s,
  immediately before the alternating GET storm begins at +0.1 s.

Sandbox caveats (both runs): Supabase realtime websockets fail in this
sandbox ("transport failure"), so REST-insert churn could not reach the
app; and the initial snapshot's all-messages fetch never landed within
the run window, so the app stayed on seed state — the same state the
user's video shows ("All Chats (4)"). Neither caveat touches the
mechanism: the loop is pure React state machinery, ignited at mount from
seed state, and independent of realtime.

## The fix (all in `src/components/ChatSystem.tsx`)

1. **Select effect — Set guard (brief hardening a).** `appliedInitialIdRef`
   (single value) → `appliedExternalIdsRef: Set<string>`. An external id
   is applied at most once per mount; A→B→A echoes are ignored. Fresh
   deep links still work: they arrive as never-applied ids, or after a
   remount (tab switch) when the set starts empty. (Known bounded
   residue: a call-accept for a conversation already applied earlier in
   the *same* mount, while already on the chat tab, no longer yanks the
   pane — the call itself connects; the thread is one click away.)
2. **Mark-read effect — no mount fire (the indicted co-flipper).**
   `prevSelectedRef` now initializes to the mount selection instead of
   `''`, so the effect reports only genuine post-mount selection
   changes. The select effect already reports the mount application
   upward, so mark-read coverage is unchanged — it just stops being a
   second, disagreeing selection authority.
3. **Auto-scroll — intent-gated jump (brief hardening b).** New
   `navIntentForRef` records the target of a genuine navigation:
   `handleSelectConv` (list click) sets it, and the select effect sets
   it when applying an external id different from the one on screen.
   The `convChanged` branch jumps to the bottom only for the first
   display or when the change lands on the intent id; any other
   re-selection preserves the current `scrollTop`.

No changes to App.tsx, the data layer, message rendering, or any other
behavior (send/receive/pill semantics verified unchanged below).

## Measured AFTER (identical scenario, `/tmp/scrollfix2-live-after.json`)

- Total Supabase requests: **94** (was 18,974). `loadMessages` GETs:
  `conv-1` ×5 in Phase A, **zero** `conv-admin-1`, zero after Phase A.
  The parent settles on `conv-1` in one step and stays.
- Programmatic scroll sets: **4 total** (was 2,419) — 2 app sets at the
  mount settle (first display + the fallback→parent-id switch, both
  intended bottom landings) + the harness's 2 deliberate parks.
- The pane settles to a clean 7-node stream (conv-1 alone, scrollHeight
  644 — vs the permanent 8-node overlap before).
- Scroll stability: after parking mid-history, `scrollTop` held at
  **104 (min = max, one distinct value) for the full 20 s idle**; at
  the bottom it held at max for 10 s. Only 3 jumps > 60 px in the whole
  run, all accounted for (mount settle + the 2 deliberate parks).
- Selection/header: stable from the first second; no transitions after
  mount.

## Regressions

- Original harness `scripts/chat-scroll/verify-chat-scroll.cjs`
  (local flavor, Jaann): **20/20 PASS** — send-sequence window/pane
  stability, no max-depth errors, receive-while-scrolled-up does not
  yank + pill shows, pill tap jumps, near-bottom auto-follow, mobile
  geometry stable.
- `npx tsc --noEmit`: 6 errors, all pre-existing and outside `src/`
  (Deno edge-function quirks ×4, `scripts/test-symptom-rules.ts`,
  `vite.artifact.config.ts`). **Zero errors in `src/`**, none in
  ChatSystem.tsx — no new errors.
- `npm run build` (production): succeeds (only the pre-existing
  chunk-size warning).

## Harness changes

- New `scripts/chat-scroll/scrollfix2-measure.cjs` (the measurement
  above; phases A–D, 150 ms sampler + programmatic-scroll stack log +
  Supabase request log).
- `scripts/chat-scroll/cdp2.cjs`: chrome binary now overridable via
  `PAW_CHROME` (default unchanged). Required here because the Hatch
  Chromium build refuses direct launches (its WebGL domain policy is
  delivered by browser-daemon); runs used the Playwright Chromium at
  `~/.cache/ms-playwright/chromium-1248/...`.

## Test data left in the live DB (disclosure)

Seeded for measurement; anon delete does not exist, so they remain
until removed via dashboard SQL (same route as the old probe rows):

- `users` row `u-scrolltest-1` ("Scroll Test", scrolltest@pawmatch.test)
- `conversations` row `conv-scrolltest-1` (Admin ↔ Scroll Test) with
  63 messages `msg-scrolltest-*` (60 seeded + 3 labeled churn)
- **4 labeled synthetic messages inside the real `conv-admin-1`**
  (Jaann's inquiry): `msg-scrolltest-other-{1,2}-live-{before,after}`,
  content "Churn message in another conversation N." — inserted as
  Phase-C churn probes. The 3 real messages in that thread are
  untouched.
