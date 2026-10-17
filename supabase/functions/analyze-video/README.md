# analyze-video — Edge Function (READY TO DEPLOY, not deployed yet)

Frame-observation proxy for PawMatch's Pet Symptom Checker (phase 3, video).

## Privacy design (the important part)

The raw video **never leaves the device**. The browser extracts up to 6
still frames from the clip (a `<video>` element + canvas, downscaled to
≤1000 px like the photo uploader) and sends only those frames. This keeps
payloads small, dodges the 6 MB function limit gracefully, and is honest to
state in the UI: "your video stays on your device — only a few sampled
frames are analyzed."

## What it does

- Accepts `POST { framesBase64: string[] (1..6, each ≤ ~1.5 MB base64), mimeType, species, symptoms[], durationSec }`.
  Rejects >6 frames, oversize payloads (per-frame and total caps), non-image
  mime types, and non-POST methods with clear errors.
- Calls `gemini-3.7-flash` with the production video-observation prompt
  (`responseMimeType: application/json`, temperature 0.2,
  `maxOutputTokens: 2048`, `thinkingConfig: { thinkingBudget: 512 }` —
  the 3.x flash models spend output tokens on hidden reasoning, so the
  budget must leave room); on 429/503 it falls back once to
  `gemini-3.1-flash-lite` (same pins as `analyze-photo`).
- The prompt asks for observations ACROSS the frame sequence — gait/limping,
  posture changes, breathing effort, activity level — plus a one-line
  `sequenceNote` describing change across the frames ("no change visible
  across frames" if none). Red-flag visuals force an emergency hint, exactly
  like the photo prompt. Observations only, never a diagnosis, no meds.
- Returns trimmed JSON
  `{ observedSigns[], triageHint, sequenceNote, vetQuestions[], disclaimer }`
  (the disclaimer is enforced server-side).
- Handles CORS correctly: answers `OPTIONS` preflight and returns
  `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`
  on every response (the Supabase JS SDK sends those headers).

## Deploy (dashboard-editor route, same as analyze-photo)

1. Open https://supabase.com/dashboard/project/edkhnahldplkjhjhhjvu/functions
2. Create a new Edge Function named exactly `analyze-video` via the
   dashboard's built-in editor ("Create a new function" / "Deploy via
   dashboard").
3. Replace the editor's entire default content with `index.ts` from this
   folder (Monaco direct typing is unreliable — stage the text through the
   dashboard AI-chat textbox as a clipboard source, copy, paste, then verify
   the content starts with `// Supabase Edge Function: analyze-video` before
   deploying).
4. Deploy. No secret needed — `GEMINI_API_KEY` is already set in the project
   (it is read via `Deno.env.get` at request time; if it is ever missing the
   function answers HTTP 500 "video analysis is not configured on the server
   yet").

Local testing: put `GEMINI_API_KEY=...` in `supabase/functions/.env` (never
committed) and run `supabase functions serve analyze-video`.

## Test call (after deploy)

```bash
curl -s -X POST \
  https://edkhnahldplkjhjhhjvu.supabase.co/functions/v1/analyze-video \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"framesBase64":["<b64>","<b64>"],"mimeType":"image/jpeg","species":"dog","symptoms":["Limping"],"durationSec":12}'
```

Expected: HTTP 200 with the observation JSON including `sequenceNote`.
`503 { retryable: true }` means the model is overloaded — retry later.

## Notes

- Rate limiting / abuse: same as `analyze-photo` — callable with the public
  anon key; acceptable for the demo, add a cap before any real launch.
- Free-tier privacy: on Gemini's free tier, uploaded frames may be used by
  Google to improve its products. A billing-enabled (paid) key avoids this.
- The client calls it via
  `supabase.functions.invoke('analyze-video', { body: { framesBase64, mimeType, species, symptoms, durationSec } })`.
- Honest limits: frame sampling can miss things that happen BETWEEN the
  sampled frames — this is not continuous video understanding. The UI says
  this in fine print.
