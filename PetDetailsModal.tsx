import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  X,
  Heart,
  MapPin,
  CheckCircle,
  AlertCircle,
  Calendar,
  MessageCircle,
  Sparkles,
  ShieldCheck,
  Stethoscope,
  Info,
  ChevronLeft
} from 'lucide-react';
import { Pet, AnyUser, AdopterProfile, MedicalRecord, VaccinationRecord } from '../types';
import { calculateCompatibilityScore } from '../utils/geoAndMatchmaker';
import { PetImage } from './PetImage';
import { formatPetAge, todayISO, computeVaccinationStatus } from '../utils/time';

interface PetDetailsModalProps {
  pet: Pet | null;
  onClose: () => void;
  currentUser: AnyUser | null;
  onApplyForAdoption: (pet: Pet) => void;
  onStartMessage: (pet: Pet) => void;
  onMessageAdmin?: (pet: Pet) => void;
  isFavorite: boolean;
  onToggleFavorite: (petId: string) => void;
  medicalRecords: MedicalRecord[];
  vaccinations: VaccinationRecord[];
  ownerVerified: boolean;
  /** Full live-sync round: vet/shelter users can add health records from here. */
  onAddMedicalRecord?: (rec: MedicalRecord) => void;
  onAddVaccination?: (vac: VaccinationRecord) => void;
}

