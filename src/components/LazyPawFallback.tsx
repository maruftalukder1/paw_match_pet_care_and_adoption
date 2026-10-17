import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PawPrint } from 'lucide-react';

/**
 * LazyPawFallback — paw-themed loading placeholder for React.lazy view chunks.
 * Mirrors the animated paw motif used in the auth header (rounded tile + bouncing
 * PawPrint, continuous motion) so code-split views load with the same branding.
 */
export const LazyPawFallback: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-20"
      role="status"
      aria-label={label}
    >
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, -10, 0], rotate: [0, -12, 12, 0] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
        className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-xl ring-1 ring-white/20"
      >
        <motion.span
          animate={reduceMotion ? undefined : { scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          className="inline-flex"
        >
          <PawPrint className="w-8 h-8 text-white" />
        </motion.span>
      </motion.div>
      <p className="text-xs font-bold text-slate-500 tracking-wide">{label}</p>
    </div>
  );
};

export default LazyPawFallback;
