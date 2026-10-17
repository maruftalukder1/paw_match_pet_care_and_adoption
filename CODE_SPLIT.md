# PawMatch — Code Splitting (Worker 4)

**Date:** 2026-10-14 · **Working copy:** `hidden_files/pawmatch-v2/` (React/Vite, source only)
**Scope:** convert rarely-first views to `React.lazy` + `Suspense`. No behavior changes,
no auth changes, no call/presence/typing/attachment changes. Published artifact and
GitHub untouched. Only the import region and the listed view JSX nodes in `src/App.tsx`
were touched; all other JSX structure left exactly as-is.

## What changed

### 1. New component: `src/components/LazyPawFallback.tsx`
Paw-themed Suspense fallback reusing the auth header's paw motif: rounded gradient tile
(teal→emerald) with a continuously bouncing/rotating `PawPrint` (lucide) + loading label,
`role="status"` + `aria-label` for a11y, honors `useReducedMotion`. Also ships a default
export.

### 2. Default exports added (named exports kept, other importers unaffected)
- `src/components/ProfileView.tsx` — appended `export default ProfileView;`
- `src/components/AdminDashboard.tsx` — appended `export default AdminDashboard;`
- `src/components/CppConsoleModal.tsx` — appended `export default CppConsoleModal;`
  (future-proofing only — see §4; the component is currently unreferenced)

### 3. `src/App.tsx` — imports region only + two Suspense wraps
- `import React, { …, lazy, Suspense }`; removed eager `ProfileView`/`AdminDashboard`
  named imports (App.tsx was their only importer); added:
  ```ts
  const ProfileView = lazy(() => import('./components/ProfileView'));
  const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
  ```
- `{activeTab === 'profile' && …}` now wraps `<ProfileView …/>` in
  `<Suspense fallback={<LazyPawFallback label="Loading your profile…" />}>` — props identical.
- `{activeTab === 'admin' && …}` now wraps `<AdminDashboard …/>` in
  `<Suspense fallback={<LazyPawFallback label="Loading admin dashboard…" />}>` — props identical.
- `MatchmakerView` intentionally left **eager**: source is 17,691 bytes (< ~30 KB
  threshold), and it sits adjacent to the first-paint path (header nav).

### 4. CppConsoleModal — NOT lazy-loaded (dead code)
`CppConsoleModal` is defined but **imported nowhere** in `src/` (verified via grep over
all `.ts/.tsx`); it contributes 0 bytes to the bundle today. There is no import site to
convert, so no `React.lazy` wrapper was added — only the `export default` (safe,
enables a future lazy import without touching other files).

## Bundle numbers (vite build)

| Build | Main JS chunk | Lazy chunks |
|---|---|---|
| BEFORE (dist as found, pre-change, single bundle) | `index-7Na4jzCL.js` **887.02 kB** | — |
| AFTER my change (my build) | `index-BC9mdX9F.js` **857.45 kB** (−29.6 kB / −3.3%) | `ProfileView-B_CpKl8-.js` **13.93 kB**, `AdminDashboard-CNU6QtX6.js` **18.71 kB** |
| FINAL (after other workers' concurrent edits, my final build) | `index-CesSqPHj.js` **648.09 kB** (gzip 184.30 kB) | `ProfileView-G8G6NoD2.js` **13.93 kB** (gzip 3.51 kB), `AdminDashboard-9TAiHq55.js` **18.71 kB** (gzip 3.69 kB) |

Caveat: other workers were editing/rebuilding concurrently, so the BEFORE→AFTER delta
is best-effort; the stable, attributable facts are the lazy chunk names/sizes above and
that `ProfileView` + `AdminDashboard` no longer ship in the initial bundle. The
home/pets/chat first-paint path is unchanged and eager.

## Verification

- `npx tsc --noEmit` → **0 errors** (run before and after all edits, incl. final tree).
- `npx vite build` → ✅, chunks emitted as above.
- `scripts/sanity-auth.ts` → **ALL SANITY CHECKS PASSED** (auth untouched).
- `scripts/sanity-time.ts` → **20 passed, 0 failed**.
- Click-through regression (headless Chromium vs production `dist`, two fresh contexts,
  Supabase/tunnel network noise filtered — sandbox blocks egress):
  - Adopter context (auto-login Jaann): first paint loads **only** the main chunk
    (no AdminDashboard/ProfileView requests); navigating to My Profile → paw fallback
    flashes → `ProfileView-*.js` 200 → "Edit Profile" renders; Matchmaker renders with
    **zero new chunks** (eager); no JS errors on home/profile/matchmaker.
  - Admin context (admin session): Admin Panel menu → paw fallback flashes →
    `AdminDashboard-*.js` HTTP 200 → "Admin Dashboard" h1 + Users section render;
    in-view interaction (tab switch) clean.
  - Double-mount check: `localStorage.setItem` spy recorded **zero repeated writes**
    during all lazy-view mounts (views write nothing on mount; nothing duplicated).
  - **18/18 checks passed.**

## Notes / open items
- The published demo link and GitHub were not touched (source-only change, per constraints).
- `dist/` was rebuilt as part of verification; another worker's concurrent rebuild also
  landed — final publish/bundle decision belongs to the orchestrator.
- Test scripts used: `/tmp/w4-clickthrough.cjs` (18-check regression),
  `/tmp/w4-shot.cjs`, `/tmp/w4-dbg*.cjs` (scratch, not committed).
