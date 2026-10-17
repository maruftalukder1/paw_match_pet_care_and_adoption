/**
 * seed-live.ts — Upserts the PawMatch demo seed data (src/data/seedData.ts)
 * into a live Supabase project via the anon key.
 *
 * Usage: npx tsx scripts/seed-live.ts
 * Env:   read from .env.local in this directory (VITE_SUPABASE_URL,
 *        VITE_SUPABASE_ANON_KEY). Never prints key values.
 *
 * Column mapping mirrors scripts/generate-seed.ts. Upsert on `id` conflict
 * so the script is re-runnable. Per-table error isolation: one table's
 * RLS rejection (e.g. `services`, which has NO anon insert policy) does
 * not stop the rest.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SEED_USERS,
  SEED_PETS,
  SEED_APPLICATIONS,
  SEED_LOST_FOUND,
  SEED_CONVERSATIONS,
  SEED_MESSAGES,
  SEED_MEDICAL_RECORDS,
  SEED_VACCINATIONS,
  SEED_SERVICES,
  SEED_NOTIFICATIONS,
} from '../src/data/seedData';

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  let text = '';
  try {
    text = readFileSync(join(HERE, '..', '.env.local'), 'utf-8');
  } catch (err) {
    throw new Error('.env.local not found — cannot load Supabase credentials');
  }
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/);
    if (m) env[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return env;
}

const env = loadEnv();
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !ANON) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env.local');
console.log(`Target: ${URL.replace(/^https?:\/\//, '').split('.')[0]}.supabase.co (key present: yes, value hidden)`);

const db: SupabaseClient = createClient(URL, ANON);

/** Parse "10:42 AM"/relative/yesterday into an ISO timestamp (mirrors generate-seed.ts). */
function tsToIso(ts: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const m = ts.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?\s*\.?[Mm]\.?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const isPM = m[4].toLowerCase() === 'p';
    if (h === 12) h = isPM ? 12 : 0;
    else if (isPM) h += 12;
    return new Date(`${ymd}T${String(h).padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`).toISOString();
  }
  const rel = ts.trim().toLowerCase().match(/^(\d+)\s*(min|hour|h|day)/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const ms = rel[2].startsWith('min') ? n * 60_000 : rel[2].startsWith('h') ? n * 3_600_000 : n * 86_400_000;
    return new Date(Date.now() - ms).toISOString();
  }
  if (/yesterday/i.test(ts)) return new Date(Date.now() - 86_400_000).toISOString();
  return new Date().toISOString();
}

// ---- row mappers (mirror generate-seed.ts) ----
const BASE_USER_KEYS = new Set([
  'id', 'name', 'email', 'phone', 'passwordHash', 'role', 'location',
  'isActive', 'failedLoginAttempts', 'isLocked', 'securityQuestion', 'securityAnswer',
]);

const userRows = SEED_USERS.map((u: any) => {
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(u)) if (!BASE_USER_KEYS.has(k)) extras[k] = v;
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone ?? null,
    password_hash: u.passwordHash, role: u.role,
    area: u.location?.area ?? null, lat: u.location?.lat ?? null, lon: u.location?.lon ?? null,
    is_active: u.isActive, failed_login_attempts: u.failedLoginAttempts ?? 0,
    is_locked: u.isLocked ?? false,
    security_question: u.securityQuestion ?? null, security_answer: u.securityAnswer ?? null,
    profile_json: extras,
  };
});

const petRows = SEED_PETS.map((p: any) => ({
  id: p.id, name: p.name, species: p.species, breed: p.breed ?? null,
  age_months: p.age_months ?? p.ageMonths ?? null, gender: p.gender, size: p.size,
  color: p.color ?? null, energy_level: p.energyLevel ?? null,
  good_with_kids: p.goodWithKids ?? false, good_with_pets: p.goodWithPets ?? false,
  vaccinated: p.vaccinated ?? false, neutered: p.neutered ?? false,
  health_notes: p.healthNotes ?? null, status: p.status,
  owner_id: p.ownerId ?? null, owner_name: p.ownerName ?? null, owner_role: p.ownerRole ?? null,
  area: p.location?.area ?? null, lat: p.location?.lat ?? null, lon: p.location?.lon ?? null,
  photo_url: p.photoUrl ?? null, description: p.description ?? null,
  date_added: p.dateAdded ?? null,
}));

const appRows = SEED_APPLICATIONS.map((a: any) => ({
  id: a.id, pet_id: a.petId, pet_name: a.petName, pet_breed: a.petBreed ?? null,
  pet_photo_url: a.petPhotoUrl ?? null, applicant_id: a.applicantId ?? null,
  applicant_name: a.applicantName ?? null, applicant_email: a.applicantEmail ?? null,
  applicant_phone: a.applicantPhone ?? null, applicant_address: a.applicantAddress ?? null,
  applicant_age: a.applicantAge ?? null, applicant_occupation: a.applicantOccupation ?? null,
  reason: a.reason ?? null, previous_experience: a.previousExperience ?? null,
  has_other_pets: a.hasOtherPets ?? null, has_enough_space: a.hasEnoughSpace ?? null,
  references: a.references ?? null, status: a.status ?? null,
  review_notes: a.reviewNotes ?? null,
}));

