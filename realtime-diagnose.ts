/**
 * realtime-diagnose.ts — retry with diagnostics:
 * logs EVERY postgres_changes event on chat_messages (not just probe id),
 * longer wait, and checks whether the probe insert itself lands.
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
const uniq = Date.now().toString(36);
const PROBE_ID = `msg-diag-${uniq}`;
const CONV_ID = 'conv-admin-1';

async function main(): Promise<void> {
  const clientA = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const clientB = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

  let gotProbe = false;
  let anyEvent = 0;

  const channel = clientA.channel('diag-chat').on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'chat_messages' },
    (payload) => {
      anyEvent++;
      const row: any = payload.new ?? payload.old ?? {};
      console.log(`event #${anyEvent}: type=${payload.eventType} id=${row.id ?? 'n/a'}`);
      if (row.id === PROBE_ID) gotProbe = true;
    }
  );

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('subscribe timeout')), 30000);
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') { clearTimeout(t); resolve(); }
    });
  });
  console.log('subscribed');

  const { error } = await clientB.from('chat_messages').insert({
    id: PROBE_ID, conversation_id: CONV_ID,
    sender_id: 'u-admin-1', sender_name: 'Admin Supervisor',
    receiver_id: 'u-adopter-1',
    content: `diag-probe ${uniq} (test row, safe to delete)`,
    is_read: false, created_at: new Date().toISOString(),
  });
  if (error) throw new Error('insert failed: ' + error.message);
  console.log(`probe inserted: ${PROBE_ID}`);

  await new Promise((r) => setTimeout(r, 35000));
  console.log(`after 35s: anyEvent=${anyEvent} probeReceived=${gotProbe}`);

  const { error: delErr } = await clientB.from('chat_messages').delete().eq('id', PROBE_ID);
  console.log(delErr ? `cleanup delete blocked: ${delErr.message}` : 'cleanup: probe deleted OK');
  await clientA.removeChannel(channel);
  process.exit(gotProbe ? 0 : 2);
}

main().catch((e) => { console.error('FATAL:', e?.message ?? String(e)); process.exit(1); });
