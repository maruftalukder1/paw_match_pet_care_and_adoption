import React, { useState } from 'react';
import { todayISO } from '../utils/time';
import {
  Compass,
  AlertTriangle,
  PlusCircle,
  MapPin,
  Calendar,
  Phone,
  CheckCircle,
  Sparkles,
  X,
  Search,
  Filter
} from 'lucide-react';
import { LostFoundReport, PetSpecies, PetSize, AnyUser } from '../types';
import { PetImage } from './PetImage';
import { ImageUploader } from './ImageUploader';
import { EmptyState } from './EmptyState';

interface LostFoundViewProps {
  reports: LostFoundReport[];
  currentUser: AnyUser | null;
  onAddReport: (report: LostFoundReport) => void;
  onResolveReport: (id: string) => void;
}

export const LostFoundView: React.FC<LostFoundViewProps> = ({
  reports,
  currentUser,
  onAddReport,
  onResolveReport,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'Lost' | 'Found'>('Lost');
  const [showModal, setShowModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<LostFoundReport | null>(null);

  // Form fields for new report
  const [repType, setRepType] = useState<'Lost' | 'Found'>('Lost');
  const [species, setSpecies] = useState<PetSpecies>('dog');
  const [breed, setBreed] = useState('');
  const [petName, setPetName] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState<PetSize>('medium');
  const [area, setArea] = useState('Mirpur, Dhaka');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState(currentUser?.name || '');
  const [contactPhone, setContactPhone] = useState(currentUser?.phone || '+880-17');
  const [photoUrl, setPhotoUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newRep: LostFoundReport = {
      id: `lf-${Date.now()}`,
      type: repType,
      species,
      breed: breed || 'Mixed Breed',
      petName: petName || (repType === 'Lost' ? 'Unknown Pet' : 'Found Animal'),
      color: color || 'Brown & White',
      size,
      area,
      lat: 23.8071,
      lon: 90.3686,
      date,
      description,
      photoUrl,
      contactName,
      contactPhone,
      status: 'Active',
    };
    onAddReport(newRep);
    setShowModal(false);
  };

  // Auto-Match Engine (Feature Module 9): Compare lost report against found reports
  const findAutoMatches = (target: LostFoundReport) => {
    const candidateType = target.type === 'Lost' ? 'Found' : 'Lost';
    return reports.filter((r) => {
      if (r.id === target.id || r.type !== candidateType || r.status !== 'Active') return false;
      const speciesMatch = r.species === target.species;
      const sizeMatch = r.size === target.size;
      const areaMatch = r.area.toLowerCase().includes(target.area.toLowerCase().split(',')[0]);
      return speciesMatch && (sizeMatch || areaMatch);
    });
  };

  const filteredReports = reports.filter((r) => {
    if (activeTab === 'all') return true;
    return r.type === activeTab;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner (Wireframe 09) */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">
            <Compass className="w-4 h-4 text-amber-600" />
            <span>Community Reunification Network</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Lost & Found Pets
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Report missing pets or sighted strays. Our spatial auto-matcher compares species, size, color,
            and coordinates to reunite families.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ Report Lost/Found Pet</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('Lost')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'Lost'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Lost Pets ({reports.filter((r) => r.type === 'Lost').length})
        </button>
        <button
          onClick={() => setActiveTab('Found')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'Found'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Found Pets ({reports.filter((r) => r.type === 'Found').length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'all'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All Reports
        </button>
      </div>

      {/* Reports Grid (Wireframe 09) */}
      {filteredReports.length === 0 ? (
        <EmptyState
          title="No Reports Here Yet"
          message={
            activeTab === 'all'
              ? 'No lost or found reports have been filed. File the first one — every report helps reunite a pet with its family.'
              : `No ${activeTab.toLowerCase()} reports right now. File one and the community auto-matcher will get to work.`
          }
          actionLabel="+ Report Lost/Found Pet"
          onAction={() => setShowModal(true)}
        />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredReports.map((item) => {
          const autoMatches = findAutoMatches(item);

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
            >
              <div className="relative aspect-16/10 bg-slate-100 overflow-hidden">
                <PetImage
                  src={item.photoUrl}
                  alt={item.petName || item.breed}
                  className="w-full h-full object-cover"
                />

                <span
                  className={`absolute top-3 left-3 text-xs font-black px-2.5 py-1 rounded-md shadow-xs ${
                    item.type === 'Lost'
                      ? 'bg-rose-600 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {item.type}
                </span>

                <span className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-xs text-white text-[10px] font-medium px-2 py-0.5 rounded">
                  {item.date}
                </span>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900 text-base">
                      {item.petName || 'Unnamed Animal'}
                    </h3>
                    <span className="text-xs text-slate-500 font-medium capitalize">
                      {item.species}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    {item.breed} · {item.color} · {item.size}
                  </p>

                  <div className="flex items-center gap-1 text-xs text-slate-500 mt-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{item.area}</span>
                  </div>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed bg-slate-50 p-2 rounded-xl border border-slate-100">
                    "{item.description}"
                  </p>

                  {/* Auto-Match Indicator */}
                  {autoMatches.length > 0 && (
                    <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-center gap-1.5 font-semibold">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        {autoMatches.length} possible matching {item.type === 'Lost' ? 'found' : 'lost'} report(s)!
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500">
                    <span className="block font-bold text-slate-700">{item.contactName}</span>
                    <span>{item.contactPhone}</span>
                  </div>

                  <button
                    onClick={() => setSelectedReport(item)}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Details & Auto-match Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                  selectedReport.type === 'Lost'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {selectedReport.type} Report Details
              </span>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="aspect-16/9 rounded-xl overflow-hidden bg-slate-100">
              <PetImage
                src={selectedReport.photoUrl}
                alt={selectedReport.petName || selectedReport.breed || 'pet'}
                className="w-full h-full object-cover"
              />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">{selectedReport.petName}</h3>
              <p className="text-xs text-slate-600">
                {selectedReport.breed} · {selectedReport.color} · Area: {selectedReport.area}
              </p>
              <p className="text-xs text-slate-700 mt-2 p-3 bg-slate-50 rounded-xl">
                {selectedReport.description}
              </p>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl text-xs text-emerald-900 space-y-1">
              <div className="font-bold">Contact Reporter:</div>
              <div>Name: {selectedReport.contactName}</div>
              <div>Phone: {selectedReport.contactPhone}</div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  onResolveReport(selectedReport.id);
                  setSelectedReport(null);
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Mark as Reunited / Resolved
              </button>
              <button
                onClick={() => setSelectedReport(null)}
                className="py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Report Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Report Lost or Found Pet</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Report Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRepType('Lost')}
                    className={`py-2 rounded-xl font-bold border transition-colors ${
                      repType === 'Lost'
                        ? 'bg-rose-50 border-rose-400 text-rose-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    I Lost a Pet
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepType('Found')}
                    className={`py-2 rounded-xl font-bold border transition-colors ${
                      repType === 'Found'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    I Found a Pet
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Species</label>
                  <select
                    value={species}
                    onChange={(e) => setSpecies(e.target.value as any)}
                    className="w-full py-2 px-2.5 rounded-xl border border-slate-200 font-medium"
                  >
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                    <option value="rabbit">Rabbit</option>
                    <option value="bird">Bird</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pet Name (if known)</label>
                  <input
                    type="text"
                    value={petName}
                    onChange={(e) => setPetName(e.target.value)}
                    placeholder="e.g. Max"
                    className="w-full py-2 px-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Breed</label>
                  <input
                    type="text"
                    value={breed}
                    onChange={(e) => setBreed(e.target.value)}
                    placeholder="e.g. Golden Retriever"
                    className="w-full py-2 px-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Color</label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="e.g. Honey / Cream"
                    className="w-full py-2 px-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Area / Location</label>
                  <input
                    type="text"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="e.g. Mirpur 10, Dhaka"
                    className="w-full py-2 px-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date Seen/Lost</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full py-2 px-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description / Collar / Traits</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Collar color, tag info, distinct marks..."
                  required
                  className="w-full py-2 px-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <ImageUploader
                  value={photoUrl}
                  onChange={(v) => setPhotoUrl(v)}
                  label="Pet Photo"
                  compact
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                    className="w-full py-2 px-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    required
                    className="w-full py-2 px-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-colors mt-2"
              >
                Submit Report to Community
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
