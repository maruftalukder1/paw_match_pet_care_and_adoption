# FULL AUDIT + FIX — 2026-10-17 (evening)

Maruf's instruction: *"ekhon tmar kaj hocche sob check kora ar bugs fix kora"* — check everything, fix the bugs.
Scope: source only. NOT published, GitHub untouched, artifact untouched — publishing is the parent's job.

---

## 1. Suite results (before → after)

| Suite | Before | After | Notes |
|---|---|---|---|
| `npx tsc --noEmit` | src/ 0 errors (only pre-existing: Deno edge fn modules, `vite.artifact.config.ts`, one scripts/ nit) | src/ 0 errors — identical | No new type errors from fixes |
| `npm run build` | clean, ~9.6s | clean, ~2.2s | |
| `scripts/sanity-auth.ts` | ALL PASSED | ALL PASSED | |
| `scripts/sanity-time.ts` | 20/20 | 20/20 | |
| `scripts/test-symptom-rules.ts` | ALL PASSED | ALL PASSED | |
| `scripts/test-video-analysis.ts` | ALL PASSED | ALL PASSED | |
| `scripts/test-fullsync-mappers.ts` | 29/29 | 29/29 | |
| `scripts/test-typing-throttle.ts` | ALL PASSED | ALL PASSED | |
| `scripts/symptom-checker-e2e.cjs` | ALL PASSED | — (unchanged paths) | |
| `scripts/symptom-photo-e2e.cjs` | ALL PASSED | — | |
| `scripts/symptom-video-e2e.cjs` | ALL PASSED | — | |
| `scripts/msgfix-local-e2e.cjs` | **CRASH** — timed out waiting for header button `/Jaann Rahman/` (see F-A) | **ALL PASSED** (2 viewports × 11 checks) | Test was stale: assumed pre-AUTHFIX2 auto-login |
| `scripts/fullsync-local-e2e.cjs` | **CRASH** — needs keyless build on :4173, got live build | **ALL PASSED** (19 checks) | Ran against a keyless `vite build` (env moved aside), as the script's own header requires |
| `scripts/authfix2-e2e.cjs` | **2 failed** (test-locator issues, see F-B/F-C) + 1 env-mismatch (recovery needs live keys) | **ALL 30 CHECKS PASSED** | Live build |
| `scripts/design-pass-sweep.cjs` | SWEEP ALL PASS (desktop+mobile, 9 views, 0px overflow, 0 errors) | SWEEP ALL PASS | Ran before source fixes; fixes touch useCall/csv only, neither rendered in sweep views |

---

## 2. Findings

### F-1 (REAL, FIXED) — Double-'accept' could build a second RTCPeerConnection and orphan the first call's stream
- **Severity:** medium (needs a double-tap/retransmit; then the mute button silently stops working because `toggleMute` flips `localStreamRef` tracks while the PC carries the orphaned stream).
- **Evidence:** `src/lib/useCall.ts` — `acceptCall` had no in-flight guard; the `'accept'` signaling case ran `setupCaller` for every accept received while `phase === 'outgoing'` (`pcRef` was never checked).
- **Fix:** added `acceptInFlightRef` (set in `acceptCall`, cleared in `.finally()` and in `teardown()`); the `'accept'` case now also requires `!pcRef.current`.

