import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PawPrint, Plus, Pencil, Trash2, X, Save, Download } from 'lucide-react';
import { Pet, AnyUser, PetSpecies, PetStatus, PetSize, EnergyLevel } from '../types';
import { exportCsv } from '../utils/csv';
import { todayISO } from '../utils/time';
import { petColumns } from '../utils/csvExports';
import { PetImage } from './PetImage';
import { ImageUploader } from './ImageUploader';

interface PetManagerProps {
  currentUser: AnyUser;
  pets: Pet[];
  onAddPet: (pet: Pet) => void;
  onUpdatePet: (pet: Pet) => void;
  onDeletePet: (petId: string) => void;
}

const EMPTY_FORM = {
  name: '',
  species: 'dog' as PetSpecies,
  breed: '',
  ageMonths: 12,
  gender: 'Male' as 'Male' | 'Female',
  size: 'medium' as PetSize,
  color: '',
  energyLevel: 'moderate' as EnergyLevel,
  goodWithKids: true,
  goodWithPets: true,
  vaccinated: true,
  neutered: false,
  healthNotes: '',
  status: 'Available' as PetStatus,
  area: '',
  description: '',
  photoUrl: '',
  tags: '',
};

/** Stock photo used only when a NEW pet is added without a photo. */
const STOCK_PET_PHOTO =
  'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop&q=80';

function formToPet(form: typeof EMPTY_FORM, currentUser: AnyUser, existing?: Pet): Pet {
  const now = todayISO();
  return {
    id: existing?.id ?? `pet-${Date.now()}`,
    name: form.name.trim(),
    species: form.species,
    breed: form.breed.trim() || 'Mixed',
    ageMonths: Math.max(1, Number(form.ageMonths) || 1),
    gender: form.gender,
    size: form.size,
    color: form.color.trim() || '—',
    energyLevel: form.energyLevel,
    goodWithKids: form.goodWithKids,
    goodWithPets: form.goodWithPets,
    vaccinated: form.vaccinated,
    neutered: form.neutered,
    healthNotes: form.healthNotes.trim(),
    status: form.status,
    ownerId: existing?.ownerId ?? currentUser.id,
    ownerName: existing?.ownerName ?? currentUser.name,
    ownerRole: existing?.ownerRole ?? (currentUser.role === 'shelter' ? 'shelter' : 'owner'),
    location: existing?.location ?? {
      area: form.area.trim() || currentUser.location?.area || 'Dhaka',
      lat: currentUser.location?.lat ?? 23.8103,
      lon: currentUser.location?.lon ?? 90.4125,
    },
    // Removing the photo in the edit form leaves '' — the honest paw
    // fallback renders everywhere (listings, detail, My Pets). The stock
    // photo applies ONLY to brand-new pets added without a photo.
    photoUrl: form.photoUrl.trim() || (existing ? '' : STOCK_PET_PHOTO),
    description: form.description.trim() || `${form.name} is looking for a loving home.`,
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12),
    dateAdded: existing?.dateAdded ?? now,
  };
}

function petToForm(pet: Pet): typeof EMPTY_FORM {
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    ageMonths: pet.ageMonths,
    gender: pet.gender,
    size: pet.size,
    color: pet.color,
    energyLevel: pet.energyLevel,
    goodWithKids: pet.goodWithKids,
    goodWithPets: pet.goodWithPets,
    vaccinated: pet.vaccinated,
    neutered: pet.neutered,
    healthNotes: pet.healthNotes,
    status: pet.status,
    area: pet.location.area,
    description: pet.description,
    photoUrl: pet.photoUrl,
    tags: (pet.tags ?? []).join(', '),
  };
}

/**
 * PetManager — Pet Management module (Pranty's module): add / edit / delete
 * pets for owners, shelters and admins. Shown on the dashboard.
 */
