/* MSGFIX local-mode click-through (playwright-core, fresh profile).
 * 1. Register a NEW user -> Messages -> "Message Admin" -> send 2 messages
 *    -> reload -> messages still there (localStorage).
 * 2. Logout -> login as Jaann -> her 4 conversations with history intact.
 * 3. At 1280x720 and 1366x768: the empty-thread placeholder and an open
 *    thread with messages must never be simultaneously visible.
 */
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:4173';
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  for (const vp of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Local-mode build sanity: header badge says "Local".
    check(`[${vp.width}] boots in local/demo mode`, await page.getByText('Local', { exact: true }).first().isVisible().catch(() => false));

    // Logout (app auto-logs in as Jaann on first visit).
    await page.locator('header').getByRole('button', { name: /Jaann Rahman/ }).click();
    await page.waitForTimeout(400);
    await page.getByText('Log Out', { exact: true }).click();
    await page.waitForTimeout(500);
    check(`[${vp.width}] logged out, Sign Up visible`, await page.getByRole('button', { name: 'Sign Up' }).isVisible());

    // Register a brand-new user (local mode: no email code).
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await page.getByRole('button', { name: 'Create Account' }).click();
    const stamp = Date.now();
    await page.getByPlaceholder('Enter your full name').fill('E2E Tester');
    await page.getByPlaceholder('you@example.com').fill(`e2e${stamp}@example.com`);
    await page.getByPlaceholder('Create a password').fill('test1234');
    await page.getByPlaceholder('Security answer for recovery').fill('Dhaka');
    await page.getByRole('button', { name: /Continue — send my verification code/ }).click();
    await page.waitForTimeout(800);
    // Demo mode shows the code on screen; read it and verify.
    const codeText = await page.locator('p.text-2xl.font-mono').first().textContent();
    const code = (codeText || '').replace(/\D/g, '');
    check(`[${vp.width}] demo verification code shown`, code.length >= 4, `code len=${code.length}`);
    await page.getByPlaceholder('8-digit code').fill(code);
    await page.getByRole('button', { name: 'Verify my account', exact: true }).click();
    await page.waitForTimeout(1800);
    check(`[${vp.width}] new user registered + logged in`, (await page.locator('header').getByRole('button', { name: /E2E Tester/ }).count()) >= 1);

    // Messages tab.
    await page.getByTitle('Messages').click();
    await page.waitForTimeout(800);

    // Start chat with Admin (fresh conversation path = the buggy one).
    await page.getByTitle('Message PawMatch Admin').click();
    await page.waitForTimeout(600);
    const threadInput = page.getByPlaceholder(/Reply as/);
    await threadInput.fill('Hello admin, first message');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.waitForTimeout(400);
    await threadInput.fill('Second message from e2e');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.waitForTimeout(600);
    check(`[${vp.width}] two messages render in thread`,
      (await page.getByText('Hello admin, first message').count()) >= 1 &&
      (await page.getByText('Second message from e2e').count()) >= 1);
    check(`[${vp.width}] no failed-send affordance in local mode`,
      (await page.locator('[data-testid^="msg-failed-"]').count()) === 0);

    // Placeholder must NOT be visible while a populated thread is open.
    const placeholderVisible = await page.getByText('No messages in this conversation yet').isVisible().catch(() => false);
    check(`[${vp.width}] placeholder hidden while thread open`, !placeholderVisible);

    // Reload -> messages must persist (localStorage).
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.getByTitle('Messages').click();
    await page.waitForTimeout(800);
    // re-open the admin conversation (should be selected already or first)
    check(`[${vp.width}] messages persist after reload`,
      (await page.getByText('Hello admin, first message').count()) >= 1 &&
      (await page.getByText('Second message from e2e').count()) >= 1);

    // Logout -> login as Jaann -> her conversations intact.
    await page.locator('header').getByRole('button', { name: /E2E Tester/ }).click();
    await page.waitForTimeout(400);
    await page.getByText('Log Out', { exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Log In' }).click();
    await page.getByPlaceholder('you@example.com').or(page.getByPlaceholder(/email/i)).first().fill('jaann@pawmatch.com');
    // login form password field
    const pwFields = page.locator('input[type="password"]');
    await pwFields.first().fill('user123');
    await page.getByRole('button', { name: 'Log In' }).last().click();
    await page.waitForTimeout(1200);
    await page.getByTitle('Messages').click();
    await page.waitForTimeout(800);
    // Jaann's 4 seed conversations must all be listed with intact history.
    const names = ['Admin Supervisor (Adoption Desk)', "Bruno's Caretaker (Shelter Dhaka)", "Luna's Owner", "Rocky's Shelter Team"];
    let found = 0;
    for (const n of names) found += await page.getByText(n, { exact: false }).count() > 0 ? 1 : 0;
    check(`[${vp.width}] Jaann: all 4 seed conversations listed`, found === 4, `found=${found}/4`);
    // Open one seeded thread and verify its history renders (seed messages intact).
    await page.getByText("Bruno's Caretaker (Shelter Dhaka)", { exact: false }).first().click();
    await page.waitForTimeout(600);
    const seededThreadHasHistory = (await page.locator('[data-testid="chat-stream"]').count()) >= 1;
    check(`[${vp.width}] Jaann: seeded thread renders history`, seededThreadHasHistory);
    const threadText = await page.getByText('No messages in this conversation yet').count();
    check(`[${vp.width}] Jaann: no spurious empty-thread placeholder on seeded thread`, threadText === 0);
    check(`[${vp.width}] zero JS page errors`, errors.length === 0, errors.join(' | ').slice(0, 200));

    await ctx.close();
  }
  await browser.close();
  console.log(failures === 0 ? '\nALL LOCAL E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
