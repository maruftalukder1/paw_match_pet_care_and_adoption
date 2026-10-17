# AUTHFIX2 — three user-reported defects: diagnosis, fix, evidence (2026-10-14)

Maruf tested the live build himself and reported three defects in Bangla.
All three are fixed in `pawmatch-v2` (source only — the published artifact
and GitHub were not touched). Strict password rules, the 3-strike lockout,
and admin role-gating are unchanged (verified by the suites below).

## Defect 1 — Password recovery never actually reset the password

**Symptom (Maruf):** Forgot Password → reset email arrives → he clicks it,
sets a "new password" on the create-password screen → but logging in with
that email + new password FAILS. The account never logs in with the new
password.

**Root cause (pinned in code, not guessed).** Two credential stores exist:
Supabase Auth (source of truth for `authManaged` accounts) and the
`public.users` mirror (`passwordHash = <pw>_hash`, checked by
`verifyPassword`). In `AuthModal.handleForgotSubmit`, the forgot form showed
Email + **Security Answer + New Password** fields for everyone — but for an
`authManaged` account in live mode the handler took an early return after
`sendPasswordResetEmail(email)`:

```ts
if (user.authManaged && live) {
  await sendPasswordResetEmail(user.email);   // link sent...
  ...return;                                   // ...newPassword silently IGNORED
}
```

The typed-in "new password" was discarded. Worse, the emailed recovery link
was never consumed anywhere: the codebase had **no `PASSWORD_RECOVERY`
handling, no recovery screen, and no `supabase.auth.updateUser()` call** —
clicking the link landed on the site and did nothing. So the password was
never changed in either store, and login with the "new" password failed
while the old one kept working. Exactly Maruf's report.

**Fix.**

- `src/lib/authFlow.ts`: new `updateAuthPassword()` (Supabase Auth password
  swap through the recovery session), `getAuthUserEmail()`, `signOutAuth()`.
- `src/utils/auth.ts`: new pure helpers — `isRecoveryHashLink(hash)`,
  `forgotResetRoute(user, live)` → `'email-link' | 'security-answer'`,
  `legacyPasswordResetPatch(user, pw)` (canonical hash + lockout cleared).
- `src/components/AuthModal.tsx`:
  - New exported mode `recovery` (`AuthModalMode`) + `initialMode`/`openKey`
    props; the App opens the modal straight into it.
  - **Recovery screen** ("Set a New Password", strength meter, confirm
    field): submit → `updateAuthPassword()` → mirror the new hash into the
    local user list AND `public.users` (`password_hash`, attempts cleared,
    `is_locked` false) → `signOutAuth()` → clean the URL fragment →
    success banner ("log in with your new password") → back to login.
    A bad/expired link shows an honest "invalid or has expired — request a
    new one" error, never a dead end.
  - **Forgot flow is now two honest steps.** Step 1: email only.
    `authManaged`+live → "we emailed you a reset link — open it, this app
    will let you set a new password" (no more ignored fields). Legacy/local
    accounts → step 2: security answer + new password + confirm (strength
    meter) → `legacyPasswordResetPatch` written to the local list AND the
    mirror row → login with the new password works, the old one fails.