export const PetManager: React.FC<PetManagerProps> = ({
  currentUser,
  pets,
  onAddPet,
  onUpdatePet,
  onDeletePet,
}) => {
  const canManage = ['owner', 'shelter', 'admin'].includes(currentUser.role);
  const [editing, setEditing] = useState<null | { mode: 'new' } | { mode: 'edit'; pet: Pet }>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<null | { petId: string; petName: string }>(null);

  if (!canManage) return null;

  const myPets =
    currentUser.role === 'admin'
      ? pets
      : pets.filter((p) => p.ownerId === currentUser.id);

  const openNew = () => {
    setForm({ ...EMPTY_FORM, area: currentUser.location?.area ?? '' });
    setEditing({ mode: 'new' });
  };

  const openEdit = (pet: Pet) => {
    setForm(petToForm(pet));
    setEditing({ mode: 'edit', pet });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const pet = formToPet(form, currentUser, editing?.mode === 'edit' ? editing.pet : undefined);
    if (editing?.mode === 'edit') onUpdatePet(pet);
    else onAddPet(pet);
    setEditing(null);
  };

  const handleDelete = (petId: string, petName: string) => {
    setConfirmDelete({ petId, petName });
  };

  const confirmDeletePet = () => {
    if (confirmDelete) onDeletePet(confirmDelete.petId);
    setConfirmDelete(null);
  };

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const inputCls =
    'w-full text-xs py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none';

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <PawPrint className="w-5 h-5 text-emerald-600" />
            {currentUser.role === 'admin' ? 'Pet Management (All Pets)' : 'My Pets'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Add, edit or remove pet listings. Changes appear for adopters immediately.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {myPets.length > 0 && (
            <button
              onClick={() => exportCsv('PawMatch_My_Pets.csv', petColumns, myPets)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 font-bold text-xs rounded-xl transition-colors"
              title="Download your pet listings as CSV"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              Export my pets
            </button>
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Pet
          </motion.button>
        </div>
      </div>

      {myPets.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">
          No pets listed yet. Click “Add Pet” to create your first listing.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {myPets.map((pet) => (
            <motion.div
              key={pet.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="relative h-36 bg-slate-100">
                <PetImage
                  src={pet.photoUrl}
                  alt={pet.name}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-2 left-2 text-[10px] font-bold bg-white/90 px-2 py-0.5 rounded-full">
                  {pet.status}
                </span>
              </div>
              <div className="p-3.5 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900">{pet.name}</h3>
                  <span className="text-[11px] text-slate-500 capitalize">
                    {pet.species} · {pet.breed}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => openEdit(pet)}
                    className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg flex items-center justify-center gap-1 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(pet.id, pet.name)}
                    className="flex-1 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] rounded-lg flex items-center justify-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="text-base font-extrabold text-slate-900">
                  {editing.mode === 'new' ? 'Add New Pet' : `Edit ${editing.pet.name}`}
                </h3>
                <button
                  onClick={() => setEditing(null)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name *</label>
                  <input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="e.g. Bruno" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Breed</label>
                  <input value={form.breed} onChange={(e) => set('breed', e.target.value)} className={inputCls} placeholder="e.g. Labrador" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Species</label>
                  <select value={form.species} onChange={(e) => set('species', e.target.value as PetSpecies)} className={inputCls}>
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                    <option value="bird">Bird</option>
                    <option value="rabbit">Rabbit</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Age (months)</label>
                  <input type="number" min={1} value={form.ageMonths} onChange={(e) => set('ageMonths', Number(e.target.value))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                  <select value={form.gender} onChange={(e) => set('gender', e.target.value as 'Male' | 'Female')} className={inputCls}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Size</label>
                  <select value={form.size} onChange={(e) => set('size', e.target.value as PetSize)} className={inputCls}>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Energy Level</label>
                  <select value={form.energyLevel} onChange={(e) => set('energyLevel', e.target.value as EnergyLevel)} className={inputCls}>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => set('status', e.target.value as PetStatus)} className={inputCls}>
                    <option value="Available">Available</option>
                    <option value="Pending">Pending</option>
                    <option value="Adopted">Adopted</option>
                    <option value="Lost">Lost</option>
                    <option value="Found">Found</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Color</label>
                  <input value={form.color} onChange={(e) => set('color', e.target.value)} className={inputCls} placeholder="e.g. Golden brown" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Area</label>
                  <input value={form.area} onChange={(e) => set('area', e.target.value)} className={inputCls} placeholder="e.g. Mirpur, Dhaka" />
                </div>
                <div className="sm:col-span-2">
                  <ImageUploader
                    value={form.photoUrl}
                    onChange={(v) => set('photoUrl', v)}
                    label="Photo"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                  <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className={inputCls} placeholder="Tell adopters about this pet..." />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tags (comma-separated)</label>
                  <input value={form.tags} onChange={(e) => set('tags', e.target.value)} className={inputCls} placeholder="e.g. playful, trained, apartment-friendly" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Health Notes</label>
                  <input value={form.healthNotes} onChange={(e) => set('healthNotes', e.target.value)} className={inputCls} placeholder="e.g. Fully vaccinated, healthy" />
                </div>

                <div className="sm:col-span-2 flex flex-wrap gap-x-5 gap-y-2 mt-1">
                  {(
                    [
                      ['goodWithKids', 'Good with kids'],
                      ['goodWithPets', 'Good with other pets'],
                      ['vaccinated', 'Vaccinated'],
                      ['neutered', 'Neutered'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form[key]}
                        onChange={(e) => set(key, e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <div className="sm:col-span-2 flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <motion.button
                    type="submit"
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    {editing.mode === 'new' ? 'Add Pet' : 'Save Changes'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom delete confirmation (no native dialogs) */}
      <AnimatePresence>
        {confirmDelete && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
              aria-label={`Delete ${confirmDelete.petName}?`}
              className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Delete {confirmDelete.petName}?
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                This removes the listing from the platform for everyone. This cannot be undone.
              </p>
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={confirmDeletePet}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" /> Yes, delete
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};
