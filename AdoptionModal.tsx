import React, { useState } from 'react';
import { X, ChevronLeft, CheckCircle2, ShieldCheck, Heart, Sparkles } from 'lucide-react';
import { Pet, AnyUser, AdoptionApplication } from '../types';
import { formatPetAge } from '../utils/time';
import { PetImage } from './PetImage';

interface AdoptionModalProps {
  pet: Pet | null;
  currentUser: AnyUser | null;
  onClose: () => void;
  onSubmitApplication: (app: AdoptionApplication, notifyAdminInChat?: boolean) => void;
}

export const AdoptionModal: React.FC<AdoptionModalProps> = ({
  pet,
  currentUser,
  onClose,
  onSubmitApplication,
}) => {
  if (!pet) return null;

  const [fullName, setFullName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [age, setAge] = useState<number>(24);
  const [occupation, setOccupation] = useState('Software Engineer');
  const [address, setAddress] = useState(currentUser?.location?.area || 'Mirpur, Dhaka');
  const [reason, setReason] = useState(
    `I love ${pet.species}s and want a lifelong, caring companion. We have an active routine ready for ${pet.name}.`
  );
  const [previousExperience, setPreviousExperience] = useState(
    'Yes, I had a family dog before and understand daily feeding, grooming, and medical care.'
  );
  const [hasOtherPets, setHasOtherPets] = useState(false);
  const [hasEnoughSpace, setHasEnoughSpace] = useState(true);
  const [references, setReferences] = useState('Local Veterinarian Dr. Bennett / Landlord approval');
  const [notifyAdminInChat, setNotifyAdminInChat] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newApp: AdoptionApplication = {
      id: `app-${Date.now()}`,
      petId: pet.id,
      petName: pet.name,
      petBreed: pet.breed,
      petPhotoUrl: pet.photoUrl,
      applicantId: currentUser?.id || `guest-${Date.now()}`,
      applicantName: fullName,
      applicantEmail: email,
      applicantPhone: phone,
      applicantAddress: address,
      applicantAge: Number(age) || 25,
      applicantOccupation: occupation,
      reason,
      previousExperience,
      hasOtherPets,
      hasEnoughSpace,
      references,
      status: 'Submitted',
      submittedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };

    onSubmitApplication(newApp, notifyAdminInChat);
    setSubmitted(true);
    setTimeout(() => {
      onClose();
    }, 1600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <h2 className="text-sm font-extrabold text-slate-900">Adoption Application</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Pet Summary Card from Wireframe 07 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-4">
            <PetImage
              src={pet.photoUrl}
              alt={pet.name}
              className="w-16 h-16 rounded-xl object-cover border border-slate-200"
            />
            <div>
              <div className="text-base font-extrabold text-slate-900">{pet.name}</div>
              <div className="text-xs text-slate-600">
                {pet.breed} · {formatPetAge(pet.ageMonths)} · {pet.location.area}
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                Guardian: {pet.ownerName} ({pet.ownerRole})
              </div>
            </div>
          </div>

          {submitted ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl">
                ✓
              </div>
              <h3 className="text-lg font-bold text-slate-900">Application Submitted!</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Your application for {pet.name} has been sent to {pet.ownerName}. You can track the status
                in your Dashboard and direct-message the shelter anytime.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    required
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Occupation</label>
                  <input
                    type="text"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    required
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Residential Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Why do you want to adopt this pet?
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Previous Pet Experience
                </label>
                <textarea
                  rows={2}
                  value={previousExperience}
                  onChange={(e) => setPreviousExperience(e.target.value)}
                  required
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <span className="font-bold text-slate-700">Do you have other pets?</span>
                  <input
                    type="checkbox"
                    checked={hasOtherPets}
                    onChange={(e) => setHasOtherPets(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <span className="font-bold text-slate-700">Enough space / yard?</span>
                  <input
                    type="checkbox"
                    checked={hasEnoughSpace}
                    onChange={(e) => setHasEnoughSpace(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                </label>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Personal or Vet Reference
                </label>
                <input
                  type="text"
                  value={references}
                  onChange={(e) => setReferences(e.target.value)}
                  placeholder="Name, Phone or Clinic"
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyAdminInChat}
                  onChange={(e) => setNotifyAdminInChat(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-emerald-950 font-medium">
                  <strong>Send direct message to Admin</strong> with this application so they can review and chat with you immediately.
                </span>
              </label>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Submit Application</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
