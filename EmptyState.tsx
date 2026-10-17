import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PawPrint } from 'lucide-react';

/**
 * EmptyState — polished empty-list placeholder: clearly visible looping
 * icon (per the standing motion rule), title, message, and an action.
 */
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}) => {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className={`text-center bg-white rounded-3xl border border-dashed border-slate-300 ${compact ? 'p-8' : 'p-12'}`}
      role="status"
    >
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, -8, 0], rotate: [0, -8, 8, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center shadow-xs mb-4"
      >
        {icon ?? <PawPrint className="w-7 h-7" />}
      </motion.div>
      <h3 className="font-extrabold text-slate-900 text-base tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">{message}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="pm-btn-primary mt-5">
          {actionLabel}
        </button>
      )}
    </div>
  );
};
