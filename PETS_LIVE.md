# Pets Go Fully Live — W1 Report (2026-10-14)

Pet listings are now backed by the shared Supabase `public.pets` table: adds, edits
and deletes sync across devices in live mode, with optimistic UI and honest
degradation on failure. Local (keyless) mode is byte-for-byte unchanged.

## What changed (source only — artifact + GitHub untouched)

**`src/lib/petMappers.ts` (new)** — pure `rowToPet` / `petToRow` mappers, no
supabaseClient import so they unit-test in plain node/tsx. Re-exported from
`dataAdapter.ts` for app use.

**`src/lib/dataAdapter.ts`**
- `DataAdapter` gains: `loadPets(): Promise<Pet[] | null>`,
  `persistPetCreate(pet)`, `persistPetUpdate(pet)`, `persistPetDelete(petId)`,
  `subscribePets(onEvent: (e: PetRealtimeEvent) => void): () => void`
  where `PetRealtimeEvent = {type:'insert'|'update', pet} | {type:'delete', petId}`.
- `LocalAdapter`: all five are no-ops / return null (local mode untouched).
- `SupabaseAdapter.loadPets`: `select *` ordered by `date_added` desc, `id` asc,
  mapped through `rowToPet`.
- `persistPetCreate` → INSERT; `persistPetUpdate` → upsert on `id`;
  `persistPetDelete` → real DELETE by id (RLS allows it; verified `204` via REST).
- `writePetRow` helper: writes include the `tags` column, but if the live table
  predates the tags migration PostgREST rejects the whole write — the helper
  catches `PGRST204` / `42703` mentioning `'tags'` (the exact error observed live)
  and retries once without the tags key, so the listing still lands.
- `subscribePets`: channel `'pawmatch-pets'`, `postgres_changes` INSERT/UPDATE/DELETE
  on `public.pets`, parse errors logged not thrown.

**`src/App.tsx`** (surgical edits only, no consumer changes)
- New live-boot effect mirroring the messaging bootstrap: `loadPets()` replaces
  state, deduping by id against anything already in state (protects rows added
  before the load finished).
- New realtime effect: merges pet events into the shared `pets` state —
  insert/update → replace-by-id (clears a stale `unsynced` flag) or prepend;
  delete → filter-by-id (no resurrection on races).
- `handleAddPet` / `handleUpdatePet`: optimistic `setPets` first, then adapter
  persist; on failure the pet gets `unsynced: true` + toast
  `"Couldn't sync to the server — kept locally"`.
- `handleDeletePet`: optimistic remove (favorites cleanup unchanged); on server
  failure the pet is restored locally with `unsynced: true` + toast
  `"Couldn't sync the deletion — pet kept locally"`.
- All of the above is gated on `dataAdapter.mode === 'supabase'` — local mode
  runs the exact original code path.

**`src/types.ts`** — `Pet` gains optional `unsynced?: boolean` (local-only sync
marker; `petToRow` never sends it to the DB).

**`src/components/PetBadges.tsx`** — when `pet.unsynced`, an amber
"Not synced" badge (CloudOff icon, tooltip explains) is prepended to the badge
row, so it shows on pet cards everywhere (Find Pets, landing, dashboard).

**`supabase/schema.sql`**
- `public.pets` gains `tags text[] not null default '{}'` (seed pets carry tags;
  search filters + CSV exports consume them — needed for identical rendering).
- Idempotent `alter publication supabase_realtime add table public.pets;`
  (same do-block pattern as chat_messages) + idempotent tags-column ALTER.

## Mapping details (`rowToPet` / `petToRow`)

Column list mirrors `scripts/generate-seed.ts` line ~92 exactly, plus `tags`:
`id, name, species, breed, age_months, gender, size, color, energy_level,
good_with_kids, good_with_pets, vaccinated, neutered, health_notes, status,
owner_id, owner_name, owner_role, area, lat, lon, photo_url, description,
date_added` + `tags`.

