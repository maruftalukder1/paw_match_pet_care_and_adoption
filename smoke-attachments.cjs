// Chat attachments smoke test (Worker W3, Calls & Attachments round).
//
// Serves the production build (vite preview) and drives ONE headless
// Chromium context through the CDP interceptor (see ../chat-scroll/cdp2.cjs).
//
// Asserts:
//   1. Text message send still works (input -> send -> bubble in stream).
//   2. Photo attach: hidden file input -> JPEG data-URL message renders <img>
//      in the stream; clicking it opens the lightbox; close button closes it.
//   3. Persistence: after reload, the photo message is still in the stream
//      (localStorage-backed).
//   4. Zero uncaught console errors during the run.
//
// Run from the repo root:
//   npx vite preview --port 3001 --host 127.0.0.1 &
//   node scripts/chat-attachments/smoke-attachments.cjs
// Exit 0 = all checks pass, 2 = one or more failed.
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('../chat-scroll/cdp2.cjs');

const DIR = __dirname;
const SHOTS = '/tmp/chat-attach-shots';
const PHOTO = '/tmp/pawtest-photo.png';
const SEED_USER_FILE = path.join(DIR, '..', 'chat-scroll', 'seed-user.json');
const seedUser = fs.readFileSync(SEED_USER_FILE, 'utf8');

const results = [];
const check = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function screenshot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const p = path.join(SHOTS, name);
  await page.send('Page.captureScreenshot', { format: 'png' }).then((r) => {
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
  }).catch(() => {});
  return p;
}

async function waitFor(page, fnSource, timeout = 15000, ...args) {
  const t0 = Date.now();
  for (;;) {
    let ok = false;
    try { ok = await page.evaluate(fnSource, ...args); } catch { ok = false; }
    if (ok) return true;
    if (Date.now() - t0 > timeout) return false;
    await sleep(400);
  }
}

