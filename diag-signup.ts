/**
 * scripts/diag-signup.ts — one-off diagnostic for the live registration failure.
 *
 * Reproduces exactly what AuthModal's register handler does (signUp + resend)
 * and prints the RAW Supabase Auth error so the "Could not reach the
 * verification service" banner can be root-caused.
 *
 * Run: npx tsx scripts/diag-signup.ts
 * NOTE: runs signUp ONCE against the live project (one confirmation email
 * will land in Maruf's inbox). Do not re-run more than one more time.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually (do NOT print these values).
const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = 'talukdermaruf9+pawtest1013@gmail.com';
const password = 'PawTest!2026x';

function describe(label: string, res: { data: unknown; error: unknown }) {
  const e = res.error as {
    status?: number;
    code?: string;
    message?: string;
    __isAuthError?: boolean;
  } | null;
  const d = res.data as {
    user?: { id?: string; email?: string; identities?: unknown[] } | null;
    session?: unknown;
  } | null;
  console.log(`\n===== ${label} =====`);
  if (e) {
    console.log('ERROR STATUS :', e.status ?? '(none)');
    console.log('ERROR CODE   :', e.code ?? '(none)');
    console.log('ERROR MESSAGE:', e.message ?? '(none)');
    console.log('RAW ERROR    :', JSON.stringify(e));
  } else {
    console.log('ERROR        : none');
    console.log('USER ID      :', d?.user?.id ?? '(none)');
    console.log('USER EMAIL   :', d?.user?.email ?? '(none)');
    console.log(
      'IDENTITIES   :',
      Array.isArray(d?.user?.identities) ? d.user.identities.length : '(unknown)'
    );
    console.log('SESSION      :', d?.session ? 'present' : 'absent (confirmation required)');
  }
}

async function main() {
  console.log('--- signUp (one attempt) ---');
  const signup = await supabase.auth.signUp({ email, password });
  describe('auth.signUp', signup);

  // If signUp failed, stop here so we don't compound the failure.
  if (signup.error) return;

  console.log('\n--- resend (signup OTP) ---');
  const resend = await supabase.auth.resend({ type: 'signup', email });
  describe('auth.resend', resend);
}

main().catch((err) => {
  console.log('\n===== FATAL (thrown, not an AuthError) =====');
  console.log('NAME   :', (err as Error)?.name);
  console.log('MESSAGE:', (err as Error)?.message);
  console.log('RAW    :', String(err).slice(0, 500));
  process.exit(2);
});
