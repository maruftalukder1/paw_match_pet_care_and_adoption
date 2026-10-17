/* Design-pass sweep (playwright-core, fresh profile).
 * Served: current dist/ on http://127.0.0.1:4173 (local demo mode).
 * Views: Home (full page), Find Pets, Pet Details modal, Pet Care (checker),
 * Services, Lost & Found, Messages (logged in), Profile, Admin.
 * Per view × {desktop 1440, mobile 390}: full-page screenshot, zero overflow
 * (scrollWidth <= clientWidth), zero page errors, and key sections visible.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:4173';
const OUT = path.join(__dirname, '..', 'hidden_sweep_shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

async function openDrawer(page) {
  await page.locator('header').getByTitle('Menu').click();
  await page.waitForTimeout(500);
}
async function navTo(page, label, tag) {
  if (tag === 'm') {
    await openDrawer(page);
    await page.locator('header').getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(900);
    return;
  }
  // Desktop >=1440px shows the full nav bar; the hamburger is hidden.
  if (label === 'My Profile') {
    await page.locator('header').getByRole('button', { name: /Jaann/ }).first().click();
    await page.waitForTimeout(400);
    await page.getByText('My Profile', { exact: true }).click();
  } else if (label === 'Admin Governance Console') {
    await page.locator('header nav').getByRole('button', { name: 'Admin', exact: true }).click();
  } else {
    await page.locator('header nav').getByRole('button', { name: label, exact: true }).click();
  }
  await page.waitForTimeout(900);
}
/** Pets grid: skeleton is expected in live mode; wait for it to clear, then
 *  assert real cards render (a stuck skeleton is a genuine failure). */
