/**
 * FULLSYNC live round-trip test.
 * Drives the app's own dataAdapter against the REAL project (node, REST is
 * reachable; browser egress to supabase.co is blocked in this sandbox).
 * Bundle first with esbuild, defining the two Vite vars from .env.local:
 *   npx esbuild scripts/fullsync-live-test.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/fullsync-live-test.mjs \
 *     --define:import.meta.env='{"VITE_SUPABASE_URL":"<url>","VITE_SUPABASE_ANON_KEY":"<key>"}'
 *   node /tmp/fullsync-live-test.mjs
 * Test rows use the `w6-sync-` prefix. Cleanup at the end attempts deletes
 * via the anon key; anon DELETE is not granted on these tables, so expected
 * 4xx is reported as dashboard-cleanup ids instead.
 */
import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^(VITE_SUPABASE_(URL|ANON_KEY))=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[3].trim();
}
if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.error('FATAL: live keys missing from .env.local');
  process.exit(2);
}

const { dataAdapter } = await import('../src/lib/dataAdapter.js');

const stamp = Date.now();
const APP = `w6-sync-app-${stamp}`;
const LF = `w6-sync-lf-${stamp}`;
const MED = `w6-sync-med-${stamp}`;
const VAC = `w6-sync-vac-${stamp}`;
const APPT = `w6-sync-appt-${stamp}`;
const now = new Date().toISOString();
const leftover: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};
const rest = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: process.env.VITE_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
    },
    ...init,
  });
  return res;
};
const getRow = async (table: string, id: string) => {
  const res = await rest(`${table}?select=*&id=eq.${id}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
};

console.log(`adapter mode: ${dataAdapter.mode}`);
check('adapter is live (supabase)', dataAdapter.mode === 'supabase');

/* ---------- 1. adoption applications ---------- */
// pet-1 and u-adopter-1 are seed rows that exist in the DB (FKs must hold).
const app = {
  id: APP,
  petId: 'pet-1',
  petName: 'Bruno',
  petBreed: 'Labrador Retriever',
  petPhotoUrl: '',
  applicantId: 'u-adopter-1',
  applicantName: 'Jaann Rahman',
  applicantEmail: 'jaann@pawmatch.com',
  applicantPhone: '+8801711111111',
  applicantAddress: 'Mirpur, Dhaka',
  applicantAge: 28,
  applicantOccupation: 'Engineer',
  reason: 'fullsync live probe',
  previousExperience: 'None',
  hasOtherPets: false,
  hasEnoughSpace: true,
  references: '',
  status: 'Submitted' as const,
  reviewNotes: undefined,
  submittedAt: now,
  updatedAt: now,
};
await dataAdapter.persistApplicationCreate(app);
const appRow = await getRow('adoption_applications', APP);
check('app create landed in DB', appRow?.pet_name === 'Bruno' && appRow?.status === 'Submitted');

// Admin review: approve + a second row auto-rejected (companion batch path)
const APP2 = `${APP}-b`;
await dataAdapter.persistApplicationCreate({ ...app, id: APP2, reason: 'companion probe' });
await dataAdapter.persistApplicationStatuses([
  { id: APP, status: 'Approved' },
  { id: APP2, status: 'Rejected', reviewNotes: 'Position filled by another approved applicant.' },
]);
const appRowAfter = await getRow('adoption_applications', APP);
const app2RowAfter = await getRow('adoption_applications', APP2);
check('app approve persisted', appRowAfter?.status === 'Approved');
check('app companion reject persisted', app2RowAfter?.status === 'Rejected');

// Adapter read-back
const apps = await dataAdapter.loadApplications();
check('loadApplications includes probe rows', !!apps?.some((a) => a.id === APP));

// Idempotency: repeat create must not duplicate
await dataAdapter.persistApplicationCreate(app);
const dupRows = await (await rest(`adoption_applications?select=id&id=eq.${APP}`)).json();
check('idempotent: still one app row', dupRows.length === 1);

/* ---------- 2. lost & found ---------- */
const lf = {
  id: LF,
  type: 'Lost' as const,
  species: 'cat' as const,
  breed: 'Persian',
  petName: 'ProbeCat',
  color: 'White',
  size: 'medium' as const,
  area: 'Dhanmondi',
  lat: 23.74,
  lon: 90.37,
  date: '2026-10-14',
  description: 'fullsync live probe',
  photoUrl: 'data:image/jpeg;base64,/9j/',
  contactName: 'Probe',
  contactPhone: '+8801700000000',
  status: 'Active' as const,
  matchedReportId: undefined,
};
await dataAdapter.persistLostFoundCreate(lf);
const lfRow = await getRow('lost_found_reports', LF);
check('lostfound create landed (photo_url present)', lfRow?.status === 'Active' && typeof lfRow?.photo_url === 'string');
await dataAdapter.persistLostFoundResolve(LF);
const lfRowAfter = await getRow('lost_found_reports', LF);
check('lostfound resolve persisted', lfRowAfter?.status === 'Resolved');
const lfs = await dataAdapter.loadLostFound();
check('loadLostFound includes probe row', !!lfs?.some((r) => r.id === LF));

/* ---------- 3. healthcare ---------- */
const med = {
  id: MED,
  petId: 'pet-1',
  petName: 'Bruno',
  date: '2026-10-14',
  diagnosis: 'fullsync probe diagnosis',
  treatment: 'probe treatment',
  vetName: 'Dr. Probe',
  weightKg: 27.5,
  notes: 'probe notes',
};
await dataAdapter.persistMedicalCreate(med);
const medRow = await getRow('medical_records', MED);
check('medical create landed', medRow?.diagnosis === 'fullsync probe diagnosis');

const vac = {
  id: VAC,
  petId: 'pet-1',
  petName: 'Bruno',
  vaccineName: 'ProbeVax',
  dateAdministered: '2026-10-14',
  nextDueDate: '2027-10-14',
  status: 'Upcoming' as const,
};
await dataAdapter.persistVaccinationCreate(vac);
const vacRow = await getRow('vaccinations', VAC);
check('vaccination create landed (no status column)', vacRow?.vaccine_name === 'ProbeVax' && !('status' in (vacRow ?? {})));

const appt = {
  id: APPT,
  petId: 'pet-1',
  petName: 'Bruno',
  vetId: 'u-vet-1',
  vetName: 'Dr. Sarah Bennett',
  clinicName: 'Central Care Vet Clinic',
  date: '2026-10-20',
  timeSlot: '10:00 AM',
  reason: 'fullsync probe',
  status: 'Scheduled' as const,
};
await dataAdapter.persistAppointmentCreate(appt);
const apptRow = await getRow('vet_appointments', APPT);
check('appointment create landed', apptRow?.status === 'Scheduled');
await dataAdapter.persistAppointmentStatus(APPT, 'Cancelled');
const apptRowAfter = await getRow('vet_appointments', APPT);
check('appointment status update persisted', apptRowAfter?.status === 'Cancelled');

const health = await dataAdapter.loadHealthcare();
check(
  'loadHealthcare includes probe rows',
  !!health?.medical.some((m) => m.id === MED) &&
    !!health?.vaccinations.some((v) => v.id === VAC) &&
    !!health?.appointments.some((a) => a.id === APPT)
);

/* ---------- 4. policy stress: FK violation must reject loudly ---------- */
let fkFailed = false;
try {
  await dataAdapter.persistApplicationCreate({ ...app, id: `${APP}-fk`, petId: 'no-such-pet' });
} catch (e) {
  fkFailed = true;
}
check('FK violation on bogus pet_id rejects (no silent loss)', fkFailed);

/* ---------- 5. cleanup ---------- */
const tables = [
  ['adoption_applications', APP],
  ['adoption_applications', APP2],
  ['lost_found_reports', LF],
  ['medical_records', MED],
  ['vaccinations', VAC],
  ['vet_appointments', APPT],
];
for (const [table, id] of tables) {
  const res = await rest(`${table}?id=eq.${id}`, { method: 'DELETE' });
  if (res.status === 204) {
    console.log(`cleanup: deleted ${table}/${id}`);
  } else {
    console.log(`cleanup: anon DELETE refused on ${table} (status ${res.status}) — dashboard cleanup needed`);
    leftover.push(`${table}: ${id}`);
  }
}
// The FK probe row never got created (insert rejected), but be tidy if it did:
const fkProbe = await getRow('adoption_applications', `${APP}-fk`);
if (fkProbe) leftover.push(`adoption_applications: ${APP}-fk`);

if (leftover.length > 0) {
  console.log('LEFTOVER TEST ROWS (delete via dashboard SQL):');
  for (const l of leftover) console.log(`  delete from public.${l.split(': ')[0]} where id = '${l.split(': ')[1]}';`);
} else {
  console.log('cleanup: no leftover test rows');
}

console.log(failures === 0 ? '\nALL LIVE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
