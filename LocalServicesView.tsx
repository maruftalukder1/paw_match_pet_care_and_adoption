import React, { useState } from 'react';
import {
  Scissors,
  Star,
  MapPin,
  Calendar,
  Clock,
  Sparkles,
  CheckCircle,
  PlusCircle,
  X
} from 'lucide-react';
import { ServiceItem, ServiceBooking, AnyUser } from '../types';
import { PetImage } from './PetImage';

interface LocalServicesViewProps {
  services: ServiceItem[];
  bookings: ServiceBooking[];
  onBookService: (booking: ServiceBooking) => void;
  currentUser: AnyUser | null;
}

export const LocalServicesView: React.FC<LocalServicesViewProps> = ({
  services,
  bookings,
  onBookService,
  currentUser,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [petName, setPetName] = useState('Bruno');
  const [bookingDate, setBookingDate] = useState('2024-10-18');
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const filteredServices = services.filter((s) => {
    if (filterType === 'all') return true;
    return s.serviceType === filterType;
  });

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;

    const newBooking: ServiceBooking = {
      id: `bk-${Date.now()}`,
      serviceId: selectedService.id,
      serviceTitle: selectedService.title,
      providerName: selectedService.providerName,
      userId: currentUser?.id || 'guest',
      userName: currentUser?.name || 'Guest User',
      petName,
      bookingDate,
      status: 'Confirmed',
      price: selectedService.price,
    };

    onBookService(newBooking);
    setBookingSuccess(true);
    setTimeout(() => {
      setBookingSuccess(false);
      setSelectedService(null);
    }, 1200);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-purple-700 uppercase tracking-wider mb-1">
            <Scissors className="w-4 h-4 text-purple-600" />
            <span>Verified Local Pet Specialists</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Local Pet Services & Salons
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
            Book professional grooming, daily neighborhood pack walks, boarding sitters, and behavioral training.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'all', label: 'All Services' },
          { id: 'grooming', label: 'Grooming & Spa 🛁' },
          { id: 'walking', label: 'Dog Walking 🦮' },
          { id: 'training', label: 'Coaching & Training 🎾' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterType(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              filterType === tab.id
                ? 'bg-purple-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Service Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredServices.map((srv) => (
          <div
            key={srv.id}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="relative aspect-4/3 bg-slate-100 overflow-hidden">
                <PetImage
                  src={srv.imageUrl}
                  alt={srv.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs text-slate-900 text-[11px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{srv.rating} ({srv.reviewCount})</span>
                </div>
              </div>

              <div className="p-4 space-y-2">
                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded uppercase">
                  {srv.serviceType}
                </span>

                <h3 className="font-extrabold text-slate-900 text-sm leading-snug">
                  {srv.title}
                </h3>

                <p className="text-xs text-slate-500 font-medium">
                  {srv.providerName}
                </p>

                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span className="truncate">{srv.location.area}</span>
                </div>

                <p className="text-[11px] text-slate-600 line-clamp-2 mt-1">
                  {srv.description}
                </p>
              </div>
            </div>

            <div className="p-4 pt-0 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-base font-extrabold text-slate-900">${srv.price}</span>
                <span className="text-[10px] text-slate-400"> / {srv.duration}</span>
              </div>

              <button
                onClick={() => setSelectedService(srv)}
                className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-colors shadow-2xs"
              >
                Book Service
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bookings Tracker */}
      {bookings.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="font-extrabold text-slate-900 text-base">Your Active Service Bookings</h3>
          <div className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-slate-900">{b.serviceTitle}</div>
                  <div className="text-slate-500 mt-0.5">
                    For {b.petName} · {b.providerName} · Date: {b.bookingDate}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-slate-900">${b.price}</span>
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                    {b.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Book {selectedService.title}</h3>
              <button
                onClick={() => setSelectedService(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bookingSuccess ? (
              <div className="p-6 text-center space-y-2">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <h4 className="font-bold text-slate-900">Booking Confirmed!</h4>
                <p className="text-xs text-slate-500">
                  {selectedService.providerName} will contact you shortly to coordinate arrival.
                </p>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Companion Pet Name</label>
                  <input
                    type="text"
                    value={petName}
                    onChange={(e) => setPetName(e.target.value)}
                    required
                    className="w-full py-2 px-3 rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preferred Date</label>
                  <input
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    required
                    className="w-full py-2 px-3 rounded-xl border border-slate-200"
                  />
                </div>

                <div className="p-3 bg-purple-50 rounded-xl flex items-center justify-between">
                  <span className="font-semibold text-purple-900">Service Fee:</span>
                  <span className="font-extrabold text-base text-purple-900 font-mono">
                    ${selectedService.price}
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl shadow-xs transition-colors mt-2"
                >
                  Confirm Reservation
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
