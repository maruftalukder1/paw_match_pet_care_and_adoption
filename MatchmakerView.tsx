import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  Sliders,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Heart,
  MapPin,
  ChevronRight,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { Pet, AdopterProfile, AnyUser } from '../types';
import { PetImage } from './PetImage';
import { formatPetAge } from '../utils/time';
import { calculateCompatibilityScore, ScoringStrategy } from '../utils/geoAndMatchmaker';

interface MatchmakerViewProps {
  pets: Pet[];
  currentUser: AnyUser | null;
  onSelectPet: (pet: Pet) => void;
  favorites: string[];
  onToggleFavorite: (petId: string) => void;
}

export const MatchmakerView: React.FC<MatchmakerViewProps> = ({
  pets,
  currentUser,
  onSelectPet,
  favorites,
  onToggleFavorite,
}) => {
  // Questionnaire state prefilled from currentUser if adopter
  const isAdopter = currentUser?.role === 'adopter';
  const currentAdopter = isAdopter ? (currentUser as AdopterProfile) : null;

  const [preferredSpecies, setPreferredSpecies] = useState<string>(
    currentAdopter?.preferredSpecies?.[0] || 'dog'
  );
  const [preferredAge, setPreferredAge] = useState<string>('young');
  const [preferredSize, setPreferredSize] = useState<'small' | 'medium' | 'large' | 'any'>('large');
  const [preferredGender, setPreferredGender] = useState<string>('any');
  const [locationArea, setLocationArea] = useState<string>(
    currentUser?.location?.area || 'Mirpur, Dhaka'
  );
  const [hasChildren, setHasChildren] = useState<boolean>(currentAdopter?.hasChildren || false);
  const [hasOtherPets, setHasOtherPets] = useState<boolean>(currentAdopter?.hasOtherPets || false);
  const [homeType, setHomeType] = useState<'apartment' | 'house_with_yard' | 'condo' | 'rural'>(
    currentAdopter?.homeType || 'apartment'
  );
  const [hasYard, setHasYard] = useState<boolean>(currentAdopter?.hasYard || false);
  const [activityLevel, setActivityLevel] = useState<'low' | 'moderate' | 'high'>(
    currentAdopter?.activityLevel || 'moderate'
  );
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'experienced'>(
    currentAdopter?.experienceLevel || 'intermediate'
  );
  const [strategy, setStrategy] = useState<ScoringStrategy>('balanced');

  // Synthetic adopter profile for score calculation
  const adopterProfile: AdopterProfile = useMemo(() => {
    return {
      id: currentUser?.id || 'guest-adopter',
      name: currentUser?.name || 'Guest Adopter',
      email: currentUser?.email || 'guest@example.com',
      phone: currentUser?.phone || '',
      passwordHash: '',
      location: {
        area: locationArea,
        lat: locationArea.includes('Uttara') ? 23.8759 : locationArea.includes('Dhanmondi') ? 23.7461 : 23.8071,
        lon: 90.3686,
      },
      role: 'adopter',
      isActive: true,
      homeType,
      hasYard,
      dailyAloneHours: 3,
      hasChildren,
      hasOtherPets,
      experienceLevel,
      preferredSpecies: preferredSpecies === 'any' ? [] : [preferredSpecies],
      preferredSize,
      preferredAgeRange: preferredAge as any,
      activityLevel,
      monthlyBudget: 200,
    };
  }, [
    currentUser,
    preferredSpecies,
    preferredAge,
    preferredSize,
    locationArea,
    hasChildren,
    hasOtherPets,
    homeType,
    hasYard,
    activityLevel,
    experienceLevel,
  ]);

  // Priority Queue Ranking calculation
  const rankedMatches = useMemo(() => {
    return pets
      .map((pet) => {
        const breakdown = calculateCompatibilityScore(adopterProfile, pet, strategy);
        return {
          pet,
          breakdown,
        };
      })
      .filter((item) => !item.breakdown.isHardExcluded)
      .sort((a, b) => b.breakdown.totalScore - a.breakdown.totalScore);
  }, [pets, adopterProfile, strategy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span>7-Factor Compatibility Engine</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Find Your Perfect Match
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
          Answer a few questions about your home, routine, and preferences. Our weighted matching algorithm
          ranks pets and reveals precise compatibility factors to ensure a harmonious adoption.
        </p>

        {/* Strategy Pattern Switcher */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-700">Scoring Strategy:</span>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              onClick={() => setStrategy('balanced')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                strategy === 'balanced'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Balanced (Standard)
            </button>
            <button
              onClick={() => setStrategy('distance_first')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                strategy === 'distance_first'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Distance-First (Nearest)
            </button>
            <button
              onClick={() => setStrategy('lifestyle_first')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                strategy === 'lifestyle_first'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lifestyle-First (Energy & Space)
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Preference Form (Wireframe 06) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-600" />
            <span>Adopter Preferences</span>
          </h2>

          <div className="space-y-4 text-xs">
            {/* Preferred Species */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Preferred Species</label>
              <select
                value={preferredSpecies}
                onChange={(e) => setPreferredSpecies(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
                <option value="rabbit">Rabbit</option>
                <option value="bird">Bird</option>
                <option value="any">Any Species</option>
              </select>
            </div>

            {/* Preferred Age */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Preferred Age</label>
              <select
                value={preferredAge}
                onChange={(e) => setPreferredAge(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="baby">Baby (&lt; 1 year)</option>
                <option value="young">Young (1 – 3 years)</option>
                <option value="adult">Adult (3 – 7 years)</option>
                <option value="any">Any Age</option>
              </select>
            </div>

            {/* Preferred Size */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Preferred Size</label>
              <select
                value={preferredSize}
                onChange={(e) => setPreferredSize(e.target.value as any)}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="any">Any Size</option>
              </select>
            </div>

            {/* Location Area */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Your Location Area</label>
              <select
                value={locationArea}
                onChange={(e) => setLocationArea(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="Mirpur, Dhaka">Mirpur, Dhaka</option>
                <option value="Dhanmondi, Dhaka">Dhanmondi, Dhaka</option>
                <option value="Uttara, Dhaka">Uttara, Dhaka</option>
                <option value="Banani, Dhaka">Banani, Dhaka</option>
                <option value="Gulshan, Dhaka">Gulshan, Dhaka</option>
                <option value="Mohammadpur, Dhaka">Mohammadpur, Dhaka</option>
              </select>
            </div>

            {/* Home Type */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Home Environment</label>
              <select
                value={homeType}
                onChange={(e) => setHomeType(e.target.value as any)}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="apartment">Apartment</option>
                <option value="house_with_yard">House with Fenced Yard</option>
                <option value="condo">Condominium</option>
                <option value="rural">Rural / Farm Estate</option>
              </select>
            </div>

            {/* Activity Level */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Your Daily Activity Pace</label>
              <select
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value as any)}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="low">Relaxed / Low (calm cuddles)</option>
                <option value="moderate">Moderate (regular walks)</option>
                <option value="high">High (running, hiking, active training)</option>
              </select>
            </div>

            {/* Boolean Safety Checks (Hard Filters) */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">Do you have children?</div>
                  <div className="text-[10px] text-slate-500">Excludes pets not certified kid-friendly</div>
                </div>
                <input
                  type="checkbox"
                  checked={hasChildren}
                  onChange={(e) => setHasChildren(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">Do you have other pets?</div>
                  <div className="text-[10px] text-slate-500">Excludes single-pet-only companions</div>
                </div>
                <input
                  type="checkbox"
                  checked={hasOtherPets}
                  onChange={(e) => setHasOtherPets(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">Do you have a secure yard?</div>
                  <div className="text-[10px] text-slate-500">Boosts large active dog match ratings</div>
                </div>
                <input
                  type="checkbox"
                  checked={hasYard}
                  onChange={(e) => setHasYard(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Your Top Matches (Wireframe 06) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Ranked Compatibility Results ({rankedMatches.length} qualified)
            </h2>
            <span className="text-xs text-slate-500 font-medium">Sorted by Top Score</span>
          </div>

          <div className="space-y-4">
            {rankedMatches.map(({ pet, breakdown }, idx) => {
              const isFav = favorites.includes(pet.id);
              return (
                <div
                  key={pet.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row gap-5 items-start"
                >
                  <div className="relative w-full sm:w-36 h-36 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <PetImage
                      src={pet.photoUrl}
                      alt={pet.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-emerald-600 text-white text-xs font-black px-2 py-0.5 rounded shadow-sm">
                      #{idx + 1}
                    </div>
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-lg leading-tight">
                            {pet.name}
                          </h3>
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                            {breakdown.totalScore}% Match
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {pet.breed} · {formatPetAge(pet.ageMonths)} · {pet.location.area} ({breakdown.distanceKm} km away)
                        </p>
                      </div>

                      <button
                        onClick={() => onToggleFavorite(pet.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500"
                      >
                        <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                      </button>
                    </div>

                    {/* Progress Score Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="bg-emerald-600 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${breakdown.totalScore}%` }}
                        transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 * Math.min(idx, 5) }}
                      />
                    </div>

                    {/* Why this match bullet points */}
                    <div className="bg-slate-50 rounded-xl p-2.5 space-y-1">
                      <div className="text-[11px] font-bold text-slate-700">Why this match:</div>
                      {breakdown.reasons.slice(0, 3).map((r, i) => (
                        <div key={i} className="text-[11px] text-slate-600 flex items-center gap-1.5">
                          <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1 flex items-center justify-end">
                      <button
                        onClick={() => onSelectPet(pet)}
                        className="px-4 py-2 bg-slate-900 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                      >
                        <span>View Details & Apply</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
