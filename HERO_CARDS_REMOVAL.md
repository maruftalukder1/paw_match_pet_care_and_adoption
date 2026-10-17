# HERO_CARDS_REMOVAL.md — Hero stat cards removed (2026-10-17)

## Request
After seeing the hero-photo removal live, Maruf photographed the three remaining
floating hero stat cards on his screen and said to remove all three
("2 Verified Shelters", "4.9★ Top-Rated Service / Pawfect Paws Grooming",
"15 Available Pets") — "for now this much is enough"; he wants a clean, minimal hero.

## What was removed (src/components/LandingPage.tsx only)
- The entire right-column hero block: the three floating stat cards, the
  fixed-height cluster panel (`h-[380px] sm:h-[430px]`), the soft glow backdrop
  div, and the drifting paw mark inside the panel. No empty decorative box remains.
- The now-fully-unreferenced `topRatedService` computation (services reduce) and
  the unused `Star` icon import. (`availablePets` and `shelterCount` stay — the
  separate Live Stats Band lower on the page still uses them.)

## Resulting hero composition
- The two-column grid became a single centered column (`max-w-3xl`, `text-center`):
  badge pill → headline "Find a Friend / Change a Life" → subcopy → centered
  search bar → centered dual CTAs → centered popular tags → centered animated
  icon chips row (Adopt/Care/Chat/Verified/Vets, still continuously moving per
  the standing design rule).
- Section background unchanged (page-level gradient + its own ambient drifting
  paw marks), so the hero still has life without looking empty or lopsided.
- Untouched: the Live Stats Band section lower on the page (he pointed only at the
  hero cards), quick-action feature cards, all other views, all data logic,
  CallOverlay/useCall.

## Verification
- `npx tsc --noEmit`: zero errors in `src/` (only the pre-existing
  `scripts/test-symptom-rules.ts` nit, Deno edge-function modules, and
  `vite.artifact.config.ts` quirks).
- `npm run build`: clean, 2.12 s.
- `scripts/sanity-auth.ts`: ALL SANITY CHECKS PASSED.
- `scripts/sanity-time.ts`: 20 passed, 0 failed.
- `scripts/design-pass-sweep.cjs` (local dist served on 127.0.0.1:4173):
  **SWEEP ALL PASS** — zero page/console errors, zero overflow (`excess=0px`)
  on Home at 1440px and 390px, hero headline + dual CTA visible at both widths.
- Desktop + mobile hero screenshots visually confirmed: balanced centered
  composition, no clipping, stats band intact below the fold.

## Not published
Publishing (artifact edit+share, GitHub push → Pages redeploy) left to the parent,
per instructions.
