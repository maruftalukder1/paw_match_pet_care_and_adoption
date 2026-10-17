import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { CheckCircle2, Info } from 'lucide-react';

export interface ToastItem {
  id: number;
  message: string;
  kind: 'success' | 'info';
}

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

/**
 * App-wide toast feedback. Motion-animated (transform/opacity only),
 * auto-dismiss handled by the caller with setTimeout.
 */
export const ToastViewport: React.FC<ToastViewportProps> = ({ toasts, onDismiss }) => {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => onDismiss(t.id)}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 16, scale: reduceMotion ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 10, scale: reduceMotion ? 1 : 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto flex items-center gap-2.5 bg-slate-900/95 backdrop-blur-md text-white text-sm font-medium pl-3.5 pr-4 py-2.5 rounded-2xl shadow-xl border border-white/10"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-sky-400 shrink-0" />
            )}
            <span className="text-left">{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
};