- `src/App.tsx`: boot effect — if the URL carries `type=recovery`, or
  `onAuthStateChange` fires `PASSWORD_RECOVERY`, open the modal in
  `recovery` mode and strip the fragment (so a reload can't replay it).
  Works when the link lands on the published site URL (Supabase Site URL is
  the demo link; the redirect allow-list already contains it).

**Evidence.**
- `sanity-auth`: 16 new cases PASS — recovery-hash detection (incl. param
  order, empty/non-recovery/error fragments), route selection per account
  type, legacy patch content (hash updated, attempts/lock cleared,
  id/email preserved), and store consistency (new password verifies, old
  rejected).
- Playwright (`scripts/authfix2-e2e.cjs`, keyed build): legacy path —
  Jaann forgot → security answer → new password → **login with the new
  password succeeds, with the old one fails ("Attempt 1 of 3")**; recovery
  screen appears for a `#access_token=…&type=recovery` URL and a fake link
  yields the honest expired-link error. All PASS.
- **Still needs Maruf's real inbox (flag for parent):** the end-to-end
  happy path — click a REAL reset email and confirm login works with the
  new password against live Supabase Auth. He owns the Hasan test account;
  send him the exact steps later. Do NOT read his Gmail.

## Defect 2 — first-visit auto-login as the demo adopter

**Symptom (Maruf):** a brand-new visitor finds the app already logged in as
Jaann and must log out first. He wants it gone.

**Root cause.** `App.tsx` session bootstrap: `if (!raw) return SEED_USERS[1]`
— no saved session meant "silently become the demo adopter".

**Fix.**
- Bootstrap now returns `null` (logged out) when there is no saved session
  and no sticky-logout marker. Explicit logins still persist across reloads
  (`pawmatch_current_user`), explicit logout stays sticky
  (`pawmatch_logged_out`), and a registered user's own session restore is
  untouched — only the silent demo assumption is removed.
- Sweep of first-paint `currentUser` assumptions:
  - `handleStartMessageToAdmin`, `handleStartChatWithUser`,
    `handleStartMessageFromPet`, `handleApplyForAdoption` now open the
    login modal + toast when logged out (no more silent attribution to
    `u-adopter-1` / "Jaann Rahman"); the `|| 'u-adopter-1'` fallbacks were
    removed at those call sites, and `handleSendMessage` hard-bails without
    a user.
  - The Messages tab renders a new `ChatLoginGate` for guests (clear login
    prompt) instead of `ChatSystem`; the `!currentUser → return conversations`
    leak in ChatSystem can no longer be reached logged out.
  - Footer "Contact PawMatch Admin" and pet-detail buttons route through
    the same guards.
  - Bonus find during the sweep: the login modal rendered at `z-50` *before*
    the pet-detail sheet in the DOM, so a guest clicking Apply opened the
    login modal **behind** the detail sheet (invisible). Fixed two ways:
    the guards close the detail sheet first, and the auth modal overlay is
    now `z-[70]` so it can never open behind another modal.
- Demo accounts still log in manually with the documented credentials;
  header/drawer already showed Log In / Sign Up when logged out.

**Evidence.** Playwright (fresh profile): boot shows Log In/Sign Up, no user
chip; Find Pets browsable logged out; Apply for Adoption / Message Shelter /
footer Contact Admin each open the visible login modal; explicit logout
sticks across reload. All PASS; `sanity-auth` still ALL PASSED (strict
matrix, lockout, Jaann manual login path untouched).

## Defect 3 — PetManager edit can't change/remove a pet's photo

**Symptom (Maruf):** for existing pets the edit form shows the photo, but he
cannot replace or remove the image.

**Root cause.** `PetManager.formToPet()` ended with:

```ts
photoUrl: form.photoUrl.trim() || 'https://images.unsplash.com/...',
```

Removing the photo in the form (`''`) was immediately overwritten with the
stock Unsplash URL on save — removal was impossible by construction. (The
uploader itself was fine: preview, upload-replace, and the X remove button
all worked in the form; only the save path resurrected the image.)

**Fix** (`src/components/PetManager.tsx`): the stock-photo fallback now
applies ONLY to brand-new pets —

```ts
photoUrl: form.photoUrl.trim() || (existing ? '' : STOCK_PET_PHOTO),
```

`''` flows through unchanged: the live write path (`petToRow` →
`photo_url`) stores it, `rowToPet` reads it back, and `PetImage` renders the
honest inline-SVG paw fallback in listings, detail modal, and My Pets. The
add flow is unchanged (no-photo add still gets the stock photo).

**Evidence.** Playwright as shelter (Bruno): edit → upload a generated PNG →
preview becomes a JPEG data URL → Save → new photo in My Pets, Find Pets,
and the detail modal → reload → persists → edit → Remove → Save → `''` in
state, paw SVG fallback in My Pets → reload → still `''` → edit → upload
again → new photo persists. 12/12 photo checks PASS.

## Suites

| Check | Result |
|---|---|
| `npm run build` | ✅ |
| `npx tsc --noEmit` | ✅ 0 errors |
| `scripts/sanity-auth.ts` (extended: strict matrix + 16 recovery/reset cases) | ✅ ALL PASSED |
| `scripts/sanity-time.ts` | ✅ 20/20 |
| `scripts/authfix2-e2e.cjs` (new, 30 checks) | ✅ 30/30, zero JS page errors |

## Files changed

- `src/utils/auth.ts` — `isRecoveryHashLink`, `forgotResetRoute`,
  `legacyPasswordResetPatch` (pure, unit-tested)
- `src/lib/authFlow.ts` — `updateAuthPassword`, `getAuthUserEmail`,
  `signOutAuth`
- `src/components/AuthModal.tsx` — `recovery` mode, two-step forgot,
  `AuthModalMode`/`initialMode`/`openKey`, auth overlay `z-[70]`
- `src/components/ChatLoginGate.tsx` — new guest gate for Messages
- `src/App.tsx` — logged-out bootstrap, recovery-link boot handling,
  `openAuth(mode)`, login guards on 4 handlers, `handleSendMessage` guest
  bail, chat-tab gate
- `src/components/PetManager.tsx` — stock photo only for new pets
- `scripts/sanity-auth.ts` — 16 new cases
- `scripts/authfix2-e2e.cjs` — new 30-check suite

## Open item for the parent

Defect 1's final live proof needs Maruf's real inbox: have him (as Hasan)
use Forgot Password → click the real reset email → set a new password on
the recovery screen → log in with the new password (works) and the old one
(fails). Give him the steps in Bangla when the build is published; the
sandbox cannot complete a real reset email end-to-end.

## Addendum — published to the artifact (2026-10-14, later)

The three fixes above were rebuilt into the published Muse artifact
(slug `pawmatch-local-pet-care-adoption-matchmaker`) — previously they
existed in source only, which is why Maruf still saw all three defects on
the live link. Bundle recipe: `vite.artifact.config.ts` (kept in this
folder) builds `src/main.tsx` as one classic IIFE `app.js` (lib mode,
`inlineDynamicImports`, `define: process.env.NODE_ENV=production` — without
that define React ships its dev build); the emitted CSS is prepended as a
style-injection snippet (same shape as the previous bundle) and also
written to `assets/app.css`.

Live probe evidence on the shipped build (audit sessions 2026-10-14):
fresh visit shows a logged-out header (no Jaann chip); Jaann forgot →
security answer → new password → login with the NEW password succeeds,
login with the OLD password fails ("Attempt 1 of 3"); shelter login →
Edit Bruno → Remove photo → Save ("Bruno's listing updated") → reload →
photo still gone (no stock resurrection); Link-replace with a new image
URL → Save → reload → photo present again. Still open (needs Maruf's real
inbox): the authManaged emailed-link happy path end-to-end.
