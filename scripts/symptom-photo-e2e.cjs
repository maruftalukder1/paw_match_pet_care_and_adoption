/* Symptom Checker — phase-2 photo wiring e2e (playwright-core, fresh profiles).
 * The Edge Function boundary is stubbed at the HTTP level (route pattern
 * matching .../functions/v1/analyze-photo) -> canned JSON (success) or HTTP 500 (failure).
 * The real function is not deployed in this sandbox, so stubbing is the
 * honest way to prove the client wiring: merge + photoNote + escalation on
 * success, and no-block + honest line on failure.
 * Served: current dist/ on http://localhost:4173.
 *
 * Scenario A (success, vet_soon): upload photo -> cat/appetite/24h/mild check
 *   -> rule result (Monitor) renders -> AI section appears with the stubbed
 *   observation -> history entry carries the photoNote summary.
 * Scenario B (emergency escalation): stub triageHint=emergency on a
 *   monitor-level check -> pulsing emergency banner appears (escalated by AI).
 * Scenario C (failure): HTTP 500 from the stub -> check still completes from
 *   the rule engine and shows the honest "isn't available right now" line.
 */
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:4173';
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

/* 1x1 PNG (red) — small enough to embed, decoded fine by the canvas downscaler. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const SUCCESS_BODY = {
  observedSigns: [
    { sign: 'Redness around the left eye', region: 'left eye', confidence: 'medium' },
    { sign: 'Slight squinting', region: 'left eye', confidence: 'low' },
  ],
  triageHint: 'vet_soon',
  vetQuestions: ['Is the redness spreading to the other eye?'],
  disclaimer: 'These observations are for informational purposes only and are not veterinary advice, diagnosis, or treatment. Always consult a licensed veterinarian.',
  servedBy: 'stub',
};

const EMERGENCY_BODY = {
  observedSigns: [{ sign: 'Labored open-mouth breathing', region: 'chest', confidence: 'high' }],
  triageHint: 'emergency',
  vetQuestions: ['How long has the breathing looked like this?'],
  disclaimer: SUCCESS_BODY.disclaimer,
  servedBy: 'stub',
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

async function bootToChecker(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await navTo(page, 'Pet Care & Vets');
  await page.waitForTimeout(600);
  await page.getByTestId('symptom-checker').scrollIntoViewIfNeeded();
}

async function attachPhoto(page) {
  const step = page.getByTestId('symptom-photo-step');
  await step.scrollIntoViewIfNeeded();
  await step.locator('input[type="file"]').setInputFiles({
    name: 'pet.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  // Wait for the downscaled preview to confirm the pipeline ran.
  await step.locator('img[alt="Pet photo preview"]').waitFor({ timeout: 10000 });
}

async function runCheck(page, { symptom, duration, severity }) {
  const checker = page.getByTestId('symptom-checker');
  await checker.getByRole('button', { name: 'cat', exact: true }).click();
  await checker.getByTestId(symptom).click();
  await checker.getByTestId(duration).click();
  await checker.getByTestId(severity).click();
  await checker.getByTestId('symptom-check-button').click();
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  /* ---------------- Scenario A: success merge ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await page.route('**/functions/v1/analyze-photo', (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
          },
          body: 'ok',
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUCCESS_BODY) });
    });
    await bootToChecker(page);
    check('A: photo step visible', await page.getByTestId('symptom-photo-step').isVisible());
    await attachPhoto(page);
    await runCheck(page, {
      symptom: 'symptom-option-appetite-loss',
      duration: 'symptom-duration-h24',
      severity: 'symptom-severity-mild',
    });
    await page.getByTestId('symptom-result').waitFor({ timeout: 10000 });
    check('A: rule result renders first (Monitor at home)', await page.getByText('Monitor at home').first().isVisible());
    await page.getByTestId('symptom-photo-analysis').waitFor({ timeout: 15000 });
    check('A: AI observations section merged', await page.getByTestId('symptom-photo-analysis').isVisible());
    check('A: stubbed sign shown', await page.getByText('Redness around the left eye').isVisible());
    check('A: informational-only label present', await page.getByText(/Informational only/i).first().isVisible());
    check('A: AI triage does NOT de-escalate or change band', await page.getByText('Monitor at home').first().isVisible());
    check('A: no emergency banner (hint was vet_soon)', await page.getByTestId('symptom-emergency-banner').count() === 0);
    // history photoNote
    await page.getByTestId('symptom-history-toggle').click();
    await page.waitForTimeout(500);
    const photoNote = page.locator('[data-testid^="symptom-history-photo-"]').first();
    check('A: history entry carries photoNote', await photoNote.count() === 1);
    check('A: photoNote summary text', (await photoNote.textContent())?.includes('AI photo observations') === true);
    check('A: zero JS errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------------- Scenario B: emergency escalation ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await page.route('**/functions/v1/analyze-photo', (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
          },
          body: 'ok',
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMERGENCY_BODY) });
    });
    await bootToChecker(page);
    await attachPhoto(page);
    await runCheck(page, {
      symptom: 'symptom-option-appetite-loss',
      duration: 'symptom-duration-h24',
      severity: 'symptom-severity-mild',
    });
    await page.getByTestId('symptom-result').waitFor({ timeout: 10000 });
    await page.getByTestId('symptom-emergency-banner').waitFor({ timeout: 15000 });
    check('B: emergency banner escalated by AI', await page.getByTestId('symptom-emergency-banner').isVisible());
    check('B: urgency card shows EMERGENCY', await page.getByText('EMERGENCY — seek care immediately').first().isVisible());
    check('B: AI escalation reason named', await page.getByText(/AI photo analysis spotted a possible emergency sign/i).isVisible());
    check('B: zero JS errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------------- Scenario C: function failure degrades ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await page.route('**/functions/v1/analyze-photo', (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
          },
          body: 'ok',
        });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'not deployed' }) });
    });
    await bootToChecker(page);
    await attachPhoto(page);
    await runCheck(page, {
      symptom: 'symptom-option-appetite-loss',
      duration: 'symptom-duration-h24',
      severity: 'symptom-severity-moderate',
    });
    await page.getByTestId('symptom-result').waitFor({ timeout: 10000 });
    check('C: rule check completes despite function failure', await page.getByTestId('symptom-result').isVisible());
    await page.getByTestId('symptom-photo-unavailable').waitFor({ timeout: 15000 });
    check('C: honest unavailable line shown', await page.getByTestId('symptom-photo-unavailable').isVisible());
    check(
      'C: honest wording',
      await page.getByText(/Photo analysis isn.t available right now/i).first().isVisible(),
    );
    check('C: no emergency banner', await page.getByTestId('symptom-emergency-banner').count() === 0);
    check('C: zero JS errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(failures === 0 ? '\nALL PHOTO-WIRING CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
