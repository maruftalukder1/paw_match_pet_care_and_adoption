/**
 * fullSyncMappers.ts — pure row <-> model mappers for the full live-sync
 * round (adoption applications, lost & found reports, medical records,
 * vaccinations, vet appointments).
 *
 * Kept in its own module (no supabaseClient import) so the mappers can be
 * unit-tested in plain node/tsx without a Vite build. dataAdapter.ts
 * re-exports them for app use.
 *
 * DB notes (supabase/schema.sql): tables are snake_case.
 *   adoption_applications: status CHECK ('Submitted','Under Review','Approved','Rejected','Completed');
 *     pet_id FK -> pets(id) ON DELETE CASCADE, applicant_id FK -> users(id) ON DELETE SET NULL.
 *   lost_found_reports: type CHECK ('Lost','Found'), status CHECK ('Active','Resolved'); NO foreign keys.
 *   medical_records: pet_id FK -> pets(id) ON DELETE CASCADE. weight_kg numeric.
 *   vaccinations: pet_id FK -> pets(id) ON DELETE CASCADE. status is COMPUTED in the app
 *     (src/utils/time.ts) and intentionally NOT stored — rowToVaccination
 *     derives it on read, vaccinationToRow never sends it.
 *   vet_appointments: pet_id FK -> pets(id) ON DELETE CASCADE,
 *     vet_id FK -> users(id) ON DELETE SET NULL,
 *     status CHECK ('Scheduled','Completed','Cancelled').
 * rowTo* is tolerant on the way in (unknown/missing -> sensible defaults,
 * never crashes); *ToRow coerces back to constrained values so writes can
 * never be rejected by a CHECK.
 */
import type {
  AdoptionApplication,
  LostFoundReport,
  MedicalRecord,
  PetSpecies,
  PetSize,
  VaccinationRecord,
  VetAppointment,
} from '../types';
import { todayISO } from '../utils/time';

const APP_STATUSES = ['Submitted', 'Under Review', 'Approved', 'Rejected', 'Completed'] as const;
const LOSTFOUND_TYPES = ['Lost', 'Found'] as const;
const LOSTFOUND_STATUSES = ['Active', 'Resolved'] as const;
const APPT_STATUSES = ['Scheduled', 'Completed', 'Cancelled'] as const;
const SIZES = ['small', 'medium', 'large'] as const;
const SPECIES = ['dog', 'cat', 'bird', 'rabbit', 'other'] as const;

/** DB date columns (date / timestamptz) -> YYYY-MM-DD app string, timezone-safe. */
function appDate(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v.length >= 10) return v.slice(0, 10);
  return fallback;
}

/** Full ISO timestamp for legacy display fields. */
function isoTs(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v.length >= 10) return v;
  return fallback;
}

/* ---------------- adoption_applications ---------------- */

export function rowToApplication(r: Record<string, unknown>): AdoptionApplication {
  const status = APP_STATUSES.includes(r.status as AdoptionApplication['status'])
    ? (r.status as AdoptionApplication['status'])
    : 'Submitted';
  return {
    id: String(r.id ?? ''),
    petId: String(r.pet_id ?? ''),
    petName: String(r.pet_name ?? ''),
    petBreed: String(r.pet_breed ?? ''),
    petPhotoUrl: String(r.pet_photo_url ?? ''),
    applicantId: String(r.applicant_id ?? ''),
    applicantName: String(r.applicant_name ?? ''),
    applicantEmail: String(r.applicant_email ?? ''),
    applicantPhone: String(r.applicant_phone ?? ''),
    applicantAddress: String(r.applicant_address ?? ''),
    applicantAge: Number.isFinite(Number(r.applicant_age)) ? Number(r.applicant_age) : 0,
    applicantOccupation: String(r.applicant_occupation ?? ''),
    reason: String(r.reason ?? ''),
    previousExperience: String(r.previous_experience ?? ''),
    hasOtherPets: Boolean(r.has_other_pets),
    hasEnoughSpace: Boolean(r.has_enough_space),
    references: String(r.references ?? ''),
    status,
    reviewNotes: r.review_notes ? String(r.review_notes) : undefined,
    submittedAt: isoTs(r.submitted_at, todayISO()),
    updatedAt: isoTs(r.updated_at ?? r.submitted_at, todayISO()),
  };
}

export function applicationToRow(a: AdoptionApplication): Record<string, unknown> {
  return {
    id: a.id,
    pet_id: a.petId || null,
    pet_name: a.petName,
    pet_breed: a.petBreed,
    pet_photo_url: a.petPhotoUrl,
    applicant_id: a.applicantId || null,
    applicant_name: a.applicantName,
    applicant_email: a.applicantEmail,
    applicant_phone: a.applicantPhone,
    applicant_address: a.applicantAddress,
    applicant_age: a.applicantAge,
    applicant_occupation: a.applicantOccupation,
    reason: a.reason,
    previous_experience: a.previousExperience,
    has_other_pets: a.hasOtherPets,
    has_enough_space: a.hasEnoughSpace,
    references: a.references,
    status: APP_STATUSES.includes(a.status as never) ? a.status : 'Submitted',
    review_notes: a.reviewNotes ?? null,
    submitted_at: a.submittedAt || new Date().toISOString(),
    updated_at: a.updatedAt || new Date().toISOString(),
  };
}

/* ---------------- lost_found_reports ---------------- */

