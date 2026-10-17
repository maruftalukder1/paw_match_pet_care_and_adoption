# analyze-photo — Edge Function (READY TO DEPLOY, not deployed yet)

Photo observation proxy for PawMatch's Pet Symptom Checker (phase 2). The
function holds the Gemini API key as a server-side secret and asks Gemini
vision to describe only what is visibly observable in a pet photo — never a
diagnosis. See `PHASE2_PLAN.md` in the project root for the full plan.

## What it does

- Accepts `POST { imageBase64, mimeType, species, symptoms[] }` (rejects
  payloads over ~6 MB, non-image mime types, and non-POST methods).
- Calls `gemini-3.7-flash` with the production observation prompt
  (`responseMimeType: application/json`, temperature 0.2); on 429/503 it
  falls back once to `gemini-3.1-flash-lite`.
- Returns trimmed JSON
  `{ observedSigns[], triageHint, vetQuestions[], disclaimer }`
  (the disclaimer is enforced server-side).
- Handles CORS correctly: answers `OPTIONS` preflight and returns
  `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`
  on every response (the Supabase JS SDK sends those headers).

## Deploy (CLI route)

```bash
cd ~/workspace/goals/local-pet-care-adoption-matchmaker/hidden_files/pawmatch-v2
supabase link --project-ref edkhnahldplkjhjhhjvu     # needs a Supabase access token (Maruf)
supabase functions deploy analyze-photo
```

## The ONE manual step for Maruf — set the secret

The function will not work until `GEMINI_API_KEY` is set. It is pasted into
Supabase (never into chat, never into code):

1. Open https://supabase.com/dashboard/project/edkhnahldplkjhjhhjvu/functions
2. Click **Manage secrets** (top of the Edge Functions page).
3. Add a new secret:
   - Name: `GEMINI_API_KEY`
   - Value: paste the Gemini API key (from Google AI Studio)
4. Save. Secrets apply immediately — no redeploy needed.

Local testing: put `GEMINI_API_KEY=...` in `supabase/functions/.env` (never
committed) and run `supabase functions serve analyze-photo`.

## Test call (after deploy + secret)

```bash
curl -s -X POST \
  https://edkhnahldplkjhjhhjvu.supabase.co/functions/v1/analyze-photo \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"imageBase64":"<base64>","mimeType":"image/jpeg","species":"cat","symptoms":["Loss of Appetite"]}'
```

Expected: HTTP 200 with the observation JSON. `503 { retryable: true }`
means the model is overloaded — retry later.

## Notes

- Rate limiting / abuse: the endpoint is callable with the public anon key.
  For a course demo this is acceptable; before any real public launch, add a
  per-IP or per-user call cap (see PHASE2_PLAN.md).
- Free-tier privacy: on Gemini's free tier, uploaded photos may be used by
  Google to improve its products. A billing-enabled (paid) key avoids this —
  recommended before real users.
- The client calls it via
  `supabase.functions.invoke('analyze-photo', { body: { imageBase64, mimeType, species, symptoms } })`.
