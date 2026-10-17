// Chat scroll-stability regression test (Worker B, feedback fix round).
//
// Prerequisites:
//   1. Local-mode dev server running (no Supabase, deterministic seed data):
//        cd hidden_files/pawmatch-v2
//        VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port=3001
//   2. Headless Chromium at /opt/meta-chromium/chrome (uses ./cdp2.js which
//      loads the app through Fetch-domain interception because this Chromium
//      build blocks direct localhost navigation via Local Network Access checks).
//
// Run:  node scripts/chat-scroll/verify-chat-scroll.js
// Exit 0 = all checks pass, 2 = one or more checks failed.
//
// What it asserts:
//   - window.scrollY is IDENTICAL before/after a 5-message send sequence
//     (desktop, page pre-scrolled) and zero window scroll events fire.
//   - Message pane + chat shell clientHeight are constant during sends.
//   - No React "Maximum update depth exceeded" errors (the old render loop).
//   - Incoming message while scrolled up (>120px from bottom): pane does NOT
//     scroll, the "New message" pill appears; tapping it jumps to the bottom.
//   - Incoming message while near bottom: gentle auto-follow, no pill.
//   - Mobile 390x844: shell/stream heights stable, scrollY unchanged.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { launch, sleep } = require('./cdp2.cjs');

const DIR = __dirname;
const SEED_USER_FILE = path.join(DIR, 'seed-user.json');

