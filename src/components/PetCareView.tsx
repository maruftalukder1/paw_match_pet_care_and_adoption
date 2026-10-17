import React, { useState } from 'react';
import {
  Stethoscope,
  ShieldCheck,
  Calendar,
  Clock,
  Heart,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Sparkles,
  PlusCircle,
  X
} from 'lucide-react';
import {
  MedicalRecord,
  VaccinationRecord,
  VetAppointment,
  AnyUser,
  Pet,
  PetSpecies
} from '../types';
import { computeVaccinationStatus } from '../utils/time';
import { SymptomChecker } from './SymptomChecker';

interface PetCareViewProps {
  medicalRecords: MedicalRecord[];
  vaccinations: VaccinationRecord[];
  appointments: VetAppointment[];
  onBookAppointment: (appt: VetAppointment) => void;
  /** Full live-sync round: vet/shelter can mark appointments Completed/Cancelled. */
  onUpdateAppointmentStatus?: (id: string, status: VetAppointment['status']) => void;
  currentUser: AnyUser | null;
  pets: Pet[];
  onNavigateTab?: (tab: string) => void;
}

export const PetCareView: React.FC<PetCareViewProps> = ({
  medicalRecords,
  vaccinations,
  appointments,
  onBookAppointment,
  onUpdateAppointmentStatus,
  currentUser,
  pets,
  onNavigateTab,
}) => {
  const [selectedSpecies, setSelectedSpecies] = useState<PetSpecies>('dog');
  const [selectedTopic, setSelectedTopic] = useState<string>('nutrition');
  const [showBookingModal, setShowBookingModal] = useState(false);

  // Booking state
  const [petName, setPetName] = useState('Bruno');
  const [vetId, setVetId] = useState('u-vet-1');
  const [bookingDate, setBookingDate] = useState('2024-10-15');
  const [timeSlot, setTimeSlot] = useState('10:00 AM');
  const [reason, setReason] = useState('Routine Annual Wellness Checkup');
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const guides = {
    dog: {
      nutrition: {
        title: 'Dog Feeding & Balanced Nutrition',
        points: [
          'Feed high-grade animal protein (chicken, lamb, beef or fish) formulated for your dog\'s life stage.',
          'Portion control is key: 2 meals daily based on adult weight to avoid canine obesity and joint strain.',
          'Dangerous toxic human foods to strictly avoid: Chocolate, onions, garlic, grapes/raisins, and xylitol artificial sweetener.',
          'Always supply fresh, clean, cool water refreshed at least twice daily.',
        ],
      },
      vaccination: {
        title: 'Canine Core & Lifestyle Vaccination Protocol',
        points: [
          'Core DHPP (Distemper, Hepatitis, Parvovirus, Parainfluenza) started at 6-8 weeks with boosters every 1-3 years.',
          'Rabies vaccine mandatory by law, administered at 12-16 weeks and boosted annually or triennially.',
          'Non-core lifestyle vaccines: Bordetella (kennel cough) for dogs visiting parks/groomers, and Leptospirosis.',
          'Keep an up-to-date physical vaccination passport for boarding and vet clinics.',
        ],
      },
      grooming: {
        title: 'Coat, Ear, and Paw Hygiene',
        points: [
          'Brush double-coated dogs 3x weekly to remove undercoat and prevent painful matting.',
          'Bathe every 3–4 weeks with pH-balanced canine shampoo. Excessive human soap dries natural skin oils.',
          'Clip nails every 3–4 weeks before they click against the floor to maintain proper musculoskeletal alignment.',
          'Check and clean ear flaps with veterinary ear cleanser to prevent fungal moisture infections.',
        ],
      },
      exercise: {
        title: 'Cardiovascular Exercise & Mental Stimulation',
        points: [
          'Active sporting/herding breeds (Labradors, German Shepherds) need 60–90 mins of vigorous daily activity.',
          'Incorporate sniff walks: 15 minutes of sniffing provides as much mental relaxation as a 45-minute jog.',
          'Utilize interactive food puzzle toys and hide-and-seek scent work to curb destructive boredom.',
          'Avoid heavy running on hot asphalt to safeguard sensitive paw pads.',
        ],
      },
      health: {
        title: 'Common Canine Health Issues & Signs',
        points: [
          'Watch for lethargy, sudden refusal to eat, pale gums, vomiting, or diarrhea lasting over 24 hours.',
          'Dental disease affects 80% of dogs over age 3; introduce enzymatic toothbrushing early.',
          'Keep heartworm prevention tablets current every 30 days year-round.',
        ],
      },
      training: {
        title: 'Positive Reinforcement Training',
        points: [
          'Reward desired behaviors with high-value treats and praise within 1.5 seconds of the action.',
          'Keep sessions short (5–10 minutes) and end on a positive, successful note.',
          'Never use fear-based dominance tactics; consistency and patience produce reliable recall.',
        ],
      },
    },
    cat: {
      nutrition: {
        title: 'Feline Obligate Carnivore Nutrition',
        points: [
          'Cats require dietary taurine and high animal moisture; wet canned food supports kidney and bladder health.',
          'Encourage hydration with circulating water fountains placed away from the litter box.',
          'Feed small, frequent meals imitating natural feline predatory eating habits.',
        ],
      },
      vaccination: {
        title: 'Feline Core Vaccines',
        points: [
          'FVRCP (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia) protects against deadly respiratory and enteric viruses.',
          'Rabies vaccine is essential even for indoor cats.',
          'FeLV (Feline Leukemia) is strongly recommended for cats with outdoor access.',
        ],
      },
      grooming: {
        title: 'Feline Grooming & Hairball Care',
        points: [
          'Comb longhair cats (Persians, Maine Coons) daily with metal-toothed combs to stop mats.',
          'Provide pet grass and enzymatic hairball gel to reduce regurgitation discomfort.',
          'Gently trim the tip of claws every two weeks with specialized cat nail clippers.',
        ],
      },
      exercise: {
        title: 'Interactive Play & Vertical Space',
        points: [
          'Provide cat trees and window perches to satisfy instinctual territorial surveillance needs.',
          'Conduct two 10-minute high-intensity wand toy sessions before meal times.',
          'Rotate toys weekly so novel textures keep them engaged.',
        ],
      },
      health: {
        title: 'Urinary & Kidney Watch',
        points: [
          'Straining in the litter box or vocalizing is a critical veterinary emergency in male cats (urinary blockage).',
          'Ensure clean litter boxes: formula is (Number of Cats + 1) boxes cleaned daily.',
        ],
      },
      training: {
        title: 'Clicker Training & Scratching Redirection',
        points: [
          'Place sisal scratching posts directly next to doorways and sleeping spots.',
          'Cats respond rapidly to clicker training with savory paste treats.',
        ],
      },
    },
    rabbit: {
      nutrition: {
        title: 'Lagomorph High-Fiber Diet',
        points: [
          '80% of daily diet must be unlimited clean Timothy or orchard hay.',
          'Feed fresh dark leafy greens (cilantro, romaine, parsley) and measured plain pellets.',
          'Carrots and fruits are high in sugar and should only be fed as pea-sized occasional treats.',
        ],
      },
      vaccination: {
        title: 'Rabbit Viral Diseases',
        points: [
          'Vaccinate against RHDV2 (Rabbit Hemorrhagic Disease Virus) and Myxomatosis where prevalent.',
        ],
      },
      grooming: {
        title: 'Gentle Bunny Grooming',
        points: [
          'Never submerge a rabbit in water; sudden hypothermia or shock can be fatal.',
          'Brush during shedding seasons to prevent intestinal wool blockages.',
        ],
      },
      exercise: {
        title: 'Safe Free-Roam Playtime',
        points: [
          'Protect electrical cables with plastic split tubing.',
          'Provide soft carpeted surfaces for binkies and safe hops.',
        ],
      },
      health: {
        title: 'GI Stasis Emergency Signs',
        points: [
          'If a rabbit stops eating or producing fecal pellets for 8–12 hours, rush to an exotic vet immediately.',
        ],
      },
      training: {
        title: 'Litter Box Training',
        points: [
          'Place hay racks directly over high-walled litter pans lined with paper bedding.',
        ],
      },
    },
    bird: {
      nutrition: {
        title: 'Avian Nutritional Balance',
        points: [
          'Seed-only diets cause fatty liver disease; transition birds to organic formulated pellets.',
          'Supplement with chopped veggies: broccoli, bell peppers, leafy kale, and cooked sweet potato.',
        ],
      },
      vaccination: {
        title: 'Preventive Avian Health',
        points: [
          'Annual physical checks, gram stains, and beak/wing inspections by certified avian veterinarians.',
        ],
      },
      grooming: {
        title: 'Feather & Beak Maintenance',
        points: [
          'Provide shallow ceramic birdbaths or gentle lukewarm water mists 3 times a week.',
          'Supply natural hardwood branches (manzanita, eucalyptus) to keep talons trimmed naturally.',
        ],
      },
      exercise: {
        title: 'Daily Supervised Flight',
        points: [
          'Ensure ceiling fans are switched off and window glass is marked before releasing birds for flight.',
        ],
      },
      health: {
        title: 'Avian Respiratory Sensitivity',
        points: [
          'Birds possess sensitive air sacs: strictly ban aerosol sprays, candles, and non-stick pans.',
        ],
      },
      training: {
        title: 'Target and Step-Up Training',
        points: [
          'Use positive reinforcement with millet spray to teach the step-up command onto fingers.',
        ],
      },
    },
    other: {
      nutrition: {
        title: 'Specialty & Pocket Pet Care',
        points: ['Research dietary specifics for your small animal species with your local vet.'],
      },
      vaccination: {
        title: 'Preventive Protocols',
        points: ['Consult an exotic specialist for appropriate species schedules.'],
      },
      grooming: {
        title: 'Sanitation',
        points: ['Clean enclosures thoroughly each week.'],
      },
      exercise: {
        title: 'Enrichment',
        points: ['Provide species-safe running wheels and foraging toys.'],
      },
      health: {
        title: 'Veterinary Checkups',
        points: ['Keep annual checks on schedule.'],
      },
      training: {
        title: 'Gentle Handling',
        points: ['Allow pets to approach your open hand at their own pace.'],
      },
    },
  };

  const currentGuide =
    guides[selectedSpecies]?.[selectedTopic as keyof typeof guides.dog] ||
    guides.dog.nutrition;

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');

    // Feature Module 8: Prevent double booking of the same slot
    const slotConflict = appointments.some(
      (a) => a.vetId === vetId && a.date === bookingDate && a.timeSlot === timeSlot && a.status === 'Scheduled'
    );

    if (slotConflict) {
      setBookingError(`This time slot (${timeSlot}) on ${bookingDate} is already reserved by another patient. Please pick a different slot.`);
      return;
    }

    const newAppt: VetAppointment = {
      id: `appt-${Date.now()}`,
      petId: 'pet-1',
      petName,
      vetId,
      vetName: vetId === 'u-vet-1' ? 'Dr. Sarah Bennett' : 'Dr. Michael Chen',
      clinicName: vetId === 'u-vet-1' ? 'Central Care Vet Clinic' : 'Evergreen Animal Hospital',
      date: bookingDate,
      timeSlot,
      reason,
      status: 'Scheduled',
    };

    onBookAppointment(newAppt);
    setBookingSuccess(true);
    setTimeout(() => {
      setBookingSuccess(false);
      setShowBookingModal(false);
    }, 1200);
  };

  /** Symptom Checker deep-link: open booking with the check's pet + reason prefilled. */
  const openBookingWithPrefill = (prefill: { petName: string; reason: string }) => {
    setPetName(prefill.petName);
    setReason(prefill.reason);
    setShowBookingModal(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner (Wireframe 10) */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">
            <Stethoscope className="w-4 h-4 text-blue-600" />
            <span>Healthcare & Veterinary Hub</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Pet Care Guides & Healthcare
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Learn how to provide optimal nutrition, grooming, and training for your companion,
            track immunizations, and schedule vet appointments with zero double-booking conflicts.
          </p>
        </div>

        <button
          onClick={() => setShowBookingModal(true)}
          className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 shrink-0"
        >
          <Calendar className="w-4 h-4" />
          <span>Book Vet Appointment</span>
        </button>
      </div>

      {/* Pet Symptom Checker — prominent section at the top of Pet Care (1 click from nav) */}
      <SymptomChecker
        currentUser={currentUser}
        pets={pets}
        onRequestBooking={openBookingWithPrefill}
        onNavigateToServices={() => onNavigateTab?.('services')}
      />

      {/* Animal Tabs from Wireframe 10 */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        {(['dog', 'cat', 'rabbit', 'bird', 'other'] as PetSpecies[]).map((sp) => (
          <button
            key={sp}
            onClick={() => setSelectedSpecies(sp)}
            className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-colors ${
              selectedSpecies === sp
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {sp === 'dog' ? 'Dogs 🐕' : sp === 'cat' ? 'Cats 🐈' : sp === 'rabbit' ? 'Rabbits 🐇' : sp === 'bird' ? 'Birds 🦜' : 'Others 🐾'}
          </button>
        ))}
      </div>

      {/* Grid: Topics Sidebar + Guide Display (Wireframe 10) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Topics Navigation */}
        <div className="md:col-span-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-1">
          {[
            { id: 'nutrition', label: 'Feeding & Nutrition', icon: '🍲' },
            { id: 'vaccination', label: 'Vaccination Protocol', icon: '💉' },
            { id: 'grooming', label: 'Grooming & Hygiene', icon: '✂️' },
            { id: 'exercise', label: 'Exercise & Activity', icon: '🏃' },
            { id: 'health', label: 'Common Health Problems', icon: '🩺' },
            { id: 'training', label: 'Training & Socialization', icon: '🎓' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedTopic(item.id)}
              className={`w-full p-3 rounded-xl text-left flex items-center gap-3 text-xs font-bold transition-colors ${
                selectedTopic === item.id
                  ? 'bg-emerald-50 text-emerald-800 border-l-4 border-emerald-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Right Content View */}
        <div className="md:col-span-8 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              {selectedSpecies.toUpperCase()} CARE STANDARD
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
              {currentGuide.title}
            </h2>
          </div>

          <div className="space-y-3">
            {currentGuide.points.map((p, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3.5"
              >
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                  {p}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Healthcare Records & Vaccinations Table (Feature Module 8) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Scheduled Appointments */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Upcoming Vet Appointments</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {appointments.length} Scheduled
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {appointments.map((appt) => (
              <div key={appt.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-slate-900">
                    {appt.petName} · {appt.reason}
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    {appt.vetName} ({appt.clinicName})
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                    📅 {appt.date} at {appt.timeSlot}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                    {appt.status}
                  </span>
                  {appt.status === 'Scheduled' &&
                    onUpdateAppointmentStatus &&
                    (currentUser?.role === 'vet' || currentUser?.role === 'shelter') && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onUpdateAppointmentStatus(appt.id, 'Completed')}
                          className="px-2 py-1 rounded-full bg-emerald-600 text-white font-bold text-[10px] hover:bg-emerald-700"
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateAppointmentStatus(appt.id, 'Cancelled')}
                          className="px-2 py-1 rounded-full bg-slate-200 text-slate-600 font-bold text-[10px] hover:bg-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Immunization Schedule & Overdue Watch */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Vaccination Schedule & Reminders</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {vaccinations.length} Recorded
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {vaccinations.map((vac) => {
              // v2: status is computed from the due date — never trust the hardcoded seed value.
              const liveStatus = computeVaccinationStatus(vac.nextDueDate);
              return (
                <div key={vac.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-slate-900">
                      {vac.petName} — {vac.vaccineName}
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      Administered: {vac.dateAdministered} · Due: {vac.nextDueDate}
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                      liveStatus === 'Upcoming'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {liveStatus}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Book Vet Appointment</h3>
              <button
                onClick={() => setShowBookingModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bookingError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            {bookingSuccess ? (
              <div className="p-6 text-center space-y-2">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <h4 className="font-bold text-slate-900">Appointment Confirmed!</h4>
                <p className="text-xs text-slate-500">
                  Slot successfully locked. Reminder sent to your notification center.
                </p>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Select Pet</label>
                  <input
                    type="text"
                    value={petName}
                    onChange={(e) => setPetName(e.target.value)}
                    required
                    className="w-full py-2 px-3 rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Veterinarian Clinic</label>
                  <select
                    value={vetId}
                    onChange={(e) => setVetId(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 font-medium"
                  >
                    <option value="u-vet-1">Dr. Sarah Bennett (Central Care Vet Clinic - Dhanmondi)</option>
                    <option value="u-vet-2">Dr. Michael Chen (Evergreen Animal Hospital - Uttara)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      required
                      className="w-full py-2 px-3 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Time Slot</label>
                    <select
                      value={timeSlot}
                      onChange={(e) => setTimeSlot(e.target.value)}
                      className="w-full py-2 px-3 rounded-xl border border-slate-200 font-medium"
                    >
                      <option value="10:00 AM">10:00 AM</option>
                      <option value="11:30 AM">11:30 AM</option>
                      <option value="02:00 PM">02:00 PM</option>
                      <option value="03:30 PM">03:30 PM</option>
                      <option value="05:00 PM">05:00 PM</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reason for Visit</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Annual vaccination check, microchipping, joint exam"
                    required
                    className="w-full py-2 px-3 rounded-xl border border-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-colors mt-2"
                >
                  Reserve Appointment Slot
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
