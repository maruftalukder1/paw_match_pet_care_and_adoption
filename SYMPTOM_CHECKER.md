# PawMatch — Pet Symptom Checker

**Date:** 2026-10-15 · **Working copy:** `hidden_files/pawmatch-v2/` (source only; artifact/GitHub untouched)
**Brief:** Maruf's spec — species-aware symptom triage GUIDANCE (never a diagnosis), with duration, severity,
emergency red flags, vet recommendations, per-user local history, and a hard safety disclaimer.

## Placement (≤2 clicks from main nav)

- Header nav → **Pet Care & Vets** → the checker's hero banner + form render **immediately at the top of
  PetCareView**, above the care-guide tabs (0 extra clicks; the hero's "Check Symptoms" button smooth-scrolls
  to the form).
- Visual language matches Pet Care (teal/emerald, rounded-3xl cards, lucide icons: Stethoscope, AlertTriangle,
  Clock, Activity, HeartPulse, Siren). Emergency banner uses a **continuous 1.4s pulsing animation**
  (`symptom-emergency-pulse` in `index.css` — clearly visible, per Maruf's design rule).
- Guests can run checks; history is namespaced per user (`pawmatch_symptom_history_<userId>`, guests → `'guest'`).

## Rule engine (`src/lib/symptomRules.ts`, pure — no React, no network)

- **Symptom catalog:** 29 symptoms. Base six on all species: Loss of Appetite, Vomiting, Diarrhea, Coughing,
  Lethargy, Skin Irritation. Species extras — cat: urinary strain, excessive thirst, hiding; dog: bloating,
  retching, limping, drooling; bird: fluffed feathers, tail bobbing; rabbit: not-eating+no-droppings (red flag),
  head tilt; shared: sneezing, eye discharge, weight loss, fever signs, loss of balance.
- **Red flags → EMERGENCY regardless of severity/duration:** cat urinary strain (especially), breathing
  difficulty, suspected poisoning, seizure, collapse/unconscious, uncontrolled bleeding, rabbit GI-stasis
  combo, plus the dog bloat combo (swollen hard belly + retching). Emergency shows a pulsing red banner
  ABOVE the results: "This can be an emergency — contact a veterinarian or emergency clinic immediately".
- **Escalation matrix (no red flag):** points from severity (moderate +1, severe → vetToday), duration
  (2–3d +1, >3d +2), ≥3 symptoms +1, GI pairs (vomiting+diarrhea ±lethargy) +1/+2.
  ≥4 → **See a vet today**; ≥2 → **See a vet within 24 hours**; else **Monitor at home**.
  Hard rails: severe ⇒ at least vetToday; >3 days ⇒ at least vet24h.
- **Per-symptom cards:** `whatItCanMean` (always "can have several causes" wording), safe home steps,
  and watch-for signs. No specific disease named as a conclusion anywhere.
- **Safety copy (non-negotiable, in every result + above the form):** the exported `DISCLAIMER` —
  "This tool provides general guidance only and is not a diagnosis. It is not a substitute for a
  veterinarian. If your pet has emergency signs — a cat that cannot urinate, difficulty breathing, or
  suspected poisoning — seek veterinary care immediately."
- **Phase-2 hook:** `photoNote?: string` is an optional field on `CheckInput`, `CheckResult` and
  `SymptomCheckHistoryEntry` (passed through, unused in UI) so a future photo/video AI-observation
  add-on needs no data migration.

## Files changed

- `src/lib/symptomRules.ts` (new, ~450 lines): catalog, `evaluateCheck`, urgency logic, history helpers.
- `src/components/SymptomChecker.tsx` (new): hero, 4-step wizard, result panel, history UI, vet actions.
- `src/components/PetCareView.tsx`: renders `<SymptomChecker/>` after the header banner; new props
  `pets`, `onNavigateTab`; `openBookingWithPrefill` opens the booking modal with the check's pet/reason.
- `src/App.tsx`: passes `pets={pets}` + `onNavigateTab={setActiveTab}` to PetCareView.
- `src/index.css`: `symptom-emergency-pulse` + `symptom-hero-float` keyframes.
- `scripts/test-symptom-rules.ts` (new, tsx): 41 assertions. `scripts/symptom-checker-e2e.cjs` (new, playwright).

## Vet consultation recommendation (working actions)

- **Book a Vet Appointment** (`data-testid="symptom-book-appointment"`) opens Pet Care's real booking modal
  with the pet name and a reason like `Symptom check follow-up (See a vet today): Vomiting, Diarrhea` —
  the booking flows through the existing `onBookAppointment` → `handleBookAppointment` (with live DB sync).
- **Find Vets & Clinics** navigates to the Services tab via `onNavigateTab('services')`.

## History (local only — server sync explicitly out of scope)

- Saved per check: timestamp, pet name/species, symptoms, duration, severity, urgency label; keyed by user
  id (`'guest'` for guests). Newest-first list, delete-one, clear-all. Verified persisting across reloads.
  A server-side history would need a new table — noted as future work, not implemented.

## Test evidence

| Suite | Result |
|---|---|
| `npx tsx scripts/test-symptom-rules.ts` | **41/41 PASS** — red flags all → EMERGENCY incl. Mild/<12h and the dog bloat combo; escalation matrix (mild single → monitor; >3d → vet24h; severe → vetToday; V+D+L → vetToday); species lists differ correctly; Maruf's exact example (Cat + Loss of Appetite + 24h) → "Monitor at home" + "can have several causes… contact a veterinarian promptly" + disclaimer present; photoNote passthrough + optionality |
| `node scripts/symptom-checker-e2e.cjs` (playwright, fresh profile, production build) | **28/28 PASS** — boots logged-out; hero + guidance subtitle; bird/cat list differences; Maruf example renders guidance + disclaimer + book button; booking modal opens; history entry appears and survives reload; cat urinary emergency shows pulsing banner (`symptom-emergency-banner`) + emergency copy; delete-one + clear survive reload; logged-in shelter picks own pet (Bruno) → V+D+L/24h/moderate → "See a vet today" addressed to Bruno; PetCare regressions (appointments, vaccinations, guides) all render; **zero JS page errors** |
| `npm run build` | ✅ (1.49s) |
| `npx tsc --noEmit` | ✅ for all source files (only pre-existing `vite.artifact.config.ts` overload quirk, unchanged by this round) |
| `npx tsx scripts/sanity-auth.ts` | ✅ ALL SANITY CHECKS PASSED |
| `npx tsx scripts/sanity-time.ts` | ✅ 20 passed, 0 failed |

## Honest limits

- Guidance is rule-based, not AI: it never diagnoses; severe/ambiguous cases are escalated by design.
- Machine-provable from the sandbox: everything above. Not machine-provable: none for this feature —
  the checker is fully local (no Supabase dependency), so all paths were exercised directly.
- Server-side history needs a new table (future); `favorites`/`activity_logs` remain per-device by design.