async function waitForPetCards(page) {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[aria-label="Loading pets…"]').length === 0,
      { timeout: 20000 }
    );
  } catch (e) {
    return 'stuck';
  }
  const cards = await page.locator('button', { hasText: 'View Details' }).count();
  return cards >= 1 ? 'ok' : 'empty';
}
async function login(page, id, pw) {
  await page.locator('header').getByRole('button', { name: 'Log In', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Email or username').fill(id);
  await page.getByPlaceholder('Your password').fill(pw);
  await page.getByRole('button', { name: 'Log In', exact: true }).last().click();
  await page.waitForTimeout(1500);
}
async function logout(page) {
  await page.locator('header').getByRole('button', { name: /(Jaann|Admin|Maria)/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByText('Log Out', { exact: true }).click();
  await page.waitForTimeout(700);
}
async function viewChecks(page, label, tag, extraChecks = []) {
  await page.waitForTimeout(900);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label} zero overflow @${tag}`, overflow <= 0, `excess=${overflow}px`);
  await page.screenshot({ path: path.join(OUT, `${tag}-${label.replace(/\s+/g, '-').toLowerCase()}.png`), fullPage: true });
  for (const [name, fn] of extraChecks) {
    let ok = false;
    try { ok = await fn(); } catch (e) { ok = false; }
    check(`${label} ${name} @${tag}`, ok);
  }
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const viewports = [
    ['d', { width: 1440, height: 900 }],
    ['m', { width: 390, height: 844 }],
  ];

  for (const [tag, vp] of viewports) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    // Sandbox-network noise is environmental, not a defect: Unsplash images
    // and the Supabase live path cannot resolve through this sandbox's
    // tunnel (same exclusion documented in every prior audit).
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|Failed to fetch|wss:\/\/|supabase\.co|ERR_SSL_PROTOCOL_ERROR|subscribe error|Keeping local data/.test(t)) return;
      errors.push('console: ' + t.slice(0, 160));
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    /* ---------- Home ---------- */
    await viewChecks(page, 'home', tag, [
      ['hero headline visible', () => page.getByRole('heading', { name: /Find a Friend/ }).isVisible()],
      ['dual CTA visible', async () => (await page.getByRole('button', { name: 'Find Pets to Adopt' }).count()) === 1 && (await page.getByRole('button', { name: 'Try the AI Matchmaker' }).count()) === 1],
      ['stats band shows real count', () => page.getByText('Pets waiting for homes').isVisible()],
      ['how-it-works section', () => page.getByRole('heading', { name: 'How Adoption Works' }).isVisible()],
      ['happy tails section', () => page.getByRole('heading', { name: 'Happy Tails from the PawMatch Family' }).isVisible()],
      ['faq section', () => page.getByRole('heading', { name: 'Frequently Asked Questions' }).isVisible()],
      ['footer rendered', () => page.locator('footer').getByText(/CSE1290/).isVisible()],
    ]);

    /* ---------- Find Pets ---------- */
    await page.getByRole('button', { name: 'Find Pets to Adopt' }).first().click();
    await page.waitForTimeout(1200);
    const petGridState = await waitForPetCards(page);
    await viewChecks(page, 'find-pets', tag, [
      ['pet cards rendered (skeleton cleared)', async () => petGridState === 'ok'],
    ]);
    check(`find-pets grid state @${tag}`, petGridState !== 'stuck', petGridState);

    /* ---------- Pet Details modal ---------- */
    await page.locator('button', { hasText: 'View Details' }).first().click();
    await page.waitForTimeout(900);
    check('pet details modal opens', await page.getByRole('dialog').first().isVisible().catch(() => false));
    await page.screenshot({ path: path.join(OUT, `${tag}-pet-details.png`) });
    await page.getByRole('button', { name: 'Close pet details' }).first().click();
    await page.waitForTimeout(600);

    /* ---------- Pet Care & Vets (checker) ---------- */
    await navTo(page, 'Pet Care & Vets', tag);
    await viewChecks(page, 'pet-care', tag, [
      ['checker hero visible', () => page.getByTestId('symptom-checker').isVisible()],
      ['vaccination section visible', () => page.getByText(/Vaccination Schedule/i).first().isVisible()],
    ]);

    /* ---------- Services ---------- */
    await navTo(page, 'Services', tag);
    await viewChecks(page, 'services', tag, [
      ['service list renders', async () => (await page.getByRole('button', { name: /Book|Details/i }).count()) >= 1 || (await page.locator('main').textContent()).length > 500],
    ]);

    /* ---------- Lost & Found ---------- */
    await navTo(page, 'Lost & Found', tag);
    await viewChecks(page, 'lost-found', tag, [
      ['report cards or empty state', async () => ((await page.getByRole('button', { name: /View Details/ }).count()) >= 1) || ((await page.getByText('No Reports Here Yet').count()) >= 1)],
    ]);

    /* ---------- Messages (login as Jaann) ---------- */
    await login(page, 'jaann@pawmatch.com', 'user123');
    check('login as Jaann works', (await page.locator('header').getByRole('button', { name: /Jaann/ }).count()) >= 1);
    // The Messages entry point is the header icon (title="Messages") on every
    // viewport — the mobile drawer has no Messages row.
    await page.locator('header [title="Messages"]').click();
    await page.waitForTimeout(1200);
    await viewChecks(page, 'messages', tag, [
      ['chat list or empty state visible', async () => ((await page.getByTestId('chat-shell').count()) >= 1) || ((await page.getByText(/No active conversations/).count()) >= 1)],
    ]);

    /* ---------- Profile ---------- */
    await navTo(page, 'My Profile', tag);
    await viewChecks(page, 'profile', tag, [
      ['profile renders', async () => ((await page.locator('main').textContent())).length > 300],
    ]);

    /* ---------- Admin ---------- */
    await logout(page);
    await login(page, 'admin', 'admin');
    check('login as admin works', (await page.locator('header').getByRole('button', { name: /Admin/ }).count()) >= 1);
    await navTo(page, 'Admin Governance Console', tag);
    await viewChecks(page, 'admin', tag, [
      ['admin dashboard renders', async () => ((await page.locator('main').textContent())).length > 300],
    ]);

    check(`zero page/console errors @${tag}`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(failures === 0 ? 'SWEEP ALL PASS' : `SWEEP FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
