# ERRMSG_FIX.md — honest auth error messages (2026-10-13)

## Problem
Live diagnosis: `supabase.auth.signUp` failed with HTTP 500 "Error sending confirmation
email" (Gmail SMTP rejected credentials). The register banner told Maruf
"Could not reach the verification service. Check your connection and try again." —
misleading, because the connection was fine; the email send failed server-side.

## Fix (error-message honesty only — no auth logic/flow/layout/animation changed)
- New exported helper `describeAuthError(err, action)` in `src/lib/authFlow.ts`
  classifies raw Auth errors:
  1. **Email-send failure** ("Error sending confirmation email", other
     confirmation/sending-email wording, or `status === 500`):
     "We couldn't send the verification email right now. Please wait a few minutes
     and try again."
  2. **Genuine network failure** (`TypeError`/fetch throw, `AuthRetryableFetchError`,
     "Failed to fetch"/network/offline/enotfound/econn/timed-out):
     "Could not reach the verification service. Check your connection and try again."
  3. **Already-registered** wording: "This email is already registered — please log in
     instead."
  4. **Other Auth errors**: the error's own message when it is user-safe and specific
     (<=160 chars, no technical markers like URLs/JWT/SQL/stack traces);
     otherwise a non-technical generic:
     "We couldn't send the verification email / resend the verification code.
     Please try again in a few minutes."
- `src/components/AuthModal.tsx`: register catch now calls
  `fail(describeAuthError(err, 'send'))` (the pre-existing `/already registered/i`
  route to the verify step is untouched and runs first); resend catch now calls
  `fail(describeAuthError(err, 'resend'))`. Nothing else changed.

## Tests
- `describeAuthError` probed directly: 500/email-send → message 1 ✅; TypeError +
  AuthRetryableFetchError → message 2 ✅; "User already registered" → log-in
  guidance ✅; "Password should be at least 6 characters." → shown as-is ✅;
  technical SQL message → non-technical generic (send and resend variants) ✅.
- `scripts/sanity-auth.ts` → ALL SANITY CHECKS PASSED ✅
- `npm run build` ✅ · `npx tsc --noEmit` ✅ 0 errors

- 2026-10-13 (source sync): this Supabase project emails 8-digit OTPs (proven live), so the verify input cap was raised from slice(0,6) to slice(0,8), all user-facing "6-digit" copy is now digit-neutral ("verification code"), comments updated, and the local demo code generator makeEmailCode() now produces 8 digits. sanity-auth + build + tsc all pass.

- 2026-10-14 (registration network retry): a real user on a flaky connection hit the network error on Create Account while Supabase logs showed NO request arriving — the fetch died before reaching the server. supabase-js throws AuthRetryableFetchError for this. Added `withNetworkRetry(fn, attempts = 3, delayMs = 1500)` in `src/lib/authFlow.ts`: retries ONLY network-class failures (TypeError, /failed to fetch|network|fetch failed|load failed/i, or AuthRetryableFetchError with no real HTTP status — status undefined or 0) with backoff (~1.2s then ~2.5s). Any error WITH an HTTP status (400/422/429/500, including "Error sending confirmation email" and rate limits) is rethrown immediately, no retry. `signUpWithEmail` and `resendSignupCode` are wrapped; login paths (authPasswordCheck etc.) are unchanged; describeAuthError wording is untouched; the register form still preserves filled values on failure. Verified: build ✅, tsc 0 errors ✅, sanity-auth ALL PASSED ✅, and a 5-case tsx probe of the real function passed (TypeError x2→success resolves; status 500 and 429 called exactly once and rethrown immediately; statusless retryable retried 3x then rethrown; status 0 retried once then success).
