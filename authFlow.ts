/**
 * authFlow.ts — Supabase Auth integration for PawMatch account flows.
 *
 * - Registration in LIVE mode uses Supabase Auth's email confirmation:
 *   signUp() sends a confirmation email (the dashboard Confirm-signup
 *   template includes {{ .Token }}, an 8-digit code), and verifyOtp with
 *   type 'signup' proves the user owns the address — real anti-bot proof.
 * - authManaged accounts (created via this flow) keep Supabase Auth as the
 *   password source of truth; login also checks Auth.
 * - In LOCAL (fallback) mode there is no mail server, so callers fall back
 *   to an honestly-labeled demo code shown on screen.
 *
 * The public.users profile row mirrors scripts/seed-live.ts column mapping
 * (base columns + profile_json extras). emailVerified/authManaged travel in
 * profile_json so no schema migration is needed.
 */
import { supabase, isSupabaseEnabled } from './supabaseClient';
import type { AnyUser } from '../types';

function mustClient() {
  if (!supabase) throw new Error('Supabase client not configured (local mode).');
  return supabase;
}

export function isLiveAuth(): boolean {
  return isSupabaseEnabled;
}

/* ------------------------------------------------------------------ */
/* Honest error classification for auth flows                         */
/* ------------------------------------------------------------------ */

/**
 * Turn a raw Auth error into an honest user-facing message.
 * - Email-send failures (SMTP rejected, HTTP 500 "Error sending
 *   confirmation email") => wait-and-retry wording, NOT "check your
 *   connection" (the connection was fine).
 * - Genuine network failures (fetch throws, AuthRetryableFetchError with a
 *   network-style message, offline) => connection wording, plus guidance
 *   that ad-blockers / browser shields can block the request (try Chrome
 *   or a different network).
 * - Other Auth errors => the error's own message when it is user-safe and
 *   specific (e.g. "User already registered" => guided to Log In),
 *   otherwise a generic retry wording.
 */
export function describeAuthError(err: unknown, action: 'send' | 'resend' = 'send'): string {
  const raw =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);
  const lower = (raw || '').toLowerCase();
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: unknown }).name)
      : '';
  const status =
    err && typeof err === 'object' && 'status' in err
      ? (err as { status: unknown }).status
      : undefined;
  const verb = action === 'send' ? 'send the verification email' : 'resend the verification code';

  // 1. Server-side email-send failure (e.g. SMTP rejected credentials ->
  //    Auth HTTP 500 "Error sending confirmation email").
  if (
    /error sending confirmation email/i.test(lower) ||
    /confirmation email/i.test(lower) ||
    /sending email/i.test(lower) ||
    status === 500
  ) {
    return "We couldn't send the verification email right now. Please wait a few minutes and try again.";
  }

  // 2. Genuine network failure.
  if (
    err instanceof TypeError ||
    /retryable/i.test(name) ||
    /failed to fetch|network|offline|enotfound|econn|timed out|load failed/i.test(lower)
  ) {
    return 'Could not reach the verification service. Check your connection and try again — ad-blockers or browser shields can block this request, so try Chrome or a different network.';
  }

  // 3. Already-registered guidance.
  if (/already registered|user already exists|email exists/i.test(lower)) {
    return 'This email is already registered — please log in instead.';
  }

  // 3b. User-safe, specific Auth messages (e.g. invalid email / weak password).
  const TECHNICAL =
    /https?:|\btoken\b|uuid|stack trace|database|function |schema|constraint|\bjwt\b|\bsql\b|internal error|error code/i;
  const trimmed = (raw || '').trim();
  if (trimmed && trimmed.length <= 160 && !TECHNICAL.test(lower)) {
    return trimmed;
  }

  // Fallback: honest but non-technical.
  return `We couldn't ${verb}. Please try again in a few minutes.`;
}

/* ------------------------------------------------------------------ */
/* Network retry for registration calls                               */
/* ------------------------------------------------------------------ */

/**
 * Run fn, retrying only on NETWORK-class failures (the fetch never
 * completed — e.g. the device lost its connection mid-request).
 *
 * Network-class = a thrown TypeError, a message matching the usual
 * fetch/network wording, or an AuthRetryableFetchError with NO meaningful
 * HTTP status (status undefined or 0).
 *
 * Any error WITH an HTTP status (400/422/429/500 — including "Error
 * sending confirmation email" and rate limits) is rethrown IMMEDIATELY
 * with no retry: the server answered, so retrying blindly would be
 * wrong. After `attempts` total tries, the last error is rethrown.
 */
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 1500
): Promise<T> {
  const NETWORK_MESSAGE = /failed to fetch|network|fetch failed|load failed/i;

  const isNetworkClass = (err: unknown): boolean => {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? (err as { status: unknown }).status
        : undefined;
    // A server answer (any real HTTP status) means "do not retry".
    if (typeof status === 'number' && status > 0) return false;
    if (err instanceof TypeError) return true;
    const name =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name: unknown }).name)
        : '';
    if (/retryable/i.test(name)) return true;
    const msg =
      err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : '';
    return NETWORK_MESSAGE.test(msg);
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isNetworkClass(err)) throw err;
      if (i < attempts - 1) {
        // Back off a little more each time: ~1.2s, then ~2.5s.
        await sleep(Math.round(delayMs * (i === 0 ? 0.8 : 1.7)));
      }
    }
  }
  throw lastError;
}