export function rowToLostFound(r: Record<string, unknown>): LostFoundReport {
  const type = LOSTFOUND_TYPES.includes(r.type as LostFoundReport['type'])
    ? (r.type as LostFoundReport['type'])
    : 'Lost';
  const status = LOSTFOUND_STATUSES.includes(r.status as LostFoundReport['status'])
    ? (r.status as LostFoundReport['status'])
    : 'Active';
  const species = (SPECIES as readonly string[]).includes(String(r.species))
    ? (r.species as PetSpecies)
    : 'dog';
  const size = (SIZES as readonly string[]).includes(String(r.size))
    ? (r.size as PetSize)
    : 'medium';
  return {
    id: String(r.id ?? ''),
    type,
    species,
    breed: String(r.breed ?? ''),
    petName: r.pet_name ? String(r.pet_name) : undefined,
    color: String(r.color ?? ''),
    size,
    area: String(r.area ?? ''),
    lat: Number.isFinite(Number(r.lat)) ? Number(r.lat) : 23.8103,
    lon: Number.isFinite(Number(r.lon)) ? Number(r.lon) : 90.4125,
    date: appDate(r.date, todayISO()),
    description: String(r.description ?? ''),
    photoUrl: String(r.photo_url ?? ''),
    contactName: String(r.contact_name ?? ''),
    contactPhone: String(r.contact_phone ?? ''),
    status,
    matchedReportId: r.matched_report_id ? String(r.matched_report_id) : undefined,
  };
}

export function lostFoundToRow(r: LostFoundReport): Record<string, unknown> {
  return {
    id: r.id,
    type: r.type === 'Found' ? 'Found' : 'Lost',
    species: (SPECIES as readonly string[]).includes(r.species) ? r.species : 'dog',
    breed: r.breed,
    pet_name: r.petName ?? null,
    color: r.color,
    size: (SIZES as readonly string[]).includes(r.size) ? r.size : 'medium',
    area: r.area,
    lat: r.lat,
    lon: r.lon,
    date: r.date || null,
    description: r.description,
    photo_url: r.photoUrl,
    contact_name: r.contactName,
    contact_phone: r.contactPhone,
    status: r.status === 'Resolved' ? 'Resolved' : 'Active',
    matched_report_id: r.matchedReportId ?? null,
  };
}

/* ---------------- medical_records ---------------- */

export function rowToMedicalRecord(r: Record<string, unknown>): MedicalRecord {
  return {
    id: String(r.id ?? ''),
    petId: String(r.pet_id ?? ''),
    petName: String(r.pet_name ?? ''),
    date: appDate(r.date, todayISO()),
    diagnosis: String(r.diagnosis ?? ''),
    treatment: String(r.treatment ?? ''),
    vetName: String(r.vet_name ?? ''),
    weightKg: Number.isFinite(Number(r.weight_kg)) ? Number(r.weight_kg) : 0,
    notes: String(r.notes ?? ''),
  };
}

export function medicalRecordToRow(m: MedicalRecord): Record<string, unknown> {
  return {
    id: m.id,
    pet_id: m.petId || null,
    pet_name: m.petName,
    date: m.date || null,
    diagnosis: m.diagnosis,
    treatment: m.treatment,
    vet_name: m.vetName,
    weight_kg: m.weightKg,
    notes: m.notes,
  };
}

/* ---------------- vaccinations ---------------- */

export function rowToVaccination(r: Record<string, unknown>): VaccinationRecord {
  return {
    id: String(r.id ?? ''),
    petId: String(r.pet_id ?? ''),
    petName: String(r.pet_name ?? ''),
    vaccineName: String(r.vaccine_name ?? ''),
    dateAdministered: appDate(r.date_administered, todayISO()),
    nextDueDate: appDate(r.next_due_date, todayISO()),
    // Schema comment: status is computed client-side from nextDueDate
    // (src/utils/time.ts). The DB row carries no status column; keep the
    // field for shape compatibility but always recompute on read.
    status: 'Upcoming',
  };
}

export function vaccinationToRow(v: VaccinationRecord): Record<string, unknown> {
  return {
    id: v.id,
    pet_id: v.petId || null,
    pet_name: v.petName,
    vaccine_name: v.vaccineName,
    date_administered: v.dateAdministered || null,
    next_due_date: v.nextDueDate || null,
  };
}

/* ---------------- vet_appointments ---------------- */

export function rowToAppointment(r: Record<string, unknown>): VetAppointment {
  const status = APPT_STATUSES.includes(r.status as VetAppointment['status'])
    ? (r.status as VetAppointment['status'])
    : 'Scheduled';
  return {
    id: String(r.id ?? ''),
    petId: String(r.pet_id ?? ''),
    petName: String(r.pet_name ?? ''),
    vetId: String(r.vet_id ?? ''),
    vetName: String(r.vet_name ?? ''),
    clinicName: String(r.clinic_name ?? ''),
    date: appDate(r.date, todayISO()),
    timeSlot: String(r.time_slot ?? ''),
    reason: String(r.reason ?? ''),
    status,
  };
}

export function appointmentToRow(a: VetAppointment): Record<string, unknown> {
  return {
    id: a.id,
    pet_id: a.petId || null,
    pet_name: a.petName,
    vet_id: a.vetId || null,
    vet_name: a.vetName,
    clinic_name: a.clinicName,
    date: a.date || null,
    time_slot: a.timeSlot,
    reason: a.reason,
    status: APPT_STATUSES.includes(a.status as never) ? a.status : 'Scheduled',
  };
}
