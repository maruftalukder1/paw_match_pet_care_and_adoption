# Phase-2 client wiring — Symptom Checker photo analysis

Status: **WIRED, source only, NOT published.** The feature flips live the
moment the `analyze-photo` Edge Function is deployed; until then it degrades
honestly. Artifact untouched, GitHub untouched.

## What changed

**New: `src/lib/photoAnalysis.ts`**
- `analyzePetPhoto({ imageBase64, mimeType, species, symptoms })` — the single
  call site for `supabase.functions.invoke('analyze-photo')`. Every failure
  (offline mode, function not deployed, missing secret, network, bad payload)
  is converted into a `PhotoAnalysisError` — nothing else ever escapes.
- `dataUrlToParts()` — splits an ImageUploader JPEG data URL into raw base64
  + MIME type; returns null for remote link URLs (those cannot be sent as bytes).
- `photoNoteSummary()` — one-line history summary: top signs + triage hint +
  "Informational only, not a diagnosis."

**Changed: `src/components/SymptomChecker.tsx`**
- New optional **Step 5: "Add a photo"** (reuses the existing `ImageUploader`,
  compact; upload or link). Guests can use it like everything else in the checker.
- `handleCheck` is now async, but the rule engine **always completes first**:
  the result renders immediately, then the photo section transitions
  `analyzing → done | unavailable` underneath it.
- On success, an **"AI photo observations"** card is merged into the result:
  observed signs (sign + region + confidence), "Questions to ask your vet",
  and the server-enforced disclaimer. Clearly labeled "Informational only —
  not a diagnosis, not veterinary advice."
- **Escalation, never de-escalation:** if the AI returns `triageHint:
  "emergency"` while the rule engine said something lower, the pulsing
  emergency banner appears (with an "AI photo analysis spotted…" reason line)
  and the urgency card shows EMERGENCY. Any lower AI hint never changes the band.
- On ANY failure: the check stands as-is and the result shows one honest line
  — "Photo analysis isn’t available right now — your check above is unaffected."
  Failures are also `console.warn`ed (no silent errors). A pasted *link* URL
  (not an upload) gets its own honest line, since links can't be sent as bytes.
- The observations summary is folded into the history entry's `photoNote`
  (field already existed in the model) and shown with a camera icon in History.
- The attached photo is kept across species/pet switches (only the result is
  cleared); "Start a New Check" clears it. Disclaimer intact on panel and
  every result.

## Test evidence (boundary stubbed at HTTP level)

New: `scripts/symptom-photo-e2e.cjs` — the `/functions/v1/analyze-photo`
endpoint is stubbed with `page.route` (incl. OPTIONS preflight), because the
real function is not deployed in this sandbox. **19/19 PASS, zero JS errors:**
- **A (success, vet_soon):** photo uploads and downscales; rule result renders
  first ("Monitor at home"); AI section merges with the stubbed sign; band
  unchanged; no emergency banner; history entry carries the photoNote summary.
- **B (emergency escalation):** stubbed `triageHint: emergency` on a
  monitor-level check → pulsing emergency banner + EMERGENCY card + AI reason
  line. Escalation works; no de-escalation path exists.
- **C (failure, HTTP 500):** rule check completes normally; honest
  "isn't available right now" line shown; no banner; no JS errors.
- Debugging note: the first run failed because clicking a species tab after
  attaching the photo wiped it via the shared reset — fixed by splitting
  reset into `clearResultState()` (keeps photo) vs `resetCheckState()`.

## Existing suites — all green

- `test-symptom-rules.ts`: 41/41 PASS (incl. photoNote optionality)
- `symptom-checker-e2e.cjs`: ALL PASSED (28/28)
- `sanity-auth.ts`: ALL PASSED
- `sanity-time.ts`: 20/20
- `npm run build`: clean (only the pre-existing `vite.artifact.config.ts`
  and Deno-function tsc quirks remain; no errors in new/changed files)

## Flip-live checklist (for the parent)

1. Maruf pastes his Gemini key as a Supabase Edge Function secret named
   `GEMINI_API_KEY` (dashboard → pawmatch → Edge Functions → Manage secrets).
2. Deploy: `supabase functions deploy analyze-photo` (README in
   `supabase/functions/analyze-photo/` has the click-by-click).
3. Rebuild + publish the artifact (`artifact.edit` + `artifact.share`) and
   export the fresh single-file HTML — the client code needs no changes.
4. Optional later: NVIDIA as a second engine (vault key pending); video via
   client-side frame extraction (stretch, per PHASE2_PLAN.md).

## Honest limits

- Not machine-proven end-to-end: the real deployed function + real Gemini
  response were never exercised from the browser (the function isn't deployed
  yet). The stub proves the client wiring; the prompt quality was proven
  separately in `phase2-evidence/` with the production prompt.
- NVIDIA benchmarking from the sandbox failed (inference endpoints silent;
  models-list worked) — the vault path may succeed where direct calls didn't.
