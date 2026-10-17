# HERO_IMAGE_REMOVAL — hero photo removed entirely (Maruf's explicit choice)

Date: 2026-10-17. Scope: home hero section ONLY (src/components/LandingPage.tsx).
Maruf looked at the hero photo (golden retriever / "Bruno" stock image) and chose
**"Chhobi puropuri shoriye dao"** — remove the image completely, no replacement.

## What was removed
- The entire photo container in the hero's right column: the `aspect-4/3`
  rounded-3xl bordered image box and the inline `PetImage` with the Unsplash URL
  `photo-1552053831-71594a27632d?w=800…` (the hero-size variant, used ONLY here).
- No other file references that URL. Bruno's pet-listing photo in Find Pets /
  seedData (`w=600` variant in seedData.ts) is untouched, as is the symptom
  checker and every other view. `PetImage` import kept (still used at two other
  spots in LandingPage). No new unused imports/constants.

## How the stat cards were recomposed
The three real-data floating cards (Verified Shelters, Top-Rated Service,
Available Pets) were re-composed as a staggered cluster inside a fixed-height
panel (`h-[380px] sm:h-[430px]`) where the photo was, over a soft emerald→amber
gradient glow backdrop + a drifting paw mark. Changes from the old layout:
- Removed all negative offsets (`-top-5`, `-bottom-6 -left-6`, `-right-4`) that
  hung cards off the photo edges → all cards now sit fully inside the panel,
  so nothing can overflow at any width.
- Kept continuous motion, made it slightly more visible: floats at
  ±10–12px, 4–5s ease-in-out loops, staggered delays, honoring
  `prefers-reduced-motion` via the existing `reduceMotion` flag (same pattern
  as the hero icon chips).
- All numbers still computed from live app data (`shelterCount`,
  `availablePets`, `topRatedService`) — nothing hardcoded.
- Headline, subcopy, search bar, both CTAs, quick tags, and icon chips
  unchanged.

## Verification
- `npx tsc --noEmit`: 0 errors in src/ (scripts/ nit and
  vite.artifact.config.ts / Deno function quirks are pre-existing, untouched).
- `npm run build`: clean (1.28s).
- `scripts/sanity-auth.ts`: ALL SANITY CHECKS PASSED.
- `scripts/sanity-time.ts`: 20 passed, 0 failed.
- `scripts/design-pass-sweep.cjs` (playwright-core, dist served locally):
  **SWEEP ALL PASS** — 54/54 checks: zero overflow (`excess=0px`) on Home at
  1440px and 390px, hero headline + dual CTA visible at both widths, zero
  page/console errors across all 9 views (desktop + mobile).
- Visual check of d-home.png / m-home.png: cluster reads as a designed panel
  (not empty); mobile stacks the three cards in a staggered column with no
  clipping.

## Honest limits
- Animation "clearly visible" motion can't be judged from still screenshots;
  the motion values (≥10px floats, 4–5s infinite loops) follow the standing
  design rule and match the previously approved floating-card behavior.
- No live two-device check needed for this edit — layout-only change.

## Not done
Publishing (artifact share + GitHub push) is the parent's job.
