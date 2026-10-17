/**
 * auth.ts — Strict, centralized password verification for PawMatch.
 *
 * This replaces the old ad-hoc checks in AuthModal that accepted ANY
 * password (a global list of literal passwords plus
 * `passwordHash.includes('hash')`, which was always true for seed users).
 *
 * Schemes supported (strict equality only, no substring tricks):
 *   `${pw}_hash`        — current seed + registration scheme
 *   `${pw}_hashed_salt` — legacy registrations from earlier builds
 *
 * Note: this is a demo-grade scheme for a classroom project (not bcrypt).
 * Supabase Auth is the source of truth for `authManaged` (email-verified)
 * accounts registered after the OTP flow.
 */
import { AnyUser } from '../types';

/** Canonical password hash format written by register + password reset. */
export function hashPassword(pw: string): string {
  return `${pw}_hash`;
}

/**
 * Strict check: the stored hash must EXACTLY match one of the known
 * scheme outputs for the candidate password. Anything else fails,
 * including empty input and substring matches.
 */
export function verifyPassword(user: AnyUser, pw: string): boolean {
  if (!pw) return false;
  return (
    user.passwordHash === `${pw}_hash` ||
    user.passwordHash === `${pw}_hashed_salt`
  );
}

/** Cryptographically-decent 8-digit email verification code (matches live Supabase OTP length). */
export function makeEmailCode(): string {
  const n = Math.floor(Math.random() * 90000000) + 10000000;
  return String(n);
}

/**
 * True when the URL fragment is a Supabase password-recovery link
 * (e.g. `#access_token=...&type=recovery`). Pure — unit-testable.
 * The app opens the set-new-password screen when this is seen on boot.
 */
export function isRecoveryHashLink(hash: string): boolean {
  if (!hash) return false;
  const frag = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return new URLSearchParams(frag).get('type') === 'recovery';
  } catch {
    return false;
  }
}

/**
 * Which forgot-password route a user takes. Pure — unit-testable.
 * - 'email-link': email-verified (authManaged) accounts in live mode —
 *   Supabase emails a recovery link; the new password is set on the
 *   recovery screen (Supabase Auth) AND mirrored to the app store.
 * - 'security-answer': legacy/local accounts — the app store hash is the
 *   only credential, reset after the security answer.
 * - null: no such account.
 */
export type ForgotResetRoute = 'email-link' | 'security-answer';
export function forgotResetRoute(
  user: { authManaged?: boolean } | null | undefined,
  live: boolean
): ForgotResetRoute | null {
  if (!user) return null;
  return user.authManaged && live ? 'email-link' : 'security-answer';
}

/**
 * Legacy (security-answer) reset patch: canonical new hash + lockout
 * cleared. Pure — unit-testable. The caller writes the SAME object to the
 * local user list and the public.users mirror row so both stay in sync.
 */
export function legacyPasswordResetPatch<T extends AnyUser>(
  user: T,
  newPassword: string
): T {
  return {
    ...user,
    passwordHash: hashPassword(newPassword),
    failedLoginAttempts: 0,
    isLocked: false,
  };
}

/** Very light password-strength meter (0-4) for the register form. */
export function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Very weak', 'Weak', 'Okay', 'Strong', 'Very strong'];
  return { score, label: labels[score] };
}