- Outbound (`petToRow`): enum fields coerced to CHECK-safe values
  (species/size/energy lowercased + whitelisted, fallback `'other'`/`'medium'`/
  `'moderate'`; gender/status/owner_role exact-case, fallback `'Male'`/
  `'Available'`/`'owner'`); `owner_id`/`area`/coords/`date_added` null when empty;
  `unsynced` never included.
- Inbound (`rowToPet`): tolerant — unknown species→`'other'`, size→`'medium'`,
  energy→`'moderate'`, status→`'Available'`, gender→`'Male'`, owner_role→`'owner'`;
  `age_months` rounded/clamped ≥ 0, NaN→0; missing lat/lon→Dhaka (23.8103, 90.4125);
  `date_added`→`YYYY-MM-DD`; missing tags→`[]`; never throws.

## Test evidence

- `npm run build` ✅ · `npx tsc --noEmit` — 0 errors in all touched files
  (repo-wide run also surfaces errors in another worker's in-flight files
  `src/lib/useCall.ts` and `scripts/test-typing-throttle.ts` — not mine, not
  caused by this change).
- `sanity-auth.ts` → ALL PASSED · `sanity-time.ts` → 20/20.
- **REST + mapper round-trip** (`/tmp/w1-pets-test.ts`, tsx, 24/24 PASS):
  - `select pets` → 200, **15 rows**; `pet-1` → Bruno via `rowToPet`
    (species `dog`, energy `high`, gender `Male`, status `Available`,
    ownerRole `shelter`, dateAdded `2024-09-15`, lat 23.8071).
  - Tolerant-parse edge row (dinosaur/huge/extreme/…) → safe defaults, no crash.
  - `petToRow` → JSON → `rowToPet` round-trip of a probe pet with a **data-URL
    photo** and tags `['probe-tag','calm']`: name/photo/tags/description
    (incl. quotes, commas, `#`) all identical.
  - Live probe cycle: insert `w1-probe-1` → 201, update name/energy → 200 and
    read-back confirms, delete → 204 and row verifiably gone; final count back
    to **15**, zero `w1-probe-*` rows remain.
  - Insert **with** the `tags` key → `400 PGRST204` "Could not find the 'tags'
    column" — this is the exact error `writePetRow`'s fallback catches; the
    retry-without-tags shape then inserts 201.
- **Realtime attempt** (node, supabase-js, `/tmp/w1-pets-realtime.cjs`): WSS
  connects and SUBSCRIBEs fine; probe insert 201 + delete 204, but **zero
  `postgres_changes` events arrived** — the live `public.pets` is not yet in the
  `supabase_realtime` publication. This is precisely what the LIVE DB ACTION
  snippet below fixes.
- **Merge-logic unit test** (`/tmp/w1-pets-merge.cjs`, 8/8 PASS): replicates the
  App.tsx updater — remote insert prepends; insert racing optimistic entry
  dedupes by id and replaces in place (clears `unsynced`); update replaces by
  id; delete removes by id; duplicate delete is a no-op (no resurrection);
  unknown-id delete harmless.
- **Local-mode regression** (keyless `--base=./` build over `file://`,
  headless Chromium, `/tmp/w1-localmode-test.mjs`, 15/15 PASS): boots in Local
  mode; as admin — Dashboard opens, Add Pet submits, new pet appears in
  PetManager **and** Find Pets, edit saves, custom delete dialog shows the pet
  name and "Yes, delete" removes it; 0 uncaught console/page errors (sandbox
  Unsplash/Fonts SSL noise excluded as pre-existing artifacts).

## LIVE DB ACTION NEEDED (parent: run in Supabase SQL editor via browser task)

Apply **before** publishing the new build. Safe to re-run (all idempotent
except the backfills, which are plain idempotent UPDATEs by primary key).

