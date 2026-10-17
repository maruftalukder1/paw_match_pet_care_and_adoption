import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Reveal — scroll-triggered entrance that can NEVER leave content blank.
 *
 * Design-pass fix (standing audit finding: home sections rendered as empty
 * "shells" in full-page captures because reveal-on-scroll left them hidden).
 *
 * Guarantees:
 *  - Content renders at full opacity from the first paint (nothing hidden).
 *  - The only animated property is a gentle y-slide on first intersection —
 *    a blank frame is impossible by construction.
 *  - A 1.2s failsafe marks the element "entered" even if the
 *    IntersectionObserver never fires (full-page capture stitchers, odd
 *    viewports), so the motion still completes instead of freezing mid-state.
 *  - Reduced-motion users get zero transform.
 */
interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** stagger delay in seconds when several Reveals share a grid */
  delay?: number;
  /** vertical travel of the entrance in px */
  distance?: number;
}

export const Reveal: React.FC<RevealProps> = ({
  children,
  className,
  delay = 0,
  distance = 18,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Failsafe: if the observer never fires (capture tools, hidden
    // containers), still settle the motion shortly after mount.
    const failsafe = window.setTimeout(() => setEntered(true), 1200);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setEntered(true);
            io.disconnect();
            window.clearTimeout(failsafe);
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -32px 0px' }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={entered && !reduceMotion ? { y: [distance, 0] } : { y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};
