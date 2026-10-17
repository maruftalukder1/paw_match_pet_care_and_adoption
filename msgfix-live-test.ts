/**
 * MSGFIX live round-trip test (run with tsx).
 * NOTE: src/lib/supabaseClient.ts reads Vite's import.meta.env, which does
 * not exist under plain node. Bundle first with esbuild, defining the two
 * Vite vars from .env.local (see MSGFIX.md), then run the bundle with
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in the environment.
 *   1. persistConversationWithMessage(conv, msg)  (the fixed path used by
 *      the adoption flow + Message Admin/Shelter/user flows)
 *   2. REST-assert both rows exist in the DB
 *   3. loadMessages(convId) — the fresh-thread server fetch — returns the row
 *   4. loadConversation(convId) — the unknown-conversation fetch — returns it
 *   5. loadInitial(admin) — the admin-side snapshot — includes the conv
 *   6. Idempotency: repeat persistConversationWithMessage — must NOT
 *      duplicate or throw (upsert-on-id)
 * Test rows use the `w5-fix-` prefix; cleanup at the end deletes the
 * message + conversation rows (anon delete is not granted on these
 * tables, so failure here is expected and reported for dashboard cleanup).
 */
import { readFileSync } from 'node:fs';
// Live keys: read .env.local here (the esbuild --define below replaces
// import.meta.env inside src/lib/supabaseClient.ts for the bundle).
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^(VITE_SUPABASE_(URL|ANON_KEY))=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[3].trim();
}
if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.error('FATAL: live keys missing from .env.local');
  process.exit(2);
}

// Importing the real adapter module (same code the app uses).
const { dataAdapter } = await import('../src/lib/dataAdapter.js');
const { supabase } = await import('../src/lib/supabaseClient.js');

const stamp = Date.now();
const CONV = `w5-fix-conv-${stamp}`;
const MSG1 = `w5-fix-msg-${stamp}-1`;
const MSG2 = `w5-fix-msg-${stamp}-2`;
const now = new Date().toISOString();
let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};
const rest = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: process.env.VITE_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
    },
    ...init,
  });
  return res;
};

console.log(`adapter mode: ${dataAdapter.mode}`);
check('adapter is live (supabase)', dataAdapter.mode === 'supabase');

// 1. Fixed path: new-conversation + first message, mirroring Hasan's
//    adoption-application flow (conv-app-*).
await dataAdapter.persistConversationWithMessage(
  {
    id: CONV,
    participantIds: ['u-adopter-3', 'u-admin-1'],
    participantNames: ['Hasan Mahmud', 'Admin Supervisor (Adoption Desk)'],
    petId: undefined,
    lastMessage: 'Hello Admin, I have submitted an adoption application for Luna (Persian Cat).',
    lastMessageTime: now,
    lastMessageAt: now,
    unreadCount: 1,
  },
  {
    id: MSG1,
    conversationId: CONV,
    senderId: 'u-adopter-3',
    senderName: 'Hasan Mahmud',
    receiverId: 'u-admin-1',
    content: 'Hello Admin! I have just submitted my adoption application for Luna (Persian Cat).',
    timestamp: now,
    createdAt: now,
    isRead: false,
  }
);
console.log('PASS  persistConversationWithMessage resolved without throwing');

// 2. Plain send on the now-existing conversation (mirrors handleSendMessage).
await dataAdapter.persistMessage({
  id: MSG2,
  conversationId: CONV,
  senderId: 'u-admin-1',
  senderName: 'Admin Supervisor',
  receiverId: 'u-adopter-3',
  content: 'Thanks Hasan! We received your application for Luna.',
  timestamp: now,
  createdAt: now,
  isRead: false,
});
console.log('PASS  persistMessage (plain send) resolved without throwing');

// 3. REST ground truth: rows actually in the DB.
const convRows = await (
  await rest(`conversations?select=id,last_message&id=eq.${CONV}`)
).json();
check('conversation row in DB', convRows.length === 1, JSON.stringify(convRows[0]?.last_message));
const msgRows = await (
  await rest(`chat_messages?select=id,sender_id,content&conversation_id=eq.${CONV}&order=created_at`)
).json();
check('both message rows in DB', msgRows.length === 2, msgRows.map((r: { id: string }) => r.id).join(','));
check(
  'first message has correct sender + content',
  msgRows[0]?.sender_id === 'u-adopter-3' && msgRows[0]?.content.startsWith('Hello Admin!')
);

// 4. Fresh-thread server fetch (used on thread open).
const fresh = await dataAdapter.loadMessages(CONV);
check('loadMessages returns both rows', (fresh?.length ?? 0) === 2);

// 5. Unknown-conversation fetch (used by the realtime handler).
const one = await dataAdapter.loadConversation(CONV);
check('loadConversation returns the row', one?.id === CONV);

// 6. Admin-side snapshot includes the new conversation (scoping check).
const adminSnap = await dataAdapter.loadInitial('u-admin-1');
check('loadInitial(admin) includes test conv', !!adminSnap?.conversations.some((c) => c.id === CONV));
check('loadInitial(admin) includes test messages', !!adminSnap?.messages.some((m) => m.id === MSG1));
const otherSnap = await dataAdapter.loadInitial('u-vet-1');
check(
  'loadInitial(vet) does NOT leak test conv',
  !otherSnap?.conversations.some((c) => c.id === CONV)
);

// 7. Idempotency: repeat the whole sequence — must not throw or duplicate.
await dataAdapter.persistConversationWithMessage(
  {
    id: CONV,
    participantIds: ['u-adopter-3', 'u-admin-1'],
    participantNames: ['Hasan Mahmud', 'Admin Supervisor (Adoption Desk)'],
    petId: undefined,
    lastMessage: 'Hello Admin, I have submitted an adoption application for Luna (Persian Cat).',
    lastMessageTime: now,
    lastMessageAt: now,
    unreadCount: 1,
  },
  {
    id: MSG1,
    conversationId: CONV,
    senderId: 'u-adopter-3',
    senderName: 'Hasan Mahmud',
    receiverId: 'u-adopter-3',
    content: 'Hello Admin! I have just submitted my adoption application for Luna (Persian Cat).',
    timestamp: now,
    createdAt: now,
    isRead: false,
  }
);
const msgRowsAfter = await (
  await rest(`chat_messages?select=id&conversation_id=eq.${CONV}`)
).json();
check('idempotent: still exactly 2 message rows', msgRowsAfter.length === 2);

// 8. Cleanup.
const delMsg = await rest(`chat_messages?conversation_id=eq.${CONV}`, { method: 'DELETE' });
const delConv = await rest(`conversations?id=eq.${CONV}`, { method: 'DELETE' });
console.log(`cleanup: delete messages -> ${delMsg.status}, delete conversation -> ${delConv.status}`);
if (delMsg.status !== 204 || delConv.status !== 204) {
  console.log(
    `NOTE: anon delete not permitted; please delete from the dashboard SQL editor:\n` +
      `delete from public.chat_messages where conversation_id = '${CONV}';\n` +
      `delete from public.conversations where id = '${CONV}';`
  );
}

if (supabase) console.log('(supabase client present)');
console.log(failures === 0 ? '\nALL LIVE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
