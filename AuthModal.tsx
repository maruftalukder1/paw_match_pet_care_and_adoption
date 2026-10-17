import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X, Eye, EyeOff, Lock, Mail, User, ShieldAlert, CheckCircle2, HelpCircle,
  PawPrint, MailCheck, RefreshCw, ArrowLeft, ShieldCheck, Loader2,
} from 'lucide-react';
import { AnyUser, UserRole } from '../types';
import { verifyPassword, hashPassword, makeEmailCode, passwordStrength, forgotResetRoute, legacyPasswordResetPatch } from '../utils/auth';
import {
  isLiveAuth, signUpWithEmail, verifySignupCode, resendSignupCode, describeAuthError,
  authPasswordCheck, sendPasswordResetEmail, fetchUserByEmail,
  insertUserProfile, updateUserRow, updateAuthPassword, getAuthUserEmail, signOutAuth,
} from '../lib/authFlow';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: AnyUser) => void;
  onRegister: (newUser: AnyUser) => void;
  /** Persist security changes (failed attempts, lock, password reset) to the user record. */
  onUpdateUser: (user: AnyUser) => void;
  users: AnyUser[];
  /** Which tab to open on (default 'login'). Bump openKey to force a fresh jump. */
  initialMode?: AuthMode;
  openKey?: number;
}

/** Exported so the App can open the modal straight into a specific step. */
export type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'recovery';

type Mode = AuthMode;

interface VerifyContext {
  email: string;
  password: string;
  pendingUser: AnyUser;
  /** LOCAL mode only: the demo code shown on screen (no mail server). */
  demoCode?: string;
  /** Set when an Auth identity already existed and we just need verification. */
  existingAuth?: boolean;
}

