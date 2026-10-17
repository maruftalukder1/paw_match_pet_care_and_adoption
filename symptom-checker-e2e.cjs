/* Symptom Checker e2e (playwright-core, fresh profile).
 * Served: current dist/ on http://localhost:4173 (keys embedded; live mode
 * falls back to local in this sandbox, which is fine — the checker is local).
 * 1. Boot logged-out -> Pet Care & Vets -> checker hero visible.
 * 2. Species lists differ (bird vs cat).
 * 3. Maruf's example (Cat + Loss of Appetite + 24h + Moderate) -> guidance,
 *    vet recommendation, booking modal opens, disclaimer present.
 * 4. History gains the entry -> reload -> persists.
 * 5. Cat urinary emergency (Mild, <12h) -> pulsing emergency banner.
 * 6. Delete history entry -> gone after reload.
 * 7. PetCare regressions: appointments + vaccinations sections render.
 */
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:4173';
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

async function openDrawer(page) {
  await page.locator('header').getByTitle('Menu').click();
  await page.waitForTimeout(500);
}
async function navTo(page, label) {
  await openDrawer(page);
  const drawer = page.locator('header');
  await drawer.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('boots logged-out (Log In visible)', await page.locator('header').getByRole('button', { name: 'Log In', exact: true }).count() >= 1);

  /* ---- 1. open Pet Care & Vets ---- */
  await navTo(page, 'Pet Care & Vets');
  await page.waitForTimeout(600);
  check('checker hero visible', await page.getByText('Pet Symptom Checker', { exact: true }).first().isVisible());
  check('guidance-only subtitle visible', await page.getByText(/general guidance only/i).first().isVisible());
  await page.getByTestId('symptom-checker').scrollIntoViewIfNeeded();

  /* ---- 2. species lists differ ---- */
  await page.getByTestId('symptom-checker').getByRole('button', { name: 'bird', exact: true }).click();
  await page.waitForTimeout(400);
  check('bird list has fluffed feathers', await page.getByTestId('symptom-option-fluffed-feathers').count() === 1);
  check('bird list has NO cat urinary item', await page.getByTestId('symptom-option-urinary-strain').count() === 0);
  await page.getByTestId('symptom-checker').getByRole('button', { name: 'cat', exact: true }).click();
  await page.waitForTimeout(400);
  check('cat list has urinary item', await page.getByTestId('symptom-option-urinary-strain').count() === 1);

  /* ---- 3. Maruf's example ---- */
  await page.getByTestId('symptom-option-appetite-loss').click();
  await page.getByTestId('symptom-duration-h24').click();
  await page.getByTestId('symptom-severity-moderate').click();
  await page.getByTestId('symptom-check-button').click();
  await page.waitForTimeout(700);
  check('result renders', await page.getByTestId('symptom-result').count() === 1);
  check('urgency = Monitor at home', await page.getByText('Monitor at home').first().isVisible());
  check('guidance wording present', await page.getByText(/can have several causes/i).first().isVisible());
  check('disclaimer on result', await page.getByText(/is not a substitute for a veterinarian/i).first().isVisible());
  check('vet recommendation book button', await page.getByTestId('symptom-book-appointment').isVisible());

  /* booking modal opens */
  await page.getByTestId('symptom-book-appointment').click();
  await page.waitForTimeout(600);
  check('booking modal opens from checker', await page.getByRole('heading', { name: 'Book Vet Appointment' }).isVisible());
  await page.locator('div.fixed.inset-0').first().locator('button').first().click(); // modal X
  await page.waitForTimeout(400);

  /* ---- 4. history persists ---- */
  await page.getByTestId('symptom-history-toggle').click();
  await page.waitForTimeout(400);
  check('history has 1 entry', await page.locator('[data-testid^="symptom-history-item-"]').count() === 1);
  const firstId = await page.locator('[data-testid^="symptom-history-item-"]').first().getAttribute('data-testid');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await navTo(page, 'Pet Care & Vets');
  await page.getByTestId('symptom-checker').scrollIntoViewIfNeeded();
  await page.getByTestId('symptom-history-toggle').click();
  await page.waitForTimeout(400);
  check('history survives reload', await page.locator('[data-testid^="symptom-history-item-"]').count() === 1);

  /* ---- 5. emergency banner (form is fresh after reload) ---- */
  await page.getByTestId('symptom-checker').getByRole('button', { name: 'cat', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('symptom-option-urinary-strain').click();
  await page.getByTestId('symptom-duration-lt12h').click();
  await page.getByTestId('symptom-severity-mild').click();
  await page.getByTestId('symptom-check-button').click();
  await page.waitForTimeout(700);
  check('EMERGENCY urgency shown', await page.getByText('EMERGENCY — seek care immediately').first().isVisible());
  check('emergency banner has pulsing class', await page.getByTestId('symptom-emergency-banner').evaluate((el) => el.classList.contains('symptom-emergency-banner')));
  check('emergency copy present', await page.getByText(/contact a veterinarian or an emergency clinic immediately/i).first().isVisible());

  /* ---- 6. delete history entry (panel is already open from step 4) ---- */
  check('history now has 2 entries', await page.locator('[data-testid^="symptom-history-item-"]').count() === 2);
  const delBtn = page.locator('[data-testid^="symptom-history-delete-"]').first();
  await delBtn.click();
  await page.waitForTimeout(400);
  check('entry deleted (1 left)', await page.locator('[data-testid^="symptom-history-item-"]').count() === 1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await navTo(page, 'Pet Care & Vets');
  await page.getByTestId('symptom-checker').scrollIntoViewIfNeeded();
  await page.getByTestId('symptom-history-toggle').click();
  await page.waitForTimeout(400);
  check('deletion survives reload', await page.locator('[data-testid^="symptom-history-item-"]').count() === 1);

  /* ---- 7. PetCare regressions ---- */
  await page.getByTestId('symptom-checker').scrollIntoViewIfNeeded();
  check('appointments section renders', await page.getByText('Upcoming Vet Appointments').isVisible());
  check('vaccinations section renders', await page.getByText('Vaccination Schedule & Reminders').isVisible());
  check('care guides render', await page.getByText('Pet Care Guides & Healthcare').isVisible());

  /* ---- 8. logged-in: pick own pet (shelter owns Bruno) ---- */
  await page.locator('header').getByRole('button', { name: 'Log In', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Email or username').fill('info@shelterdhaka.org');
  await page.getByPlaceholder('Your password').fill('shelter123');
  await page.getByRole('button', { name: 'Log In', exact: true }).last().click();
  await page.waitForTimeout(1500);
  await navTo(page, 'Pet Care & Vets');
  await page.getByTestId('symptom-checker').scrollIntoViewIfNeeded();
  const brunoChip = page.getByTestId('symptom-checker').getByRole('button', { name: /Bruno/ });
  check('own pet chip visible for logged-in user', await brunoChip.count() >= 1);
  await brunoChip.first().click();
  await page.waitForTimeout(400);
  await page.getByTestId('symptom-option-vomiting').click();
  await page.getByTestId('symptom-option-diarrhea').click();
  await page.getByTestId('symptom-option-lethargy').click();
  await page.getByTestId('symptom-duration-h24').click();
  await page.getByTestId('symptom-severity-moderate').click();
  await page.getByTestId('symptom-check-button').click();
  await page.waitForTimeout(700);
  check('own-pet check → vet today', await page.getByText('See a vet today').first().isVisible());
  check('result addressed to Bruno', await page.getByText(/Result for Bruno/).isVisible());

  check('zero JS page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n${failures === 0 ? 'SYMPTOM-CHECKER E2E: ALL PASSED' : failures + ' FAILURES'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('E2E CRASH:', e.message);
  process.exit(1);
});
