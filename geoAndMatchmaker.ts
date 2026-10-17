import { AdopterProfile, MatchScoreBreakdown, Pet } from '../types';

/**
 * Calculates Great-Circle distance between two coordinates in kilometers using Haversine formula
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export type ScoringStrategy = 'balanced' | 'distance_first' | 'lifestyle_first';

/**
 * PawMatch Compatibility Scoring Engine
 * Implements modern C++ Strategy Pattern analog in TypeScript
 */
export function calculateCompatibilityScore(
  adopter: AdopterProfile,
  pet: Pet,
  strategy: ScoringStrategy = 'balanced'
): MatchScoreBreakdown {
  // FULLSYNC hardening: freshly registered adopters are plain BaseUsers —
  // the matchmaker preference fields don't exist until the user completes
  // their profile. Normalize with safe defaults so a missing profile can
  // never crash the listings sort (this was a hard crash: "Cannot read
  // properties of undefined (reading 'length')" on preferredSpecies).
  const a: AdopterProfile = {
    ...adopter,
    preferredSpecies: adopter.preferredSpecies ?? [],
    preferredSize: adopter.preferredSize ?? 'any',
    preferredAgeRange: adopter.preferredAgeRange ?? 'any',
    homeType: adopter.homeType ?? 'apartment',
    hasYard: adopter.hasYard ?? false,
    dailyAloneHours: adopter.dailyAloneHours ?? 8,
    hasChildren: adopter.hasChildren ?? false,
    hasOtherPets: adopter.hasOtherPets ?? false,
    experienceLevel: adopter.experienceLevel ?? 'beginner',
    activityLevel: adopter.activityLevel ?? 'moderate',
    monthlyBudget: adopter.monthlyBudget ?? 0,
  };
  adopter = a;

  const reasons: string[] = [];

  // HARD FILTER 1: Kids Safety Check
  if (adopter.hasChildren && !pet.goodWithKids) {
    return {
      speciesScore: 0,
      sizeHomeScore: 0,
      energyActivityScore: 0,
      kidsScore: 0,
      petsScore: 0,
      experienceScore: 0,
      distanceScore: 0,
      totalScore: 0,
      distanceKm: calculateHaversineDistanceKm(
        adopter.location.lat,
        adopter.location.lon,
        pet.location.lat,
        pet.location.lon
      ),
      reasons: ['Hard Excluded: Pet is not suited for households with young children.'],
      isHardExcluded: true,
    };
  }

  // HARD FILTER 2: Other Pets Safety Check
  if (adopter.hasOtherPets && !pet.goodWithPets) {
    return {
      speciesScore: 0,
      sizeHomeScore: 0,
      energyActivityScore: 0,
      kidsScore: 0,
      petsScore: 0,
      experienceScore: 0,
      distanceScore: 0,
      totalScore: 0,
      distanceKm: calculateHaversineDistanceKm(
        adopter.location.lat,
        adopter.location.lon,
        pet.location.lat,
        pet.location.lon
      ),
      reasons: ['Hard Excluded: Pet does not socialize well with other pets.'],
      isHardExcluded: true,
    };
  }

  // 1. Species Preference (Weight: 20%)
  let speciesScore = 50;
  if (adopter.preferredSpecies.length === 0 || adopter.preferredSpecies.includes(pet.species)) {
    speciesScore = 100;
    reasons.push(`Preferred species match (${pet.species})`);
  } else {
    speciesScore = 20;
  }

  // 2. Size vs Home Type (Weight: 15%)
  let sizeHomeScore = 70;
  if (adopter.homeType === 'apartment') {
    if (pet.size === 'small') {
      sizeHomeScore = 100;
      reasons.push('Compact size ideal for apartment living');
    } else if (pet.size === 'medium') {
      sizeHomeScore = 75;
    } else {
      sizeHomeScore = adopter.hasYard ? 60 : 35;
      if (!adopter.hasYard) reasons.push('Large pet in apartment without yard');
    }
  } else if (adopter.homeType === 'house_with_yard' || adopter.homeType === 'rural') {
    sizeHomeScore = 100;
    reasons.push('Home with yard provides optimal space');
  } else {
    sizeHomeScore = 80;
  }

  // 3. Energy Level vs Adopter Activity (Weight: 20%)
  let energyActivityScore = 70;
  if (adopter.activityLevel === pet.energyLevel) {
    energyActivityScore = 100;
    reasons.push(`Synchronized ${pet.energyLevel} energy & activity pace`);
  } else if (
    (adopter.activityLevel === 'moderate' && (pet.energyLevel === 'low' || pet.energyLevel === 'high')) ||
    (pet.energyLevel === 'moderate')
  ) {
    energyActivityScore = 75;
  } else {
    energyActivityScore = 40;
  }

  // 4. Kids Compatibility (Weight: 15%)
  let kidsScore = 80;
  if (adopter.hasChildren) {
    if (pet.goodWithKids) {
      kidsScore = 100;
      reasons.push('Certified friendly and gentle with children');
    } else {
      kidsScore = 0;
    }
  } else {
    kidsScore = pet.goodWithKids ? 100 : 85;
  }

  // 5. Other Pets Compatibility (Weight: 10%)
  let petsScore = 80;
  if (adopter.hasOtherPets) {
    if (pet.goodWithPets) {
      petsScore = 100;
      reasons.push('Socialized and friendly with existing pets');
    } else {
      petsScore = 0;
    }
  } else {
    petsScore = 95;
  }

  // 6. Experience vs Pet Needs (Weight: 10%)
  let experienceScore = 70;
  if (adopter.experienceLevel === 'experienced') {
    experienceScore = 100;
    reasons.push('Adopter has seasoned pet guardianship experience');
  } else if (adopter.experienceLevel === 'intermediate') {
    experienceScore = pet.energyLevel === 'high' ? 80 : 95;
  } else {
    // beginner
    if (pet.energyLevel === 'low' && pet.goodWithKids) {
      experienceScore = 95;
      reasons.push('Gentle temperament suitable for first-time owners');
    } else if (pet.energyLevel === 'high') {
      experienceScore = 55;
    } else {
      experienceScore = 80;
    }
  }

  // 7. Distance (Weight: 10%)
  const distanceKm = calculateHaversineDistanceKm(
    adopter.location.lat,
    adopter.location.lon,
    pet.location.lat,
    pet.location.lon
  );
  let distanceScore = 100;
  if (distanceKm <= 5) {
    distanceScore = 100;
    reasons.push(`Nearby location (${distanceKm} km away)`);
  } else if (distanceKm <= 15) {
    distanceScore = 85;
  } else if (distanceKm <= 30) {
    distanceScore = 65;
  } else {
    distanceScore = Math.max(30, 100 - distanceKm * 2);
  }

  // Weights according to Strategy Pattern
  let wSpecies = 0.20;
  let wSize = 0.15;
  let wEnergy = 0.20;
  let wKids = 0.15;
  let wPets = 0.10;
  let wExp = 0.10;
  let wDist = 0.10;

  if (strategy === 'distance_first') {
    wDist = 0.35;
    wSpecies = 0.15;
    wSize = 0.10;
    wEnergy = 0.15;
    wKids = 0.10;
    wPets = 0.05;
    wExp = 0.10;
  } else if (strategy === 'lifestyle_first') {
    wEnergy = 0.30;
    wSize = 0.25;
    wKids = 0.15;
    wPets = 0.10;
    wSpecies = 0.10;
    wExp = 0.05;
    wDist = 0.05;
  }

  const rawTotal =
    speciesScore * wSpecies +
    sizeHomeScore * wSize +
    energyActivityScore * wEnergy +
    kidsScore * wKids +
    petsScore * wPets +
    experienceScore * wExp +
    distanceScore * wDist;

  const totalScore = Math.min(100, Math.max(10, Math.round(rawTotal)));

  return {
    speciesScore,
    sizeHomeScore,
    energyActivityScore,
    kidsScore,
    petsScore,
    experienceScore,
    distanceScore,
    totalScore,
    distanceKm,
    reasons,
    isHardExcluded: false,
  };
}