(async () => {
  const { child, page } = await launch({ port: 9343, width: 1366, height: 800, profile: '/tmp/pawtest/prof-attach-w3' });
  try {
    await page.navigate();
    await page.evaluate(`(u) => { localStorage.setItem('pawmatch_current_user', u); localStorage.removeItem('pawmatch_logged_out'); return 1; }`, seedUser);
    await page.navigate();
    await waitFor(page, `() => !!document.querySelector('button[title="Messages"]')`);
    await page.evaluate(`() => document.querySelector('button[title="Messages"]').click()`);
    await waitFor(page, `() => !!document.querySelector('[data-testid="chat-stream"]')`);
    await sleep(1200);

    // ---- 1. text send still works ----
    const typed = 'Smoke test: attachments round trip ' + Date.now();
    await page.evaluate(`(txt) => {
      const el = document.querySelector('[data-testid="chat-input"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, txt);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 1;
    }`, typed);
    await sleep(300);
    const sendEnabled = await page.evaluate(`() => {
      const b = document.querySelector('[data-testid="chat-send"]');
      return b && !b.disabled;
    }`);
    check('send button enables after typing', !!sendEnabled);
    await page.evaluate(`() => document.querySelector('[data-testid="chat-send"]').click()`);
    const textSeen = await waitFor(page, `(t) => {
      const s = document.querySelector('[data-testid="chat-stream"]');
      return s && s.textContent.includes(t);
    }`, 8000, typed);
    check('text message renders in stream', textSeen, typed.slice(0, 40));
    await sleep(600);
    const shot1 = await screenshot(page, '01-text-sent.png');
    console.log('   shot:', shot1);

    // ---- 2. photo attach via hidden file input ----
    // In-page DataTransfer + dispatched change (deterministic across CDP).
    const photoB64 = fs.readFileSync(PHOTO, 'base64');
    const inputOk = await page.evaluate(`(b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'test-photo.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('input[accept="image/*"]');
      if (!input) return 'no-input';
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    }`, photoB64);
    check('photo file input found', inputOk === 'ok', inputOk);
    const imgSeen = await waitFor(page, `() => {
      const s = document.querySelector('[data-testid="chat-stream"]');
      return s && !!s.querySelector('img[src^="data:image/jpeg"]');
    }`, 12000);
    check('photo message renders <img> in stream', imgSeen);
    await sleep(600);
    const shot2 = await screenshot(page, '02-photo-sent.png');
    console.log('   shot:', shot2);

    // lightbox open/close
    let lightboxOk = false;
    if (imgSeen) {
      await page.evaluate(`() => {
        const s = document.querySelector('[data-testid="chat-stream"]');
        s.querySelector('img[src^="data:image/jpeg"]').click();
        return 1;
      }`);
      await sleep(700);
      lightboxOk = await page.evaluate(`() => !!document.querySelector('[aria-label="Photo viewer"]')`);
      check('lightbox opens on photo click', lightboxOk);
      if (lightboxOk) {
        await screenshot(page, '03-lightbox.png');
        await page.evaluate(`() => document.querySelector('[aria-label="Close photo viewer"]').click()`);
        await sleep(500);
        const closed = await page.evaluate(`() => !document.querySelector('[aria-label="Photo viewer"]')`);
        check('lightbox closes', closed);
      }
    }

    // call buttons in local mode: disabled-ish + toast, no call starts
    const callToast = await (async () => {
      const btn = await page.evaluate(`() => {
        const b = document.querySelector('button[title="Calls need the live connection"]');
        return !!b;
      }`);
      check('call button shows live-connection tooltip in local mode', !!btn);
      if (!btn) return false;
      await page.evaluate(`() => document.querySelector('button[title="Calls need the live connection"]').click()`);
      await sleep(700);
      return page.evaluate(`() => document.body.textContent.includes('Calls need the live connection')`);
    })();
    check('call button click shows toast, no overlay', callToast);
    const noOverlay = await page.evaluate(`() => !document.querySelector('[aria-label="Call"]')`);
    check('no call overlay opened', noOverlay);

    // page must not have moved during all of this
    const scrollY = await page.evaluate(`() => window.scrollY`);
    check('window.scrollY untouched', scrollY === 0, `scrollY=${scrollY}`);

    // ---- 3. persistence across reload ----
    const storedBefore = await page.evaluate(`() => {
      try { return JSON.parse(localStorage.getItem('pawmatch_messages') || '[]'); } catch { return []; }
    }`);
    const storedPhoto = (storedBefore || []).find((m) => m.attachment && m.attachment.kind === 'image');
    check('photo message persisted to localStorage', !!storedPhoto,
      storedPhoto ? `dataUrl ${String(storedPhoto.attachment.dataUrl || '').length} chars` : 'none');

    await page.navigate();
    await waitFor(page, `() => !!document.querySelector('button[title="Messages"]')`);
    await page.evaluate(`() => document.querySelector('button[title="Messages"]').click()`);
    await waitFor(page, `() => !!document.querySelector('[data-testid="chat-stream"]')`);
    const imgAfterReload = await waitFor(page, `() => {
      const s = document.querySelector('[data-testid="chat-stream"]');
      return s && !!s.querySelector('img[src^="data:image/jpeg"]');
    }`, 12000);
    check('photo persists after reload', imgAfterReload);
    await sleep(400);
    const shot4 = await screenshot(page, '04-after-reload.png');
    console.log('   shot:', shot4);

    // ---- 4. console errors ----
    check('zero uncaught console errors', page.consoleErrors.length === 0,
      page.consoleErrors.length ? page.consoleErrors.slice(0, 3).join(' | ') : 'none');
  } finally {
    try { await page.close(); } catch {}
    try { child.kill('SIGKILL'); } catch {}
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 2 : 0);
})().catch((e) => {
  console.error('SMOKE FAILED:', e.message);
  process.exit(2);
});
