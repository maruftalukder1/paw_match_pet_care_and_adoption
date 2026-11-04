// SCROLLFIX2 measurement harness (live flavor).
//
// Boots the app (vite dev server on :3001 serving the REAL .env.local build),
// signs in as admin via the localStorage session seed, opens Messages, and
// records a 150ms time series of: pane scrollTop/scrollHeight, stream DOM
// node identity (remount detector), pane header name, selected list item,
// bubble count, first visible bubble — plus a log of every PROGRAMMATIC
// scrollTop assignment to the stream (with stack) and every Supabase REST
// call the page makes (loadMessages GETs / mark-read PATCHes reveal the
// parent's activeConversationId over time).
//
// Phases:
//   A boot-idle 25s (no clicks after opening Messages) — boot race + yank
//   B open Scroll Test thread (60 seeded msgs), park mid-history, 20s idle
//   C REST churn: 3 incoming msgs into the OPEN thread (4s apart), then
//     2 into a different admin conversation — sample throughout
//   D park at bottom, 10s idle
//
// Usage: node scripts/chat-scroll/scrollfix2-measure.cjs <tag>
// Writes /tmp/scrollfix2-<tag>.json and prints a summary.
const fs = require('fs');
const { launch, sleep } = require('./cdp2.cjs');

const TAG = process.argv[2] || 'run';
const ADMIN = fs.readFileSync('/tmp/seed-admin.json', 'utf8');
const envRaw = fs.readFileSync(__dirname + '/../../.env.local', 'utf8');
const envMap = {};
for (const line of envRaw.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) envMap[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}
const SB_URL = envMap.VITE_SUPABASE_URL.replace(/[^\x20-\x7E]/g, '');
const SB_KEY = envMap.VITE_SUPABASE_ANON_KEY.replace(/[^\x20-\x7E]/g, '');
const SB_H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };

async function restInsert(table, row) {
  const r = await fetch(SB_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: { ...SB_H, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(row),
  });
  return r.status;
}

const INSTRUMENT = `() => {
  window.__sf2 = [];
  window.__sf2_sets = [];
  window.__sf2tokN = 0;
  // Log every programmatic scrollTop assignment / scrollTo on the chat stream.
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get: desc.get,
    set(v) {
      if (this && this.dataset && this.dataset.testid === 'chat-stream') {
        window.__sf2_sets.push({ t: Date.now(), kind: 'set', v: Math.round(v),
          stack: (new Error().stack || '').split('\\n').slice(2, 7).join(' | ') });
      }
      return desc.set.call(this, v);
    },
  });
  const origScrollTo = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (...a) {
    if (this && this.dataset && this.dataset.testid === 'chat-stream') {
      window.__sf2_sets.push({ t: Date.now(), kind: 'scrollTo', v: JSON.stringify(a).slice(0, 80),
        stack: (new Error().stack || '').split('\\n').slice(2, 7).join(' | ') });
    }
    return origScrollTo.apply(this, a);
  };
  setInterval(() => {
    const shell = document.querySelector('[data-testid="chat-shell"]');
    const stream = document.querySelector('[data-testid="chat-stream"]');
    let tok = null;
    if (stream) { if (!stream.__sf2tok) stream.__sf2tok = ++window.__sf2tokN; tok = stream.__sf2tok; }
    const header = shell ? ((shell.querySelector('h3') || {}).textContent ?? null) : null;
    let selName = null;
    if (shell) {
      const btns = [...shell.querySelectorAll('button')];
      const sel = btns.find((b) => typeof b.className === 'string' && b.className.includes('border-emerald-600'));
      if (sel) { const sp = sel.querySelector('span.truncate, span'); selName = sp ? sp.textContent : sel.textContent.slice(0, 40); }
    }
    let allChats = null;
    const tabs = [...document.querySelectorAll('button')].map((b) => b.textContent || '').find((t) => t.includes('All Chats'));
    if (tabs) allChats = tabs.trim();
    const kids = stream ? [...stream.children] : [];
    const firstTxt = kids.length ? (kids[0].textContent || '').slice(0, 42) : null;
    const lastTxt = kids.length ? (kids[kids.length - 1].textContent || '').slice(0, 42) : null;
    window.__sf2.push({
      t: Date.now(), tok,
      st: stream ? Math.round(stream.scrollTop) : null,
      sh: stream ? stream.scrollHeight : null,
      ch: stream ? stream.clientHeight : null,
      header, selName, allChats,
      nkids: kids.length, firstTxt, lastTxt,
    });
  }, 150);
  return 1;
}`;

function transitions(samples, key) {
  const out = [];
  let prev;
  for (const s of samples) {
    if (s[key] !== prev) { out.push({ t: s.t, from: prev, to: s[key] }); prev = s[key]; }
  }
  return out;
}

