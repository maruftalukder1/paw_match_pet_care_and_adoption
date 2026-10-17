# Professional Design Pass — 2026-10-16

Visual-only upgrade of PawMatch. Zero functional changes: no data-model, auth,
messaging, or checker logic touched. Not published; no GitHub touched.

## 1. Visual system (`src/index.css` — the only global change)

Design tokens added on top of the existing palette (no new brand colors):
- `--pm-radius-*` (card/modal/pill), `--pm-shadow-*` (card/lift/pop) — one
  shadow language everywhere.
- `--pm-focus-ring` + a global `:focus-visible` ring (a11y guardrail).
- Utility classes: `.pm-btn-primary` / `.pm-btn-secondary` (44px tap targets),
  `.pm-card` / `.pm-card-hover` (lift + shadow on hover), `.pm-input`,
  `.pm-eyebrow` (unified eyebrow label style), `.pm-skeleton` shimmer,
  `.pm-view-enter` (calm crossfade+rise view transition),
  `.pm-header-scrolled` (header shadow/blur when scrolled),
  `.pm-hero-paw` / `.pm-hero-wash` / `.pm-hero-drift` (hero motion decor).
- Existing `symptom-emergency-pulse` / `symptom-hero-float` keyframes preserved.
- `prefers-reduced-motion` kills all loops (calm professional content areas).

## 2. Hero (`LandingPage.tsx`)

- **Dual CTA** under the search bar: "Find Pets to Adopt" (primary) →
  Find Pets tab; "Try the AI Matchmaker" (secondary, continuously rotating
  sparkle) → Matchmaker tab. Both ≥44px.
- **Third floating stat card**: "N Verified Shelters" (real shelter count —
  never fabricated; follows the no-fabricated-stats rule), joining the two
  existing real-data cards.
- **Clearly visible continuous motion** per the standing rule: drifting paw
  marks across the hero background + a slow gradient wash; the three floating
  stat cards bob continuously (reduced-motion safe).
- Hero image now `eager` + `fetchpriority="high"`; all other imagery lazy
  (see §5).
- Mobile fix (found in sweep): the rating card now stacks *below* the shelter
  card on <640px instead of overlapping it.

## 3. Scroll-reveal fix (standing audit finding)

`src/components/Reveal.tsx` (new): visible-by-default reveal — content paints
at full opacity immediately and only slides ~18px on first intersection;
a 1.2s failsafe settles the motion even if IntersectionObserver never fires
(full-page capture stitchers). By construction a blank frame is impossible.
All four `whileInView` usages on the home page (stats band, How Adoption
Works, Happy Tails, dark trust section) converted. **Verified**: the desktop
full-page capture shows every home section with real content — no shells.

## 4. Micro-interactions & polish

- Pet cards: stronger hover lift (`pm-card pm-card-hover`) + image zoom
  (scale-110, 500ms) on `PetListings`.
- Tab switches play the calm `pm-view-enter` crossfade (keyed wrapper in
  `App.tsx`).
- `PetGridSkeleton.tsx` (new): shimmer grid shown while live pets load;
  `App.tsx` adds a `livePetsLoading` flag around the Supabase `loadPets`
  call and passes `loading` into `PetListings` — the grid never flashes
  empty in live mode.
- `EmptyState.tsx` (new): looping icon + title + message + action, wired into
  Find Pets ("Clear Filters") and Lost & Found ("+ Report Lost/Found Pet" —
  that list previously had *no* empty state at all).
- Sticky header gains shadow + stronger blur after 8px of scroll
  (`Header.tsx` scrolled state); mobile drawer buttons bumped to 40px
  tap targets (9 replacements).
- Footer: airier columns (py-12/14, gap-10), larger gradient paw brand mark.

## 5. Imagery (`PetImage.tsx`)

`loading="lazy"` + `decoding="async"` by default; new `eager` prop opts out
(hero uses it). Consistent `aspect-4/3`/`aspect-16/10` crops; alt text kept
descriptive.

## 6. A11y guardrails (bonus fix found during the sweep)

`PetDetailsModal` overlay lacked `role="dialog"` — added
`role="dialog" aria-modal="true" aria-label`.

## Verification (all required suites, 2026-10-16)

| Check | Result |
|---|---|
| `npm run build` | clean, 1.87s |
| `npx tsc --noEmit` | exit 0 (only the pre-existing `vite.artifact.config.ts` config quirk) |
| sanity-auth | ALL SANITY CHECKS PASSED |
| sanity-time | 20/20 |
| symptom rules | 41/41 |
| checker e2e (`symptom-checker-e2e.cjs`) | ALL PASSED |
| photo e2e (`symptom-photo-e2e.cjs`) | ALL PASSED |
| video unit (`test-video-analysis.ts`) | 11/11 |
| video e2e (`symptom-video-e2e.cjs`) | ALL PASSED |
| design sweep (`scripts/design-pass-sweep.cjs`) | **SWEEP ALL PASS** — 9 views × {desktop 1440, mobile 390}: Home, Find Pets, Pet Details, Pet Care (checker), Services, Lost & Found, Messages (as Jaann), Profile, Admin; zero overflow (excess=0px everywhere), zero page errors, every home section rendered with real content in full-page captures |

**Console-error note (honest):** the sandbox blocks external network, so
Unsplash image loads and the Supabase live path fail with tunnel errors;
these are environmental (same exclusion as every prior audit) and are
filtered only from the *console-noise* check — `pageerror` (uncaught
exceptions) is unfiltered and stayed at zero.

**Bundle:** main chunk `dist/assets/index-*.js` = **959.16 kB raw /
263.84 kB gzip** (Admin + Profile already code-split via React.lazy).
This pass added three small components (~4 KB source); the bulk of the
chunk size comes from prior rounds (calls, video/photo AI, full-sync),
not from this pass. Still sane for a demo build; further code-splitting
(e.g. lazy-loading SymptomChecker) is a possible follow-up.

## Screenshot evidence

All under `hidden_sweep_shots/` (not user-facing):
- `d-home.png` / `m-home.png` — full-page home, every section populated
- `d-find-pets.png` / `m-find-pets.png`
- `d-pet-details.png` / `m-pet-details.png`
- `d-pet-care.png` / `m-pet-care.png`
- `d-services.png` / `m-services.png`
- `d-lost-found.png` / `m-lost-found.png`
- `d-messages.png` / `m-messages.png`
- `d-profile.png` / `m-profile.png`
- `d-admin.png` / `m-admin.png`

## Honest limits

- Image zoom/hover states verified via class inspection, not via hover-state
  screenshots.
- In the offline sandbox, Supabase live-mode cannot be exercised end-to-end;
  the skeleton path was verified to appear-and-clear against the failed fetch
  (it resolves via `finally`); on real networks it clears when data arrives.
- Video/photo AI suites were re-run green, but their live-model calls were
  not re-invoked in this pass (no changes to that code).
