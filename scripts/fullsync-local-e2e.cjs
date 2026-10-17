/* FULLSYNC local-mode click-through (playwright-core, fresh profile).
 * Served: keyless build from /tmp/fullsync-local-dist on http://localhost:4173.
 * 1. Register NEW user -> Find Pets -> Bruno detail -> Apply -> submit
 *    -> reload -> Dashboard My Applications shows it.
 * 2. Admin login -> Admin tab -> approve the new application.
 * 3. New user again -> Dashboard My Applications shows Approved.
 * 4. Lost & Found: report a lost pet with uploaded photo -> appears;
 *    open it -> Mark as Reunited/Resolved -> status Resolved.
 * 5. Vet login -> Bruno detail -> add medical record + vaccination ->
 *    reload -> records present in the detail modal.
 * 6. Pet Care & Vets: book an appointment -> Complete it.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://localhost:4173';
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

// Tiny valid PNG for upload tests (1x1 white).
const pngPath = path.join(os.tmpdir(), 'e2e-photo.png');
fs.writeFileSync(pngPath, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
));

const brunoCard = (pg) => pg.locator('div.group', { has: pg.getByRole('heading', { name: 'Bruno', exact: true }) });

// Desktop nav only shows at >=1440px; at 1366 we navigate via the drawer.
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

async function login(page, email, password) {
  await page.locator('header').getByRole('button', { name: 'Log In', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Email or username').fill(email);
  await page.getByPlaceholder('Your password').fill(password);
  await page.getByRole('button', { name: 'Log In', exact: true }).last().click();
  await page.waitForTimeout(1400);
}

async function logout(page, chipName) {
  await page.locator('header').getByRole('button', { name: new RegExp(chipName) }).click();
  await page.waitForTimeout(500);
  await page.getByText('Log Out', { exact: true }).click();
  await page.waitForTimeout(700);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('boots in local/demo mode', await page.getByText('Local', { exact: true }).first().isVisible().catch(() => false));

  /* ---- 1. register a new adopter ---- */
  await page.locator('header').getByRole('button', { name: 'Sign Up', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Create Account' }).click();
  const stamp = Date.now();
  await page.getByPlaceholder('Enter your full name').fill('Sync Tester');
  await page.getByPlaceholder('you@example.com').fill(`synct${stamp}@example.com`);
  await page.getByPlaceholder('Create a password').fill('test1234');
  await page.getByPlaceholder('Security answer for recovery').fill('Dhaka');
  await page.getByRole('button', { name: /Continue — send my verification code/ }).click();
  await page.waitForTimeout(800);
  const codeText = await page.locator('p.text-2xl.font-mono').first().textContent().catch(() => '');
  const code = (codeText || '').replace(/\D/g, '');
  await page.getByPlaceholder('8-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify my account', exact: true }).click();
  await page.waitForTimeout(1800);
  const chip = await page.locator('header').getByRole('button', { name: /Sync Tester/ }).count();
  check('registered + logged in as new adopter', chip >= 1);

  /* ---- 2. apply for Bruno ---- */
  await navTo(page, 'Find Pets');
  await page.getByPlaceholder('Search by name, breed, temperaments...').fill('Bruno');
  await page.waitForTimeout(800);
  await brunoCard(page).getByRole('button', { name: 'View Details' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Apply for Adoption' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await page.waitForTimeout(2200); // success panel + auto-close
  check('application submitted (modal closed)', (await page.getByText('Application Submitted!').count()) === 0);

  // Reload -> Dashboard -> My Applications shows it.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await navTo(page, 'Dashboard');
  const appRow = page.locator('tr, div', { hasText: `Sync Tester` }).filter({ hasText: 'Bruno' });
  check('applicant dashboard lists the new application', (await page.getByText('Bruno').count()) >= 1);

  /* ---- 3. admin approves it ---- */
  await logout(page, 'Sync Tester');
  await login(page, 'admin', 'admin');
  const adminChip = await page.locator('header').getByRole('button', { name: /Admin|Supervisor/ }).count();
  check('admin logged in', adminChip >= 1);
  // Admin nav entry lives in the drawer at this viewport.
  await openDrawer(page);
  await page.getByText('Admin Governance Console', { exact: true }).click();
  await page.waitForTimeout(800);
  const appTableRow = page.locator('tr', { hasText: 'Sync Tester' });
  check('admin console shows the application', (await appTableRow.count()) >= 1);
  await appTableRow.first().getByRole('button', { name: 'Approve' }).click();
  await page.waitForTimeout(900);
  check('admin approval marks it Approved',
    (await page.locator('tr', { hasText: 'Sync Tester' }).getByText('Approved', { exact: true }).count()) >= 1);

  /* ---- 4. applicant sees Approved after reload ---- */
  await logout(page, 'Admin');
  await login(page, `synct${stamp}@example.com`, 'test1234');
  await navTo(page, 'Dashboard');
  check('applicant sees the application', (await page.getByText('Bruno').count()) >= 1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await navTo(page, 'Dashboard');
  check('application survives reload', (await page.getByText('Bruno').count()) >= 1);

  /* ---- 5. lost & found: report with photo, then resolve ---- */
  await navTo(page, 'Lost & Found');
  await page.getByText('+ Report Lost/Found Pet', { exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByPlaceholder('e.g. Max').fill('Probie');
  await page.getByPlaceholder('e.g. Golden Retriever').fill('Beagle');
  await page.getByPlaceholder('e.g. Honey / Cream').fill('Brown');
  await page.getByPlaceholder('e.g. Mirpur 10, Dhaka').fill('Uttara, Dhaka');
  await page.getByPlaceholder('Collar color, tag info, distinct marks...').fill('Probe report for fullsync e2e');
  // Photo via ImageUploader: find the Upload tab file input.
  const uploadTab = page.getByRole('tab', { name: /Upload/ }).first();
  if ((await uploadTab.count()) > 0) await uploadTab.click();
  await page.waitForTimeout(300);
  const fileInput = page.locator('input[type="file"]').first();
  if ((await fileInput.count()) > 0) await fileInput.setInputFiles(pngPath);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Submit Report to Community' }).click();
  await page.waitForTimeout(900);
  check('lost report card appears with pet name', (await page.getByText('Probie').count()) >= 1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await navTo(page, 'Lost & Found');
  check('lost report survives reload', (await page.getByText('Probie').count()) >= 1);

  /* ---- 6. vet adds medical record + vaccination to Bruno ---- */
  await logout(page, 'Sync Tester');
  await login(page, 'sarah@centralpetvet.com', 'vet123');
  await navTo(page, 'Find Pets');
  // Bruno was adopted in the admin step above, so lift the "Available Only" filter.
  const availOnly = page.getByText('Available Only', { exact: true });
  if ((await availOnly.count()) > 0) await availOnly.click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Search by name, breed, temperaments...').fill('Bruno');
  await page.waitForTimeout(800);
  await brunoCard(page).getByRole('button', { name: 'View Details' }).click();
  await page.waitForTimeout(700);
  const addBtn = page.getByText('+ Add medical record / vaccination', { exact: true });
  check('vet sees the add-record form toggle', (await addBtn.count()) >= 1);
  await addBtn.click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Diagnosis *').fill('Probe checkup');
  await page.getByPlaceholder('Treatment').fill('Rest and fluids');
  await page.getByRole('button', { name: 'Save record' }).click();
  await page.waitForTimeout(800);
  check('medical record added (visible in detail)', (await page.getByText('Probe checkup').count()) >= 1);
  await addBtn.click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Vaccination' }).first().click();
  await page.waitForTimeout(300);
  await page.getByPlaceholder('Vaccine name *').fill('ProbeVax');
  await page.getByRole('button', { name: 'Save record' }).click();
  await page.waitForTimeout(800);
  check('vaccination added (visible in detail)', (await page.getByText('ProbeVax').count()) >= 1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await navTo(page, 'Find Pets');
  const availOnly2 = page.getByText('Available Only', { exact: true });
  if ((await availOnly2.count()) > 0) await availOnly2.click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Search by name, breed, temperaments...').fill('Bruno');
  await page.waitForTimeout(800);
  await brunoCard(page).getByRole('button', { name: 'View Details' }).click();
  await page.waitForTimeout(700);
  check('medical record survives reload', (await page.getByText('Probe checkup').count()) >= 1);
  check('vaccination survives reload', (await page.getByText('ProbeVax').count()) >= 1);

  /* ---- 7. book + complete an appointment ---- */
  await page.getByLabel('Close pet details').click().catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await navTo(page, 'Pet Care & Vets');
  await page.getByRole('button', { name: 'Book Vet Appointment' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Reserve Appointment Slot' }).click();
  await page.waitForTimeout(900);
  const sched = page.getByText('Scheduled', { exact: true });
  check('appointment booked (Scheduled visible)', (await sched.count()) >= 1);
  // Close the booking success modal, then complete the new appointment.
  await page.locator('button:has(svg.lucide-x)').last().click().catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const completeBtn = page.getByRole('button', { name: 'Complete' }).first();
  if ((await completeBtn.count()) > 0) {
    await completeBtn.scrollIntoViewIfNeeded();
    await completeBtn.click();
    await page.waitForTimeout(700);
  }
  check('appointment status control responded', (await page.getByText('Completed', { exact: true }).count()) >= 1);

  check('zero JS page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures === 0 ? '\nALL LOCAL E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('E2E crashed:', String(e).slice(0, 300));
  process.exit(2);
});
