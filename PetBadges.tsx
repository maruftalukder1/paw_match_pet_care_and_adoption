import React from 'react';
import { CheckCircle2, ShieldCheck, Baby, HeartHandshake, Zap, CloudOff } from 'lucide-react';
import { Pet } from '../types';

/**
 * Premium trust badges for pet cards. Every badge is derived from an
 * EXISTING data field on the Pet record — nothing is invented per-pet.
 */
export const PetBadges: React.FC<{ pet: Pet; className?: string }> = ({ pet, className = '' }) => {
  const badges: { icon: React.ReactNode; label: string; style: string; title?: string }[] = [];

  if (pet.vaccinated) {
    badges.push({
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: 'Vaccinated',
      style: 'bg-emerald-600/95 text-white',
    });
  }
  if (pet.neutered) {
    badges.push({
      icon: <ShieldCheck className="w-3 h-3" />,
      label: 'Neutered/Spayed',
      style: 'bg-sky-600/95 text-white',
    });
  }
  if (pet.goodWithKids) {
    badges.push({
      icon: <Baby className="w-3 h-3" />,
      label: 'Kid-friendly',
      style: 'bg-amber-500/95 text-white',
    });
  }
  if (pet.goodWithPets) {
    badges.push({
      icon: <HeartHandshake className="w-3 h-3" />,
      label: 'Pet-friendly',
      style: 'bg-violet-600/95 text-white',
    });
  }
  if (pet.energyLevel === 'high' || pet.energyLevel === 'low') {
    badges.push({
      icon: <Zap className="w-3 h-3" />,
      label: pet.energyLevel === 'high' ? 'High energy' : 'Calm',
      style: 'bg-slate-700/95 text-white',
    });
  }
  // Local-only sync marker (live mode): the server write failed and this
  // listing is currently visible on this device only.
  if (pet.unsynced) {
    badges.unshift({
      icon: <CloudOff className="w-3 h-3" />,
      label: 'Not synced',
      style: 'bg-orange-600/95 text-white',
      title: 'Could not sync to the server — this listing is kept on this device only.',
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {badges.map((b, i) => (
        <span
          key={i}
          title={b.title}
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm backdrop-blur-xs ${b.style}`}
        >
          {b.icon}
          {b.label}
        </span>
      ))}
    </div>
  );
};