function ensureSeedUser() {
  if (!fs.existsSync(SEED_USER_FILE)) {
    const out = execSync(
      `npx tsx -e "import('./src/data/seedData.ts').then(m=>{const u=m.SEED_USERS.find((x)=>x.id==='u-adopter-1');require('fs').writeFileSync('${SEED_USER_FILE}',JSON.stringify(u))})"`,
      { cwd: path.join(DIR, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  }
  return fs.readFileSync(SEED_USER_FILE, 'utf8');
}

const seedUser = ensureSeedUser();
const results = [];
const check = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const STREAM_OF = `(s) => s.querySelector('[data-testid="chat-stream"]') || [...s.querySelectorAll('div')].find((d) => typeof d.className === 'string' && d.className.includes('space-y-4'))`;

async function boot(port, profile, width, height) {
  const { child, page } = await launch({ port, profile, width, height });
  await page.navigate();
  await page.evaluate(`() => { localStorage.setItem('pawmatch_current_user', ${JSON.stringify(seedUser)}); localStorage.removeItem('pawmatch_logged_out'); return 1; }`);
  await page.navigate();
  for (let i = 0; i < 50; i++) {
    const f = await page.evaluate(`() => !!document.querySelector('button[title="Messages"]')`);
    if (f) break; await sleep(300);
  }
  await page.evaluate(`() => document.querySelector('button[title="Messages"]').click()`);
  await sleep(1500);
  await page.evaluate(`() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => typeof b.className === 'string' && b.className.includes('items-start'));
    if (btns[0]) btns[0].click(); return btns.length;
  }`);
  await sleep(1500);
  return { child, page };
}

const sendMsg = (text) => `(text) => {
  const grid = document.querySelector('[data-testid="chat-shell"]');
  const input = grid.querySelector('[data-testid="chat-input"]');
  const send = grid.querySelector('[data-testid="chat-send"]');
  const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  desc.set.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  send.click(); return 'sent';
}`;

async function desktop() {
  console.log('\n===== DESKTOP 1366x600 =====');
  const { child, page } = await boot(9346, '/tmp/pawtest/prof-vdesk', 1366, 600);
  try {
    const depthBefore = page.consoleErrors.filter((e) => e.includes('Maximum update depth')).length;
    check('no max-depth errors on chat open', depthBefore === 0, `count=${depthBefore}`);

    const y0 = await page.evaluate(`() => { window.scrollTo(0, 140); return window.scrollY; }`);
    await sleep(300);

    await page.evaluate(`() => {
      const shell = document.querySelector('[data-testid="chat-shell"]');
      const stream = (${STREAM_OF})(shell);
      window.__s = { y0: window.scrollY, ys: [], ph: [], shellH: [], winEv: 0, sto: 0 };
      window.addEventListener('scroll', () => window.__s.winEv++, { passive: true });
      const orig = Element.prototype.scrollTo;
      Element.prototype.scrollTo = function (...a) { if (this === stream) window.__s.sto++; return orig.apply(this, a); };
      window.__siv = setInterval(() => {
        window.__s.ys.push(window.scrollY);
        window.__s.ph.push(stream.clientHeight);
        window.__s.shellH.push(shell.clientHeight);
      }, 50);
      return !!stream;
    }`);

    for (let i = 1; i <= 5; i++) {
      await page.evaluate(sendMsg(), `verify send ${i} stability check`);
      await sleep(600);
    }
    await sleep(2000);
    const s = await page.evaluate(`() => window.__s`);
    const yMin = Math.min(...s.ys), yMax = Math.max(...s.ys);
    check('window.scrollY unchanged during 5 sends', yMin === yMax && yMin === y0, `y0=${y0} min=${yMin} max=${yMax}`);
    check('no window scroll events during sends', s.winEv === 0, `events=${s.winEv}`);
    const phMin = Math.min(...s.ph), phMax = Math.max(...s.ph);
    check('pane clientHeight stable during sends', phMin === phMax, `min=${phMin} max=${phMax}`);
    const shMin = Math.min(...s.shellH), shMax = Math.max(...s.shellH);
    check('shell clientHeight stable during sends', shMin === shMax, `min=${shMin} max=${shMax}`);
    const depthAfter = page.consoleErrors.filter((e) => e.includes('Maximum update depth')).length;
    check('no max-depth errors after sends', depthAfter === 0, `count=${depthAfter}`);

    // receive while scrolled up (well beyond the 120px near-bottom threshold)
    await page.evaluate(`(STREAM_OF) => {
      const shell = document.querySelector('[data-testid="chat-shell"]');
      const stream = eval(STREAM_OF)(shell);
      stream.scrollTop = 0; return Math.round(stream.scrollTop);
    }`, STREAM_OF);
    await sleep(600);
    const topBefore = await page.evaluate(`(STREAM_OF) => { const sh = document.querySelector('[data-testid="chat-shell"]'); return Math.round(eval(STREAM_OF)(sh).scrollTop); }`, STREAM_OF);
    const injected = await page.evaluate(`() => window.__pawInjectReceived('', 'incoming while you were scrolled up — do not yank')`);
    check('dev hook injected incoming message', injected === true);
    await sleep(1200);
    const st = await page.evaluate(`(STREAM_OF) => {
      const sh = document.querySelector('[data-testid="chat-shell"]');
      const stream = eval(STREAM_OF)(sh);
      return { top: Math.round(stream.scrollTop), sh: stream.scrollHeight, ch: stream.clientHeight,
               ind: !!document.querySelector('[data-testid="chat-new-indicator"]'),
               indText: (document.querySelector('[data-testid="chat-new-indicator"]') || {}).textContent || null,
               y: window.scrollY };
    }`, STREAM_OF);
    check('no forced scroll on receive while scrolled up', st.top <= topBefore + 2, `topBefore=${topBefore} topAfter=${st.top}`);
    check('new-message indicator shown', st.ind === true, `text=${JSON.stringify(st.indText)}`);
    check('window.scrollY unchanged on receive', st.y === y0, `y=${st.y} y0=${y0}`);

    await page.evaluate(`() => document.querySelector('[data-testid="chat-new-indicator"]').click()`);
    await sleep(1000);
    const st2 = await page.evaluate(`(STREAM_OF) => {
      const sh = document.querySelector('[data-testid="chat-shell"]');
      const stream = eval(STREAM_OF)(sh);
      return { atBottom: (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 4,
               ind: !!document.querySelector('[data-testid="chat-new-indicator"]') };
    }`, STREAM_OF);
    check('indicator tap scrolls pane to bottom', st2.atBottom === true);
    check('indicator hides after tap', st2.ind === false);

    // receive while near bottom -> gentle auto-scroll, no indicator
    await page.evaluate(`(STREAM_OF) => { const sh = document.querySelector('[data-testid="chat-shell"]'); const st = eval(STREAM_OF)(sh); st.scrollTop = st.scrollHeight; return 1; }`, STREAM_OF);
    await sleep(600);
    await page.evaluate(`() => window.__pawInjectReceived('', 'incoming while near bottom — gentle follow')`);
    await sleep(1200);
    const st3 = await page.evaluate(`(STREAM_OF) => {
      const sh = document.querySelector('[data-testid="chat-shell"]');
      const stream = eval(STREAM_OF)(sh);
      return { atBottom: (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 120,
               ind: !!document.querySelector('[data-testid="chat-new-indicator"]'),
               y: window.scrollY };
    }`, STREAM_OF);
    check('near-bottom receive auto-follows to bottom', st3.atBottom === true);
    check('no indicator when already near bottom', st3.ind === false);
    check('window.scrollY unchanged on near-bottom receive', st3.y === y0, `y=${st3.y}`);

    const errs = page.consoleErrors.filter((e) => !e.includes('[vite]'));
    check('zero non-vite console errors overall', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally {
    await page.close(); child.kill();
  }
}

async function mobile() {
  console.log('\n===== MOBILE 390x844 =====');
  const { child, page } = await boot(9347, '/tmp/pawtest/prof-vmob', 390, 844);
  try {
    await page.evaluate(`() => {
      const shell = document.querySelector('[data-testid="chat-shell"]');
      window.__m = { shellH: [], streamH: [], ys: [] };
      window.__miv = setInterval(() => {
        const st = shell.querySelector('[data-testid="chat-stream"]');
        window.__m.shellH.push(shell.clientHeight);
        window.__m.streamH.push(st ? st.clientHeight : -1);
        window.__m.ys.push(window.scrollY);
      }, 50);
      return !!shell;
    }`);
    await sleep(300);
    for (let i = 1; i <= 3; i++) {
      await page.evaluate(sendMsg(), `mobile send ${i}`);
      await sleep(700);
    }
    await sleep(1500);
    const m = await page.evaluate(`() => window.__m`);
    const sh = [Math.min(...m.shellH), Math.max(...m.shellH)];
    const th = [Math.min(...m.streamH), Math.max(...m.streamH)];
    const ys = [Math.min(...m.ys), Math.max(...m.ys)];
    check('mobile shell height stable during sends', sh[0] === sh[1] && sh[0] > 0, `min=${sh[0]} max=${sh[1]}`);
    check('mobile stream height stable during sends', th[0] === th[1] && th[0] > 0, `min=${th[0]} max=${th[1]}`);
    check('mobile window.scrollY unchanged during sends', ys[0] === ys[1], `min=${ys[0]} max=${ys[1]}`);
    const depth = page.consoleErrors.filter((e) => e.includes('Maximum update depth')).length;
    check('mobile: no max-depth errors', depth === 0, `count=${depth}`);
  } finally {
    await page.close(); child.kill();
  }
}

(async () => {
  await desktop();
  await mobile();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== ${results.length - failed.length}/${results.length} checks passed =====`);
  if (failed.length) process.exit(2);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
