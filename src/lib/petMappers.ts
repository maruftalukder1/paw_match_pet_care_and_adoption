/**
 * petMappers.ts — pure row <-> Pet mappers for the live `public.pets` table.
 *
 * Kept in its own module (no supabaseClient import) so the mappers can be
 * unit-tested in plain node/tsx without a Vite build. dataAdapter.ts
 * re-exports them for app use.
 *
 * DB notes: the table is snake_case and enforces CHECK constraints on
 * species ('dog','cat','bird','rabbit','other'), gender ('Male','Female'),
 * size ('small','medium','large'), energy_level ('low','moderate','high'),
 * status ('Available','Pending','Adopted','Lost','Found') and owner_role
 * ('owner','shelter'). The seed data matches; rowToPet is tolerant on the
 * way in (unknown/missing -> sensible defaults, never crashes) and petToRow
 * coerces back to the constrained values so the DB never rejects a write.
 */
import type { Pet, PetSpecies, PetSize, EnergyLevel, PetStatus } from '../types';
import { todayISO } from '../utils/time';

export const PET_SPECIES = ['dog', 'cat', 'bird', 'rabbit', 'other'] as const;
export const PET_SIZES = ['small', 'medium', 'large'] as const;
export const PET_ENERGY = ['low', 'moderate', 'high'] as const;
export const PET_STATUSES = ['Available', 'Pending', 'Adopted', 'Lost', 'Found'] as const;

/** Finite number or fallback — never NaN leaks into the app. */
function petNum(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function rowToPet(r: Record<string, unknown>): Pet {
  const species = PET_SPECIES.includes(r.species as PetSpecies)
    ? (r.species as PetSpecies)
    : 'other';
  const size = PET_SIZES.includes(r.size as PetSize) ? (r.size as PetSize) : 'medium';
  const energyLevel = PET_ENERGY.includes(r.energy_level as EnergyLevel)
    ? (r.energy_level as EnergyLevel)
    : 'moderate';
  const status = PET_STATUSES.includes(r.status as PetStatus)
    ? (r.status as PetStatus)
    : 'Available';
  const tagsRaw = Array.isArray(r.tags) ? r.tags : [];
  return {
    id: String(r.id ?? `pet-${Date.now()}`),
    name: String(r.name ?? 'Unnamed Pet'),
    species,
    breed: String(r.breed ?? ''),
    ageMonths: Math.max(0, Math.round(petNum(r.age_months, 0))),
    gender: r.gender === 'Female' ? 'Female' : 'Male',
    size,
    color: String(r.color ?? ''),
    energyLevel,
    goodWithKids: Boolean(r.good_with_kids),
    goodWithPets: Boolean(r.good_with_pets),
    vaccinated: Boolean(r.vaccinated),
    neutered: Boolean(r.neutered),
    healthNotes: String(r.health_notes ?? ''),
    status,
    ownerId: String(r.owner_id ?? ''),
    ownerName: String(r.owner_name ?? ''),
    ownerRole: r.owner_role === 'shelter' ? 'shelter' : 'owner',
    location: {
      area: String(r.area ?? ''),
      // Dhaka fallback for missing coords (the app is Dhaka-focused).
      lat: petNum(r.lat, 23.8103),
      lon: petNum(r.lon, 90.4125),
    },
    photoUrl: String(r.photo_url ?? ''),
    description: String(r.description ?? ''),
    tags: tagsRaw.filter((t): t is string => typeof t === 'string'),
    dateAdded:
      typeof r.date_added === 'string'
        ? r.date_added.slice(0, 10)
        : todayISO(),
  };
}

/**
 * App Pet -> DB row. Mirrors the proven column list in
 * scripts/generate-seed.ts (the pets insert), plus the newer `tags` column.
 * Enum fields are coerced to their CHECK-constrained values so writes can
 * never be rejected by a constraint. `unsynced` is local-only and is never
 * sent to the DB.
 */
export function petToRow(p: Pet): Record<string, unknown> {
  const lc = String(p.species ?? '').toLowerCase();
  return {
    id: p.id,
    name: p.name,
    species: (PET_SPECIES as readonly string[]).includes(lc) ? lc : 'other',
    breed: p.breed,
    age_months: p.ageMonths,
    gender: p.gender === 'Female' ? 'Female' : 'Male',
    size: (PET_SIZES as readonly string[]).includes(p.size) ? p.size : 'medium',
    color: p.color,
    energy_level: (PET_ENERGY as readonly string[]).includes(p.energyLevel)
      ? p.energyLevel
      : 'moderate',
    good_with_kids: p.goodWithKids,
    good_with_pets: p.goodWithPets,
    vaccinated: p.vaccinated,
    neutered: p.neutered,
    health_notes: p.healthNotes,
    status: (PET_STATUSES as readonly string[]).includes(p.status) ? p.status : 'Available',
    owner_id: p.ownerId || null,
    owner_name: p.ownerName,
    owner_role: p.ownerRole === 'shelter' ? 'shelter' : 'owner',
    area: p.location?.area ?? null,
    lat: p.location?.lat ?? null,
    lon: p.location?.lon ?? null,
    photo_url: p.photoUrl,
    description: p.description,
    tags: p.tags ?? [],
    date_added: p.dateAdded || null,
  };
}
