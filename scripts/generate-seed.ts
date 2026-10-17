/**
 * generate-seed.ts — Emits supabase/seed.sql from src/data/seedData.ts.
 * Run:  npx tsx scripts/generate-seed.ts > supabase/seed.sql
 *
 * The SQL mirrors the local demo dataset so a fresh Supabase project shows
 * the same 15 pets / 11 users / conversations that the local fallback shows.
 */
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

const esc = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const arr = (v: unknown): string =>
  v === null || v === undefined
    ? 'null'
    : `'{${(v as string[]).map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(',')}}'`;
const json = (v: unknown): string => esc(JSON.stringify(v ?? {}));

/** Parse "10:42 AM" (or full ISO) into "YYYY-MM-DD HH:MM:SS" for today, else null. */
function tsToToday(ts: string): string | null {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const m = ts.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?\s*\.?[Mm]\.?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const isPM = m[4].toLowerCase() === 'p';
    if (h === 12) h = isPM ? 12 : 0;
    else if (isPM) h += 12;
    return `${ymd} ${String(h).padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
  }
  const rel = ts.trim().toLowerCase().match(/^(\d+)\s*(min|hour|h|day)/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const ms = rel[2].startsWith('min') ? n * 60_000 : rel[2].startsWith('h') ? n * 3_600_000 : n * 86_400_000;
    const t = new Date(Date.now() - ms);
    return t.toISOString().replace('T', ' ').substring(0, 19);
  }
  if (/yesterday/i.test(ts)) {
    const t = new Date(Date.now() - 86_400_000);
    return t.toISOString().replace('T', ' ').substring(0, 19);
  }
  return null;
}

const out: string[] = [];
out.push('-- ============================================================================');
out.push('-- PawMatch demo seed — generated from src/data/seedData.ts');
out.push('-- Regenerate: npx tsx scripts/generate-seed.ts > supabase/seed.sql');
out.push('-- Run AFTER schema.sql and policies.sql.');
out.push('-- Idempotent: uses ON CONFLICT DO NOTHING.');
out.push('-- ============================================================================');
out.push('');

// ---- USERS ----
out.push('-- USERS (' + SEED_USERS.length + ')');
const BASE_USER_KEYS = new Set([
  'id', 'name', 'email', 'phone', 'passwordHash', 'role', 'location',
  'isActive', 'failedLoginAttempts', 'isLocked', 'securityQuestion', 'securityAnswer',
]);
for (const u of SEED_USERS) {
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(u)) if (!BASE_USER_KEYS.has(k)) extras[k] = v;
  out.push(
    `insert into public.users (id, name, email, phone, password_hash, role, area, lat, lon, is_active, failed_login_attempts, is_locked, security_question, security_answer, profile_json) values (${[
      esc(u.id), esc(u.name), esc(u.email), esc(u.phone), esc(u.passwordHash), esc(u.role),
      esc(u.location?.area), u.location?.lat ?? 'null', u.location?.lon ?? 'null',
      esc(u.isActive), u.failedLoginAttempts ?? 0, esc(u.isLocked ?? false),
      esc(u.securityQuestion), esc(u.securityAnswer), json(extras),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');

// ---- PETS ----
out.push('-- PETS (' + SEED_PETS.length + ')');
for (const p of SEED_PETS) {
  out.push(
    `insert into public.pets (id, name, species, breed, age_months, gender, size, color, energy_level, good_with_kids, good_with_pets, vaccinated, neutered, health_notes, status, owner_id, owner_name, owner_role, area, lat, lon, photo_url, description, date_added) values (${[
      esc(p.id), esc(p.name), esc(p.species), esc(p.breed), (p as any).age_months ?? p.ageMonths ?? 'null',
      esc(p.gender), esc(p.size), esc(p.color), esc(p.energyLevel), esc(p.goodWithKids), esc(p.goodWithPets),
      esc(p.vaccinated), esc(p.neutered), esc(p.healthNotes), esc(p.status), esc(p.ownerId), esc(p.ownerName),
      esc(p.ownerRole), esc(p.location?.area), p.location?.lat ?? 'null', p.location?.lon ?? 'null',
      esc(p.photoUrl), esc(p.description), esc(p.dateAdded),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');

// ---- APPLICATIONS ----
out.push('-- ADOPTION APPLICATIONS (' + SEED_APPLICATIONS.length + ')');
for (const a of SEED_APPLICATIONS) {
  out.push(
    `insert into public.adoption_applications (id, pet_id, pet_name, pet_breed, pet_photo_url, applicant_id, applicant_name, applicant_email, applicant_phone, applicant_address, applicant_age, applicant_occupation, reason, previous_experience, has_other_pets, has_enough_space, "references", status, review_notes) values (${[
      esc(a.id), esc(a.petId), esc(a.petName), esc(a.petBreed), esc(a.petPhotoUrl), esc(a.applicantId),
      esc(a.applicantName), esc(a.applicantEmail), esc(a.applicantPhone), esc(a.applicantAddress),
      a.applicantAge ?? 'null', esc(a.applicantOccupation), esc(a.reason), esc(a.previousExperience),
      esc(a.hasOtherPets), esc(a.hasEnoughSpace), esc(a.references), esc(a.status), esc(a.reviewNotes),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');

// ---- CONVERSATIONS + MESSAGES ----
const msgTime = new Map<string, string>();
out.push('-- CONVERSATIONS (' + SEED_CONVERSATIONS.length + ')');
for (const c of SEED_CONVERSATIONS) {
  // last message time = newest of its messages (computed below), else legacy string
  msgTime.set(c.id, '');
  out.push(
    `insert into public.conversations (id, participant_ids, participant_names, pet_id, last_message) values (${[
      esc(c.id), arr(c.participantIds), arr(c.participantNames), esc(c.petId), esc(c.lastMessage),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');
out.push('-- CHAT MESSAGES (' + SEED_MESSAGES.length + ')');
const convTimes: Record<string, string> = {};
for (const m of SEED_MESSAGES) {
  const t = tsToToday(m.timestamp) ?? new Date().toISOString().replace('T', ' ').substring(0, 19);
  convTimes[m.conversationId] = !convTimes[m.conversationId] || convTimes[m.conversationId] < t ? t : convTimes[m.conversationId];
  out.push(
    `insert into public.chat_messages (id, conversation_id, sender_id, sender_name, receiver_id, content, is_read, created_at) values (${[
      esc(m.id), esc(m.conversationId), esc(m.senderId), esc(m.senderName), esc(m.receiverId),
      esc(m.content), esc(m.isRead), esc(t),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');
out.push('-- backfill conversation last_message_at from messages');
for (const [cid, t] of Object.entries(convTimes)) {
  out.push(`update public.conversations set last_message_at = '${t}' where id = '${cid}';`);
}
out.push('');

// ---- LOST & FOUND ----
out.push('-- LOST & FOUND (' + SEED_LOST_FOUND.length + ')');
for (const r of SEED_LOST_FOUND) {
  out.push(
    `insert into public.lost_found_reports (id, type, species, breed, pet_name, color, size, area, lat, lon, date, description, photo_url, contact_name, contact_phone, status, matched_report_id) values (${[
      esc(r.id), esc(r.type), esc(r.species), esc(r.breed), esc(r.petName), esc(r.color), esc(r.size),
      esc(r.area), r.lat ?? 'null', r.lon ?? 'null', esc(r.date), esc(r.description), esc(r.photoUrl),
      esc(r.contactName), esc(r.contactPhone), esc(r.status), esc(r.matchedReportId),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');

// ---- MEDICAL ----
out.push('-- MEDICAL RECORDS (' + SEED_MEDICAL_RECORDS.length + ')');
for (const m of SEED_MEDICAL_RECORDS) {
  out.push(
    `insert into public.medical_records (id, pet_id, pet_name, date, diagnosis, treatment, vet_name, weight_kg, notes) values (${[
      esc(m.id), esc(m.petId), esc(m.petName), esc(m.date), esc(m.diagnosis), esc(m.treatment),
      esc(m.vetName), m.weightKg ?? 'null', esc(m.notes),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');
out.push('-- VACCINATIONS (' + SEED_VACCINATIONS.length + ')  -- status computed in app, not stored');
for (const v of SEED_VACCINATIONS) {
  out.push(
    `insert into public.vaccinations (id, pet_id, pet_name, vaccine_name, date_administered, next_due_date) values (${[
      esc(v.id), esc(v.petId), esc(v.petName), esc(v.vaccineName), esc(v.dateAdministered), esc(v.nextDueDate),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');

// ---- SERVICES ----
out.push('-- SERVICES (' + SEED_SERVICES.length + ')');
for (const s of SEED_SERVICES) {
  out.push(
    `insert into public.services (id, provider_id, provider_name, service_type, title, description, price, duration, rating, review_count, area, lat, lon, image_url) values (${[
      esc(s.id), esc(s.providerId), esc(s.providerName), esc(s.serviceType), esc(s.title), esc(s.description),
      s.price ?? 'null', esc(s.duration), s.rating ?? 'null', s.reviewCount ?? 'null',
      esc(s.location?.area), s.location?.lat ?? 'null', s.location?.lon ?? 'null', esc(s.imageUrl),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');

// ---- NOTIFICATIONS ----
out.push('-- NOTIFICATIONS (' + SEED_NOTIFICATIONS.length + ')');
for (const n of SEED_NOTIFICATIONS) {
  const t = tsToToday(n.timestamp) ?? new Date().toISOString().replace('T', ' ').substring(0, 19);
  out.push(
    `insert into public.notifications (id, user_id, title, message, type, is_read, created_at) values (${[
      esc(n.id), esc(n.userId), esc(n.title), esc(n.message), esc(n.type), esc(n.isRead), esc(t),
    ].join(', ')}) on conflict (id) do nothing;`
  );
}
out.push('');

console.log(out.join('\n'));
