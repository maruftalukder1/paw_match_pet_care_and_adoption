# PawMatch — Full Live-Sync Round (applications, lost & found, healthcare)

**Date:** 2026-10-14 · **Working copy:** `hidden_files/pawmatch-v2/` (source only; artifact/GitHub untouched)

The three remaining local-only slices now sync through Supabase exactly like
pets/conversations/messages/notifications do. Live mode loads each slice from
the DB on boot (DB rows are the shared truth; seed rows already live there),
writes persist through the adapter with MSGFIX discipline (ordered awaited
writes, idempotent upsert-on-id, transient retry, failures reject → the UI
shows an honest toast and keeps the row locally — never a silent loss), and
realtime channels merge cross-device INSERT/UPDATE events by id. Local mode
is untouched; offline fallback keeps local data with a console note.

## What shipped per slice

**1. Adoption applications** — `dataAdapter` gains `loadApplications`,
`persistApplicationCreate` (upsert-on-id), `persistApplicationStatuses`
(batch: each affected row awaited sequentially, a permanent failure rejects
the batch), `subscribeApplications` (channel `pawmatch-applications`).
App.tsx: `handleSubmitApplication` persists the new row; `handleApproveApplication`
persists the approval AND every auto-rejected competing application; the pet's
`Adopted` status change also goes through the existing `persistPetUpdate`;
`handleRejectApplication` persists the rejection. Admin console + applicant's
My Applications + CSV export all read the same state, so DB state is what the
UI shows everywhere. FK note: `pet_id` → pets is enforced; an application for
a pet that never synced is rejected by the DB and surfaced (proven in tests).

**2. Lost & Found** — `loadLostFound`, `persistLostFoundCreate` (upsert-on-id,
photo data-URL goes in `photo_url`), `persistLostFoundResolve`
(status → 'Resolved'), `subscribeLostFound` (channel `pawmatch-lostfound`).
No FKs on this table, so creates can't race.

**3. Healthcare** — `loadHealthcare` (one parallel fetch of the three tables),
`persistMedicalCreate`, `persistVaccinationCreate`, `persistAppointmentCreate`
(all upsert-on-id), `persistAppointmentStatus`, `subscribeHealthcare`
(channel `pawmatch-healthcare`; INSERT on medical_records/vaccinations,
INSERT+UPDATE on vet_appointments). The app previously had NO write UI for
medical records/vaccinations (seed-read-only), so this round adds it:
PetDetailsModal gained a vet/shelter-gated "+ Add medical record /
vaccination" form (two tabs, minimal fields; section renders even when a pet
has no records yet), and PetCareView's appointments list gained
Complete/Cancel buttons for vet/shelter on Scheduled appointments. Vaccination
status is computed from `nextDueDate` everywhere — `vaccinationToRow` never
sends a status (the DB has no such column; the schema comment says the same),
`rowToVaccination` marks it 'Upcoming' and both consumers recompute via
`computeVaccinationStatus` (the timezone-safe helper from the earlier fix);
PetDetailsModal's card previously trusted `vac.status` and now computes it
like PetCareView always did.

**Bonus fix found by the new tests (pre-existing, not caused by this round):**
a freshly registered adopter visiting Find Pets crashed the page
(`TypeError: Cannot read properties of undefined (reading 'length')` —
the listings default to match-sort, and `calculateCompatibilityScore` read
`preferredSpecies.length` on a user whose profile has no matchmaker fields).
`calculateCompatibilityScore` now normalizes the adopter with safe defaults
at entry (`src/utils/geoAndMatchmaker.ts`). Verified: no page error, scores
render for the new user.

## Files changed
`src/lib/fullSyncMappers.ts` (new: 5 pure row↔model mapper pairs),
`src/lib/dataAdapter.ts` (interface + SupabaseAdapter + LocalAdapter stubs),
`src/App.tsx` (3 boot loads, 3 realtime subscriptions, 9 write call-sites),
`src/components/PetDetailsModal.tsx` (add-record forms + computed vaccine status),
`src/components/PetCareView.tsx` (Complete/Cancel controls),
`src/utils/geoAndMatchmaker.ts` (profile-field hardening),
`scripts/test-fullsync-mappers.ts` (new), `scripts/fullsync-live-test.ts` (new),
`scripts/fullsync-local-e2e.cjs` (new).

## Test evidence
- **Mapper units** (`scripts/test-fullsync-mappers.ts`, tsx, plain node): **29/29 PASS** —
  round-trips for all 5 models incl. quotes/commas/newlines in text fields,
  data-URL photo passthrough, null-field tolerance, timestamptz → YYYY-MM-DD,
  CHECK-constraint coercion on write (junk status/species/size/type).
