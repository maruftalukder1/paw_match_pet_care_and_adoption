/** Confirms anon delete on chat_messages is a silent no-op (no anon delete policy). */
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
  for (const id of ['msg-probe-mv6twrhu', 'msg-diag-mv6tz39w']) {
    const { data, error, count } = await db
      .from('chat_messages')
      .delete({ count: 'exact' })
      .eq('id', id)
      .select('id');
    console.log(`${id}: error=${error?.message ?? 'none'} affected=${count} returned=${(data ?? []).length}`);
  }
}
main().catch((e) => { console.error('FATAL:', e?.message ?? String(e)); process.exit(1); });