const RESEND_COOLDOWN_S = 30;

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen, onClose, onLogin, onRegister, onUpdateUser, users,
  initialMode = 'login', openKey = 0,
}) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(''); // login tab only
  const [password, setPassword] = useState(''); // login tab only
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Register tab fields — SEPARATE state so login autofill/demo fills never leak across tabs.
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const reduceMotion = useReducedMotion();

  // Register fields
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('adopter');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [secAnswer, setSecAnswer] = useState('');

  // Verify step
  const [code, setCode] = useState('');
  const [verifyCtx, setVerifyCtx] = useState<VerifyContext | null>(null);
  const [resendLeft, setResendLeft] = useState(0);

  // Forgot password — two steps: (1) email lookup decides the route,
  // (2a) email-verified accounts get a Supabase reset link, (2b) legacy
  // accounts answer their security question and set a password directly.
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<'email' | 'answer'>('email');
  const [forgotUser, setForgotUser] = useState<AnyUser | null>(null);
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Recovery screen (arrived via the emailed reset link)
  const [recoveryPw, setRecoveryPw] = useState('');
  const [recoveryPw2, setRecoveryPw2] = useState('');

  // States
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  /** Which step the current banner belongs to — banners never render on another tab. */
  const [msgMode, setMsgMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const live = isLiveAuth();
  const timers = useRef<number[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  useEffect(() => {
    if (resendLeft <= 0) return;
    const t = window.setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendLeft]);

  // Open straight into a requested step (e.g. 'recovery' when the user
  // arrived via a password-reset link). openKey forces the jump even if
  // the modal was already open on another step.
  useEffect(() => {
    if (isOpen && initialMode !== 'login') {
      setMode(initialMode);
      setErrorMsg('');
      setSuccessMsg('');
      setMsgMode(null);
      if (initialMode === 'forgot') {
        setForgotStep('email');
        setForgotUser(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, openKey]);

  if (!isOpen) return null;

  const fail = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg('');
    setMsgMode(mode);
    setErrorKey((k) => k + 1);
    setBusy(false);
  };

  /** Show a success banner pinned to a specific step. */
  const ok = (msg: string, forMode: Mode = mode) => {
    setSuccessMsg(msg);
    setErrorMsg('');
    setMsgMode(forMode);
  };

  /** Switch steps and clear any per-step banners. */
  const goMode = (m: Mode) => {
    setMode(m);
    setErrorMsg('');
    setSuccessMsg('');
    setMsgMode(null);
    if (m === 'forgot') {
      setForgotStep('email');
      setForgotUser(null);
    }
  };

  const findLocalUser = (input: string): AnyUser | undefined => {
    const inputLower = input.trim().toLowerCase();
    const isAdminInput = inputLower === 'admin' || inputLower === 'admin@pawmatch.com';
    return users.find((u) => {
      if (isAdminInput && u.role === 'admin') return true;
      return (
        u.email.toLowerCase() === inputLower ||
        u.name.toLowerCase() === inputLower ||
        u.id.toLowerCase() === inputLower
      );
    });
  };

  /** Persist lockout counters both locally and (live) on the shared DB row. */
  const bumpAttempts = async (target: AnyUser, count: number) => {
    const updated: AnyUser = {
      ...target,
      failedLoginAttempts: count,
      isLocked: count >= 3 ? true : target.isLocked,
    };
    onUpdateUser(updated);
    if (live) {
      await updateUserRow(target.id, {
        failed_login_attempts: count,
        is_locked: updated.isLocked,
      }).catch(() => undefined);
    }
    return updated;
  };

  const clearAttempts = async (target: AnyUser) => {
    const cleared: AnyUser = { ...target, failedLoginAttempts: 0 };
    onUpdateUser(cleared);
    if (live) {
      await updateUserRow(target.id, { failed_login_attempts: 0 }).catch(() => undefined);
    }
    return cleared;
  };

  const finishLogin = (user: AnyUser, mergeIntoList: boolean) => {
    setSuccessMsg(`Welcome back, ${user.name.split(' ')[0]}!`);
    setMsgMode('login');
    const t = window.setTimeout(() => {
      if (mergeIntoList) onRegister(user);
      else onLogin(user);
      onClose();
    }, 750);
    timers.current.push(t);
  };

  /* ------------------------------- LOGIN ------------------------------- */

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setMsgMode(null);
    setBusy(true);

    let target = findLocalUser(email);
    let fromDb = false;

    // Cross-device login in live mode: look the user up in the shared DB.
    if (!target && live) {
      try {
        const dbUser = await fetchUserByEmail(email);
        if (dbUser) {
          target = dbUser;
          fromDb = true;
        }
      } catch {
        /* fall through to "not found" */
      }
    }

    if (!target) {
      fail('User account not found. Check the email, or register a new account.');
      return;
    }

    const priorAttempts = target.failedLoginAttempts ?? 0;
    if (target.isLocked || priorAttempts >= 3) {
      fail('Account locked after 3 failed attempts. Use Forgot Password or contact Admin.');
      return;
    }

    // Unverified accounts must complete the email-code step first.
    if (target.emailVerified === false) {
      setBusy(false);
      setErrorMsg('');
      startVerifyForExisting(target);
      return;
    }

    // STRICT password verification — no global literals, no substring tricks.
    let ok = false;
    try {
      if (target.authManaged && live) {
        await authPasswordCheck(target.email, password);
        ok = true;
      } else {
        ok = verifyPassword(target, password);
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      const updated = await bumpAttempts(target, priorAttempts + 1);
      fail(
        updated.isLocked
          ? 'Security Alert: account locked after 3 failed login attempts.'
          : `Incorrect password. Attempt ${priorAttempts + 1} of 3 before account lock.`
      );
      return;
    }

    const cleared = await clearAttempts(target);
    setBusy(false);
    finishLogin(cleared, fromDb);
  };

  /* ----------------------------- REGISTER ------------------------------ */

  const buildPendingUser = (): AnyUser => ({
    id: `u-${role}-${Date.now()}`,
    name,
    email: regEmail.trim(),
    phone: phone || '+880-1700-000000',
    passwordHash: hashPassword(regPassword),
    location: { area, lat: 23.8103, lon: 90.4125 },
    role,
    isActive: true,
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    securityQuestion: 'What is your security token or favorite pet name?',
    securityAnswer: secAnswer || 'pawmatch',
    emailVerified: false,
    authManaged: live,
    failedLoginAttempts: 0,
    isLocked: false,
  });

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name || !regEmail || !regPassword) {
      fail('Please fill in all mandatory fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      fail('Please enter a valid email address — we send your verification code there.');
      return;
    }
    if (regPassword.length < 4) {
      fail('Password must be at least 4 characters.');
      return;
    }

    const dupLocal = users.some((u) => u.email.toLowerCase() === regEmail.trim().toLowerCase());
    if (dupLocal) {
      fail('An account with this email already exists — please log in instead.');
      return;
    }

    const pendingUser = buildPendingUser();

    if (live) {
      setBusy(true);
      try {
        await signUpWithEmail(regEmail.trim(), regPassword);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setBusy(false);
        if (/already registered/i.test(msg)) {
          // An Auth identity exists but no app account: jump to verification.
          setVerifyCtx({
            email: regEmail.trim(),
            password: regPassword,
            pendingUser,
            existingAuth: true,
          });
          setCode('');
          setMode('verify');
          setResendLeft(RESEND_COOLDOWN_S);
          ok('We found an unverified signup for this email — enter the code we just sent.', 'verify');
          try {
            await resendSignupCode(regEmail.trim());
          } catch {
            /* ignore resend errors here */
          }
          return;
        }
        fail(describeAuthError(err, 'send'));
        return;
      }
      setBusy(false);
      setVerifyCtx({ email: regEmail.trim(), password: regPassword, pendingUser });
      setCode('');
      setMode('verify');
      setResendLeft(RESEND_COOLDOWN_S);
      ok(`Verification code sent to ${regEmail.trim()} — check your inbox (and spam).`, 'verify');
      return;
    }

    // LOCAL (offline) mode: no mail server — honestly-labeled demo code.
    const demoCode = makeEmailCode();
    setVerifyCtx({ email: regEmail.trim(), password: regPassword, pendingUser, demoCode });
    setCode('');
    setMode('verify');
    ok('Demo mode is offline, so email cannot be sent.', 'verify');
  };

  /** Begin the verify step for an existing unverified account (login gating). */
  const startVerifyForExisting = (target: AnyUser) => {
    setVerifyCtx({
      email: target.email,
      password: '',
      pendingUser: target,
      existingAuth: target.authManaged === true,
    });
    setCode('');
    setMode('verify');
    setErrorMsg('');
    setSuccessMsg(
      live
        ? 'This account is not email-verified yet. Enter the code from your email, or resend it below.'
        : 'This account is not email-verified yet.'
    );
    setMsgMode('verify');
    if (live && target.authManaged) {
      resendSignupCode(target.email).catch(() => undefined);
      setResendLeft(RESEND_COOLDOWN_S);
    }
  };

  const finalizeRegistration = async () => {
    const ctx = verifyCtx;
    if (!ctx) return;
    const user: AnyUser = { ...ctx.pendingUser, emailVerified: true };
    if (live) {
      try {
        await insertUserProfile(user);
      } catch {
        /* row may already exist from an earlier attempt — continue */
      }
    }
    setBusy(false);
    setSuccessMsg(`Email verified — welcome to PawMatch, ${user.name.split(' ')[0]}!`);
    setMsgMode('verify');
    const t = window.setTimeout(() => {
      onRegister(user);
      onClose();
    }, 900);
    timers.current.push(t);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ctx = verifyCtx;
    if (!ctx) return;
    if (code.trim().length < 4) {
      fail('Please enter the verification code from your email.');
      return;
    }
    setErrorMsg('');
    setBusy(true);
    if (live) {
      try {
        await verifySignupCode(ctx.email, code.trim());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setBusy(false);
        if (/expired/i.test(msg)) {
          fail('That code has expired — press Resend code for a fresh one.');
        } else {
          fail('Incorrect code. Double-check the email and try again.');
        }
        return;
      }
      await finalizeRegistration();
      return;
    }
    // LOCAL mode: compare against the honestly-labeled demo code.
    if (code.trim() === ctx.demoCode) {
      await finalizeRegistration();
    } else {
      fail('Incorrect demo code. Use the code shown above.');
    }
  };

  const handleResend = async () => {
    const ctx = verifyCtx;
    if (!ctx || resendLeft > 0) return;
    setErrorMsg('');
    if (live) {
      setBusy(true);
      try {
        await resendSignupCode(ctx.email);
        setSuccessMsg(`Fresh code sent to ${ctx.email}.`);
        setMsgMode('verify');
      } catch (err: unknown) {
        fail(describeAuthError(err, 'resend'));
        return;
      } finally {
        setBusy(false);
      }
    } else {
      const demoCode = makeEmailCode();
      setVerifyCtx({ ...ctx, demoCode });
      setSuccessMsg('New demo code generated below.');
      setMsgMode('verify');
    }
    setResendLeft(RESEND_COOLDOWN_S);
  };

  /** Fallback for the free-plan template gap: confirm via the email LINK instead. */
  const handleLinkConfirm = async () => {
    const ctx = verifyCtx;
    if (!ctx || !live) return;
    // Login-gating path doesn't know the user's password — the link click
    // itself is the proof; send them back to log in normally.
    if (!ctx.password) {
      setMode('login');
      setSuccessMsg('If you clicked the confirmation link, your email is now verified — please log in.');
      setMsgMode('login');
      return;
    }
    setErrorMsg('');
    setBusy(true);
    try {
      // If the email link was clicked, the account is confirmed and Auth
      // login now succeeds — that is our proof.
      await authPasswordCheck(ctx.email, ctx.password);
      await finalizeRegistration();
    } catch (err: unknown) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : String(err);
      if (/not confirmed|confirm/i.test(msg)) {
        fail('The link has not been clicked yet — open your email, click the confirmation link, then press this button again.');
      } else {
        fail(`Could not confirm yet: ${msg}`);
      }
    }
  };

  /* ------------------------------- FORGOT ------------------------------ */

  /** Step 1: email lookup — the route depends on the account type. */
  const handleForgotEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusy(true);
    let user = users.find((u) => u.email.toLowerCase() === forgotEmail.trim().toLowerCase());
    if (!user && live) {
      try {
        user = (await fetchUserByEmail(forgotEmail)) ?? undefined;
      } catch {
        /* ignore */
      }
    }
    setBusy(false);
    if (!user) {
      fail('Email address not registered.');
      return;
    }
    setForgotUser(user);
    const route = forgotResetRoute(user, live);
    if (route === 'email-link') {
      // Email-verified accounts reset through Supabase's emailed link.
      // Clicking the link returns here and opens the set-new-password screen.
      setBusy(true);
      try {
        await sendPasswordResetEmail(user.email);
        setBusy(false);
        setSuccessMsg(
          'We emailed you a password reset link — open it, and this app will let you set a new password.'
        );
        setMsgMode('forgot');
      } catch (err: unknown) {
        fail(`Could not send reset email: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    // Legacy / local accounts: the app store is the only credential —
    // prove identity with the security answer, then set a password directly.
    setForgotStep('answer');
  };

  /** Step 2 (legacy route): security answer + new password. */
  const handleForgotAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = forgotUser;
    if (!user) {
      fail('Please enter your account email first.');
      return;
    }
    setErrorMsg('');
    const expected = (user.securityAnswer || 'pawmatch').trim().toLowerCase();
    if (forgotAnswer.trim().toLowerCase() !== expected) {
      fail('Security answer did not match. Please try again.');
      return;
    }
    if (newPassword.length < 4) {
      fail('Password must be at least 4 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      fail('The new passwords do not match.');
      return;
    }
    // Same patch goes to the local user list AND the public.users mirror
    // row so both stores agree: the new password works, the old one fails.
    const updated = legacyPasswordResetPatch(user, newPassword);
    onUpdateUser(updated);
    if (live) {
      await updateUserRow(user.id, {
        password_hash: updated.passwordHash,
        failed_login_attempts: 0,
        is_locked: false,
      }).catch(() => undefined);
    }
    setSuccessMsg('Identity verified! Your password has been reset. You may now log in.');
    setMsgMode('forgot');
    const t = window.setTimeout(() => {
      setMode('login');
      setEmail(forgotEmail);
      setSuccessMsg('');
      setMsgMode(null);
    }, 1400);
    timers.current.push(t);
  };

  /* ------------------------------ RECOVERY ----------------------------- */

  /**
   * The emailed reset link landed back here (Supabase established a
   * short-lived recovery session from the link). Swap the password on the
   * Auth identity AND mirror the new hash into the app store + clear any
   * lockout, so login with the new password works everywhere and the old
   * one fails everywhere. Then end the recovery session.
   */
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (recoveryPw.length < 4) {
      fail('Password must be at least 4 characters.');
      return;
    }
    if (recoveryPw !== recoveryPw2) {
      fail('The new passwords do not match.');
      return;
    }
    setBusy(true);
    let recoveredEmail: string | null = null;
    try {
      await updateAuthPassword(recoveryPw);
      recoveredEmail = await getAuthUserEmail();
      if (recoveredEmail) {
        const mirror = users.find(
          (u) => u.email.toLowerCase() === (recoveredEmail as string).toLowerCase()
        );
        if (mirror) {
          const updated: AnyUser = {
            ...mirror,
            passwordHash: hashPassword(recoveryPw),
            failedLoginAttempts: 0,
            isLocked: false,
          };
          onUpdateUser(updated);
          await updateUserRow(mirror.id, {
            password_hash: updated.passwordHash,
            failed_login_attempts: 0,
            is_locked: false,
          }).catch(() => undefined);
        }
      }
      await signOutAuth();
      // Clear the recovery fragment so a reload doesn't reopen this screen.
      try {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search
        );
      } catch {
        /* ignore */
      }
      setBusy(false);
      setSuccessMsg('Your password has been updated — log in with your new password.');
      setMsgMode('recovery');
      const t = window.setTimeout(() => {
        setMode('login');
        if (recoveredEmail) setEmail(recoveredEmail);
        setSuccessMsg('');
        setMsgMode(null);
      }, 1600);
      timers.current.push(t);
    } catch {
      fail(
        'This reset link is invalid or has expired. Please request a new one from “Forgot Password?”.'
      );
    }
  };

  /* --------------------------------- UI --------------------------------- */

  const titles: Record<Mode, string> = {
    login: 'Welcome Back!',
    register: 'Join PawMatch',
    verify: 'Check Your Email',
    forgot: 'Reset Password',
    recovery: 'Set a New Password',
  };
  const subtitles: Record<Mode, string> = {
    login: live ? 'Live · sign in to your synced account.' : 'Log in to your local PawMatch demo.',
    register: live
      ? 'Create your account — we will email you a verification code.'
      : 'Create your account in this offline demo.',
    verify: 'Enter the code from your email to prove you are a real human, not a bot.',
    forgot: 'Enter your account email — we will route you to the right reset method.',
    recovery: 'Choose a new password for your account. This link works once — afterwards, log in normally.',
  };

  const strength = passwordStrength(regPassword);
  const strengthColors = ['bg-slate-200', 'bg-rose-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-600'];

  return (
    // z-[70]: always above the pet-detail sheet (z-50, later in the DOM) —
    // the login modal must never open behind another modal.
    <div className="fixed inset-0 z-[70] flex overflow-y-auto p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        className="m-auto bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 relative max-h-[94dvh] flex flex-col"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Animated header band */}
        <div className="relative shrink-0 p-5 pb-4 bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 text-white text-center overflow-hidden">
          <motion.div
            className="absolute -top-8 -left-8 w-40 h-40 rounded-full bg-emerald-400/20 blur-2xl"
            animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
            transition={{ repeat: Infinity, duration: 9, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -bottom-10 -right-6 w-44 h-44 rounded-full bg-teal-300/20 blur-2xl"
            animate={{ x: [0, -24, 0], y: [0, -16, 0] }}
            transition={{ repeat: Infinity, duration: 11, ease: 'easeInOut' }}
          />
          {/* Drifting paw prints — clearly visible continuous loops */}
          {[
            { left: '10%', top: '16%', size: 'w-6 h-6', delay: 0, dur: 5 },
            { left: '84%', top: '26%', size: 'w-4 h-4', delay: 1.2, dur: 6 },
            { left: '70%', top: '68%', size: 'w-7 h-7', delay: 2.1, dur: 5.5 },
            { left: '20%', top: '72%', size: 'w-4 h-4', delay: 0.6, dur: 4.6 },
          ].map((p, i) => (
            <motion.span
              key={i}
              className="absolute text-white/30"
              style={{ left: p.left, top: p.top }}
              animate={reduceMotion ? undefined : { y: [0, -16, 0], x: [0, 10, 0], rotate: [0, 18, -18, 0], opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: p.dur, delay: p.delay, ease: 'easeInOut' }}
            >
              <PawPrint className={p.size} />
            </motion.span>
          ))}
          <motion.div
            animate={reduceMotion ? undefined : { y: [0, -10, 0], rotate: [0, -12, 12, 0] }}
            transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
            className="relative w-16 h-16 mx-auto rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center mb-2 shadow-xl ring-1 ring-white/30"
          >
            <motion.span
              animate={reduceMotion ? undefined : { scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
              className="inline-flex"
            >
              <PawPrint className="w-8 h-8 text-white" />
            </motion.span>
          </motion.div>
          <h2 className="relative text-lg font-extrabold tracking-tight">{titles[mode]}</h2>
          <p className="relative text-xs text-emerald-100 mt-1 max-w-xs mx-auto">{subtitles[mode]}</p>
          <div className="relative mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/15">
            {live ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                <span>Live · email verification on</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                <span>Demo mode · offline</span>
              </>
            )}
          </div>
        </div>

        {/* Tab controls (login/register only) */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex shrink-0 border-b border-slate-200 bg-slate-50 relative">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => goMode(m)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors relative ${
                  mode === m ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {m === 'login' ? 'Log In' : 'Create Account'}
                {mode === m && (
                  <motion.span
                    layoutId="auth-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"
                  />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable body — header + tabs stay pinned, the primary button always lives inside this scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-5">
          <AnimatePresence>
            {msgMode === mode && errorMsg && (
              <motion.div
                key={`err-${errorKey}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: [0, -9, 9, -5, 5, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {msgMode === mode && successMsg && (
              <motion.div
                key="ok"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2"
              >
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                </motion.span>
                <span>{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {/* ------------------------------ LOGIN ------------------------------ */}
              {mode === 'login' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email or Username</label>
                    <div className="relative group">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 group-focus-within:text-emerald-600 transition-colors" />
                      <input
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email or username"
                        required
                        className="w-full text-xs py-2.5 pl-9 pr-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition-shadow"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">Password</label>
                      <button
                        type="button"
                        onClick={() => goMode('forgot')}
                        className="text-[11px] font-semibold text-emerald-600 hover:underline"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative group">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 group-focus-within:text-emerald-600 transition-colors" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your password"
                        required
                        className="w-full text-xs py-2.5 pl-9 pr-10 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition-shadow"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Remember me</span>
                    </label>
                    <span className="text-[11px] text-slate-400">Lock after 3 failed tries</span>
                  </div>

                  <motion.button
                    type="submit"
                    disabled={busy}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    Log In
                  </motion.button>

                  <div className="pt-2 border-t border-slate-100 text-center">
                    <p className="text-[11px] text-slate-500">
                      New here?{' '}
                      <button
                        type="button"
                        onClick={() => goMode('register')}
                        className="font-bold text-emerald-700 hover:underline"
                      >
                        Create an account
                      </button>
                    </p>
                  </div>
                </form>
              )}

              {/* ----------------------------- REGISTER ----------------------------- */}
              {mode === 'register' && (
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">I want to register as:</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="adopter">Adopter (Looking to adopt a companion)</option>
                      <option value="owner">Pet Owner (Rehoming or managing pets)</option>
                      <option value="shelter">Rescue Shelter / Organization</option>
                      <option value="vet">Licensed Veterinarian</option>
                      <option value="service_provider">Service Provider (Groomer/Walker/Trainer)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                    <div className="relative group">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 group-focus-within:text-emerald-600 transition-colors" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your full name"
                        required
                        className="w-full text-xs py-2 pl-9 pr-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                      <div className="relative group">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 group-focus-within:text-emerald-600 transition-colors" />
                        <input
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          autoComplete="email"
                          className="w-full text-xs py-2 pl-9 pr-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+880 17..."
                        className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                      <div className="relative group">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 group-focus-within:text-emerald-600 transition-colors" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Create a password"
                          required
                          autoComplete="new-password"
                          className="w-full text-xs py-2 pl-9 pr-9 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {regPassword.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <div className="flex gap-1 flex-1">
                            {[0, 1, 2, 3].map((i) => (
                              <motion.span
                                key={i}
                                initial={false}
                                animate={{ scaleX: strength.score > i ? 1 : 0.6, opacity: strength.score > i ? 1 : 0.45 }}
                                className={`h-1 flex-1 rounded-full origin-left ${strengthColors[strength.score > i ? strength.score : 0]}`}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500">{strength.label}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Area / City</label>
                      <input
                        type="text"
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        placeholder="Your area or city"
                        className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Security Question: Your first pet or hometown?
                    </label>
                    <input
                      type="text"
                      value={secAnswer}
                      onChange={(e) => setSecAnswer(e.target.value)}
                      placeholder="Security answer for recovery"
                      required
                      className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={busy}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-sm transition-colors mt-2 flex items-center justify-center gap-2"
                  >
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    <MailCheck className="w-4 h-4" />
                    Continue — send my verification code
                  </motion.button>
                  <p className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    {live
                      ? 'A verification code will be emailed to you to prove you are human, not a bot.'
                      : 'Demo mode is offline — the code will be shown on the next screen.'}
                  </p>
                </form>
              )}

              {/* ------------------------------ VERIFY ------------------------------ */}
              {mode === 'verify' && (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <motion.div
                      animate={reduceMotion ? undefined : { y: [0, -12, 0], rotate: [0, -12, 12, 0] }}
                      transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                      className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-md"
                    >
                      <MailCheck className="w-7 h-7" />
                    </motion.div>
                  </div>
                  <p className="text-xs text-slate-600 text-center">
                    We sent a <strong>verification code</strong> to{' '}
                    <strong className="text-slate-900">{verifyCtx?.email}</strong>.
                    <br />Paste it below to verify you are a real human, not a bot.
                  </p>

                  {!live && verifyCtx?.demoCode && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
                      <p className="text-[10px] text-amber-700 mb-1">
                        Demo mode is offline, so no email was sent. Your code is:
                      </p>
                      <p className="text-2xl font-mono font-extrabold tracking-[0.35em] text-amber-900">
                        {verifyCtx.demoCode}
                      </p>
                    </div>
                  )}

                  <form onSubmit={handleVerifySubmit} className="space-y-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="8-digit code"
                      required
                      className="w-full text-center text-2xl font-mono font-extrabold tracking-[0.35em] py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none transition-all"
                    />
                    <motion.button
                      type="submit"
                      disabled={busy || code.trim().length < 4}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                      Verify my account
                    </motion.button>
                  </form>

                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => goMode('register')}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 font-semibold"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back
                    </button>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendLeft > 0 || busy}
                      className="inline-flex items-center gap-1.5 text-emerald-700 font-bold disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                      {resendLeft > 0 ? `Resend code (${resendLeft}s)` : 'Resend code'}
                    </button>
                  </div>

                  {live && (
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <p className="text-[11px] text-slate-500 text-center">
                        No code in the email? Click the <strong>confirmation link</strong> in the
                        same email first, then finish here:
                      </p>
                      <button
                        type="button"
                        onClick={handleLinkConfirm}
                        disabled={busy}
                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                      >
                        I&apos;ve clicked the link — finish my registration
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------- FORGOT ------------------------------- */}
              {mode === 'forgot' && forgotStep === 'email' && (
                <form onSubmit={handleForgotEmailSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Your Account Email</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Enter your registered email"
                      required
                      className="w-full text-xs py-2.5 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => goMode('login')}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <motion.button
                      type="submit"
                      disabled={busy}
                      whileTap={{ scale: 0.97 }}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                      Continue
                    </motion.button>
                  </div>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1.5 justify-center">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Email-verified accounts get a secure reset link. Other accounts use their security answer.
                  </p>
                </form>
              )}

              {/* ---------------------- FORGOT: legacy step 2 ---------------------- */}
              {mode === 'forgot' && forgotStep === 'answer' && (
                <form onSubmit={handleForgotAnswerSubmit} className="space-y-4">
                  <p className="text-xs text-slate-600">
                    Resetting password for <strong className="text-slate-900">{forgotUser?.email}</strong>.
                    Answer your security question to prove it is you.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Security Answer (Hometown or first pet)
                    </label>
                    <input
                      type="text"
                      value={forgotAnswer}
                      onChange={(e) => setForgotAnswer(e.target.value)}
                      placeholder="Your security answer"
                      required
                      className="w-full text-xs py-2.5 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Create a new password"
                      required
                      autoComplete="new-password"
                      className="w-full text-xs py-2.5 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    {newPassword.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <div className="flex gap-1 flex-1">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className={`h-1 flex-1 rounded-full ${
                                passwordStrength(newPassword).score > i
                                  ? strengthColors[passwordStrength(newPassword).score]
                                  : 'bg-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">
                          {passwordStrength(newPassword).label}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Repeat the new password"
                      required
                      autoComplete="new-password"
                      className="w-full text-xs py-2.5 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotStep('email');
                        setErrorMsg('');
                        setSuccessMsg('');
                        setMsgMode(null);
                      }}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                    >
                      Back
                    </button>
                    <motion.button
                      type="submit"
                      disabled={busy}
                      whileTap={{ scale: 0.97 }}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                      Reset Password
                    </motion.button>
                  </div>
                </form>
              )}

              {/* ------------------------------ RECOVERY ------------------------------ */}
              {mode === 'recovery' && (
                <form onSubmit={handleRecoverySubmit} className="space-y-4">
                  <div className="flex justify-center">
                    <motion.div
                      animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
                      transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                      className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-md"
                    >
                      <ShieldCheck className="w-7 h-7" />
                    </motion.div>
                  </div>
                  <p className="text-xs text-slate-600 text-center">
                    You arrived from a password reset link. Choose your new password below —
                    afterwards, log in normally with it.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={recoveryPw}
                      onChange={(e) => setRecoveryPw(e.target.value)}
                      placeholder="Create a new password"
                      required
                      autoComplete="new-password"
                      className="w-full text-xs py-2.5 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    {recoveryPw.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <div className="flex gap-1 flex-1">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className={`h-1 flex-1 rounded-full ${
                                passwordStrength(recoveryPw).score > i
                                  ? strengthColors[passwordStrength(recoveryPw).score]
                                  : 'bg-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">
                          {passwordStrength(recoveryPw).label}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={recoveryPw2}
                      onChange={(e) => setRecoveryPw2(e.target.value)}
                      placeholder="Repeat the new password"
                      required
                      autoComplete="new-password"
                      className="w-full text-xs py-2.5 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={busy}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    Set New Password
                  </motion.button>
                  <p className="text-[10px] text-slate-400 text-center">
                    Link not working? Request a fresh one from{' '}
                    <button
                      type="button"
                      onClick={() => goMode('forgot')}
                      className="font-bold text-emerald-700 hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </p>
                </form>
              )}
            </motion.div>
          </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
