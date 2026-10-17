# MSGFIX — "Empty thread" root cause, fix, and proof (2026-10-14)

**Symptom (Maruf's screen recording):** a freshly registered user (Hasan) opens
Messages, sees his Admin conversation with the sent-text preview, but the thread
is empty: *"No messages in this conversation yet."* He reported the same problem
was still not fixed.

## 1. Pinned root cause (evidence, not guessing)

Live-DB ground truth (verified via REST before touching code):
- `conversations` had 6 rows: 4 seeds + `conv-admin-1791965088665` (user
  "maruf" ↔ admin) + `conv-app-1791966419278` (Hasan Mahmud `u-adopter-3` ↔
  admin, `last_message` = *"Hello Admin, I have submitted an adoption
  application for Luna (Persian Cat)."*).
- `chat_messages` had **only the 7 seed rows**. The maruf and Hasan
  conversations had `last_message` set but **zero message rows**.

Code path: every new-conversation flow (`persistChatObjects` in
`src/App.tsx` — Message Admin / Message Shelter-owner / Message user — and the
adoption-application submit flow) did this in live mode:

```ts
dataAdapter.persistConversation(conv).catch((e) => console.error(e));
dataAdapter.persistMessage(msg).catch((e) => console.error(e));
```

Two unawaited writes fired concurrently. The schema has a real foreign key:

```sql
chat_messages.conversation_id text not null
  references public.conversations(id) on delete cascade
```

If the message INSERT committed before the conversation upsert, the DB
rejected it — reproduced live, deterministically, from node/REST against the
real project:

```
message-first status: 409
{"code":"23503","message":"insert or update on table \"chat_messages\"
 violates foreign key constraint \"chat_messages_conversation_id_fkey\""}
```

The rejection was swallowed by `.catch(console.error)`. Net effect: the
conversation row survived (with `last_message`, so the list preview showed the
text) while the message row never existed — an empty thread on any fresh
origin/device, exactly what Maruf recorded. Seed conversations never hit this
because their rows were inserted with parents already in place.

A secondary trap was checked and ruled out for the reported cases:
`chat_messages.sender_id → public.users(id)` FK. Verified live that the actual
sender ids exist (`u-adopter-3` = Hasan Mahmud; maruf's real id is
`u-adopter-1791964969453`, which exists; plain `maruf` was only a display
name). A 23503 on a missing sender was reproduced deliberately and confirmed
as a separate, currently-untriggered failure mode. Registration already
persists profile rows into `public.users` (`insertUserProfile` in
`src/lib/authFlow.ts`), so senders exist for registered users.

## 2. The fix

**`src/lib/dataAdapter.ts`** (Supabase adapter; local adapter gets no-op/null
stubs so local/demo behavior is unchanged):
- New `persistConversationWithMessage(conv, msg)` — conversation row is
  **awaited before** the message insert (FK-safe order). Transient
  network/5xx failures are retried once (800 ms); permanent failures
  (235xx, 42501, PGRST, 22xxx/42xxx) are never retried. Final failure
  **rejects** — the UI must react, never silently drop.
- The message step inside it is an **idempotent upsert on id** (message
  content is immutable in this app), so a retry after an ambiguous failure
  (write landed but response was lost) can neither duplicate nor die on
  23505.
- New `loadMessages(conversationId)` — full thread history from the server,
  oldest first.
- New `loadConversation(conversationId)` — single conversation row from the
  server.

**`src/App.tsx`**:
- Adoption-application flow and `persistChatObjects` (Message Admin /
  Shelter / user) now use `persistConversationWithMessage`.
- `handleSendMessage` (existing conversations): message-write failure now
  marks the bubble failed instead of vanishing into `console.error`.
- New failed-send UX: `failedMessageIds` state + `retryFailedMessage()`
  (always retries through the idempotent conversation+message path) + a
  visible toast. Failed ids are session-only — a reload re-derives truth
  from the server.
- New live-mode effect: opening a thread pulls `loadMessages()` and merges
  server rows (server is the source of truth; session-failed bubbles are
  preserved so retry stays possible). A fresh device/origin therefore
  always renders the real persisted history.
- Realtime incoming handler: a message arriving for a conversation this
  client has never seen (created on another device, e.g. a new user's first
  message to Admin) now fetches and inserts that conversation via
  `loadConversation()` instead of being dropped silently.

**`src/components/ChatSystem.tsx`**: new optional props
`failedMessageIds` / `onRetryMessage`; a failed own-bubble renders
**"⚠ Not sent — retry"** (with `data-testid="msg-failed-<id>"`) instead of
the ✓ ticks. Tap retries the write.

**Conversation scoping (unchanged, re-verified):** `loadInitial` filters
`conversations` by `participant_ids` containing the current user id, and
ChatSystem additionally filters non-admin lists to participants. Admin's
"all" oversight view is admin-only.

## 3. Test evidence

**Live round-trip** — `scripts/msgfix-live-test.ts` (esbuild-bundled with the
Vite vars from `.env.local`, driving the app's own `dataAdapter` code):
all 12 checks PASS against the real project —
`persistConversationWithMessage` resolves; REST confirms the conversation
row **and** both message rows in the DB with correct sender/content;
`loadMessages` returns both rows; `loadConversation` returns the row;
`loadInitial(admin)` includes the test conversation + messages;
`loadInitial(vet)` does **not** leak it; repeating the whole sequence is
idempotent (still exactly 2 message rows). Test-row deletes returned 204
but RLS left the rows in place (no anon delete policy) — see §5.

**Local-mode click-through** — `scripts/msgfix-local-e2e.cjs`
(playwright-core, keyless build, fresh profiles), at **1280×720 and
1366×768**: all 22 checks PASS — boot in demo mode; logout; register a new
user (demo verification-code flow); Messages → "Message Admin" → send 2
messages → both render, no failed affordance; the empty-thread placeholder
is **not** visible while a populated thread is open; **reload → both
messages persist**; Jaann login → all 4 seed conversations listed, seeded
thread renders history, no spurious placeholder; **zero JS page errors**.

**Suites:** `npm run build` ✅ · `npx tsc --noEmit` 0 errors ✅ ·
`sanity-auth.ts` ALL PASSED ✅ · `sanity-time.ts` 20/20 ✅.

## 4. Known data scars (left as-is, deliberately)

`conv-app-1791966419278` (Hasan) and `conv-admin-1791965088665` (maruf) have
`last_message` previews but no message rows — victims of the old race. They
were **not** backfilled: the true sent content is unrecoverable (the
adoption flow's `last_message` preview text differs from the actual first
message body, which included the application reason), so fabricating rows
would be inventing history. The fix prevents recurrence; these two threads
will show their real history from the next genuinely-sent message onward.
Admins can delete the two scar rows via dashboard SQL if desired.

## 5. Dashboard cleanup (test rows; anon role cannot delete them)

```sql
delete from public.chat_messages where conversation_id like 'w5-fix-conv-%';
delete from public.chat_messages where id in ('w5-fix-msg1');
delete from public.conversations where id like 'w5-fix-conv%';
```

## 6. Honest limits

- The full two-device realtime handshake (typing over the wire,
  ring-anywhere accept, in-call media) is still not machine-provable from
  this sandbox (no Supabase egress/UDP for the test browser) and awaits
  Maruf's two-device spot-check.
- If a sender's `public.users` row were ever missing, the message insert
  fails on the `sender_id` FK (23503); registration writes the profile row,
  so this is a non-issue for real flows, but it surfaces as a failed-send
  state rather than silent loss.
