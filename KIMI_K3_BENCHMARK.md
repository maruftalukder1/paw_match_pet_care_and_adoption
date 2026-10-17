# Kimi K3 benchmark — `moonshotai/kimi-k3` (NVIDIA NIM)

Date: 2026-10-16 ~00:26 +06 (Asia/Dhaka)
Decision rule (Maruf): if Kimi K3 doesn't work well, drop it.

## Method

Called via the vault connector only: `custom.nvidia` surrogate attached to
`Authorization: Bearer` on `integrate.api.nvidia.com` (helper pattern from
`~/workspace/custom-connectors/custom.nvidia/bin/nvidia-test.py`).
No raw key anywhere in this test.

Request: `POST /v1/chat/completions`, model `moonshotai/kimi-k3`, Bruno dog
photo
(`https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&auto=format&fit=crop&q=80`),
production-style instruction:

> Species: dog. Owner-reported symptom: Lethargy. Describe ONLY what you can
> visibly observe. Reply with ONLY a JSON object
> {"observedSigns": [{"sign": string, "region": string,
> "confidence": "low"|"medium"|"high"}],
> "triageHint": "monitor"|"vet_soon"|"vet_today"|"emergency",
> "vetQuestions": [string]}.
> Never give a diagnosis or medication advice.

Parameters: `max_tokens: 800`, `temperature: 0.2`, hard timeout 150s,
one attempt (no retry — the failure was not transient).

## Result

- **HTTP 410 Gone**, latency **0.7 s**.
- Server body (verbatim): `The model 'moonshotai/kimi-k3' has reached its
  end of life on 2026-10-15T08:00:00Z and is no longer available.`

No second attempt was made: end-of-life is not a transient error.

## Verdict: DROP ❌

Kimi K3 does not exist on NVIDIA NIM anymore — it was retired
2026-10-15 08:00 UTC (today). This also explains the parent agent's hanging
inference calls the previous night: they were aimed at a dying model, not
merely a slow queue.

Known Gemini reference for this same photo (production, proven):
observed "holding a flower in mouth" + "alert posture", and asked
"Are tulips toxic to dogs if ingested?" — K3 could not be judged against it
because K3 never answered.

## Notes for the parent

- Gemini remains the proven primary engine for PawMatch photo/video
  observation (live-proven multiple times on the deployed Edge Functions).
- `moonshotai/kimi-k2.6` still appears in the account's model list (it was
  in the vision-capable row). If Maruf wants a Moonshot-family second
  engine, K2.6 would need its own benchmark — but nothing in this test
  supports it; quality and latency are unknown.
- NVIDIA via the vault connector stays a verified spare for other vision
  models (e.g. llama-3.2-11b-vision answered in ~4s, though it echoed the
  stated symptom as an observed sign — weaker than Gemini).
