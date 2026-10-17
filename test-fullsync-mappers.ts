/**
 * FULLSYNC mapper unit tests (run with tsx). Pure functions — no Supabase.
 *   npx tsx scripts/test-fullsync-mappers.ts
 * Covers row<->model round-trips for adoption applications, lost & found
 * reports, medical records, vaccinations, vet appointments, plus edge
 * cases (empty photo, null fields, date coercions, status CHECK coercion).
 */
import {
  rowToApplication,
  applicationToRow,
  rowToLostFound,
  lostFoundToRow,
  rowToMedicalRecord,
  medicalRecordToRow,
  rowToVaccination,
  vaccinationToRow,
  rowToAppointment,
  appointmentToRow,
} from '../src/lib/fullSyncMappers.js';
import type {
  AdoptionApplication,
  LostFoundReport,
  MedicalRecord,
  VaccinationRecord,
  VetAppointment,
} from '../src/types.js';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

/* ---------- adoption applications ---------- */
const app: AdoptionApplication = {
  id: 'app-test-1',
  petId: 'pet-1',
  petName: 'Bruno',
  petBreed: 'Labrador Retriever',
  petPhotoUrl: 'https://example.com/b.jpg',
  applicantId: 'u-adopter-1',
  applicantName: 'Jaann Rahman',
  applicantEmail: 'jaann@pawmatch.com',
  applicantPhone: '+8801711111111',
  applicantAddress: 'Mirpur, Dhaka',
  applicantAge: 28,
  applicantOccupation: 'Engineer',
  reason: 'Companion, "quoted" & commas, too',
  previousExperience: 'Owned dogs',
  hasOtherPets: true,
  hasEnoughSpace: true,
  references: 'Mr. X',
  status: 'Submitted',
  reviewNotes: undefined,
  submittedAt: '2026-10-14T10:00:00.000Z',
  updatedAt: '2026-10-14T10:00:00.000Z',
};
const appRow = applicationToRow(app);
check('app row snake_case', appRow.pet_id === 'pet-1' && appRow.applicant_name === 'Jaann Rahman');
check('app reason survives quotes/commas', appRow.reason === 'Companion, "quoted" & commas, too');
const appBack = rowToApplication(appRow as Record<string, unknown>);
check('app round-trip name', appBack.petName === 'Bruno');
check('app round-trip reason exact', appBack.reason === app.reason);
check('app round-trip status', appBack.status === 'Submitted');
check('app reviewNotes optional absent', appBack.reviewNotes === undefined);

// Edge: DB row with null applicant (SET NULL FK) and bad status string
const appNull = rowToApplication({
  id: 'x',
  pet_id: 'p',
  applicant_id: null,
  applicant_age: null,
  has_other_pets: null,
  status: 'Whatever',
  submitted_at: null,
} as Record<string, unknown>);
check('app null applicant id tolerated', appNull.applicantId === '');
check('app null age -> 0', appNull.applicantAge === 0);
check('app bad status -> Submitted', appNull.status === 'Submitted');
check('app null submitted_at -> date fallback', appNull.submittedAt.length === 10);

// Coercion on write: junk status never hits the DB CHECK
const appJunk = applicationToRow({ ...app, status: 'Junk' as never });
check('app write coerces status', appJunk.status === 'Submitted');

/* ---------- lost & found ---------- */
const lf: LostFoundReport = {
  id: 'lf-test-1',
  type: 'Lost',
  species: 'cat',
  breed: 'Persian',
  petName: 'Luna',
  color: 'White',
  size: 'medium',
  area: 'Dhanmondi',
  lat: 23.7465,
  lon: 90.3763,
  date: '2026-10-01',
  description: 'Very friendly, responds to name',
  photoUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  contactName: 'Maruf',
  contactPhone: '+8801722222222',
  status: 'Active',
};
const lfRow = lostFoundToRow(lf);
check('lf row photoUrl passes through', lfRow.photo_url === lf.photoUrl);
const lfBack = rowToLostFound(lfRow as Record<string, unknown>);
check('lf round-trip data-url intact', lfBack.photoUrl === lf.photoUrl);
check('lf round-trip coords', lfBack.lat === 23.7465 && lfBack.lon === 90.3763);

const lfEmpty = rowToLostFound({ id: 'e', type: 'Weird', size: 'xl', species: 'dragon' } as Record<string, unknown>);
check('lf bad type -> Lost', lfEmpty.type === 'Lost');
check('lf bad size -> medium', lfEmpty.size === 'medium');
check('lf bad species -> dog', lfEmpty.species === 'dog');
check('lf empty photo -> empty string (honest paw fallback)', lfEmpty.photoUrl === '');

/* ---------- medical records ---------- */
const med: MedicalRecord = {
  id: 'med-test-1',
  petId: 'pet-1',
  petName: 'Bruno',
  date: '2026-10-05',
  diagnosis: 'Skin allergy',
  treatment: 'Antihistamine',
  vetName: 'Dr. Sarah Bennett',
  weightKg: 28.5,
  notes: "Itchy, red patches — O'Brien's notes",
};
const medRow = medicalRecordToRow(med);
check('med numeric weight_kg', medRow.weight_kg === 28.5);
const medBack = rowToMedicalRecord(medRow as Record<string, unknown>);
check('med round-trip diagnosis exact', medBack.diagnosis === med.diagnosis);
check('med notes with quotes/apostrophe', medBack.notes === med.notes);

const medNull = rowToMedicalRecord({ id: 'n', weight_kg: null, date: '2026-10-05T09:00:00Z' } as Record<string, unknown>);
check('med null weight -> 0', medNull.weightKg === 0);
check('med timestamptz -> YYYY-MM-DD', medNull.date === '2026-10-05');

/* ---------- vaccinations ---------- */
const vac: VaccinationRecord = {
  id: 'vac-test-1',
  petId: 'pet-1',
  petName: 'Bruno',
  vaccineName: 'Rabies',
  dateAdministered: '2026-01-10',
  nextDueDate: '2027-01-10',
  status: 'Upcoming',
};
const vacRow = vaccinationToRow(vac);
check('vac row has NO status column (computed client-side)', !('status' in (vacRow as object)));
const vacBack = rowToVaccination(vacRow as Record<string, unknown>);
check('vac round-trip dates', vacBack.dateAdministered === '2026-01-10' && vacBack.nextDueDate === '2027-01-10');

/* ---------- appointments ---------- */
const appt: VetAppointment = {
  id: 'appt-test-1',
  petId: 'pet-2',
  petName: 'Luna',
  vetId: 'u-vet-1',
  vetName: 'Dr. Sarah Bennett',
  clinicName: 'Central Care Vet Clinic',
  date: '2026-10-20',
  timeSlot: '10:00 AM',
  reason: 'Booster',
  status: 'Scheduled',
};
const apptRow = appointmentToRow(appt);
const apptBack = rowToAppointment(apptRow as Record<string, unknown>);
check('appt round-trip vet/clinic', apptBack.vetName === 'Dr. Sarah Bennett' && apptBack.clinicName === 'Central Care Vet Clinic');
const apptBad = rowToAppointment({ id: 'b', status: 'Weird' } as Record<string, unknown>);
check('appt bad status -> Scheduled', apptBad.status === 'Scheduled');

console.log(failures === 0 ? `\nALL ${29} CHECKS PASSED` : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