export const PetDetailsModal: React.FC<PetDetailsModalProps> = ({
  pet,
  onClose,
  currentUser,
  onApplyForAdoption,
  onStartMessage,
  onMessageAdmin,
  isFavorite,
  onToggleFavorite,
  medicalRecords,
  vaccinations,
  ownerVerified,
  onAddMedicalRecord,
  onAddVaccination,
}) => {
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const reduceMotion = useReducedMotion();

  // Full live-sync round: compact vet/shelter health-record forms.
  const canAddRecords =
    (currentUser?.role === 'vet' || currentUser?.role === 'shelter') &&
    (onAddMedicalRecord || onAddVaccination);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordKind, setRecordKind] = useState<'medical' | 'vaccination'>('medical');
  const [fDate, setFDate] = useState(todayISO());
  const [fDiagnosis, setFDiagnosis] = useState('');
  const [fTreatment, setFTreatment] = useState('');
  const [fWeight, setFWeight] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fVaccine, setFVaccine] = useState('');
  const [fGiven, setFGiven] = useState(todayISO());
  const [fDue, setFDue] = useState('');

  const resetRecordForm = () => {
    setFDate(todayISO());
    setFDiagnosis('');
    setFTreatment('');
    setFWeight('');
    setFNotes('');
    setFVaccine('');
    setFGiven(todayISO());
    setFDue('');
  };

  const submitRecordForm = () => {
    if (!pet) return;
    if (recordKind === 'medical') {
      if (!fDiagnosis.trim()) return;
      onAddMedicalRecord?.({
        id: `med-${Date.now()}`,
        petId: pet.id,
        petName: pet.name,
        date: fDate,
        diagnosis: fDiagnosis.trim(),
        treatment: fTreatment.trim(),
        vetName: currentUser?.name ?? '',
        weightKg: Number.isFinite(Number(fWeight)) ? Number(fWeight) : 0,
        notes: fNotes.trim(),
      });
    } else {
      if (!fVaccine.trim() || !fGiven) return;
      onAddVaccination?.({
        id: `vac-${Date.now()}`,
        petId: pet.id,
        petName: pet.name,
        vaccineName: fVaccine.trim(),
        dateAdministered: fGiven,
        nextDueDate: fDue || fGiven,
        status: 'Upcoming',
      });
    }
    resetRecordForm();
    setShowRecordForm(false);
  };

  if (!pet) return null;

  // Polymorphic care tips generator (simulates Pet::careTips() in C++)
  const getSpeciesCareTips = (species: string): string[] => {
    switch (species) {
      case 'dog':
        return [
          'Requires 45–60 minutes of daily cardiovascular exercise & outdoor walking.',
          'High protein balanced diet with fresh hydration available 24/7.',
          'Bi-weekly coat brushing and monthly nail trimming to maintain paw ergonomics.',
          'Regular heartworm and flea/tick preventive medication.',
        ];
      case 'cat':
        return [
          'Provide dedicated scratching posts and high vertical perches for security.',
          'Daily litter box maintenance and multiple freshwater drinking stations.',
          'Hairball control diet and weekly grooming for long-haired breeds.',
          'Interactive playtime with feather wands to satisfy hunting instincts.',
        ];
      case 'rabbit':
        return [
          '80% diet must consist of unlimited fresh Timothy Hay for continuous dental wear.',
          'Indoor bunny-proofed exercise zone away from electrical wiring.',
          'Provide gentle chin head rubs; avoid picking up by scruff or ears.',
          'Regular veterinary check of molars and digestive gut motility.',
        ];
      case 'bird':
        return [
          'Draft-free room with consistent 10-12 hours of sleep schedule.',
          'Pellet-based diet complemented by dark leafy greens and seed treats.',
          'Daily out-of-cage supervised flight and foraging puzzle toys.',
          'Strictly avoid non-stick Teflon cookware fumes in the household.',
        ];
      default:
        return [
          'Fresh clean water, species-appropriate habitat, and routine health checks.',
        ];
    }
  };

  const careTips = getSpeciesCareTips(pet.species);

  // Real health records for THIS pet only (never fabricated)
  const petMedical = medicalRecords.filter((m) => m.petId === pet.id);
  const petVaccines = vaccinations.filter((v) => v.petId === pet.id);

  // Honest health summary derived only from this pet's own fields
  const healthSummary =
    pet.vaccinated && pet.neutered
      ? 'Vaccinated & neutered'
      : pet.vaccinated
        ? 'Vaccinated'
        : 'Health notes on file';

  // Match score if adopter
  const matchResult =
    currentUser?.role === 'adopter'
      ? calculateCompatibilityScore(currentUser as AdopterProfile, pet, 'balanced')
      : null;

  // Multi-photo mock array
  const photos = [
    pet.photoUrl,
    'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=400&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400&auto=format&fit=crop&q=80',
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${pet.name} — pet details`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Top Control Bar */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Search</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleFavorite(pet.id)}
              className="p-2 rounded-full border border-slate-200 text-slate-600 hover:text-rose-500 hover:bg-rose-50 transition-colors"
              title="Add to favorites"
            >
              <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close pet details"
              className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* Left Column: Photos (from Wireframe 05) */}
            <div className="md:col-span-6 space-y-3">
              <div className="aspect-4/3 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-md relative group">
                <PetImage
                  src={photos[selectedPhotoIdx]}
                  alt={pet.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {pet.status === 'Available' ? (
                  <span className="absolute top-3 left-3 bg-emerald-600/90 backdrop-blur-xs text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-sm">
                    Available for Adoption
                  </span>
                ) : (
                  <span className="absolute top-3 left-3 bg-amber-600/90 backdrop-blur-xs text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-sm">
                    {pet.status}
                  </span>
                )}
              </div>

              {/* Thumbnails Row */}
              <div className="grid grid-cols-4 gap-2">
                {photos.map((src, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedPhotoIdx(idx)}
                    className={`aspect-4/3 rounded-xl overflow-hidden border-2 transition-all ${
                      selectedPhotoIdx === idx
                        ? 'border-emerald-600 shadow-xs'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <PetImage src={src} alt={`${pet.name} photo ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Right Column: Key Details & Actions */}
            <div className="md:col-span-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    {pet.name}
                  </h1>
                  <p className="text-sm font-semibold text-emerald-800 mt-0.5">{pet.breed}</p>
                </div>

                {matchResult && (
                  <div className="bg-emerald-600 text-white px-3 py-1.5 rounded-xl shadow-xs text-center shrink-0">
                    <div className="text-xs font-extrabold">{matchResult.totalScore}% Match</div>
                    <div className="text-[10px] text-emerald-100">Compatibility</div>
                  </div>
                )}
              </div>

              {/* Quick Attribute Chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-lg font-medium">
                  {pet.ageMonths < 12 ? formatPetAge(pet.ageMonths) : `${formatPetAge(pet.ageMonths)} (${pet.ageMonths} mos)`}
                </span>
                <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-lg font-medium capitalize">
                  {pet.size} Size
                </span>
                <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-lg font-medium flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  {pet.location.area}
                </span>
                {pet.vaccinated && (
                  <span className="bg-emerald-50 text-emerald-800 px-3 py-1 rounded-lg font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Vaccinated
                  </span>
                )}
                {pet.neutered && (
                  <span className="bg-blue-50 text-blue-800 px-3 py-1 rounded-lg font-bold">
                    Neutered/Spayed
                  </span>
                )}
              </div>

              {/* Description */}
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">About {pet.name}</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
                  {pet.description}
                </p>
              </div>

              {/* Action Buttons (from Wireframe 05) */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => onApplyForAdoption(pet)}
                  disabled={pet.status !== 'Available'}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Apply for Adoption</span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => onStartMessage(pet)}
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <span>Message Shelter</span>
                  </button>

                  <button
                    onClick={() => onMessageAdmin && onMessageAdmin(pet)}
                    className="py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Directly message the PawMatch Admin about this pet"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Message Admin</span>
                  </button>
                </div>
              </div>

              {/* Guardian / Shelter Badge */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                  {pet.ownerName.charAt(0)}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">{pet.ownerName}</div>
                  <div className="text-[11px] text-slate-500 capitalize flex items-center gap-1">
                    {ownerVerified ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-semibold">Verified shelter partner</span>
                      </>
                    ) : (
                      <span>
                        Listed by {pet.ownerRole === 'shelter' ? 'shelter' : 'private owner'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Details Table & Health Matrix */}
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Complete Profile Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block">Species</span>
                <span className="font-bold text-slate-900 capitalize">{pet.species}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Breed</span>
                <span className="font-bold text-slate-900">{pet.breed}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Gender</span>
                <span className="font-bold text-slate-900">{pet.gender}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Color</span>
                <span className="font-bold text-slate-900">{pet.color}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Energy Level</span>
                <span className="font-bold text-slate-900 capitalize">{pet.energyLevel}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Good with Kids?</span>
                <span className="font-bold text-slate-900">{pet.goodWithKids ? 'Yes, very gentle' : 'No / Prefers adults'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Good with Other Pets?</span>
                <span className="font-bold text-slate-900">{pet.goodWithPets ? 'Yes, friendly' : 'No / Single pet home'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Health Status</span>
                <span className="font-bold text-emerald-700">{healthSummary}</span>
              </div>
            </div>
          </div>

          {/* Health & Vaccination Record — real records for this pet only.
              The section always renders for vet/shelter staff so new records
              can be added even when none exist yet. */}
          {(petMedical.length > 0 || petVaccines.length > 0 || pet.healthNotes || canAddRecords) && (
            <div className="border-t border-slate-200 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <motion.span
                  animate={reduceMotion ? undefined : { scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                  className="inline-flex w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 items-center justify-center shrink-0"
                >
                  <Stethoscope className="w-4 h-4" />
                </motion.span>
                <h3 className="text-sm font-bold text-slate-900">Health & Vaccination Record</h3>
              </div>

              {pet.healthNotes && (
                <p className="text-xs text-slate-600 leading-relaxed bg-white border border-slate-200 rounded-xl px-4 py-3 mb-3">
                  <span className="font-bold text-slate-800">Health notes: </span>
                  {pet.healthNotes}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {petMedical.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xs hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      {rec.diagnosis}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {rec.date} · {rec.vetName} · {rec.treatment}
                    </div>
                  </div>
                ))}
                {petVaccines.map((vac) => {
                  // Full live-sync round: status is computed from the due date —
                  // the DB stores no status, and seed hardcodes are not trusted.
                  const liveStatus = computeVaccinationStatus(vac.nextDueDate);
                  return (
                    <div
                      key={vac.id}
                      className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xs hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                        {vac.vaccineName}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Given {vac.dateAdministered} · Next due {vac.nextDueDate}
                        <span
                          className={`ml-1.5 font-bold ${
                            liveStatus === 'Overdue'
                              ? 'text-rose-600'
                              : liveStatus === 'Upcoming'
                                ? 'text-amber-600'
                                : 'text-emerald-700'
                          }`}
                        >
                          · {liveStatus}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Vet/Shelter: add a health record (synced to the shared DB in live mode) */}
              {canAddRecords && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowRecordForm((s) => !s)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                  >
                    {showRecordForm ? '− Hide record form' : '+ Add medical record / vaccination'}
                  </button>
                  {showRecordForm && (
                    <div className="mt-3 bg-white border border-slate-200 rounded-xl px-4 py-4 space-y-3">
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setRecordKind('medical')}
                          className={`px-3 py-1.5 rounded-full font-bold ${
                            recordKind === 'medical'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Medical record
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecordKind('vaccination')}
                          className={`px-3 py-1.5 rounded-full font-bold ${
                            recordKind === 'vaccination'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Vaccination
                        </button>
                      </div>
                      {recordKind === 'medical' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          <input
                            type="date"
                            value={fDate}
                            onChange={(e) => setFDate(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2"
                            aria-label="Record date"
                          />
                          <input
                            value={fWeight}
                            onChange={(e) => setFWeight(e.target.value)}
                            placeholder="Weight (kg)"
                            inputMode="decimal"
                            className="border border-slate-300 rounded-lg px-3 py-2"
                          />
                          <input
                            value={fDiagnosis}
                            onChange={(e) => setFDiagnosis(e.target.value)}
                            placeholder="Diagnosis *"
                            className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-2"
                          />
                          <input
                            value={fTreatment}
                            onChange={(e) => setFTreatment(e.target.value)}
                            placeholder="Treatment"
                            className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-2"
                          />
                          <textarea
                            value={fNotes}
                            onChange={(e) => setFNotes(e.target.value)}
                            placeholder="Notes"
                            rows={2}
                            className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-2"
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          <input
                            value={fVaccine}
                            onChange={(e) => setFVaccine(e.target.value)}
                            placeholder="Vaccine name *"
                            className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-2"
                          />
                          <input
                            type="date"
                            value={fGiven}
                            onChange={(e) => setFGiven(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2"
                            aria-label="Date administered"
                          />
                          <input
                            type="date"
                            value={fDue}
                            onChange={(e) => setFDue(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2"
                            aria-label="Next due date (leave blank if none)"
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={submitRecordForm}
                          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                        >
                          Save record
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            resetRecordForm();
                            setShowRecordForm(false);
                          }}
                          className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Polymorphic Care Tips (Feature requirement) */}
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-emerald-700" />
              <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                Species Care Guide ({pet.species.toUpperCase()})
              </h4>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
              {careTips.map((tip, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
