/**
 * verify-loadinitial.ts — Runs the exact queries SupabaseAdapter.loadInitial()
 * uses for a given user id, and reports row counts. Also spot-checks a few
 * seed fields for sanity.
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
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function main(): Promise<void> {
  for (const userId of ['u-adopter-1', 'u-admin-1']) {
    const [convRes, msgRes, notifRes] = await Promise.all([
      db.from('conversations').select('*').contains('participant_ids', [userId]),
      db.from('chat_messages').select('*').order('created_at', { ascending: true }),
      db.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    ]);
    if (convRes.error) throw new Error(`conversations query: ${convRes.error.message}`);
    if (msgRes.error) throw new Error(`messages query: ${msgRes.error.message}`);
    const convIds = new Set((convRes.data ?? []).map((r: any) => r.id));
    const messages = (msgRes.data ?? []).filter((r: any) => convIds.has(r.conversation_id));
    console.log(`\nloadInitial('${userId}'): conversations=${(convRes.data ?? []).length} messages(in those convs)=${messages.length} notifications=${notifRes.error ? 'ERR:' + notifRes.error.message : (notifRes.data ?? []).length}`);
    for (const c of convRes.data ?? []) {
      console.log(`  conv ${c.id}: participants=${JSON.stringify(c.participant_ids)} last_message_at=${c.last_message_at}`);
    }
    for (const m of messages) {
      console.log(`  msg ${m.id}: conv=${m.conversation_id} from=${m.sender_id} created_at=${m.created_at} content="${String(m.content).slice(0, 50)}"`);
    }
  }

  // spot checks
  const { data: pet } = await db.from('pets').select('id,name,species,status').eq('id', 'pet-1').single();
  console.log(`\nspot check pet-1: ${JSON.stringify(pet)}`);
  const { data: user } = await db.from('users').select('id,name,role,email').eq('id', 'u-admin-1').single();
  console.log(`spot check u-admin-1: ${JSON.stringify(user)}`);
  const { data: svc } = await db.from('services').select('id', { count: 'exact', head: true });
  console.log(`services rows: ${svc === null ? 'n/a' : 'n/a (count above)'}`);
}

main().catch((e) => { console.error('FATAL:', e?.message ?? String(e)); process.exit(1); });
