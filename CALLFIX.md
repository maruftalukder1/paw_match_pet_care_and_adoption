# CALLFIX — WebRTC media fix (audio/video silent after accept)

**Date:** 2026-10-17 · **Source:** `~/workspace/goals/local-pet-care-adoption-matchmaker/hidden_files/pawmatch-v2/` · **File changed:** `src/lib/useCall.ts` (only)

## Diagnosis (confirmed)

Maruf tested on **two real devices on separate networks** (cross-NAT — not the same Wi-Fi).
Symptom: call rings and accept both work (Supabase broadcast signaling is fine), but no audio/video after accept.

Root cause, textbook: `ICE_SERVERS` was **STUN-only** (two Google STUN servers). Behind
carrier-grade / symmetric NAT — normal on Bangladeshi mobile networks — STUN cannot find
a peer-to-peer path, so ICE never connects and media stays silent. Nothing else in the
call machinery was broken (onicecandidate, ontrack, pending-ICE queue, signaling all sound).
A contributing bug: `onconnectionstatechange` ended the call **immediately** on
`'disconnected'`, so even a recoverable blip killed the call.

## Changes

### 1. TURN relays added to `ICE_SERVERS`

```ts
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];
```

The Open Relay entries are the free Metered community project (no account needed); when a
direct path fails, media is relayed through TURN. The code comment marks them demo-grade:
production should use dedicated TURN credentials (own coturn or a paid allocation).
Signaling, UI, and every other feature are untouched.

### 2. One-shot ICE-restart hardening

- `'failed'` → attempt **one** `pc.restartIce()` on the SAME peer connection; the caller then
  sends a fresh offer on that same PC (no PC rebuild). The callee answers the re-offer in
  place (`handleReoffer`, new) instead of building a new PC.
- `'disconnected'` no longer ends the call instantly: a 5 s grace (`DISCONNECT_GRACE_MS`)
  is armed; only if the state is still down when it fires do we attempt the restart.
- `'connected'` cancels any pending grace.
- Idempotent: `iceRestartedRef` allows at most one restart per peer connection (reset when a
  new PC is created and in `teardown()`); a second failure surfaces
  `'Connection lost — the call has ended.'` exactly as before.
- The `'answer'` signaling case now also accepts the re-answer while `'in-call'`
  (previously only `'outgoing'`), without re-patching phase or restarting the ticker.
- Untouched: the 30 s no-answer timeout + single missed-call log (`handleNoAnswer` fires only
  in `'outgoing'`, before any PC exists), calllog write rules, teardown, busy/reject/end paths.

## Verification

- `npx tsc --noEmit` — zero errors in `src/` (only the pre-existing quirks remain:
  Deno-function modules, `vite.artifact.config.ts`, one scripts/ type nit — same as before).
- `npm run build` — clean, 1.18 s; main chunk 960.88 kB raw / 264.29 kB gzip
  (~+1.7 kB vs the design-pass baseline — the restart logic only).
- `scripts/sanity-auth.ts` — ALL SANITY CHECKS PASSED.
- `scripts/sanity-time.ts` — 20 passed, 0 failed.
- No call-specific test file exists in `scripts/`; nothing outside `useCall.ts`
  references the changed connection-state behavior.

## Honest limits

- The sandbox cannot do UDP/WebRTC media, so in-call audio/video was **not machine-proven
  here**. The fix is the standard remedy for the confirmed cross-NAT symptom, but the real
  proof still requires Maruf's two-device retest on the published site.
- The Open Relay service is a free community relay: generous but shared/best-effort. If
  calls work but are laggy, or if the relay is ever down, a dedicated TURN server is the
  next step.
- Not published: the parent agent owns publishing; no GitHub or artifact changes were made.
