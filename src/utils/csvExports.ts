/**
 * Shared CSV column definitions for PawMatch data exports.
 *
 * Each export only carries non-sensitive display fields. Notably, user exports
 * deliberately exclude `passwordHash`, `securityQuestion` and `securityAnswer`.
 */
import type { ActivityLog, AdoptionApplication, AnyUser, Pet } from '../types';
import type { CsvColumn } from './csv';

export const auditLogColumns: CsvColumn<ActivityLog>[] = [
  { header: 'ID', get: (l) => l.id },
  { header: 'Timestamp', get: (l) => l.timestamp },
  { header: 'Actor', get: (l) => l.actor },
  { header: 'Action', get: (l) => l.action },
  { header: 'Details', get: (l) => l.details },
];

/** Organization/business/clinic name for role-specific user profiles, blank otherwise. */
function orgNameOf(user: AnyUser): string {
  if ('organizationName' in user) return user.organizationName;
  if ('clinicName' in user) return user.clinicName;
  if ('businessName' in user) return user.businessName;
  return '';
}

export const userColumns: CsvColumn<AnyUser>[] = [
  { header: 'ID', get: (u) => u.id },
  { header: 'Name', get: (u) => u.name },
  { header: 'Email', get: (u) => u.email },
  { header: 'Phone', get: (u) => u.phone },
  { header: 'Role', get: (u) => u.role },
  { header: 'Organization', get: (u) => orgNameOf(u) },
  { header: 'Area', get: (u) => u.location.area },
  { header: 'Active', get: (u) => u.isActive },
  { header: 'Email Verified', get: (u) => (u.emailVerified ?? true) },
];

export const petColumns: CsvColumn<Pet>[] = [
  { header: 'ID', get: (p) => p.id },
  { header: 'Name', get: (p) => p.name },
  { header: 'Species', get: (p) => p.species },
  { header: 'Breed', get: (p) => p.breed },
  { header: 'Age (months)', get: (p) => p.ageMonths },
  { header: 'Gender', get: (p) => p.gender },
  { header: 'Size', get: (p) => p.size },
  { header: 'Color', get: (p) => p.color },
  { header: 'Energy Level', get: (p) => p.energyLevel },
  { header: 'Good With Kids', get: (p) => p.goodWithKids },
  { header: 'Good With Pets', get: (p) => p.goodWithPets },
  { header: 'Vaccinated', get: (p) => p.vaccinated },
  { header: 'Neutered', get: (p) => p.neutered },
  { header: 'Health Notes', get: (p) => p.healthNotes },
  { header: 'Status', get: (p) => p.status },
  { header: 'Owner ID', get: (p) => p.ownerId },
  { header: 'Owner Name', get: (p) => p.ownerName },
  { header: 'Owner Role', get: (p) => p.ownerRole },
  { header: 'Area', get: (p) => p.location.area },
  { header: 'Description', get: (p) => p.description },
  { header: 'Tags', get: (p) => (p.tags ?? []).join('; ') },
  { header: 'Date Added', get: (p) => p.dateAdded },
];

export const applicationColumns: CsvColumn<AdoptionApplication>[] = [
  { header: 'ID', get: (a) => a.id },
  { header: 'Pet ID', get: (a) => a.petId },
  { header: 'Pet Name', get: (a) => a.petName },
  { header: 'Pet Breed', get: (a) => a.petBreed },
  { header: 'Applicant ID', get: (a) => a.applicantId },
  { header: 'Applicant Name', get: (a) => a.applicantName },
  { header: 'Applicant Email', get: (a) => a.applicantEmail },
  { header: 'Applicant Phone', get: (a) => a.applicantPhone },
  { header: 'Applicant Address', get: (a) => a.applicantAddress },
  { header: 'Applicant Age', get: (a) => a.applicantAge },
  { header: 'Applicant Occupation', get: (a) => a.applicantOccupation },
  { header: 'Reason', get: (a) => a.reason },
  { header: 'Previous Experience', get: (a) => a.previousExperience },
  { header: 'Has Other Pets', get: (a) => a.hasOtherPets },
  { header: 'Has Enough Space', get: (a) => a.hasEnoughSpace },
  { header: 'References', get: (a) => a.references },
  { header: 'Status', get: (a) => a.status },
  { header: 'Review Notes', get: (a) => a.reviewNotes },
  { header: 'Submitted At', get: (a) => a.submittedAt },
  { header: 'Updated At', get: (a) => a.updatedAt },
];
