/**
 * ProfileView — the logged-in user's own profile page.
 *
 * - Profile header: avatar (via ImageUploader in compact mode), full name,
 *   read-only email, role badge.
 * - Editable fields (full name, phone, address, bio) with a Save button.
 *   Saving flows back up through `onSaveProfile`, which updates the local
 *   user record (users[] + currentUser, persisted to localStorage by App)
 *   and — for authManaged accounts in live mode — mirrors the editable
 *   fields into the public.users row. Never touches passwordHash or
 *   auth-managed fields.
 * - "My Pets" cards link into the existing PetManager edit flow by
 *   navigating to the dashboard and scrolling to the #pet-manager section
 *   (UserDashboard renders PetManager inline there).
 * - "My Applications" and "My Favorites" render real records only;
 *   every empty section gets a friendly CTA instead of a blank hole.
 */
import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  BadgeCheck,
  FileText,
  Heart,
  MapPin,
  PawPrint,
  Pencil,
  Save,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { AnyUser, AdoptionApplication, Pet, UserRole } from '../types';
import { ImageUploader } from './ImageUploader';
import { PetImage } from './PetImage';
import { formatPetAge } from '../utils/time';

interface ProfileViewProps {
  currentUser: AnyUser;
  pets: Pet[];
  applications: AdoptionApplication[];
  favorites: string[];
  /** Persist the edited profile (App updates users[] + currentUser + Supabase mirror). */
  onSaveProfile: (updated: AnyUser) => void;
  onSelectPet: (pet: Pet) => void;
  onNavigateTab: (tab: string) => void;
  onToggleFavorite: (petId: string) => void;
}

