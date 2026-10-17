/**
 * realtime-probe.ts — End-to-end realtime test for chat_messages.
 * 1) Client A subscribes to INSERT events on public.chat_messages.
 * 2) Client B inserts a probe message into conv-admin-1.
 * 3) Client A must receive it within TIMEOUT_MS.
 * 4) Attempts to delete the probe row (expected to FAIL: no anon delete
 *    policy on chat_messages — the id is then reported for manual cleanup).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const text = readFileSync(join(HERE, '..', '.env.local'), 'utf-8');
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/);
    if (m) env[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return env;
}
const env = loadEnv();
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !ANON) throw new Error('credentials missing');

const TIMEOUT_MS = 20000;
const uniq = Date.now().toString(36);
const PROBE_ID = `msg-probe-${uniq}`;
const PROBE_CONTENT = `realtime-probe ${uniq} (test row, safe to delete)`;
const CONV_ID = 'conv-admin-1';

async function main(): Promise<void> {
  const clientA = createClient(URL, ANON);
  const clientB = createClient(URL, ANON);

  let received: any = null;
  let resolveEvent!: (row: any) => void;
  const eventPromise = new Promise<any>((res) => (resolveEvent = res));

  const channel = clientA
    .channel('probe-chat')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
      if ((payload.new as any).id === PROBE_ID) {
        received = payload.new;
        resolveEvent(received);
      }
    });

  const subscribedAt = Date.now();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('subscribe timed out')), TIMEOUT_MS);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  console.log(`subscribe: SUBSCRIBED in ${Date.now() - subscribedAt}ms`);

  const sentAt = Date.now();
  const { error: insErr } = await clientB.from('chat_messages').insert({
    id: PROBE_ID,
    conversation_id: CONV_ID,
    sender_id: 'u-admin-1',
    sender_name: 'Admin Supervisor',
    receiver_id: 'u-adopter-1',
    content: PROBE_CONTENT,
    is_read: false,
    created_at: new Date().toISOString(),
  });
  if (insErr) throw new Error(`insert failed: ${insErr.message}`);
  console.log(`insert: probe row ${PROBE_ID} written at ${new Date(sentAt).toISOString()}`);

  const winner = await Promise.race([
    eventPromise,
    new Promise<null>((res) => setTimeout(() => res(null), TIMEOUT_MS)),
  ]);
  const elapsed = Date.now() - sentAt;
  if (winner) {
    console.log(`realtime: EVENT RECEIVED in ${elapsed}ms — content matches: ${winner.content === PROBE_CONTENT}`);
  } else {
    console.log(`realtime: TIMEOUT after ${elapsed}ms — FAIL`);
    process.exitCode = 2;
  }

  const { error: delErr } = await clientB.from('chat_messages').delete().eq('id', PROBE_ID);
  if (delErr) {
    console.log(`cleanup: delete blocked (${delErr.message}) — probe row remains:`);
    console.log(`  id=${PROBE_ID} conversation_id=${CONV_ID} content="${PROBE_CONTENT}"`);
  } else {
    console.log(`cleanup: probe row ${PROBE_ID} deleted OK`);
  }

  await clientA.removeChannel(channel);
}

main().catch((err) => {
  console.error('FATAL:', err?.message ?? String(err));
  process.exit(1);
});