const convRows = SEED_CONVERSATIONS.map((c: any) => ({
  id: c.id, participant_ids: c.participantIds, participant_names: c.participantNames,
  pet_id: c.petId ?? null, last_message: c.lastMessage ?? null,
}));

const msgRows = SEED_MESSAGES.map((m: any) => ({
  id: m.id, conversation_id: m.conversationId, sender_id: m.senderId,
  sender_name: m.senderName ?? '', receiver_id: m.receiverId ?? '',
  content: m.content ?? '', is_read: m.isRead ?? false,
  created_at: tsToIso(m.timestamp ?? ''),
}));

const lostRows = SEED_LOST_FOUND.map((r: any) => ({
  id: r.id, type: r.type, species: r.species, breed: r.breed ?? null,
  pet_name: r.petName ?? null, color: r.color ?? null, size: r.size ?? null,
  area: r.area ?? null, lat: r.lat ?? null, lon: r.lon ?? null,
  date: r.date ?? null, description: r.description ?? null, photo_url: r.photoUrl ?? null,
  contact_name: r.contactName ?? null, contact_phone: r.contactPhone ?? null,
  status: r.status ?? null, matched_report_id: r.matchedReportId ?? null,
}));

const medRows = SEED_MEDICAL_RECORDS.map((m: any) => ({
  id: m.id, pet_id: m.petId, pet_name: m.petName ?? null, date: m.date ?? null,
  diagnosis: m.diagnosis ?? null, treatment: m.treatment ?? null,
  vet_name: m.vetName ?? null, weight_kg: m.weightKg ?? null, notes: m.notes ?? null,
}));

const vacRows = SEED_VACCINATIONS.map((v: any) => ({
  id: v.id, pet_id: v.petId, pet_name: v.petName ?? null,
  vaccine_name: v.vaccineName ?? null, date_administered: v.dateAdministered ?? null,
  next_due_date: v.nextDueDate ?? null,
}));

const svcRows = SEED_SERVICES.map((s: any) => ({
  id: s.id, provider_id: s.providerId ?? null, provider_name: s.providerName ?? null,
  service_type: s.serviceType ?? null, title: s.title ?? null,
  description: s.description ?? null, price: s.price ?? null,
  duration: s.duration ?? null, rating: s.rating ?? null, review_count: s.reviewCount ?? null,
  area: s.location?.area ?? null, lat: s.location?.lat ?? null, lon: s.location?.lon ?? null,
  image_url: s.imageUrl ?? null,
}));

const notifRows = SEED_NOTIFICATIONS.map((n: any) => ({
  id: n.id, user_id: n.userId, title: n.title ?? '', message: n.message ?? '',
  type: n.type ?? 'message', is_read: n.isRead ?? false,
  created_at: tsToIso(n.timestamp ?? ''),
}));

// FK-respecting order
const TABLES: Array<{ name: string; rows: Record<string, unknown>[]; rlsNote?: string }> = [
  { name: 'users', rows: userRows },
  { name: 'pets', rows: petRows },
  { name: 'conversations', rows: convRows },
  { name: 'chat_messages', rows: msgRows },
  { name: 'adoption_applications', rows: appRows },
  { name: 'lost_found_reports', rows: lostRows },
  { name: 'medical_records', rows: medRows },
  { name: 'vaccinations', rows: vacRows },
  { name: 'notifications', rows: notifRows },
  { name: 'services', rows: svcRows, rlsNote: 'no anon insert policy — RLS rejection expected; app uses local seed for services' },
];

interface TableResult {
  table: string;
  sent: number;
  ok: boolean;
  note: string;
}

async function main(): Promise<void> {
  const results: TableResult[] = [];
  for (const t of TABLES) {
    try {
      const { error } = await db.from(t.name).upsert(t.rows, { onConflict: 'id' });
      if (error) throw error;
      results.push({ table: t.name, sent: t.rows.length, ok: true, note: `upserted ${t.rows.length}` });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const isRls = /row-level security|policy/i.test(msg);
      results.push({ table: t.name, sent: t.rows.length, ok: false, note: `${isRls ? 'RLS/POLICY REJECTION' : 'ERROR'}: ${msg}` });
      if (t.rlsNote) results[results.length - 1].note += ` — (${t.rlsNote})`;
    }
  }

  console.log('\n== upsert results ==');
  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.table.padEnd(24)} sent=${r.sent} ${r.note}`);

  console.log('\n== final row counts (exact) ==');
  for (const t of TABLES) {
    try {
      const { count, error } = await db.from(t.name).select('*', { count: 'exact', head: true });
      if (error) throw error;
      console.log(`${t.name.padEnd(24)} db_rows=${count} expected=${t.rows.length}${count === t.rows.length ? '' : '  <-- MISMATCH'}`);
    } catch (err: any) {
      console.log(`${t.name.padEnd(24)} count query failed: ${err?.message ?? String(err)}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} table(s) failed — details above (per-table isolation kept the rest intact).`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err?.message ?? String(err));
  process.exit(1);
});
