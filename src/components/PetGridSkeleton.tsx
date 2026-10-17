import React from 'react';

/**
 * PetGridSkeleton — shimmer placeholder grid shown while live pet data
 * loads, so the grid never flashes an empty box or a bare spinner.
 * Layout mirrors the real 4-column card grid (photo, name row, breed,
 * location, CTA) to avoid layout shift when data arrives.
 */
const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs" aria-hidden="true">
    <div className="aspect-4/3 bg-slate-100">
      <div className="pm-skeleton w-full h-full !rounded-none" />
    </div>
    <div className="p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="pm-skeleton h-5 w-24" />
        <div className="pm-skeleton h-4 w-12" />
      </div>
      <div className="pm-skeleton h-3.5 w-32" />
      <div className="pm-skeleton h-3.5 w-40" />
      <div className="pm-skeleton h-9 w-full !rounded-xl" />
    </div>
  </div>
);

export const PetGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div
    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
    role="status"
    aria-label="Loading pets…"
  >
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