(async () => {
  const { child, page } = await launch({ port: 9351, profile: '/tmp/pawtest/prof-sf2-' + TAG, width: 1366, height: 768 });
  const netLog = [];
  page.on('Network.requestWillBeSent', (p) => {
    const u = p.request.url;
    if (u.includes('supabase.co')) {
      netLog.push({ t: Date.now(), m: p.request.method, u: u.replace(SB_URL, '').slice(0, 160) });
    }
  });
  await page.send('Network.enable').catch(() => {});
  const marks = [];
  const mark = (name) => { marks.push({ name, t: Date.now() }); console.log('MARK', name); };

  try {
    await page.navigate();
    await page.evaluate(`() => { localStorage.setItem('pawmatch_current_user', ${JSON.stringify(ADMIN)}); localStorage.removeItem('pawmatch_logged_out'); return 1; }`);
    await page.navigate();
    await page.evaluate(INSTRUMENT);
    for (let i = 0; i < 60; i++) {
      const f = await page.evaluate(`() => !!document.querySelector('button[title="Messages"]')`);
      if (f) break; await sleep(300);
    }
    mark('A:boot-idle-start');
    await page.evaluate(`() => document.querySelector('button[title="Messages"]').click()`);
    await sleep(25000);
    mark('A:boot-idle-end');

    // Phase B: open the Scroll Test thread.
    let opened = false;
    for (let i = 0; i < 40 && !opened; i++) {
      opened = await page.evaluate(`() => {
        const btns = [...document.querySelectorAll('button')];
        const b = btns.find((x) => (x.textContent || '').includes('Scroll Test'));
        if (b) { b.click(); return true; }
        return false;
      }`);
      if (!opened) await sleep(500);
    }
    console.log('scroll-test opened:', opened);
    // wait for a tall stream
    for (let i = 0; i < 40; i++) {
      const ok = await page.evaluate(`() => { const s = document.querySelector('[data-testid="chat-stream"]'); return s ? (s.scrollHeight - s.clientHeight) : 0; }`);
      if (ok > 800) break; await sleep(500);
    }
    await sleep(1500);
    mark('B:mid-idle-start');
    await page.evaluate(`() => { const s = document.querySelector('[data-testid="chat-stream"]'); if (s) s.scrollTop = Math.round((s.scrollHeight - s.clientHeight) * 0.45); return s ? Math.round(s.scrollTop) : -1; }`);
    await sleep(20000);
    mark('B:mid-idle-end');

    // Phase C: churn — incoming messages into the OPEN thread, then another conv.
    mark('C:churn-start');
    for (let i = 1; i <= 3; i++) {
      const st = await restInsert('chat_messages', {
        id: 'msg-scrolltest-live-' + i,
        conversation_id: 'conv-scrolltest-1',
        sender_id: 'u-scrolltest-1', sender_name: 'Scroll Test',
        receiver_id: 'u-admin-1',
        content: 'Live churn message ' + i + ' arriving while you read history.',
        is_read: false, created_at: new Date().toISOString(),
      });
      console.log('churn insert open-thread', i, '->', st);
      await sleep(4000);
    }
    for (let i = 1; i <= 2; i++) {
      const st = await restInsert('chat_messages', {
        id: 'msg-scrolltest-other-' + i + '-' + TAG,
        conversation_id: 'conv-admin-1',
        sender_id: 'u-adopter-1', sender_name: 'Jaann Rahman',
        receiver_id: 'u-admin-1',
        content: 'Churn message in another conversation ' + i + '.',
        is_read: false, created_at: new Date().toISOString(),
      });
      console.log('churn insert other-conv', i, '->', st);
      await sleep(4000);
    }
    mark('C:churn-end');

    // Phase D: bottom idle.
    await page.evaluate(`() => { const s = document.querySelector('[data-testid="chat-stream"]'); if (s) s.scrollTop = s.scrollHeight; return 1; }`);
    mark('D:bottom-idle-start');
    await sleep(10000);
    mark('D:bottom-idle-end');

    const samples = await page.evaluate(`() => window.__sf2`);
    const sets = await page.evaluate(`() => window.__sf2_sets`);
    fs.writeFileSync('/tmp/scrollfix2-' + TAG + '.json', JSON.stringify({ samples, sets, netLog, marks }, null, 1));

    // ---- summary ----
    const t0 = samples.length ? samples[0].t : 0;
    const rel = (t) => ((t - t0) / 1000).toFixed(1) + 's';
    console.log('\n== header transitions ==');
    for (const tr of transitions(samples, 'header')) console.log(' ', rel(tr.t), JSON.stringify(tr.from), '->', JSON.stringify(tr.to));
    console.log('== selection transitions ==');
    for (const tr of transitions(samples, 'selName')) console.log(' ', rel(tr.t), JSON.stringify(tr.from), '->', JSON.stringify(tr.to));
    console.log('== stream node (remount) transitions ==');
    for (const tr of transitions(samples, 'tok')) console.log(' ', rel(tr.t), tr.from, '->', tr.to);
    console.log('== All Chats label transitions ==');
    for (const tr of transitions(samples, 'allChats')) console.log(' ', rel(tr.t), JSON.stringify(tr.from), '->', JSON.stringify(tr.to));
    console.log('== scroll jumps (|dTop|>60 between samples) ==');
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      if (a.st !== null && b.st !== null && Math.abs(b.st - a.st) > 60) {
        console.log(' ', rel(b.t), a.st, '->', b.st, '(sh=' + b.sh + ', header=' + JSON.stringify(b.header) + ')');
      }
    }
    console.log('== programmatic scroll sets on stream:', sets.length, '==');
    const byStack = {};
    for (const s of sets) {
      const key = s.kind + ' :: ' + s.stack.split('|')[0].trim();
      byStack[key] = byStack[key] || { n: 0, stacks: s.stack };
      byStack[key].n++;
    }
    for (const [k, v] of Object.entries(byStack)) console.log(' ', v.n + 'x', k, '\n     ', v.stacks.slice(0, 300));
    console.log('== supabase REST calls:', netLog.length, '==');
    for (const n of netLog) {
      if (n.u.includes('chat_messages') || n.u.includes('conversations')) console.log(' ', rel(n.t), n.m, n.u.slice(0, 130));
    }
    console.log('== marks ==');
    for (const m of marks) console.log(' ', rel(m.t), m.name);
    console.log('\nconsole errors:', page.consoleErrors.slice(0, 5).join(' | ') || 'none');
  } finally {
    await page.close(); child.kill();
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
