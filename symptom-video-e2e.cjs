/* Symptom Checker — phase-3 video wiring e2e (playwright-core, fresh profiles).
 * The Edge Function boundary is stubbed at the HTTP level (route pattern
 * matching .../functions/v1/analyze-video) -> canned JSON (success) or HTTP 500 (failure).
 * The real function is not deployed in this sandbox, so stubbing is the
 * honest way to prove the client wiring: frame sampling -> invoke -> merge +
 * videoNote + escalation on success, and no-block + honest line on failure.
 * A real webm test clip is generated with ffmpeg at run time so the browser
 * genuinely decodes video and samples frames (no stubbed pixels).
 * Served: current dist/ on http://localhost:4173.
 *
 * Scenario A (success, vet_soon): attach video -> cat/appetite/24h/mild check
 *   -> rule result (Monitor) renders -> AI video section appears with the
 *   stubbed observation + sequenceNote -> history entry carries the videoNote.
 * Scenario B (emergency escalation): stub triageHint=emergency on a
 *   monitor-level check -> pulsing emergency banner appears (escalated by AI video).
 * Scenario C (failure): HTTP 500 from the stub -> check still completes from
 *   the rule engine and shows the honest video unavailable line.
 * Scenario D (exclusivity): photo attached, then video attached -> photo is
 *   cleared (one check = one kind of media); then photo attached again ->
 *   video is cleared.
 */
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://localhost:4173';
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

/* 1x1 PNG (red) for the photo side of the exclusivity test. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function makeTestClip() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawmatch-video-'));
  const clip = path.join(dir, 'dog-clip.webm');
  // 4s, 320x240 VP9 — animated pattern so the sampled frames actually differ.
  execSync(
    `ffmpeg -y -loglevel error -f lavfi -i testsrc=size=320x240:rate=10:duration=4 ` +
      `-c:v libvpx-vp9 -pix_fmt yuv420p "${clip}"`,
    { stdio: 'pipe' },
  );
  return clip;
}

const SUCCESS_BODY = {
  observedSigns: [
    { sign: 'Slight limp on the left front leg', region: 'left front leg', confidence: 'medium' },
  ],
  triageHint: 'vet_soon',
  sequenceNote: 'the limp is more pronounced in the later frames',
  vetQuestions: ['Is the limp constant or does it come and go?'],
  disclaimer: 'These observations are for informational purposes only and are not veterinary advice, diagnosis, or treatment. Always consult a licensed veterinarian.',
  servedBy: 'stub',
};

const EMERGENCY_BODY = {
  observedSigns: [{ sign: 'Labored open-mouth breathing', region: 'chest', confidence: 'high' }],
  triageHint: 'emergency',
  sequenceNote: 'breathing effort increases across the frames',
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

/* Attach a REAL video file (decodes in headless chromium) and wait for the
 * preview + sampled-frame count line, proving the browser got a duration. */
async function attachVideo(page, clipPath) {
  const step = page.getByTestId('symptom-photo-step');
  await step.scrollIntoViewIfNeeded();
  await page.getByTestId('symptom-media-tab-video').click();
  await step.getByTestId('symptom-video-input').setInputFiles(clipPath);
  await page.getByTestId('symptom-video-preview').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500); // let the duration probe settle
}

