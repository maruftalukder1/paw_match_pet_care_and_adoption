// CDP driver v2: loads the local vite dev server through Fetch-domain
// interception. The browser navigates to https://example.com/ (via the
// environment egress proxy); every request to that origin is fulfilled by
// Node from the local vite server. This sidesteps the Chromium build's
// Local Network Access block on direct localhost navigation.
// The page origin is https://example.com -> secure context, localStorage works.
const WebSocket = require('/home/hatch/workspace/goals/local-pet-care-adoption-matchmaker/hidden_files/pawmatch-v2/node_modules/ws');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const VITE = 'http://127.0.0.1:3001';
const ORIGIN = 'https://example.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpPutJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'PUT' }, (resp) => {
      let d = '';
      resp.on('data', (c) => (d += c));
      resp.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json: ' + d.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// Fetch a path from the local vite server, return {status, headers, body}
function fetchLocal(path) {
  return new Promise((resolve) => {
    const req = http.get(VITE + path, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve({
        status: resp.statusCode,
        headers: resp.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', (e) => resolve({ status: 502, headers: {}, body: Buffer.from('proxy err: ' + e.message) }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 504, headers: {}, body: Buffer.from('timeout') }); });
  });
}

class InterceptPage {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.handlers = {};
  }
  on(method, fn) { this.handlers[method] = fn; }
  async connect() {
    this.ws = new WebSocket(this.wsUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (this.handlers[m.method]) { try { this.handlers[m.method](m.params); } catch (e) { console.error('handler err', e.message); } }
      if (m.method === 'Runtime.consoleAPICalled' && m.params && m.params.type === 'error') {
        this.consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      }
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) rej(new Error('CDP ' + JSON.stringify(m.error).slice(0, 300)));
        else res(m.result);
      }
    });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    // Intercept every request; fulfill example.com/* from the local vite server.
    this.on('Fetch.requestPaused', async (p) => {
      try {
        const u = new URL(p.request.url);
        if (u.origin === ORIGIN) {
          const local = await fetchLocal(u.pathname + u.search);
          const headers = [];
          for (const [k, v] of Object.entries(local.headers)) {
            if (['content-length', 'connection', 'keep-alive', 'transfer-encoding', 'content-encoding'].includes(k.toLowerCase())) continue;
            headers.push({ name: k, value: Array.isArray(v) ? v.join(', ') : String(v) });
          }
          await this.send('Fetch.fulfillRequest', {
            requestId: p.requestId,
            responseCode: local.status,
            responseHeaders: headers,
            body: local.body.toString('base64'),
          });
        } else {
          await this.send('Fetch.continueRequest', { requestId: p.requestId });
        }
      } catch (e) {
        try { await this.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }); } catch {}
      }
    });
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); } }, 30000);
    });
  }
  async navigate() {
    await this.send('Page.navigate', { url: ORIGIN + '/' });
    await new Promise((resolve) => {
      const handler = (raw) => {
        try {
          const m = JSON.parse(raw.toString());
          if (m.method === 'Page.loadEventFired') { this.ws.off('message', handler); resolve(); }
        } catch {}
      };
      this.ws.on('message', handler);
      setTimeout(() => { this.ws.off('message', handler); resolve(); }, 20000);
    });
    await sleep(500);
  }
  async evaluate(fnSource, ...args) {
    const expr = `(${fnSource}).apply(null, ${JSON.stringify(args)})`;
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('evaluate failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result && 'value' in r.result ? r.result.value : undefined;
  }
  async close() { try { this.ws.close(); } catch {} }
}

async function launch({ port = 9341, width = 1366, height = 600, profile = '/tmp/pawtest/prof-intercept' } = {}) {
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--proxy-server=${proxy}`,
    '--proxy-bypass-list=127.0.0.1,localhost',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ];
  const child = spawn('/opt/meta-chromium/chrome', args, { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await httpPutJson(`http://127.0.0.1:${port}/json/version`); break; }
    catch { await sleep(200); if (i === 49) throw new Error('chrome did not start'); }
  }
  const targets = await httpPutJson(`http://127.0.0.1:${port}/json/list`);
  const t = targets.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
  const page = new InterceptPage(t.webSocketDebuggerUrl);
  await page.connect();
  return { child, page };
}

module.exports = { launch, sleep, ORIGIN };
