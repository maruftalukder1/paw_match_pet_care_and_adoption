import React, { useEffect, useState } from 'react';

// Friendly fallback shown when a pet photo fails to load (offline, dead URL, blocked host).
// Inline SVG data URI so it works with zero network.
const FALLBACK_SRC =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">` +
      `<rect width="200" height="150" fill="#d1fae5"/>` +
      `<g fill="#059669" opacity="0.55">` +
      `<ellipse cx="100" cy="88" rx="26" ry="21"/>` +
      `<circle cx="62" cy="62" r="13"/><circle cx="84" cy="48" r="14"/>` +
      `<circle cx="116" cy="48" r="14"/><circle cx="138" cy="62" r="13"/>` +
      `</g></svg>`
  );

interface PetImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  /**
   * Above-the-fold imagery (hero) should load eagerly with high priority;
   * everything else lazy-loads so off-screen cards don't compete for
   * bandwidth. Defaults to lazy.
   */
  eager?: boolean;
}

export function PetImage({ src, alt, eager = false, ...rest }: PetImageProps) {
  const [failed, setFailed] = useState(false);
  // A new src deserves a fresh load attempt: without this, replacing a photo
  // after a load failure (offline, dead URL) would stick on the fallback.
  useEffect(() => {
    setFailed(false);
  }, [src]);
  return (
    <img
      src={failed || !src ? FALLBACK_SRC : src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
