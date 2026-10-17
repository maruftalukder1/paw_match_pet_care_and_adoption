/* AUTHFIX2 e2e (playwright-core, keyless local build, fresh profiles).
 * Defect 2 — no first-visit auto-login: boot logged out, browsing works,
 *   account actions open the login modal; sticky logout survives reload.
 * Defect 3 — PetManager edit: replace a seed pet's photo -> persists across
 *   reload; remove it -> paw fallback everywhere + persists; add again.
 * Defect 1 — forgot flow (legacy path): security answer -> new password ->
 *   login works with the NEW password, fails with the OLD one.
 * Defect 1 — recovery screen: fake recovery hash shows the set-new-password
 *   UI, and submitting shows an honest invalid/expired error (not a dead end).
 */
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:4173';
const IMG = '/tmp/authfix2-pet.png';
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

const petPhotoUrl = async (page) => {
  return page.evaluate(() => {
    try {
      const pets = JSON.parse(localStorage.getItem('pawmatch_pets') || '[]');
      const bruno = pets.find((p) => p.name === 'Bruno');
      return bruno ? bruno.photoUrl : null;
    } catch {
      return 'ERR';
    }
  });
};

const brunoMyPetsCard = (pg) =>
  pg.getByText('My Pets').first().locator('xpath=ancestor::section[1]')
    .locator('div.overflow-hidden', { has: pg.getByRole('heading', { name: 'Bruno', exact: true }) });

