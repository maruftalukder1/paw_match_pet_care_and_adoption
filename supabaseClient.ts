/**
 * supabaseClient.ts — Shared Supabase client for PawMatch.
 *
 * Reads credentials from Vite env vars:
 *   VITE_SUPABASE_URL      e.g. https://xyzcompany.supabase.co
 *   VITE_SUPABASE_ANON_KEY the project's anon (public) key
 *
 * If either is missing, `supabase` is null and the app runs in LOCAL
 * fallback mode (seed data + localStorage, exactly like v1). Nothing in
 * the app may assume the client exists — always go through
 * `isSupabaseEnabled` / the data adapter.
 *
 * Maruf's next step (after he creates his own Supabase project):
 *   1. Run supabase/schema.sql, then supabase/seed.sql in the SQL editor.
 *   2. Set the two VITE_ vars in .env.local (see .env.example).
 *   3. Restart the dev server / redeploy. The app switches to live mode
 *      automatically and realtime messaging starts working.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True only when both credentials are present. */
export const isSupabaseEnabled: boolean = Boolean(url && anonKey);

/**
 * The shared client, or null in local fallback mode.
 * Callers must null-check; the data adapter does this for you.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 10 } },
      })
    : null;