```sql
-- 1. Realtime publication for pets (REQUIRED: without this, no cross-device
--    pet events arrive — verified: subscription SUBSCRIBEs but 0 events fire)
alter publication supabase_realtime add table public.pets;

-- 2. Tags column (needed for identical seed rendering + future writes)
alter table public.pets
  add column if not exists tags text[] not null default '{}';

-- 3. Backfill seed tags (generated from src/data/seedData.ts — the live rows
--    were seeded without tags)
update public.pets set tags = ARRAY['Friendly', 'Loves Water', 'Trained', 'Kid Friendly']::text[] where id = 'pet-1';
update public.pets set tags = ARRAY['Calm', 'Lap Cat', 'Fluffy', 'Quiet']::text[] where id = 'pet-2';
update public.pets set tags = ARRAY['Protective', 'Loyal', 'Intelligent', 'Athletic']::text[] where id = 'pet-3';
update public.pets set tags = ARRAY['Gentle', 'Playful', 'Rescue Hero']::text[] where id = 'pet-4';
update public.pets set tags = ARRAY['Affectionate', 'Eager to please', 'Family Dog']::text[] where id = 'pet-5';
update public.pets set tags = ARRAY['Curious', 'Agile', 'Smart']::text[] where id = 'pet-6';
update public.pets set tags = ARRAY['Vocal', 'Affectionate', 'Striking Eyes']::text[] where id = 'pet-7';
update public.pets set tags = ARRAY['Gentle', 'Litter Trained', 'Quiet Pet']::text[] where id = 'pet-8';
update public.pets set tags = ARRAY['Musical', 'Hand-Tamed', 'Colorful']::text[] where id = 'pet-9';
update public.pets set tags = ARRAY['Gentle Giant', 'Magnificent Coat', 'Purr Machine']::text[] where id = 'pet-10';
update public.pets set tags = ARRAY['Merry', 'Adventurous', 'Good with Dogs']::text[] where id = 'pet-11';
update public.pets set tags = ARRAY['Low Energy', 'Apartment Perfect', 'Snuggle Champion']::text[] where id = 'pet-12';
update public.pets set tags = ARRAY['Athletic', 'Playful', 'Cat Tree Lover']::text[] where id = 'pet-13';
update public.pets set tags = ARRAY['Chirpy', 'Social', 'Affectionate']::text[] where id = 'pet-14';
update public.pets set tags = ARRAY['Lionhead', 'Docile', 'Gentle']::text[] where id = 'pet-15';
```

Until step 1 is applied, live mode degrades honestly: initial pet load works
(REST), writes work, but cross-device realtime pet updates won't arrive (the app
logs the subscribe status; no crash). Until step 2, writes still succeed via the
`writePetRow` fallback (tags stay local-only) — verified against the live API.

## Honest limitations

- The full live loop (two real browsers, realtime pet insert → other client's
  UI updates) could NOT be machine-proven here: this sandbox's Chromium cannot
  reach Supabase (LNA/proxy block), and the publication add needs the parent's
  browser task. REST + mapper + merge-logic evidence above is the substitute;
  re-verify from an unrestricted network after the SQL is applied.
- `pets.tags` does not exist on the live DB yet (see action item); current live
  rows read back with `tags: []` until the backfill runs — search-by-tag and
  CSV Tags column will be empty for the 15 seeds until then.
- On a failed delete that is restored locally, the favorites cleanup is not
  rolled back (documented edge; favorites are local-only bookkeeping).
- No probe rows left behind: all `w1-probe-*` / `w1-rt-probe` rows inserted
  during testing were deleted via REST (204) and verified gone; pets count is
  back to exactly 15.

## ⚠️ Environment incident — parent action required

Mid-task the VM/service restarted and **wiped `/tmp`**, which contained the only
copies of `.env.local` (I had moved it aside for the keyless build, per the
established pattern). Consequences:

1. **`.env.local` is GONE** — the Supabase URL/anon key are not recoverable from
   the workspace (only truncated placeholders exist in docs). The parent must
   restore `.env.local` (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY); I never saw
   or printed the key values.
2. **`dist/` is currently a KEYLESS build** (my last `npm run build` ran without
   env). It must be rebuilt with keys after `.env.local` is restored — do NOT
   publish the current `dist/`.
3. The keyless test bundle `/tmp/pm-w1-keyless` was also wiped (it was
   scratch only; reproducible from source).

Source changes are all intact and committed to the working tree; only the
environment files above need the parent's attention.