/** Send the Supabase confirmation email. Throws with a friendly message. */
export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { data, error } = await withNetworkRetry(() =>
    mustClient().auth.signUp({ email, password })
  );
  if (error) throw error;
  // If identities list is empty, the address is already registered in Auth.
  if (data.user && (data.user.identities?.length ?? 1) === 0) {
    throw new Error('This email is already registered in our auth system.');
  }
}

/** Verify the emailed verification code from the confirmation email. */
export async function verifySignupCode(email: string, token: string): Promise<void> {
  const { error } = await withNetworkRetry(() =>
    mustClient().auth.verifyOtp({
      email,
      token: token.trim(),
      type: 'signup',
    })
  );
  if (error) throw error;
}

/** Resend the confirmation code (cooldown handled by the caller UI). */
export async function resendSignupCode(email: string): Promise<void> {
  const { error } = await withNetworkRetry(() =>
    mustClient().auth.resend({ type: 'signup', email })
  );
  if (error) throw error;
}

/**
 * Check an authManaged user's password against Supabase Auth (source of
 * truth). The Auth session is signed out afterward so the app keeps its own
 * session state in currentUser.
 */
export async function authPasswordCheck(email: string, password: string): Promise<void> {
  const client = mustClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await client.auth.signOut().catch(() => undefined);
}

/** For authManaged accounts that forgot their password: Supabase emails a reset link. */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await mustClient().auth.resetPasswordForEmail(email);
  if (error) throw error;
}

/**
 * Complete a password reset from the emailed recovery link. Clicking the
 * link establishes a short-lived recovery session in the browser; this
 * call swaps the password on the Supabase Auth identity through it.
 * The caller must ALSO update the public.users mirror hash (the app's
 * local/login store) so both stores agree — otherwise login with the new
 * password fails in one of them.
 * Throws when there is no valid recovery session (bad/expired link).
 */
export async function updateAuthPassword(newPassword: string): Promise<void> {
  const { error } = await mustClient().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Email of the currently-authenticated Auth user (the recovery session). */
export async function getAuthUserEmail(): Promise<string | null> {
  const { data, error } = await mustClient().auth.getUser();
  if (error) return null;
  return data.user?.email ?? null;
}

/** End the Auth session (after login checks, and after a password recovery). */
export async function signOutAuth(): Promise<void> {
  await mustClient().auth.signOut().catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* public.users <-> AnyUser mapping (mirrors scripts/seed-live.ts)    */
/* ------------------------------------------------------------------ */

const BASE_USER_KEYS = new Set([
  'id', 'name', 'email', 'phone', 'passwordHash', 'role', 'location',
  'isActive', 'failedLoginAttempts', 'isLocked', 'securityQuestion', 'securityAnswer',
  'emailVerified', 'authManaged', 'avatarUrl',
]);

/** Map an app user to a public.users insert row. */
export function userRowForDb(u: AnyUser): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(u)) if (!BASE_USER_KEYS.has(k)) extras[k] = v;
  extras.emailVerified = u.emailVerified ?? true;
  extras.authManaged = u.authManaged ?? false;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? null,
    password_hash: u.passwordHash,
    role: u.role,
    area: u.location?.area ?? null,
    lat: u.location?.lat ?? null,
    lon: u.location?.lon ?? null,
    is_active: u.isActive,
    failed_login_attempts: u.failedLoginAttempts ?? 0,
    is_locked: u.isLocked ?? false,
    security_question: u.securityQuestion ?? null,
    security_answer: u.securityAnswer ?? null,
    profile_json: extras,
  };
}

/** Map a public.users row back to an app user. */
export function userFromDbRow(r: Record<string, unknown>): AnyUser {
  const extras = (r.profile_json ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    phone: String(r.phone ?? ''),
    passwordHash: String(r.password_hash ?? ''),
    location: {
      area: String(r.area ?? ''),
      lat: Number(r.lat ?? 23.8103),
      lon: Number(r.lon ?? 90.4125),
    },
    role: (r.role as AnyUser['role']) ?? 'adopter',
    isActive: Boolean(r.is_active ?? true),
    avatarUrl:
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    failedLoginAttempts: Number(r.failed_login_attempts ?? 0),
    isLocked: Boolean(r.is_locked ?? false),
    securityQuestion: r.security_question ? String(r.security_question) : undefined,
    securityAnswer: r.security_answer ? String(r.security_answer) : undefined,
    emailVerified:
      typeof extras.emailVerified === 'boolean' ? extras.emailVerified : true,
    authManaged:
      typeof extras.authManaged === 'boolean' ? extras.authManaged : false,
    ...extras,
  } as AnyUser;
}

/** Look up an app user in the shared DB by email (cross-device login). */
export async function fetchUserByEmail(email: string): Promise<AnyUser | null> {
  const { data, error } = await mustClient()
    .from('users')
    .select('*')
    .ilike('email', email.trim())
    .maybeSingle();
  if (error) throw error;
  return data ? userFromDbRow(data as Record<string, unknown>) : null;
}

/** Persist patch fields on a public.users row (used for lockout on cross-device logins). */
export async function updateUserRow(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await mustClient().from('users').update(patch).eq('id', id);
  if (error) throw error;
}

/** Persist a newly registered profile row into public.users. */
export async function insertUserProfile(u: AnyUser): Promise<void> {
  const { error } = await mustClient().from('users').insert(userRowForDb(u));
  if (error) throw error;
}