### F-2 (REAL, FIXED) — `ontrack` dropped track events that arrive without `e.streams[0]`
- **Severity:** low (most browsers populate `streams[0]` for `addTrack(track, stream)`; some mobile browsers don't → black remote view despite a connected call).
- **Evidence:** `src/lib/useCall.ts` `pc.ontrack` read only `e.streams[0]`.
- **Fix:** fallback `e.streams[0] ?? (e.track ? new MediaStream([e.track]) : null)`.

### F-3 (REAL, FIXED) — CSV formula injection in admin exports
- **Severity:** low (admin-only exports, but a pet name like `=cmd|...` would execute in Excel).
- **Evidence:** `src/utils/csv.ts` `escapeCsvField` did RFC-4180 escaping but no formula guard.
- **Fix:** prefix a `'` text marker when a cell starts with `=`, `+`, `-`, `@` (OWASP recommendation; Excel hides the marker, visible content unchanged).

### F-A (test infra, FIXED) — `msgfix-local-e2e.cjs` assumed pre-AUTHFIX2 auto-login
- **Evidence:** script comment "app auto-logs in as Jaann on first visit"; AUTHFIX2 removed that in 2026-10-14, so the test crashed at the Jaann chip locator.
- **Fix:** script now asserts the logged-out boot, logs in as Jaann explicitly (`jaann@pawmatch.com` / `user123`), then logs out before the register path. No app change.

### F-B (test infra, FIXED) — `authfix2-e2e.cjs` used an exact `img[alt="Bruno"]` locator
- **Evidence:** listing cards render `alt="Bruno the Golden Retriever"` (a11y), so the locator matched 0 images and "replaced photo shows in Find Pets" falsely failed. The app was correct (detail modal + state + reload all showed the new photo).
- **Fix:** substring locator `img[alt*="Bruno"]`, matching the detail-modal check in the same script.

### F-C (test infra, FIXED) — `authfix2-e2e.cjs` missing `/tmp/authfix2-pet.png` fixture + 600ms fixed wait on live fetch
- **Evidence:** `setInputFiles` crashed with ENOENT; the D2 browse check raced the live Supabase fetch.
- **Fix:** script generates the 1×1 PNG fixture itself (same pattern as `fullsync-local-e2e.cjs`); the browse check now waits for Bruno's card heading (15s timeout).

### False alarms / cleared suspicions (no fix)
- **Symptom-history delete id collision:** CLEARED. Ids are `sym-${Date.now()}-${random(1e6)}`; delete filters exact id. Collision is practically impossible and the code path is correct. (`src/lib/symptomRules.ts`)
- **MSGFIX write discipline:** intact — `persistConversationWithMessage` awaits conversation → message with one transient retry; all fullsync writes (applications, lost&found, medical, vaccinations, appointments) follow the same awaited, retry-once, throw-on-permanent pattern. `isTransientError` correctly excludes 235xx/42501/PGRST/22xxx/42xxx.
- **Recovery-screen "failure" in authfix2:** environmental, not a bug — the recovery boot handler correctly requires the Supabase client (`App.tsx:355` `if (!supabase) return;`); the test step needs live keys and passed on the live build.
- **Auth:** `verifyPassword` strict equality (`<pw>_hash` / legacy `<pw>_hashed_salt`), empty input rejected; lockout fields, sticky logout, OTP, both recovery routes, and profile mirroring (name/phone/profile_json only — `password_hash` explicitly deleted before the write) all review clean. Admin view and admin tab are role-gated (`role === 'admin'`); role is display-only in Profile, never user-writable.
- **ImageUploader:** 8 MB cap, MIME + extension check, canvas downscale ≤1000px, honest errors, errors caught internally — clean.
- **CSV:** RFC-4180 correct (Blob download, CRLF, BOM); `passwordHash`/`securityQuestion`/`securityAnswer` excluded from user exports.
- **Timezone:** `time.ts` is careful — local ISO dates via `toLocalISODate` (never UTC `toISOString` for display dates); `computeVaccinationStatus` compares normalized YYYY-MM-DD strings.
- **Listeners/subscriptions:** `subscribeMessages`/`subscribePets`/call channels all return cleanup; `ChatSystem`'s keydown listener has a matching remove; `useCall` effects remove channels on unmount.
- **CallOverlay (post-CALLFIX2):** remote `<audio>` element mounts for the whole dialog; attach effects + `play()` with "🔊 Tap for sound" fallback verified in the shipped bundle by the earlier artifact audit. No regressions found in re-read.

### Decision item for Maruf (NOT fixed — needs his call)
- None from this round. Everything user-visible that was wrong got fixed as a pure bug fix.

---

## 3. Live DB check (2026-10-17 ~22:30 +06, anon REST, key never printed)

| Table | Live count | Seed | Delta explanation |
|---|---|---|---|
| users | 15 | 11 | 4 real registrations: Maruf's new account today, `rifat`, teammate **Nusrat jahan megha** (today), `maruf` (Oct 14) |
| pets | 13 | 15 | **pet-3 and pet-7 are missing** — deleted by user action (who/why unknown); not caused by any test in this audit |
| conversations | 13 | 6 | +6 real (Maruf/rifat/Megha admin chats, application threads) + 1 probe row |
| chat_messages | 32 | 7 | seed + call-log pills + real messages + 1 probe row |
| adoption_applications | 6 | 4 | +2 real (incl. Maruf's Milo application today) |
| lost_found_reports | 3 | 3 | ✓ |
| medical_records | 2 | 3 | 1 fewer (user action, unknown) |
| vaccinations | 5 | 5 | ✓ |
| vet_appointments | 1 | 0 | +1 real |
| notifications | 54 | 4 | by design (one "New Message" notification per message + favorites); unbounded by design — fine at this scale |
| services | 0 | 0 | intentionally unseeded ✓ |

**Probe rows from 2026-10-17: STILL PRESENT** — conversation `probe-msg-20261017` and message `probe-msg-20261017-m1` both exist. No anon DELETE exists; dashboard-SQL cleanup still owed (harmless: synthetic users, invisible in normal lists).

**"Empty content" messages (msg-1792252535109 etc.):** not a bug — they are call-log pills (`attachment.kind=calllog`, content `""` by design). They also show REAL call activity today: a **69s completed audio call**, a 27s completed video call, a declined audio call, and a 5s video call (~21:24–21:55 Dhaka) — strong field evidence the call fixes are working. Maruf's explicit confirmation is still the witnessed proof.

**Test-caused live mutations — RESTORED and verified:**
- `authfix2-e2e` D1 legitimately changed Jaann's live password via the legacy reset path → restored `u-adopter-1.password_hash = 'user123_hash'`, attempts 0, unlocked (HTTP 204, read back ✓). Demo login `jaann@pawmatch.com / user123` works again.
- `authfix2-e2e` D3 left Bruno's photo as a data URL → restored `pet-1.photo_url` to the original Unsplash URL (HTTP 204, read back ✓).

---

## 4. Honest limits (cannot be machine-proven here)
- Real two-device WebRTC media (audio heard, video seen across networks) — the sandbox has no UDP/WebRTC; a trickle-ice probe earlier gathered zero candidates of any type here. Field proof = Maruf's retest (DB already shows completed calls today, which is encouraging).
- Real-inbox email delivery (Gmail SMTP / OTP / recovery link to Hasan's inbox).
- Apple/Safari-specific WebRTC quirks (no iOS device here).
- Google Search Console indexing timeline (Google's side).

## 5. Files changed in this round (source only — parent publishes)
- `src/lib/useCall.ts` — double-accept guard (`acceptInFlightRef` + `pcRef` check), `ontrack` stream fallback.
- `src/utils/csv.ts` — formula-injection `'` marker in `escapeCsvField`.
- `scripts/msgfix-local-e2e.cjs` — explicit Jaann login (auto-login assumption removed).
- `scripts/authfix2-e2e.cjs` — self-generating PNG fixture, substring alt locator, heading-wait for live fetch.

Final state verified: `tsc` src/ 0 errors, `npm run build` clean, all unit suites green, `authfix2-e2e` 30/30, `msgfix-local-e2e` all pass, `fullsync-local-e2e` all pass, symptom suites all pass, design sweep all pass, live DB test mutations restored.