const openDrawer = async (page) => {
  await page.locator('header').getByTitle('Menu').click();
  await page.waitForTimeout(400);
};

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));

  /* ---------------- Defect 2: first visit starts logged out ---------------- */
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('D2 boots with live keys (Live badge)', await page.getByText('Live', { exact: true }).first().isVisible().catch(() => false));
  const loggedOutHeader =
    (await page.locator('header').getByRole('button', { name: 'Log In', exact: true }).count()) >= 1 &&
    (await page.locator('header').getByRole('button', { name: 'Sign Up', exact: true }).count()) >= 1;
  check('D2 first visit: NOT auto-logged in (Log In / Sign Up shown)', loggedOutHeader);
  const chipCount = await page.locator('header').getByRole('button', { name: /Jaann|Hasan/ }).count();
  check('D2 first visit: no demo user chip', chipCount === 0);

  // Browsing works logged out.
  await openDrawer(page);
  await page.locator('header').getByRole('button', { name: 'Find Pets', exact: true }).click();
  await page.waitForTimeout(600);
  check('D2 logged-out browsing: pet listings render', (await page.getByText('Bruno').count()) >= 1);
  const brunoListingCard = (pg) =>
    pg.locator('div.group', { has: pg.getByRole('heading', { name: 'Bruno', exact: true }) });
  await brunoListingCard(page).getByRole('button', { name: 'View Details' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Apply for Adoption' }).click();
  await page.waitForTimeout(500);
  check('D2 Apply for Adoption (logged out) opens the login modal',
    await page.getByText('Welcome Back!').isVisible().catch(() => false));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(300);
  // The guard closed the pet detail sheet; reopen it for the next check.
  await brunoListingCard(page).getByRole('button', { name: 'View Details' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Message Shelter' }).click();
  await page.waitForTimeout(500);
  check('D2 Message Shelter (logged out) opens the login modal',
    await page.getByText('Welcome Back!').isVisible().catch(() => false));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Footer "Contact PawMatch Admin" while logged out -> login modal.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Contact PawMatch Admin' }).click();
  await page.waitForTimeout(500);
  check('D2 footer Contact Admin (logged out) opens the login modal',
    await page.getByText('Welcome Back!').isVisible().catch(() => false));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(300);

  /* ---------------- Defect 1 (legacy): forgot -> new password ---------------- */
  await page.locator('header').getByRole('button', { name: 'Log In', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Forgot Password?' }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Enter your registered email').fill('jaann@pawmatch.com');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForTimeout(600);
  check('D1 forgot step 2 (security answer) appears for a seed account',
    await page.getByPlaceholder('Your security answer').isVisible().catch(() => false));
  await page.getByPlaceholder('Your security answer').fill('Dhaka');
  await page.getByPlaceholder('Create a new password').fill('NewPass9!');
  await page.getByPlaceholder('Repeat the new password').fill('NewPass9!');
  await page.getByRole('button', { name: 'Reset Password', exact: true }).click();
  await page.waitForTimeout(700);
  check('D1 legacy reset success shown',
    await page.getByText(/Your password has been reset/).isVisible().catch(() => false));
  await page.waitForTimeout(1600); // auto-switch back to the login tab
  await page.getByPlaceholder('Email or username').fill('jaann@pawmatch.com');
  await page.getByPlaceholder('Your password').fill('NewPass9!');
  await page.getByRole('button', { name: 'Log In', exact: true }).last().click();
  await page.waitForTimeout(1400);
  check('D1 login with the NEW password works',
    (await page.locator('header').getByRole('button', { name: /Jaann/ }).count()) >= 1);

  // Sticky logout (Defect 2).
  await page.locator('header').getByRole('button', { name: /Jaann/ }).click();
  await page.waitForTimeout(400);
  await page.getByText('Log Out', { exact: true }).click();
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('D2 explicit logout sticks across reload',
    (await page.locator('header').getByRole('button', { name: 'Log In', exact: true }).count()) >= 1);

  // Old password must now fail.
  await page.locator('header').getByRole('button', { name: 'Log In', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Email or username').fill('jaann@pawmatch.com');
  await page.getByPlaceholder('Your password').fill('user123');
  await page.getByRole('button', { name: 'Log In', exact: true }).last().click();
  await page.waitForTimeout(700);
  check('D1 login with the OLD password is rejected',
    await page.getByText(/Attempt 1 of 3/).isVisible().catch(() => false));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(300);

  /* ---------------- Defect 1: recovery screen (fake link) ---------------- */
  const page2 = await ctx.newPage();
  page2.on('pageerror', (e) => errors.push('p2: ' + String(e).slice(0, 140)));
  await page2.goto(BASE + '/#access_token=fake123&type=recovery', { waitUntil: 'networkidle' });
  await page2.waitForTimeout(900);
  check('D1 recovery screen appears for a recovery link',
    await page2.getByText('Set a New Password').isVisible().catch(() => false));
  await page2.getByPlaceholder('Create a new password').fill('Another9!');
  await page2.getByPlaceholder('Repeat the new password').fill('Another9!');
  await page2.getByRole('button', { name: 'Set New Password', exact: true }).click();
  await page2.waitForTimeout(1200);
  check('D1 fake/expired link shows an honest error, not a dead end',
    await page2.getByText(/invalid or has expired/).isVisible().catch(() => false));
  await page2.close();

  /* ---------------- Defect 3: edit pet photo ---------------- */
  await page.locator('header').getByRole('button', { name: 'Log In', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Email or username').fill('info@shelterdhaka.org');
  await page.getByPlaceholder('Your password').fill('shelter123');
  await page.getByRole('button', { name: 'Log In', exact: true }).last().click();
  await page.waitForTimeout(1400);
  check('D3 shelter login works',
    (await page.locator('header').getByRole('button', { name: /Shelter/ }).count()) >= 1);

  await openDrawer(page);
  await page.locator('header').getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.waitForTimeout(700);
  check('D3 Dashboard My Pets renders',
    await page.getByText('My Pets').first().isVisible().catch(() => false));

  const before = await petPhotoUrl(page);
  check('D3 Bruno starts with a remote photo', !!before && before.startsWith('https://'), (before || '').slice(0, 40));

  // Open the edit form for Bruno.
  await brunoMyPetsCard(page).getByRole('button', { name: 'Edit' }).click();
  await page.waitForTimeout(500);
  check('D3 edit form opens', await page.getByText('Edit Bruno').isVisible().catch(() => false));
  const preview = page.locator('img[alt="Photo preview"]');
  check('D3 edit form shows the current photo', (await preview.count()) === 1);

  // Replace via upload.
  await page.locator('form input[type="file"]').setInputFiles(IMG);
  await page.waitForTimeout(1200);
  const newSrc = await preview.getAttribute('src').catch(() => null);
  check('D3 replacement photo previews as a data URL', !!newSrc && newSrc.startsWith('data:image/jpeg'), (newSrc || '').slice(0, 24));
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.waitForTimeout(700);
  const afterReplace = await petPhotoUrl(page);
  check('D3 replaced photo persists in state', !!afterReplace && afterReplace.startsWith('data:image/jpeg'));

  // Visible in Find Pets + detail modal.
  await openDrawer(page);
  await page.locator('header').getByRole('button', { name: 'Find Pets', exact: true }).click();
  await page.waitForTimeout(700);
  const listingImgs = await page.locator('img[alt="Bruno"]').all();
  let listingOk = false;
  for (const im of listingImgs) {
    const s = await im.getAttribute('src');
    if (s && s.startsWith('data:image/jpeg')) { listingOk = true; break; }
  }
  check('D3 replaced photo shows in Find Pets', listingOk);
  await brunoListingCard(page).getByRole('button', { name: 'View Details' }).click();
  await page.waitForTimeout(700);
  const detailImgs = await page.locator('img[alt*="Bruno"]').all();
  let detailOk = false;
  for (const im of detailImgs) {
    const s = await im.getAttribute('src');
    if (s && s.startsWith('data:image/jpeg')) { detailOk = true; break; }
  }
  check('D3 replaced photo shows in the detail modal', detailOk);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Reload: the replacement survives.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const afterReload = await petPhotoUrl(page);
  check('D3 replaced photo persists across reload', !!afterReload && afterReload.startsWith('data:image/jpeg'));

  // Remove the photo -> honest paw fallback everywhere.
  await openDrawer(page);
  await page.locator('header').getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.waitForTimeout(700);
  await brunoMyPetsCard(page).getByRole('button', { name: 'Edit' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await page.waitForTimeout(400);
  check('D3 photo removed from the form preview', (await page.locator('img[alt="Photo preview"]').count()) === 0);
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.waitForTimeout(700);
  const afterRemove = await petPhotoUrl(page);
  check('D3 removed photo persists as empty (no stock URL resurrected)', afterRemove === '');
  const fallbackImgs = await page.locator('img[alt="Bruno"]').all();
  let fallbackOk = false;
  for (const im of fallbackImgs) {
    const s = await im.getAttribute('src');
    if (s && s.includes('data:image/svg+xml')) { fallbackOk = true; break; }
  }
  check('D3 paw fallback renders in My Pets', fallbackOk);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('D3 removal persists across reload', (await petPhotoUrl(page)) === '');

  // Add a photo again to the photo-less pet.
  await openDrawer(page);
  await page.locator('header').getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.waitForTimeout(700);
  await brunoMyPetsCard(page).getByRole('button', { name: 'Edit' }).click();
  await page.waitForTimeout(500);
  await page.locator('form input[type="file"]').setInputFiles(IMG);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.waitForTimeout(700);
  const afterReadd = await petPhotoUrl(page);
  check('D3 a new photo can be added after removal', !!afterReadd && afterReadd.startsWith('data:image/jpeg'));

  check('zero JS page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
  await browser.close();
  console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} E2E CHECKS FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