async function attachPhoto(page) {
  const step = page.getByTestId('symptom-photo-step');
  await step.scrollIntoViewIfNeeded();
  await step.locator('input[type="file"]').first().setInputFiles({
    name: 'pet.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
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

const routeVideo = (page, body, status = 200) =>
  page.route('**/functions/v1/analyze-video', (route) => {
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
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

(async () => {
  const clip = makeTestClip();
  console.log('test clip:', clip);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  /* ---------------- Scenario A: success merge ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await routeVideo(page, SUCCESS_BODY);
    await bootToChecker(page);
    check('A: photo/video step visible', await page.getByTestId('symptom-photo-step').isVisible());
    await attachVideo(page, clip);
    check('A: clip attached, duration line shown', (await page.getByText(/frames will be sampled across it/i).count()) > 0);
    check('A: privacy line shown after attach', await page.getByText(/your video stays on your device/i).isVisible());
    await runCheck(page, {
      symptom: 'symptom-option-appetite-loss',
      duration: 'symptom-duration-h24',
      severity: 'symptom-severity-mild',
    });
    await page.getByTestId('symptom-result').waitFor({ timeout: 10000 });
    check('A: rule result renders first (Monitor at home)', await page.getByText('Monitor at home').first().isVisible());
    await page.getByTestId('symptom-video-analysis').waitFor({ timeout: 30000 });
    check('A: AI video observations section merged', await page.getByTestId('symptom-video-analysis').isVisible());
    check('A: stubbed sign shown', await page.getByText('Slight limp on the left front leg').isVisible());
    check('A: sequenceNote shown', await page.getByTestId('symptom-video-sequence-note').isVisible());
    check('A: sequenceNote text', (await page.getByTestId('symptom-video-sequence-note').textContent())?.includes('more pronounced') === true);
    check('A: no emergency banner (hint was vet_soon)', await page.getByTestId('symptom-emergency-banner').count() === 0);
    // history videoNote
    await page.getByTestId('symptom-history-toggle').click();
    await page.waitForTimeout(500);
    const note = page.locator('[data-testid^="symptom-history-photo-"]').first();
    check('A: history entry carries videoNote', await note.count() === 1);
    check('A: videoNote has Video: prefix', (await note.textContent())?.includes('Video:') === true);
    check('A: zero JS errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------------- Scenario B: emergency escalation ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await routeVideo(page, EMERGENCY_BODY);
    await bootToChecker(page);
    await attachVideo(page, clip);
    await runCheck(page, {
      symptom: 'symptom-option-appetite-loss',
      duration: 'symptom-duration-h24',
      severity: 'symptom-severity-mild',
    });
    await page.getByTestId('symptom-result').waitFor({ timeout: 10000 });
    await page.getByTestId('symptom-emergency-banner').waitFor({ timeout: 30000 });
    check('B: emergency banner escalated by AI video', await page.getByTestId('symptom-emergency-banner').isVisible());
    check('B: urgency card shows EMERGENCY', await page.getByText('EMERGENCY — seek care immediately').first().isVisible());
    check('B: AI video escalation reason named', await page.getByText(/AI video analysis spotted a possible emergency sign/i).isVisible());
    check('B: zero JS errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------------- Scenario C: function failure degrades ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await routeVideo(page, { error: 'not deployed' }, 500);
    await bootToChecker(page);
    await attachVideo(page, clip);
    await runCheck(page, {
      symptom: 'symptom-option-appetite-loss',
      duration: 'symptom-duration-h24',
      severity: 'symptom-severity-moderate',
    });
    await page.getByTestId('symptom-result').waitFor({ timeout: 10000 });
    check('C: rule check completes despite function failure', await page.getByTestId('symptom-result').isVisible());
    await page.getByTestId('symptom-video-unavailable').waitFor({ timeout: 30000 });
    check('C: honest unavailable line shown', await page.getByTestId('symptom-video-unavailable').isVisible());
    check(
      'C: honest wording',
      await page.getByText(/Video analysis isn.t available right now/i).first().isVisible(),
    );
    check('C: no emergency banner', await page.getByTestId('symptom-emergency-banner').count() === 0);
    check('C: zero JS errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------------- Scenario D: photo/video exclusivity ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await routeVideo(page, SUCCESS_BODY);
    await bootToChecker(page);
    const step = page.getByTestId('symptom-photo-step');
    await attachPhoto(page);
    check('D: photo preview present', await step.locator('img[alt="Pet photo preview"]').count() === 1);
    // attaching a video clears the photo
    await page.getByTestId('symptom-media-tab-video').click();
    await step.getByTestId('symptom-video-input').setInputFiles(clip);
    await page.getByTestId('symptom-video-preview').waitFor({ timeout: 20000 });
    check('D: video attached', await page.getByTestId('symptom-video-preview').isVisible());
    check('D: photo cleared after video attach', await step.locator('img[alt="Pet photo preview"]').count() === 0);
    // switching back to the Photo tab clears the video
    await page.getByTestId('symptom-media-tab-photo').click();
    await page.waitForTimeout(800);
    check('D: video cleared after switching to Photo tab', await page.getByTestId('symptom-video-preview').count() === 0);
    await attachPhoto(page);
    check('D: photo re-attached', await step.locator('img[alt="Pet photo preview"]').count() === 1);
    check('D: zero JS errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(failures === 0 ? '\nALL VIDEO-WIRING CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
