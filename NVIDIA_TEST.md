# NVIDIA API key test — 2026-10-15 (~11:25 +06)

Maruf connected an NVIDIA key through the Secure Vault (provider `custom.nvidia`,
host `integrate.api.nvidia.com`, Bearer header). The raw key was never seen, copied,
or stored. Tested through the connector's surrogate exchange (authd) with the helper
`~/workspace/custom-connectors/custom.nvidia/bin/nvidia-test.py`.

## Test 1 — models list (verdict test): PASSED

- `GET https://integrate.api.nvidia.com/v1/models` → **HTTP 200 in <1s**
- 80 models on the account
- Full vision row present: `meta/llama-3.2-11b-vision-instruct`,
  `meta/llama-3.2-90b-vision-instruct`, `microsoft/kosmos-2`,
  `microsoft/phi-3-vision-128k-instruct`, `nvidia/neva-22b`, `nvidia/vila`,
  `moonshotai/kimi-k3` (the Kimi model Maruf asked about)

**Verdict: the vault-connected key works.**

## Test 2 — vision inference (stretch): PASSED

- `POST /v1/chat/completions` with `meta/llama-3.2-11b-vision-instruct`,
  Bruno dog photo (Unsplash), prompt asking for visible signs only as JSON
- **HTTP 200 in ~4s**, reply:
  `{"observedSigns": ["Lethargy"], "triageHint": "monitor"}`
- Honest note: the model echoed the owner-stated symptom back as an "observed"
  sign, so its observation quality is unproven for production use. Also note the
  contrast with last night's direct sandbox curls (three inference calls hung
  silently for 90–150s while `/v1/models` answered instantly); through the
  surrogate connector the same class of inference call returns in seconds.
  Always route NVIDIA inference through the skill helper, never through ad-hoc
  curls with a pasted key.

## Production status

PawMatch's live photo-AI runs on Gemini behind the deployed Supabase Edge Function
(`analyze-photo`, secret `GEMINI_API_KEY` set 2026-10-15 morning). NVIDIA stays the
optional second-opinion engine; wiring it into the product needs a benchmark of
observation quality (the one test above is promising but not sufficient) and Maruf's
call on which models to use.

## Replacement key verification — 2026-10-16

Maruf stored a NEW NVIDIA key in the Secure Vault (custom.nvidia reconnect/replacement).
Both tests re-run through the surrogate connector — no raw key anywhere.

- `GET /v1/models` → **HTTP 200 in ~1s**, count now **81** models (was 80).
  Vision row present: llama-3.2-11b/90b-vision-instruct, kosmos-2,
  phi-3-vision-128k-instruct, neva-22b, vila, plus newer entries
  (nemotron-3.5-super-vl-120b-a12b). **moonshotai/kimi-k3 is gone from the
  list**, confirming the end-of-life retirement reported in KIMI_K3_BENCHMARK.md.
- `POST /v1/chat/completions` with `meta/llama-3.2-11b-vision-instruct`,
  Bruno dog photo, same visible-signs-only prompt → **HTTP 200 in ~3s**,
  reply: `{"observedSigns": ["Puppy holding a flower in its mouth"],
  "triageHint": "monitor"}`. This time the model observed something genuinely
  visual (the flower) instead of echoing the owner-stated symptom — still
  shallower than Gemini's outputs (tulip-toxicity reasoning), but a real
  observation.

**Verdict: the replacement key authenticates and serves both calls cleanly.
No 401/403 or errors. Gemini remains PawMatch's production engine; NVIDIA
stays the verified spare/second-opinion option.**
