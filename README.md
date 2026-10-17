# PawMatch — Supabase setup

Live mode gives the app a shared Postgres database + Realtime messaging, so
two different users on two different devices can message each other. Without
these steps the app runs in **local demo mode** (seed data + this browser's
localStorage) — everything still works, chats just stay on one device.

## What Maruf needs to do (one time, ~10 minutes)

1. Create a free project at https://supabase.com (his own account — Pip never
   creates accounts or handles his credentials).
2. In the Supabase dashboard open **SQL Editor** and run, in this order:
   - `supabase/schema.sql` — tables, indexes, Realtime on `chat_messages`
   - `supabase/policies.sql` — RLS, demo-open policies (read the header!)
   - `supabase/seed.sql` — the same 15 pets / 11 users / chats as the local demo
3. Copy **Project URL** and **anon public key** from Project Settings → API.
4. Create `.env.local` next to `package.json`:
   ```
   VITE_SUPABASE_URL="https://xyzcompany.supabase.co"
   VITE_SUPABASE_ANON_KEY="eyJhbGciOi..."
   ```
5. Restart the dev server (`npm run dev`) or rebuild/redeploy (`npm run build`).
   The app detects the keys and switches to live mode automatically; the chat
   shows a green "Live" badge instead of the amber "Demo mode" banner.

## Verifying it worked

- Open the app in two different browsers (or normal + incognito).
- Log in as `jaann@pawmatch.com` / `user123` in one, as `admin` / `admin` in the other.
- Send a message from one — it should appear in the other within a second or two.
- In the Supabase dashboard, Table Editor → `chat_messages` should show the row.

## Regenerating the seed

If the local seed data changes, regenerate:
```
npx tsx scripts/generate-seed.ts > supabase/seed.sql
```

## Security note

The bundled policies are **demo-open** (anon key can read everything and write
user content). That is acceptable for a classroom demo but not for a public
product. `policies.sql` documents the stricter Supabase-Auth-backed variants
in comments — wiring Supabase Auth into the login flow is the natural next step
after this pass.
