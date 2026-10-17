# PawMatch AUTH Overhaul — Report

**Date:** 2026-10-13 · **Working copy:** `hidden_files/pawmatch-v2/` · **Live keys present** in `.env.local` (Supabase "pawmatch", Singapore)

> Maruf reported login/logout bugs and asked for: strict login, an animated login/logout panel, real email verification codes for new accounts, and animated icons inspired by Flaticon (link supplied: https://www.flaticon.com/animated-icons).

## 1. Bugs confirmed and fixed

**Bug A — any password logged into any account (CRITICAL).**
Before (`AuthModal.tsx`):
```ts
const isMasterAdminAuth = (isAdminInput || targetUser.role === 'admin') &&
  (password === 'admin' || password === 'Admin@123' || password === 'admin123');
const valid =
  password === 'admin' || password === 'Admin@123' ||
  password === 'user123' || password === 'password' ||
  targetUser.passwordHash.includes('hash');
```
Every seed hash ends in `_hash`, so `includes('hash')` was always true — any string unlocked any account, and the four literal passwords worked cross-account.
After: new `src/utils/auth.ts` → `verifyPassword(user, pw)` uses STRICT equality only (`${pw}_hash` or legacy `${pw}_hashed_salt`). No global literals, no substring tricks, no master-admin multi-password. `admin`/`admin` still works (`'admin_hash' === 'admin'+'_hash'`); `Admin@123`/`admin123` for admin are now REJECTED. The persisted 3-strike lockout finally triggers for real wrong passwords.

**Bug B — logout didn't stick.**
After logging out and revisiting (fresh storage, e.g. the published page), the app auto-logged back in as Jaann (the demo default). After: explicit `pawmatch_logged_out` marker in `App.tsx`; logout sets it (and returns to Home), login/register/persona-switch clear it. First-ever visit still demo-logs-in as Jaann for the ma'am demo.

**Bug C — forgot-password stored a different hash scheme** (`_hashed_salt` vs register's scheme). After: all writes (register, reset) use the canonical `${pw}_hash`; legacy `_hashed_salt` rows still verify.

**Registration duplicate check now also covers live mode** (was local-only).

## 2. Email verification (anti-bot) — how it works

New flow: Register → **Verify** step → code entry → account created.
- **Live mode (the published app):** `supabase.auth.signUp({ email, password })` makes Supabase email a confirmation message; the code is verified with `verifyOtp({ type: 'signup' })`. Only on success is the profile row written to `public.users` (with `emailVerified: true`, `authManaged: true`) and the user logged in. Resend button with 30s cooldown. If the email is already in Auth but unverified, the flow jumps straight to the verify step.
- **Template dependency (dashboard task, in flight):** the 6-digit `{{ .Token }}` only appears in the email once the template carries it — Maruf chose the free Gmail SMTP route to unlock template editing. Until then the email carries only the confirmation LINK, so the verify screen shows a note ("No code in the email? Click the confirmation link in the same email…") plus a working fallback button: *"I've clicked the link — finish my registration"* which proves confirmation via Auth and completes registration. Code-entry remains the primary path and goes live automatically once the template is updated — no app change needed.
- **Local/offline mode:** no mail server exists, so an honestly-labeled demo code is shown on screen ("Demo mode is offline — your code is: XXXXXX").
- **Login gating:** `emailVerified === false` blocks login with a clear message and a "verify now" path (resends a fresh code in live mode). Seed/demo accounts (`emailVerified` undefined) are grandfathered — demo logins unchanged.
- **Registered-user login in live mode:** `authManaged` accounts are additionally checked via `supabase.auth.signInWithPassword` (Auth is the password source of truth); the Auth session is signed out afterward so the app keeps its own session. Their "forgot password" goes through Supabase's emailed reset link instead of the security-answer flow.

## 3. Animated redesign

`AuthModal`: spring-mounted modal, animated gradient header with drifting blobs and a bouncing/tilting PawPrint, Live/Demo mode badge, sliding tab underline (`layoutId`), AnimatePresence slide+fade transitions between login/register/verify/forgot, error **shake** animation, success **spring check**, password **strength meter**, resend cooldown timer, animated verify envelope icon, busy spinners. Header user menu: AnimatePresence scale/fade dropdown with staggered item entrances, hover slide, and a tilting Log Out icon. Log Out now has a clear rose hover state.

## 4. Flaticon animated-icons shortlist

Browsed the user-supplied collection (https://www.flaticon.com/animated-icons — 57,000+ icons, Lottie JSON/GIF/SVG/AE; the catalog page is JS-driven so individual packs are picked by on-site search). Nothing was downloaded or hotlinked (free use requires attribution/account); the app implements the same concepts with lucide + motion. A footer credit "Animated icons inspired by Flaticon" was added (App footer exists).

Picks for PawMatch — search these on the collection page to download the exact files later:
1. **Paw print** (animated pop/bounce) → auth header, logo moments. Search: "paw print animated".
2. **Dog / Cat** (wagging tail, blinking) → hero, pet cards, empty states. Search: "dog animated", "cat animated".
3. **Heart** (beating/popping) → favorites. Search: "heart animated".
4. **Bell** (ringing) → notifications. Search: "bell animated".
5. **Envelope / Mail** (opening, letter flying out) → the new email-verify step. Search: "envelope animated", "mail animated".
6. **Shield / Lock** (shield check drawing, lock clicking) → login security, lockout. Search: "shield animated", "lock animated".
7. **Chat bubble** (typing dots) → messaging. Search: "chat animated".
8. **Magnifier / Search** → pet search. Search: "search animated".
9. **Stethoscope / Syringe** → Pet Care & Vets. Search: "stethoscope animated", "syringe animated".

Format note: prefer **Lottie JSON** (small, crisp, controllable) over GIF for the auth header; GIF/MP4 free downloads work fine for decorative spots.

## 5. Tests

| Check | Result |
|---|---|
| `scripts/sanity-auth.ts` (all 11 seed users: correct pw accepted; `password`, `Admin@123`, `admin123`, `letmein`, `wrongpassword123`, `qwerty`, empty rejected; legacy `_hashed_salt` round-trip; substring-trick rejected; strength meter) | ✅ ALL PASSED |
| `npm run build` | ✅ |
| `npx tsc --noEmit` (whole project incl. scripts) | ✅ 0 errors |
| Verify-flow paths (signUp → code → verifyOtp → profile insert → login; resend cooldown; link fallback; login gating; authManaged Auth login; forgot variants) | ✅ code-reviewed (live OTP email needs the template task to test end-to-end) |

## 6. What still depends on others

- **Dashboard email-template task (parent's, in flight):** put `{{ .Token }}` in the Confirm-signup template (unlocked by Maruf's Gmail SMTP choice). Until then, code-entry shows the graceful link fallback — nothing else to change in the app.
- **Not touched:** the published artifact (parent republishes), GitHub.
- Known demo-grade caveat: app password hashes are not bcrypt; Supabase Auth holds the real credential for OTP-registered accounts.
