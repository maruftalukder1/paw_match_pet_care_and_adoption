# Auth Layout + Animation Fix — 2026-10-13

Follow-up to the auth overhaul (AUTH_REPORT.md). Maruf reported from the
published app: (1) the Create Account form overflowed the modal (submit
button fell below the fold, fields oversized), with Log In tab text
("Demo admin credentials filled in" / `admin`) leaking into the register
form; (2) animations were not visible — "no animation anywhere", not on
the main page either.

Auth logic (strict password check, OTP flow, lockout, logout) was NOT
touched.

## Issue 1 — AuthModal layout & cross-tab pollution

**Root causes**
- The card used `max-h-[92dvh] overflow-y-auto` on the whole card inside a
  flex `items-center` wrapper: when content exceeded the viewport the top
  clipped (classic flex-centering + overflow bug), pushing the Create
  Account submit out of reach.
- The header band was tall (`p-6 pb-5`, large badge), wasting vertical space.
- Login and register SHARED `email`/`password` state, so anything typed or
  auto-filled on the Log In tab (e.g. the 1-click admin demo fill in the
  published build) appeared in the register Email field; success/info
  banners were global, so a login banner showed on the register tab.

**Fixes** (`src/components/AuthModal.tsx`)
- Wrapper: `fixed inset-0 z-50 flex overflow-y-auto p-3 sm:p-4`; card:
  `m-auto … max-h-[94dvh] flex flex-col` — safe centering, never clips.
- Flex column: header `shrink-0` (compacted to `p-5 pb-4`, title `text-lg`),
  tabs `shrink-0`, body `flex-1 min-h-0 overflow-y-auto` — header/tabs stay
  pinned, the primary button always lives inside the scrollable body.
- Register grids: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` (stack on phones).
- Separate state: register now uses `regEmail`/`regPassword`; login keeps
  `email`/`password`. Strength meter reads `regPassword`.
- Per-step banners: new `msgMode` state; `fail()` pins to the current step,
  every `setSuccessMsg` site pins its step (`verify`/`login`/`forgot`),
  `goMode()` switches steps and clears banners. Banners render only when
  `msgMode === mode`.

## Issue 2 — animations made clearly visible (continuous loops)

All loops are transform/opacity only, `repeat: Infinity`, and gated by
`useReducedMotion` (loops run by default).

- `Header.tsx`: logo paw now wiggles/bounces continuously (was hover-only);
  notification bell swings periodically on its own (was unread-only).
- `LandingPage.tsx`: new floating animated icon-chip row on the hero
  (Adopt / Care / Chat / Verified / Vets — PawPrint, Heart, MessageCircle,
  ShieldCheck, Stethoscope) with staggered float+tilt loops; "Ready for
  Adoption" eyebrow got a pulsing heart chip; "Trust & Transparency" eyebrow
  got a slowly spinning shield chip; the 4 quick-action card icons float
  gently with staggered delays; favorited hearts on featured cards pulse.
- `PetListings.tsx`: favorited heart pulses continuously (keeps the tap pop).
- `AuthModal.tsx`: header paw badge bigger with a stronger float/rotate loop
  plus 4 clearly-visible drifting paw prints over the gradient; verify-step
  mail icon bounces continuously.

## Test evidence (all required checks)

- `npm run build` ✅ · `npx tsc --noEmit` ✅ 0 errors ·
  `npx tsx scripts/sanity-auth.ts` → **ALL SANITY CHECKS PASSED** ✅
- Served `dist` via `vite preview`; drove stock Chromium (Playwright) —
  the VM's bundled Chromium hard-blocks loopback navigation, so rendering
  was done with an upstream build:
- **Desktop 1366×768, Create Account tab**: modal top 41 / bottom 728
  (fully inside viewport), body scrollH == clientH (445 — no scroll needed),
  submit button at y 642–678 and inside the scroll body, register Email
  empty, no login banner. Screenshot confirms the whole form + button visible.
- **Log In tab**: clean, no stray banner; no console/page errors anywhere.
- **Mobile 390×844**: single-column fields, modal 25–819 inside viewport,
  no horizontal overflow, submit visible.
- **Animation proof**: two hero screenshots 1.2s apart — pixel diff on the
  chip strip: mean abs diff 11.8, 4,738 changed pixels (max 177); floating
  metric cards also moved (3,901 changed px). Loops are genuinely animating.
