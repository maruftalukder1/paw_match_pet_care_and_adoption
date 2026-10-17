import React, { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Search,
  Filter,
  RotateCcw,
  Heart,
  MapPin,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Pet, PetSpecies, PetSize, AnyUser, AdopterProfile } from '../types';
import { PetBadges } from './PetBadges';
import { PetImage } from './PetImage';
import { PetGridSkeleton } from './PetGridSkeleton';
import { EmptyState } from './EmptyState';
import { PawPrint } from 'lucide-react';
import { formatPetAge } from '../utils/time';
import { calculateCompatibilityScore } from '../utils/geoAndMatchmaker';

interface PetListingsProps {
  pets: Pet[];
  currentUser: AnyUser | null;
  onSelectPet: (pet: Pet) => void;
  favorites: string[];
  onToggleFavorite: (petId: string) => void;
  initialQuery?: string;
  /** While the live list loads — shows the shimmer skeleton grid instead of an empty box */
  loading?: boolean;
}

export const PetListings: React.FC<PetListingsProps> = ({
  pets,
  currentUser,
  onSelectPet,
  favorites,
  onToggleFavorite,
  initialQuery = '',
  loading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const reduceMotion = useReducedMotion();
  const [selectedSpecies, setSelectedSpecies] = useState<string>('all');
  const [selectedBreed, setSelectedBreed] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedAge, setSelectedAge] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [selectedSize, setSelectedSize] = useState<string>('all');
  const [vaccinatedOnly, setVaccinatedOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [sortBy, setSortBy] = useState<'match' | 'age_asc' | 'age_desc' | 'distance'>('match');

  // Pagination (10 per page as specified in Feature Module 3)
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8; // fits neatly in 4-column grid

  // Extract unique breeds and locations
  const availableBreeds = useMemo(() => {
    const breeds = new Set<string>();
    pets.forEach((p) => breeds.add(p.breed));
    return Array.from(breeds).sort();
  }, [pets]);

  const availableLocations = useMemo(() => {
    const locs = new Set<string>();
    pets.forEach((p) => locs.add(p.location.area.split(',')[0].trim()));
    return Array.from(locs).sort();
  }, [pets]);

  // Reset filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedSpecies('all');
    setSelectedBreed('all');
    setSelectedLocation('all');
    setSelectedAge('all');
    setSelectedGender('all');
    setSelectedSize('all');
    setVaccinatedOnly(false);
    setAvailableOnly(true);
    setSortBy('match');
    setCurrentPage(1);
  };

  // Filter and Sort Engine
  const filteredPets = useMemo(() => {
    return pets.filter((pet) => {
      // 1. Text Search (name or breed or tags)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = pet.name.toLowerCase().includes(q);
        const matchBreed = pet.breed.toLowerCase().includes(q);
        const matchArea = pet.location.area.toLowerCase().includes(q);
        const matchTags = pet.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchBreed && !matchArea && !matchTags) return false;
      }

      // 2. Species
      if (selectedSpecies !== 'all' && pet.species !== selectedSpecies) {
        return false;
      }

      // 3. Breed
      if (selectedBreed !== 'all' && pet.breed !== selectedBreed) {
        return false;
      }

      // 4. Location
      if (selectedLocation !== 'all' && !pet.location.area.includes(selectedLocation)) {
        return false;
      }

      // 5. Age Range
      if (selectedAge !== 'all') {
        const years = pet.ageMonths / 12;
        if (selectedAge === 'baby' && years >= 1) return false;
        if (selectedAge === 'young' && (years < 1 || years > 3)) return false;
        if (selectedAge === 'adult' && (years < 3 || years > 7)) return false;
        if (selectedAge === 'senior' && years <= 7) return false;
      }

      // 6. Gender
      if (selectedGender !== 'all' && pet.gender !== selectedGender) {
        return false;
      }

      // 7. Size
      if (selectedSize !== 'all' && pet.size !== selectedSize) {
        return false;
      }

      // 8. Vaccinated
      if (vaccinatedOnly && !pet.vaccinated) {
        return false;
      }

      // 9. Available Only
      if (availableOnly && pet.status !== 'Available') {
        return false;
      }

      return true;
    });
  }, [
    pets,
    searchQuery,
    selectedSpecies,
    selectedBreed,
    selectedLocation,
    selectedAge,
    selectedGender,
    selectedSize,
    vaccinatedOnly,
    availableOnly,
  ]);

  // Sort Pets
  const sortedPets = useMemo(() => {
    const list = [...filteredPets];
    if (sortBy === 'age_asc') {
      return list.sort((a, b) => a.ageMonths - b.ageMonths);
    }
    if (sortBy === 'age_desc') {
      return list.sort((a, b) => b.ageMonths - a.ageMonths);
    }
    if (sortBy === 'match' && currentUser?.role === 'adopter') {
      const adopter = currentUser as AdopterProfile;
      return list.sort((a, b) => {
        const scoreA = calculateCompatibilityScore(adopter, a, 'balanced').totalScore;
        const scoreB = calculateCompatibilityScore(adopter, b, 'balanced').totalScore;
        return scoreB - scoreA;
      });
    }
    return list;
  }, [filteredPets, sortBy, currentUser]);

  // Pagination calculation
  const totalPages = Math.ceil(sortedPets.length / ITEMS_PER_PAGE) || 1;
  const paginatedPets = sortedPets.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Title & Search Bar (from Screen 04) */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Find Your Perfect Pet
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {sortedPets.length} companions ready for loving homes in your community.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs py-1.5 px-3 rounded-xl border border-slate-200 bg-slate-50 font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="match">Match Score (AI Recommended)</option>
              <option value="age_asc">Age (Youngest First)</option>
              <option value="age_desc">Age (Oldest First)</option>
            </select>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, breed, temperaments..."
            className="w-full text-xs py-3 pl-10 pr-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Filter Controls Row (from Screen 04 in screenshot) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
          {/* Species */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Species</label>
            <select
              value={selectedSpecies}
              onChange={(e) => {
                setSelectedSpecies(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white font-medium"
            >
              <option value="all">All Species</option>
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
              <option value="rabbit">Rabbit</option>
              <option value="bird">Bird</option>
            </select>
          </div>

          {/* Breed */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Breed</label>
            <select
              value={selectedBreed}
              onChange={(e) => {
                setSelectedBreed(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white font-medium"
            >
              <option value="all">All Breeds</option>
              {availableBreeds.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Location</label>
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white font-medium"
            >
              <option value="all">All Areas</option>
              {availableLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Age */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Age</label>
            <select
              value={selectedAge}
              onChange={(e) => {
                setSelectedAge(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white font-medium"
            >
              <option value="all">All Ages</option>
              <option value="baby">Baby (&lt; 1 yr)</option>
              <option value="young">Young (1 - 3 yrs)</option>
              <option value="adult">Adult (3 - 7 yrs)</option>
              <option value="senior">Senior (7+ yrs)</option>
            </select>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Gender</label>
            <select
              value={selectedGender}
              onChange={(e) => {
                setSelectedGender(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white font-medium"
            >
              <option value="all">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          {/* Size */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Size</label>
            <select
              value={selectedSize}
              onChange={(e) => {
                setSelectedSize(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white font-medium"
            >
              <option value="all">All Sizes</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        </div>

        {/* Checkbox filters and Reset button */}
        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 gap-3">
          <div className="flex items-center gap-5 text-xs text-slate-700 font-medium">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={vaccinatedOnly}
                onChange={(e) => setVaccinatedOnly(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Vaccinated Only</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Available Only</span>
            </label>
          </div>

          <button
            onClick={handleResetFilters}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        </div>
      </div>

      {/* Pet Card Grid (Screen 04) — shimmer skeleton while the live list loads */}
      {loading ? (
        <PetGridSkeleton count={8} />
      ) : paginatedPets.length === 0 ? (
        <EmptyState
          icon={<PawPrint className="w-7 h-7" />}
          title="No Pets Matched Your Filters"
          message="Try loosening the species, age, or location filters to discover companion pets."
          actionLabel="Clear Filters"
          onAction={handleResetFilters}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedPets.map((pet) => {
            const isFav = favorites.includes(pet.id);
            const matchScore =
              currentUser?.role === 'adopter'
                ? calculateCompatibilityScore(currentUser as AdopterProfile, pet, 'balanced').totalScore
                : null;

            return (
              <div
                key={pet.id}
                className="pm-card pm-card-hover overflow-hidden flex flex-col group"
              >
                <div className="relative aspect-4/3 overflow-hidden bg-slate-100">
                  <PetImage
                    src={pet.photoUrl}
                    alt={`${pet.name} the ${pet.breed}`}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />

                  {matchScore && (
                    <div className="absolute top-3 left-3 bg-emerald-600/95 backdrop-blur-xs text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm">
                      {matchScore}% Match
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 1.5 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    onClick={() => onToggleFavorite(pet.id)}
                    aria-label={isFav ? `Remove ${pet.name} from favorites` : `Add ${pet.name} to favorites`}
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-md rounded-full text-slate-600 hover:text-rose-500 shadow-sm transition-colors"
                  >
                    <motion.span
                      key={isFav ? 'fav' : 'unfav'}
                      initial={{ scale: 0.4 }}
                      animate={reduceMotion || !isFav ? { scale: 1 } : { scale: [1, 1.3, 1] }}
                      transition={
                        reduceMotion || !isFav
                          ? { type: 'spring', stiffness: 500, damping: 12 }
                          : { repeat: Infinity, duration: 1.6, ease: 'easeInOut' }
                      }
                      className="block"
                    >
                      <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </motion.span>
                  </motion.button>

                  <div className="absolute bottom-3 left-3 max-w-[72%]">
                    <PetBadges pet={pet} />
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-slate-900 text-base group-hover:text-emerald-700 transition-colors">
                        {pet.name}
                      </h3>
                      <span className="text-xs text-slate-500 font-semibold">
                        {formatPetAge(pet.ageMonths)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mt-0.5">{pet.breed}</p>

                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{pet.location.area}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectPet(pet)}
                    className="w-full mt-4 py-2 bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white rounded-xl text-xs font-bold transition-all text-center"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-slate-700 px-3 py-1 bg-white rounded-lg border border-slate-200">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