- **Live adapter round-trips** (`scripts/fullsync-live-test.ts`, esbuild-bundled
  with the real `.env.local` keys, driving the app's own adapter against the
  real project): **15/15 PASS** — application create → DB row → approve +
  companion-reject batch → statuses reflected → `loadApplications` read-back →
  idempotent re-create (still 1 row); lost-found create (photo_url present) →
  resolve → `loadLostFound`; medical + vaccination + appointment creates →
  `loadHealthcare`; appointment status → 'Cancelled'; FK violation on a bogus
  `pet_id` **rejects loudly** (no silent loss). **Cleanup correction:** the
  test's REST DELETEs all returned 204, which I initially read as success —
  but a follow-up REST scan proved the rows were NOT deleted: PostgREST
  returns 204 even when RLS silently matches zero rows, and there is no anon
  DELETE policy on these tables (correctly, per policies.sql). **6 probe rows
  remain and MUST be deleted via dashboard SQL** (see below) — not via REST.
- **Local-mode click-through** (`scripts/fullsync-local-e2e.cjs`, Playwright,
  fresh profile, keyless build on :4173, 1366×768): **19/19 PASS, zero JS
  page errors** — register new adopter → apply for Bruno → reload → listed in
  My Applications → admin approves → applicant sees Approved after reload →
  lost-pet report with uploaded PNG photo appears + survives reload →
  vet login → add medical record + vaccination in the detail modal → both
  survive reload → book appointment → Complete → status flips.
- **Suites:** `npm run build` ✅ · `npx tsc --noEmit` ✅ (only the pre-existing
  `vite.artifact.config.ts` overload quirk, unrelated) · `sanity-auth`
  ALL PASSED · `sanity-time` 20/20.
- **Regression spot-checks:** pets live path code untouched (adapter methods
  and App wiring from the earlier round unchanged; keyed build clean);
  messaging auth suites still pass; the matchmaker crash fix above.

## Dashboard SQL needed (Pip, please run — idempotent, guarded)

Add the five tables to the realtime publication so the three new channels
receive cross-device events:

```sql
do $$ begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='adoption_applications')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='adoption_applications') then
    alter publication supabase_realtime add table public.adoption_applications;
  end if;
  if exists (select 1 from pg_tables where schemaname='public' and tablename='lost_found_reports')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='lost_found_reports') then
    alter publication supabase_realtime add table public.lost_found_reports;
  end if;
  if exists (select 1 from pg_tables where schemaname='public' and tablename='medical_records')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='medical_records') then
    alter publication supabase_realtime add table public.medical_records;
  end if;
  if exists (select 1 from pg_tables where schemaname='public' and tablename='vaccinations')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='vaccinations') then
    alter publication supabase_realtime add table public.vaccinations;
  end if;
  if exists (select 1 from pg_tables where schemaname='public' and tablename='vet_appointments')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='vet_appointments') then
    alter publication supabase_realtime add table public.vet_appointments;
  end if;
end $$;
```

Then verify with:
```sql
select tablename from pg_publication_tables where pubname='supabase_realtime'
  and tablename in ('adoption_applications','lost_found_reports','medical_records','vaccinations','vet_appointments');
```
Expected: all 5 rows.

## Leftover test rows — dashboard cleanup REQUIRED (do not skip)

The live test's probe rows (prefix `w6-sync-`, stamp `1791995543040`) could not
be removed via REST (no anon DELETE policy — the 204s were RLS no-ops).
Delete them in this FK-safe order (messages-independent tables first is fine
here; applications reference pets, and deleting applications needs no
cascade worries):

```sql
delete from public.adoption_applications where id like 'w6-sync-%';
delete from public.lost_found_reports where id like 'w6-sync-%';
delete from public.medical_records where id like 'w6-sync-%';
delete from public.vaccinations where id like 'w6-sync-%';
delete from public.vet_appointments where id like 'w6-sync-%';
```
Verify: `select id from public.adoption_applications where id like 'w6-sync-%';`
(and the same for the other four tables) — expected: 0 rows each.

## Policy gaps (true dashboard follow-ups, app designed to fit current policies)
- **vaccinations / medical_records have anon INSERT but no anon UPDATE**
  (policies.sql defines only `public read` + `anon insert` for them). The app
  therefore offers **add-only** for these slices — no edit UI for existing rows
  in this round. If Maruf wants vets to correct entries, add guarded policies
  `anon update medical_records` / `anon update vaccinations` (mirror the
  applications-review pattern), and a small edit affordance can follow.
- **No anon DELETE on any of the five tables** (by design — same as pets/chat).
  The app exposes no delete UI for these slices; test rows were cleaned via
  the granted anon DELETE during this round only.

## Honest limits
- Realtime delivery (INSERT on device A → list updates on device B) is
  machine-unproven here: the sandbox browser can't reach supabase.co and the
  tables aren't yet in the publication (pending the SQL above). The wiring
  mirrors the proven `pawmatch-pets`/`pawmatch-chat` channels exactly, and
  REST write/read-back is proven 15/15 against the real DB.
- Two-client live acceptance (status flips, cross-device lists) still awaits
  Maruf's real two-device spot-check — same ask as the previous rounds.
- `activity_logs` remain local-only (no table need; they mirror the local CSV
  audit log). `services` stay unseeded/demo-open by design (no anon insert
  policy, per the original decision); `favorites` stay per-device local by
  design (privacy).
