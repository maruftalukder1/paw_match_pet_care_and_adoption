# PawMatch — Phase 2: AI photo/video observation for the Symptom Checker

Status: PREPARED OVERNIGHT, not built into the site yet. Phase 1 (rule-based
Symptom Checker) is being built separately inside Pet Care & Vets.

## 1. What phase 2 adds

Inside the Symptom Checker UI, an optional **"Add a photo"** step:

1. User uploads a pet photo (reuse the existing `ImageUploader` — downscaled
   JPEG, same as pet listings).
2. The site calls the Supabase Edge Function
   `supabase.functions.invoke('analyze-photo', { body: { imageBase64, mimeType, species, symptoms } })`.
3. The function's Gemini vision step returns **observations only** —
   visible signs, a triage hint, questions for the vet. Never a diagnosis.
4. The checker result merges them: an "AI observations" card next to the
   rule-based guidance. Final urgency = the MORE urgent of the two hints
   (an emergency hint from either side always wins).
5. The observation summary is attached to the history entry via the optional
   `photoNote` field (pending in phase 1's data model — confirm before wiring).

Emergency signs from either path always surface the red emergency banner.

## 2. Architecture (key never touches the browser)

Browser → Edge Function `analyze-photo` (holds `GEMINI_API_KEY` via
`Deno.env.get`) → `generativelanguage.googleapis.com` → trimmed JSON back.

Code is written and waiting: `supabase/functions/analyze-photo/` (index.ts +
README.md with deploy steps). The live pipeline was proven end-to-end with
the same production prompt on 2026-10-15 — see `phase2-evidence/`.

## 3. Model choice (live-verified, with a correction)

- The research suggested `gemini-3.8-flash`. **It does not exist** — the live
  models list was checked on 2026-10-15 and it is absent.
- Pinned primary: **`gemini-3.7-flash`** (newest numbered stable Flash).
  On free tier it returned HTTP 503 (capacity) during the overnight test.
- Pinned fallback: **`gemini-3.1-flash-lite`** — answered live ("pong" and a
  full photo analysis). The function and the test CLI both try the primary,
  then fall back once on 429/503.
- Recommendation: keep this primary+fallback design; re-check the models
  list if generation keeps failing (Google deprecates models with 2-week
  notice). `gemini-2.5-flash-lite` told new users it is "no longer
  available" — avoid the 2.5 line.

## 4. Safety framing (required by Google's terms and Maruf's spec)

- The system prompt forbids diagnoses, medication/dosage advice, and
  disease names as conclusions; red-flag visuals force an emergency hint.
- The disclaimer is enforced server-side in the function (clients cannot
  drop it): "These observations are for informational purposes only and are
  not veterinary advice, diagnosis, or treatment. Always consult a licensed
  veterinarian."
- The UI must repeat the checker's existing disclaimer near the photo step
  and on the result.

## 5. Privacy: free tier vs paid tier

- On Gemini's **free tier**, uploaded photos may be used by Google to improve
  its products. Fine for the course demo; **before any real users, switch to
  a billing-enabled (paid) key**, where content is not used for training.
  The function needs no code change — only the key in the secret changes.
- Cost reference (ai.google.dev pricing): Flash ≈ $0.75/1M input +
  $3.75/1M output tokens through Dec 31, 2026 (≈ $0.003 per photo
  analysis); doubles Jan 1, 2027. At course-demo volume the bill is cents
  or $0.

## 6. Abuse / rate limiting (public anon proxy)

The endpoint is callable with the public anon key, so anyone could burn the
Gemini quota. Acceptable for the demo; before launch add one of:
per-IP daily cap (Deno KV counter in the function), per-user cap via the
users table, or a Cloudflare/turnstile gate. Keep the default JWT verify on
(anon-key-gated), not `--no-verify-jwt`.

## 7. Video (stretch, not in scope for phase 2 launch)

Gemini's File API handles short clips (1 FPS frame sampling, ~300 tokens/s
at high res; formats mp4/mov/webm). Two viable paths:
(a) function uploads the clip to the File API (resumable upload) — more
server code; (b) the client extracts N frames from the video into JPEGs and
sends them as a multi-image request — simpler, no File API needed.
Cap clips at 30–60 s. Video stays stretch until photos are proven with users.

## 8. Remaining steps checklist

- [x] Feasibility research (report.md)
- [x] Production prompt written and live-tested on real pet photos
- [x] Edge Function code ready (`supabase/functions/analyze-photo/`)
- [ ] Deploy the function: `supabase functions deploy analyze-photo`
      (needs a Supabase access token — Maruf's step or a browser task)
- [ ] Set the `GEMINI_API_KEY` secret (Maruf pastes it in the dashboard:
      Edge Functions → Manage secrets — the ONE manual step left for him)
- [ ] Phase-1 photoNote field confirmed in the checker history model
- [x] Client wiring: photo upload step → functions.invoke → merge into
      result + history; loading/error/empty states (done in source, see
      PHASE2_WIRING.md; NOT published — flips live when the function deploys)
- [ ] Click-through tests: photo upload → observations card renders →
      emergency hint short-circuits → history persists; retryable 503 UI
- [ ] Publish + fresh HTML export
