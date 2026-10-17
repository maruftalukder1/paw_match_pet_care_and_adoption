/**
 * sanity-auth.ts — verifies the strict password scheme (src/utils/auth.ts)
 * against every seed user.
 *
 * Run: npx tsx scripts/sanity-auth.ts
 * Exit 1 on any failure.
 */
import { SEED_USERS } from '../src/data/seedData';
import {
  verifyPassword, hashPassword, passwordStrength,
  isRecoveryHashLink, forgotResetRoute, legacyPasswordResetPatch,
} from '../src/utils/auth';

let failures = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  } else {
    console.log(`ok: ${name}`);
  }
}

const WRONG = ['wrongpassword123', 'password', 'letmein', 'Admin@123', 'admin123', 'qwerty', ''];

for (const u of SEED_USERS as any[]) {
  // Derive the expected demo password from the stored hash scheme.
  let correctPw: string | null = null;
  if (u.passwordHash === 'admin_hash') correctPw = 'admin';
  else if (typeof u.passwordHash === 'string' && u.passwordHash.endsWith('_hash')) {
    correctPw = u.passwordHash.slice(0, -'_hash'.length);
  }
  if (!correctPw) {
    check(`${u.email}: resolvable demo password`, false);
    continue;
  }
  check(`${u.email}: correct password accepted`, verifyPassword(u, correctPw));
  for (const w of WRONG) {
    // 'password'/'Admin@123' were globally accepted before the fix — must fail now.
    // ('Admin@123' !== 'admin' anyway, but assert explicitly.)
    check(`${u.email}: wrong password "${w || '(empty)'}" rejected`, !verifyPassword(u, w));
  }
}

// Legacy registrations ('_hashed_salt') keep working with their own password.
const legacy = { passwordHash: 'secret_hashed_salt' } as any;
check('legacy _hashed_salt: own password accepted', verifyPassword(legacy, 'secret'));
check('legacy _hashed_salt: other password rejected', !verifyPassword(legacy, 'other'));

// New registrations use the strict ${pw}_hash scheme.
check('hashPassword scheme', hashPassword('abc') === 'abc_hash');
check(
  'new registration round-trip',
  verifyPassword({ passwordHash: hashPassword('MyNewPass9') } as any, 'MyNewPass9') &&
    !verifyPassword({ passwordHash: hashPassword('MyNewPass9') } as any, 'MyNewPass')
);

// Substring tricks must not pass.
const trick = { passwordHash: 'xx_admin_hash_yy' } as any;
check('substring hash rejected', !verifyPassword(trick, 'admin'));

// Strength meter sanity.
check('strength: weak', passwordStrength('abc').score <= 1);
check('strength: strong', passwordStrength('MyNewPass9!').score >= 3);

/* ---------------- AUTHFIX2: password-recovery + reset consistency ---------------- */

// Recovery-link detection (the emailed link lands with #...&type=recovery).
check('recovery link: detected', isRecoveryHashLink('#access_token=abc123&type=recovery'));
check('recovery link: param order irrelevant', isRecoveryHashLink('#type=recovery&access_token=abc123'));
check('recovery link: empty hash rejected', !isRecoveryHashLink(''));
check('recovery link: non-recovery hash rejected', !isRecoveryHashLink('#access_token=abc123'));
check('recovery link: error hash rejected', !isRecoveryHashLink('#error=access_denied&error_code=otp_expired'));

// Forgot-password routing per account type.
check('route: authManaged+live -> email-link', forgotResetRoute({ authManaged: true }, true) === 'email-link');
check('route: authManaged+local -> security-answer', forgotResetRoute({ authManaged: true }, false) === 'security-answer');
check('route: legacy+live -> security-answer', forgotResetRoute({ authManaged: false }, true) === 'security-answer');
check('route: missing account -> null', forgotResetRoute(null, true) === null);

// Legacy (security-answer) reset: new hash written, lockout cleared, and the
// SAME object content goes to the local list and the public.users mirror row.
const legacyUser = {
  id: 'u-test-1', email: 't@example.com', name: 'T',
  passwordHash: hashPassword('OldPass1'),
  failedLoginAttempts: 2, isLocked: true,
} as any;
const reset = legacyPasswordResetPatch(legacyUser, 'BrandNew9');
check('legacy reset: hash updated', reset.passwordHash === hashPassword('BrandNew9'));
check('legacy reset: attempts cleared', reset.failedLoginAttempts === 0);
check('legacy reset: lock cleared', reset.isLocked === false);
check('legacy reset: id/email preserved', reset.id === 'u-test-1' && reset.email === 't@example.com');
// Store consistency: new password verifies, old password fails.
check('legacy reset: new password verifies', verifyPassword(reset, 'BrandNew9'));
check('legacy reset: old password rejected', !verifyPassword(reset, 'OldPass1'));

console.log(failures === 0 ? '\nALL SANITY CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