const ROLE_STYLES: Record<UserRole, string> = {
  admin: 'bg-rose-100 text-rose-800 border-rose-200',
  shelter: 'bg-blue-100 text-blue-800 border-blue-200',
  vet: 'bg-teal-100 text-teal-800 border-teal-200',
  owner: 'bg-amber-100 text-amber-800 border-amber-200',
  service_provider: 'bg-purple-100 text-purple-800 border-purple-200',
  adopter: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const APP_STATUS_STYLES: Record<AdoptionApplication['status'], string> = {
  Submitted: 'bg-sky-100 text-sky-800',
  'Under Review': 'bg-amber-100 text-amber-800',
  Approved: 'bg-emerald-100 text-emerald-800',
  Rejected: 'bg-rose-100 text-rose-800',
  Completed: 'bg-slate-200 text-slate-700',
};

const PET_STATUS_STYLES: Record<Pet['status'], string> = {
  Available: 'bg-emerald-100 text-emerald-800',
  Pending: 'bg-amber-100 text-amber-800',
  Adopted: 'bg-slate-200 text-slate-700',
  Lost: 'bg-rose-100 text-rose-800',
  Found: 'bg-sky-100 text-sky-800',
};

function goToPetManager(onNavigateTab: (tab: string) => void) {
  onNavigateTab('dashboard');
  // Give the dashboard a beat to render, then scroll to the PetManager section.
  window.setTimeout(() => {
    document.getElementById('pet-manager')?.scrollIntoView({ behavior: 'smooth' });
  }, 150);
}

const inputCls =
  'w-full text-sm py-2.5 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none bg-white';

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  pets,
  applications,
  favorites,
  onSaveProfile,
  onSelectPet,
  onNavigateTab,
  onToggleFavorite,
}) => {
  // Form state resets whenever a different account signs in.
  const [name, setName] = useState(currentUser.name);
  const [phone, setPhone] = useState(currentUser.phone ?? '');
  const [address, setAddress] = useState(currentUser.address ?? '');
  const [bio, setBio] = useState(currentUser.bio ?? '');
  const [avatar, setAvatar] = useState<string | ''>(
    currentUser.avatar ?? currentUser.avatarUrl ?? ''
  );
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    setName(currentUser.name);
    setPhone(currentUser.phone ?? '');
    setAddress(currentUser.address ?? '');
    setBio(currentUser.bio ?? '');
    setAvatar(currentUser.avatar ?? currentUser.avatarUrl ?? '');
    setNameError('');
  }, [currentUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Please enter your name.');
      return;
    }
    setNameError('');
    const updated: AnyUser = {
      ...currentUser,
      name: trimmed,
      phone: phone.trim(),
      address: address.trim() || undefined,
      bio: bio.trim() || undefined,
    };
    // Avatar: prefer the user's chosen image; clearing it also clears the
    // legacy avatarUrl fallback so the header chip falls back to initials.
    if (avatar) {
      updated.avatar = avatar;
    } else {
      updated.avatar = undefined;
      updated.avatarUrl = undefined;
    }
    onSaveProfile(updated);
  };

  const myPets = pets.filter((p) => p.ownerId === currentUser.id);
  const myApplications = applications.filter((a) => a.applicantId === currentUser.id);
  const myFavorites = favorites
    .map((id) => pets.find((p) => p.id === id))
    .filter((p): p is Pet => !!p);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ---- Profile header ---- */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="sm:w-56 shrink-0">
            <ImageUploader
              value={avatar}
              onChange={setAvatar}
              label="Profile photo"
              compact
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 truncate">
                {currentUser.name}
              </h1>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border capitalize ${
                  ROLE_STYLES[currentUser.role]
                }`}
              >
                <BadgeCheck className="w-3.5 h-3.5" />
                {currentUser.role.replace('_', ' ')}
              </span>
              {currentUser.emailVerified !== false && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                  Verified
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1.5">{currentUser.email}</p>
            {(currentUser.address || currentUser.location?.area) && (
              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {currentUser.address || currentUser.location?.area}
              </p>
            )}
            {currentUser.bio && (
              <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-xl">
                {currentUser.bio}
              </p>
            )}
            {currentUser.phone && (
              <p className="text-xs text-slate-500 mt-2">📞 {currentUser.phone}</p>
            )}
          </div>
        </div>
      </section>

      {/* ---- Edit profile ---- */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-1">
          <Pencil className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-extrabold text-slate-900">Edit Profile</h2>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          Your name, photo and contact details are what other members see. Your email
          address stays the same.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Full name <span className="text-rose-500">*</span>
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Your full name"
              maxLength={80}
            />
            {nameError && <p className="text-[11px] text-rose-600 font-medium mt-1">{nameError}</p>}
          </div>
          <div>
            <label htmlFor="profile-phone" className="block text-xs font-semibold text-slate-700 mb-1">
              Phone
            </label>
            <input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
              placeholder="+880 1XXX-XXXXXX"
              maxLength={24}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="profile-address" className="block text-xs font-semibold text-slate-700 mb-1">
              Address
            </label>
            <input
              id="profile-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputCls}
              placeholder="Street, area, city"
              maxLength={140}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="profile-bio" className="block text-xs font-semibold text-slate-700 mb-1">
              About me
            </label>
            <textarea
              id="profile-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={`${inputCls} min-h-20 resize-y`}
              placeholder="A short intro — your experience with pets, what you're looking for…"
              maxLength={500}
              rows={3}
            />
            <p className="text-[10px] text-slate-400 mt-1 text-right tabular-nums">{bio.length}/500</p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Save className="w-4 h-4" />
            Save changes
          </motion.button>
          <span className="text-[11px] text-slate-400">
            Saved on this device{currentUser.authManaged ? ' and synced to your account' : ''}.
          </span>
        </div>
      </section>

      {/* ---- My Pets ---- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <PawPrint className="w-5 h-5 text-emerald-600" />
              My Pets
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">
                {myPets.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Pets you've listed on PawMatch.</p>
          </div>
          {myPets.length > 0 && (
            <button
              onClick={() => goToPetManager(onNavigateTab)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              Manage all →
            </button>
          )}
        </div>

        {myPets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <PawPrint className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No pets listed yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              List a pet you own or foster to reach adopters across Dhaka.
            </p>
            <button
              onClick={() => goToPetManager(onNavigateTab)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors"
            >
              List a pet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myPets.map((pet) => (
              <div
                key={pet.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="relative aspect-4/3 bg-slate-100">
                  <PetImage src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                  <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full ${PET_STATUS_STYLES[pet.status]}`}>
                    {pet.status}
                  </span>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900">{pet.name}</h3>
                    <span className="text-[11px] text-slate-500 font-semibold">{formatPetAge(pet.ageMonths)}</span>
                  </div>
                  <p className="text-xs text-slate-500">{pet.breed}</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => goToPetManager(onNavigateTab)}
                      className="flex-1 py-2 bg-slate-900 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      Edit listing
                    </button>
                    <button
                      onClick={() => onSelectPet(pet)}
                      className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                    >
                      View
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- My Applications ---- */}
      <section className="space-y-4">
        <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-600" />
          My Applications
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">
            {myApplications.length}
          </span>
        </h2>

        {myApplications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No applications yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              When you apply to adopt a pet, you'll be able to track its status here.
            </p>
            <button
              onClick={() => onNavigateTab('pets')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors"
            >
              Browse pets
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
            {myApplications.map((app) => (
              <div key={app.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <PetImage
                    src={app.petPhotoUrl}
                    alt={app.petName}
                    className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                  />
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{app.petName}</h4>
                    <p className="text-xs text-slate-500">
                      {app.petBreed} · Submitted on {app.submittedAt}
                    </p>
                  </div>
                </div>
                <span className={`self-start sm:self-auto text-xs font-bold px-2.5 py-1 rounded-full ${APP_STATUS_STYLES[app.status]}`}>
                  {app.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- My Favorites ---- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
            My Favorites
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">
              {myFavorites.length}
            </span>
          </h2>
          {myFavorites.length > 0 && (
            <button
              onClick={() => onNavigateTab('pets')}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              Find more →
            </button>
          )}
        </div>

        {myFavorites.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <Heart className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No favorites yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Tap the heart on any pet to keep it here for later.
            </p>
            <button
              onClick={() => onNavigateTab('matchmaker')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Find my match
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myFavorites.map((pet) => (
              <div
                key={pet.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-shadow"
              >
                <div className="relative aspect-4/3 bg-slate-100">
                  <PetImage src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => onToggleFavorite(pet.id)}
                    aria-label={`Remove ${pet.name} from favorites`}
                    className="absolute top-3 right-3 p-2 bg-white/90 rounded-full text-rose-500 hover:text-rose-600 shadow-sm transition-colors"
                  >
                    <Heart className="w-4 h-4 fill-rose-500" />
                  </button>
                </div>
                <div className="p-4">
                  <h3 className="font-extrabold text-slate-900">{pet.name}</h3>
                  <p className="text-xs text-slate-500">{pet.breed}</p>
                  <button
                    onClick={() => onSelectPet(pet)}
                    className="w-full mt-3 py-2 bg-slate-900 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    View details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Account facts ---- */}
      <section className="bg-slate-50 rounded-2xl border border-slate-200 p-5 flex items-start gap-3">
        <UserIcon className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          Your sign-in email <span className="font-semibold text-slate-700">{currentUser.email}</span> and
          role <span className="font-semibold text-slate-700 capitalize">{currentUser.role.replace('_', ' ')}</span>{' '}
          can't be changed here. Profile edits save instantly on this device
          {currentUser.authManaged ? ' and sync to your PawMatch account.' : '.'}
        </p>
      </section>
    </div>
  );
};

/** Default export for React.lazy code-splitting; named export above stays for other importers. */
export default ProfileView;
