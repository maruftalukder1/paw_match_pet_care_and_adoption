# PawMatch v2 — Senior-Engineer Audit & Fix Report

**Date:** 2026-10-13 · **Base:** Google AI Studio export (`pawmatch-source-fixed.zip`, incl. the esbuild ^0.28.0 fix)
**Working copy:** `hidden_files/pawmatch-v2/` · **Mode verified:** local fallback (no keys) — builds clean, runs fully offline-capable.

> Maruf's order for this pass: **bug fixes first, Supabase connection later.**
> The `supabase/` folder is prepared as files only — nothing was connected, no
> account created, no keys invented.

## Verification status

| Check | Result |
|---|---|
| `npm install` | ✅ passes |
| `npm run build` | ✅ passes (one chunk-size warning: supabase-js makes the JS bundle ~570 KB — acceptable, code-split later if needed) |
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx tsx scripts/sanity-time.ts` | ✅ 20/20 pass (timestamp parsing, sorting, vaccination status) |
| Built `dist/` served via `vite preview` | ✅ HTTP 200, bundle contains new features |
| Supabase live path | ⚠️ **not verifiable without keys** — code complete, marked clearly (see §9) |

---

## 1. Messaging (Maruf's focus area)

**Bugs found & fixed:**
1. **Cross-user messaging was impossible.** All chats lived in one browser's localStorage — a message sent on device A could never reach device B. Fixed structurally: new `src/lib/supabaseClient.ts` + `src/lib/dataAdapter.ts`. When `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` exist the app uses shared Postgres + a Realtime `INSERT` subscription on `chat_messages`; otherwise it falls back to the current local behavior. New messages are inserted optimistically locally and pushed to Supabase; incoming rows from other devices are appended (deduped by id) and conversation previews update.
2. **Timestamps were fake.** Messages stored only `"10:42 AM"`, conversation previews hardcoded `'Just now'`. Now every new message/conversation/notification stores a real ISO timestamp (`createdAt` / `lastMessageAt` on the types; legacy `timestamp`/`lastMessageTime` kept as deprecated display fields so old saved data still loads). Legacy strings are parsed by `src/utils/time.ts` (`parseTimestamp` handles ISO, "10:42 AM", "YYYY-MM-DD HH:mm", "Just now"/"5 mins ago"/"2h ago"/"Yesterday").
3. **No message ordering.** The stream rendered in insertion order; a realtime message arriving out of order would land wrong. Now sorted oldest→newest by real timestamp, with **day separators** (Today / Yesterday / date), real clock times (`10:42 AM`) under each bubble, and humanized preview times (`5m ago`) in the conversation list.
4. **Fake shelter auto-reply removed.** `handleSendMessage` used `setTimeout` to fabricate a reply from shelter accounts after 1.5s. Deleted. In live mode the real person replies; in demo mode the chat honestly shows a banner instead of pretending someone answered.
5. **Other-participant name resolution was fragile** (matched by display name, broke with duplicate names). Now resolved by participant id.
6. Read receipts now render correctly: the double-check is emerald when `isRead`, grey otherwise (previously always emerald).
7. Added an honesty banner: amber **"Demo mode — messages stay on this browser only"** vs green **"Live — messages sync in real time"** once Supabase keys are set.

**Still needs live keys to verify:** realtime delivery between two devices, `loadInitial` replacing local state, notification inserts. Listed in §9.

## 2. Notifications

**Bugs found & fixed:**
1. **Badge + dropdown counted everyone's notifications.** `unreadNotificationsCount` and the Header dropdown received the full array. Now App scopes to `currentUser.id` (`myNotifications`) before passing to Header.
2. **"Mark all read" cleared other users' notifications.** Now only the current user's rows are marked.
3. All new notifications now carry ISO timestamps; Header displays humanized times.

## 3. Login, registration, lockout (AuthModal)

**Bugs found & fixed:**
1. **Lockout reset on reload.** Failed-attempt counting lived in component state. Now attempts/lock persist on the **user record** (`failedLoginAttempts`, `isLocked`), saved to users state → localStorage (and a `users` table column for Supabase).
2. **Direct state mutation** (`targetUser.isLocked = false`) replaced with an `onUpdateUser` callback — no more mutating React state objects in place (this also covered the admin master-login and 1-click admin button).
3. **Forgot password was fake.** It showed "Identity verified!" without checking anything and never changed the password. Now it verifies the security answer (case-insensitive, defaults to `pawmatch`), actually resets `passwordHash`, and clears attempts + lock.
4. Successful login resets the attempt counter.

**Known remaining:** password storage is still a demo-grade salted string, not a real hash — acceptable for the course demo; Supabase Auth is the proper next step (noted in `supabase/policies.sql`).

## 4. Persistence (local fallback layer)

**Bugs found & fixed:**
1. `lostFound`, `medicalRecords`, `vaccinations` were **read** from localStorage but **never written** — new reports/records vanished on reload. Now all slices are written.
2. `appointments`, `serviceBookings`, `activityLogs` were **never persisted at all** (bookings disappeared on reload!). Now persisted with safe load on start.
3. **Favorites were global to the device**, not per user — switching persona showed the wrong favorites. Now stored per user id (`pawmatch_favorites` map).
4. Every localStorage read is wrapped in try/catch (`loadState`) — one corrupt key can no longer white-screen the app.

## 5. Pet healthcare (vaccinations)

**Bug fixed:** vaccination status badges were hardcoded in seed data (`Completed` with 2024/2025 dates — permanently stale). Status is now **computed from `nextDueDate` vs today** (`computeVaccinationStatus` in `utils/time.ts`, unit-tested): `Overdue` when the due date passed, `Upcoming` otherwise. The stored field is ignored at render time, and `seed.sql` intentionally does not store status.

## 6. Pet Management — Pranty's module (was missing)

**Gap closed:** there was no add/edit/delete UI at all. Added `src/components/PetManager.tsx`, embedded in the Dashboard for `owner` / `shelter` / `admin` roles:
- **Add pet** (full form: name, species, breed, age, gender, size, energy, color, status, area, photo URL, description, health notes, kid/pet-friendly, vaccinated, neutered)
- **Edit** any own listing (all listings for admin)
- **Delete** with confirm; also cleans the pet out of every user's favorites
- Pets added this way appear immediately in Find Pets / Matchmaker / details.

## 7. Icons, animation & micro-interactions

All with `lucide-react` + the already-present `motion` package (v12, imported as `motion/react`) — **no new heavy deps**. Supabase-js was the only addition (required for the task).
- **Chat:** animated message entrance (fade/slide via `AnimatePresence`), animated day separators, springy unread badge, animated send button (tap/hover), floating empty-state icon, animated modal open.
- **Nav/Header:** brand paw icon is now a lucide `PawPrint` that playfully wiggles on hover; notification bell swings gently when there are unread items.
- **Landing hero:** staggered entrance (badge → headline → copy), sparkles icon loop, floating metric cards.
- **Pet cards:** heart button pops with a spring on favorite toggle (Find Pets).
- **Matchmaker:** score bars animate from 0 to the real score, staggered per rank.
- **PetManager:** cards and modal animate in/out.
- Layout and performance unchanged otherwise; all animations are transform/opacity only.

> Maruf will send his own icons later — when they arrive they can replace/augment these (drop them in `src/assets/` and swap the lucide usage).

## 8. Section-by-section sweep (other fixes)

- **PetListings / Matchmaker / LostFound / Services / PetCare / AdminDashboard / UserDashboard:** reviewed for the same bug classes (stale timestamps, unpersisted state, cross-user leaks). No additional functional bugs found; adoption approve/reject flow, activity-log CSV export, lost/found resolve, and service booking all behave correctly in fallback mode.
- **CppConsoleModal:** untouched — it's a simulator/viewer, behaves as before.
- **Data adapter mappers:** `rowToMessage` / `rowToConversation` / `rowToNotification` handle missing fields defensively.

## 9. Supabase prep — files only, NOT connected

Prepared in `supabase/` (nothing needs Maruf's action to keep working today):

| File | Contents |
|---|---|
| `schema.sql` | 14 tables mirroring `src/types.ts` (users, pets, adoption_applications, conversations, **chat_messages** with `(conversation_id, created_at)` index, lost_found_reports, medical_records, vaccinations, vet_appointments, services, service_bookings, notifications, favorites, activity_logs). `chat_messages` added to the `supabase_realtime` publication. FKs + indexes included. |
| `policies.sql` | RLS enabled everywhere. **Demo-open policies** (public read; anon write) because the app has no Supabase Auth login yet — every policy is commented, with the stricter auth-backed variants included as comments for later. |
| `seed.sql` | **Generated from the real seed data** (`npx tsx scripts/generate-seed.ts > supabase/seed.sql`) — 60 inserts: 11 users, 15 pets, applications, 4 conversations, 7 messages, lost/found, medical, vaccinations, 4 services, notifications. Timestamps normalized to real datetimes. Idempotent (`ON CONFLICT DO NOTHING`). |
| `README.md` | Step-by-step setup for Maruf (create project → run 3 SQL files → paste URL + anon key into `.env.local` → restart). |

App-side wiring (`src/lib/`):
- `supabaseClient.ts` — reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; `null` client when absent; **never throws in fallback mode**.
- `dataAdapter.ts` — `LocalAdapter` (today's behavior) vs `SupabaseAdapter` (loadInitial, persistMessage/Conversation/Notification, `subscribeMessages` realtime). App picks automatically. All Supabase calls have `.catch` logging so a network failure degrades to local instead of crashing.
- `.env.example` documents the two `VITE_` vars.

## 10. What Maruf must do to go live (exact steps)

1. Create a **free Supabase project** (his own account).
2. SQL Editor → run `supabase/schema.sql`, then `supabase/policies.sql`, then `supabase/seed.sql`.
3. Project Settings → API → copy **Project URL** + **anon public key**.
4. Create `.env.local` in the project root:
   ```
   VITE_SUPABASE_URL="https://xyzcompany.supabase.co"
   VITE_SUPABASE_ANON_KEY="eyJhbGciOi..."
   ```
5. `npm run dev` (restart) or rebuild. Chat shows the green **Live** badge.
6. Verify: two browsers (one normal, one incognito) — `jaann@pawmatch.com`/`user123` in one, `admin`/`admin` in the other — send a message, it appears on the other side within ~1–2s. Also confirm rows appear in Table Editor → `chat_messages`.

## 11. Known remaining / out of scope for this pass

- **Supabase live behavior unverified** (no keys exist) — realtime, loadInitial, remote notification writes. Code is complete and defensive; needs the 10-minute setup above.
- **File handling is still localStorage** in fallback mode (Megha's module maps to the DB tables once live). No text-file C++ layer — that belongs to the Qt repo, not this web demo.
- **C++ in this zip is still partial** (5 utility headers + viewer-embedded sources). Unchanged — the `uni-group-project` repo remains the real C++ submission.
- Passwords are demo-grade (see §3); Supabase Auth is the recommended next step.
- Bundle is ~570 KB JS (supabase-js); code-split if it ever matters for load time.
- Pet photos still load from Unsplash (internet needed for images).

## Files changed (v2 vs the uploaded zip)

- **New:** `src/utils/time.ts`, `src/lib/supabaseClient.ts`, `src/lib/dataAdapter.ts`, `src/components/PetManager.tsx`, `supabase/{schema.sql,policies.sql,seed.sql,README.md}`, `scripts/generate-seed.ts`, `scripts/sanity-time.ts`, `AUDIT.md` (this file)
- **Edited:** `src/App.tsx` (safe storage, full persistence, per-user favorites + notifications, ISO timestamps, fake reply removed, Supabase load/realtime, pet CRUD handlers), `src/types.ts` (`createdAt`/`lastMessageAt`), `src/components/ChatSystem.tsx` (sort/day-separators/animations/banner), `src/components/AuthModal.tsx` (persisted lockout, real password reset), `src/components/PetCareView.tsx` (computed vaccine status), `src/components/Header.tsx` (scoped notifs already via props, humanized times, animated icons), `src/components/LandingPage.tsx` (animations), `src/components/PetListings.tsx` (heart pop), `src/components/MatchmakerView.tsx` (animated score bars), `src/components/UserDashboard.tsx` (PetManager wiring), `package.json` (+`@supabase/supabase-js`), `.env.example`
- **Untouched:** `src/data/seedData.ts`, `src/utils/geoAndMatchmaker.ts`, all other components, `include/` C++ headers, `index.html`, `vite.config.ts`
