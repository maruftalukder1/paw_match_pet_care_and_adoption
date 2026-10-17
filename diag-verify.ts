import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
async function main() {
  const env: Record<string, string> = {};
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = process.env.OTP_TOKEN || '';
  const { data, error } = await sb.auth.verifyOtp({ email: 'talukdermaruf9+pawtest1013@gmail.com', token, type: 'signup' });
  if (error) { console.log('VERIFY ERROR:', error.status, error.message); }
  else { console.log('VERIFY SUCCESS — user confirmed:', data.user?.email, '| confirmed_at:', data.user?.email_confirmed_at); }
}
main();
