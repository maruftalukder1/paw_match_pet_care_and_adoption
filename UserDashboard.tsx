import React from 'react';
import {
  PawPrint,
  Heart,
  FileText,
  MessageSquare,
  Sparkles,
  MapPin,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { Pet, AnyUser, AdoptionApplication, AdopterProfile } from '../types';
import { calculateCompatibilityScore } from '../utils/geoAndMatchmaker';
import { PetManager } from './PetManager';
import { formatPetAge } from '../utils/time';
import { PetImage } from './PetImage';

interface UserDashboardProps {
  currentUser: AnyUser;
  pets: Pet[];
  applications: AdoptionApplication[];
  favorites: string[];
  unreadMessagesCount: number;
  onSelectPet: (pet: Pet) => void;
  onNavigateTab: (tab: string) => void;
  onToggleFavorite: (petId: string) => void;
  onAddPet: (pet: Pet) => void;
  onUpdatePet: (pet: Pet) => void;
  onDeletePet: (petId: string) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  currentUser,
  pets,
  applications,
  favorites,
  unreadMessagesCount,
  onSelectPet,
  onNavigateTab,
  onToggleFavorite,
  onAddPet,
  onUpdatePet,
  onDeletePet,
}) => {
  // If user is adopter, calculate real match scores for pets
  const topMatches = React.useMemo(() => {
    if (currentUser.role === 'adopter') {
      const adopter = currentUser as AdopterProfile;
      const scored = pets.map((pet) => {
        const match = calculateCompatibilityScore(adopter, pet, 'balanced');
        return { pet, score: match.totalScore, reasons: match.reasons };
      });
      return scored.sort((a, b) => b.score - a.score).slice(0, 4);
    }
    return pets.slice(0, 4).map((p, idx) => ({
      pet: p,
      score: 95 - idx * 6,
      reasons: ['Verified healthy companion'],
    }));
  }, [currentUser, pets]);

  const userApplications = applications.filter(
    (a) => a.applicantId === currentUser.id || currentUser.role === 'admin'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider">
            <span>Member Dashboard</span>
            <span>·</span>
            <span className="capitalize">{currentUser.role.replace('_', ' ')}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            Welcome, {currentUser.name}! 🐾
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Let's find your perfect local companion and manage pet healthcare today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigateTab('matchmaker')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>Recalculate Matches</span>
          </button>
          <button
            onClick={() => onNavigateTab('pets')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
          >
            Browse All Pets
          </button>
        </div>
      </div>

      {/* 4 Stat Cards from UI Screen 03 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Stat 1: Available Pets */}
        <button
          onClick={() => onNavigateTab('pets')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-300 hover:shadow-sm transition-all flex items-center gap-4 text-left cursor-pointer"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <PawPrint className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {pets.filter((p) => p.status === 'Available').length}
            </div>
            <div className="text-xs font-medium text-slate-500">Available Pets</div>
          </div>
        </button>

        {/* Stat 2: My Favorites */}
        <button
          onClick={() => onNavigateTab('pets')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-rose-300 hover:shadow-sm transition-all flex items-center gap-4 text-left cursor-pointer"
        >
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
            <Heart className="w-6 h-6 fill-rose-500" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {favorites.length}
            </div>
            <div className="text-xs font-medium text-slate-500">Saved Favorites</div>
          </div>
        </button>

        {/* Stat 3: Adoption Requests */}
        <button
          onClick={() => {
            const el = document.getElementById('applications-tracker');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 hover:shadow-sm transition-all flex items-center gap-4 text-left cursor-pointer"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {userApplications.length}
            </div>
            <div className="text-xs font-medium text-slate-500">Adoption Requests</div>
          </div>
        </button>

        {/* Stat 4: Messages */}
        <button
          onClick={() => onNavigateTab('chat')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-300 hover:shadow-sm transition-all flex items-center gap-4 text-left cursor-pointer"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {unreadMessagesCount}
            </div>
            <div className="text-xs font-medium text-slate-500">Unread Messages</div>
          </div>
        </button>
      </div>

      {/* Top Matches For You Section (Wireframe 03) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Top Matches For You</h2>
            <p className="text-xs text-slate-500">
              Personalized suggestions weighted by your lifestyle, housing space, and energy compatibility.
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('matchmaker')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
          >
            <span>View All Matches</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {topMatches.map(({ pet, score, reasons }) => {
            const isFav = favorites.includes(pet.id);
            return (
              <div
                key={pet.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col group"
              >
                <div className="relative aspect-4/3 overflow-hidden bg-slate-100">
                  <PetImage
                    src={pet.photoUrl}
                    alt={pet.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* Match % Pill Badge from Screenshot */}
                  <div className="absolute top-3 left-3 bg-emerald-600 text-white font-bold text-xs px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                    <span>{score}% Match</span>
                  </div>

                  <button
                    onClick={() => onToggleFavorite(pet.id)}
                    className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-md rounded-full text-slate-600 hover:text-rose-500 shadow-sm transition-colors"
                  >
                    <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                  </button>
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

                    {reasons && reasons[0] && (
                      <p className="text-[11px] text-emerald-800 bg-emerald-50 rounded-lg p-1.5 mt-2.5 font-medium line-clamp-1">
                        ✓ {reasons[0]}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => onSelectPet(pet)}
                    className="w-full mt-4 py-2 bg-slate-900 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Adoption Applications Tracker */}
      <section id="applications-tracker" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs scroll-mt-20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Your Adoption Applications</h2>
          <span className="text-xs text-slate-500">Updated today</span>
        </div>

        <div className="divide-y divide-slate-100">
          {userApplications.map((app) => (
            <div key={app.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PetImage
                  src={app.petPhotoUrl}
                  alt={app.petName}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                />
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{app.petName}</h4>
                  <p className="text-xs text-slate-500">{app.petBreed} · Submitted on {app.submittedAt}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    app.status === 'Approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : app.status === 'Rejected'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {app.status}
                </span>

                <button
                  onClick={() => onNavigateTab('chat')}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Message Shelter
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pet Management (Pranty's module): add / edit / delete listings */}
      <div id="pet-manager" className="scroll-mt-20">
        <PetManager
          currentUser={currentUser}
          pets={pets}
          onAddPet={onAddPet}
          onUpdatePet={onUpdatePet}
          onDeletePet={onDeletePet}
        />
      </div>
    </div>
  );
};
