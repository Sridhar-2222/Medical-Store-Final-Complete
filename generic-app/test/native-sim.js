// Simulates the Android app: the web files are served from a separate origin (like the APK's
// https://localhost) with a fake Capacitor bridge, then connected to a real BizCore server.
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server/server');

(async () => {
  const www = process.env.WWW || path.join(__dirname, '../android-app/www');   // WWW=<unzipped APK assets/public> tests the real APK files
  const stat = http.createServer((req, res) => {
    const f = path.join(www, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(www) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => stat.listen(0, r));
  const appUrl = 'http://127.0.0.1:' + stat.address().port + '/';
  const srv = await createServer({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'bz-nat-')), APP_PIN: '2468', SUPABASE_URL: '' } });
  await new Promise((r) => srv.server.listen(0, r));
  const serverUrl = 'http://localhost:' + srv.server.address().port;
  srv.engine.setup({ industry: 'pharmacy', businessName: 'Server Pharmacy', mode: 'both', loadSamples: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    window.__native = [];
    window.Capacitor = { isNativePlatform: () => true,
      nativePromise: (plugin, method, opts) => { window.__native.push(plugin + '.' + method); return Promise.resolve(plugin === 'Filesystem' ? { uri: 'file:///cache/' + opts.path } : {}); } };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const step = (m) => console.log('·', m);
  let blockServer = false;
  await ctx.route(serverUrl + '/**', (route) => (blockServer ? route.abort('internetdisconnected') : route.continue()));

  // 1. Fresh install: phone-only mode works with no server at all
  await page.goto(appUrl);
  await page.waitForSelector('#setup-connect');
  const note = await page.textContent('#setup-form');
  if (!/saved on this phone/.test(note)) throw new Error('expected phone wording');
  step('fresh app opens in phone-only mode');

  // 2. Connect to the shop server (cross-origin + PIN)
  await page.click('#setup-connect');
  await page.fill('#cn-url', serverUrl);
  await page.fill('#cn-pin', '2468');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('#sync-pill', { timeout: 15000 }).catch(async (e) => { console.log('Connect step failed; page shows:', page.url(), (await page.textContent('body')).slice(0, 300)); throw e; });
  await page.waitForFunction(() => /Online/.test(document.getElementById('sync-pill').textContent));
  const brand = await page.textContent('.brand-name');
  if (brand !== 'Server Pharmacy') throw new Error('not showing server data: ' + brand);
  step('connected to server across origins with PIN: ' + brand);
  await page.waitForFunction(() => !!localStorage.getItem('bizcore-cache-v1'), null, { timeout: 10000 });

  // 3. Lose connection mid-use and keep billing
  blockServer = true;
  await page.goto(appUrl + '#pos');
  await page.waitForSelector('[data-add]');
  await page.click('[data-add]');
  await page.click('#cart-go');
  await page.waitForSelector('#print-area');
  if (await page.$('#rc-print')) throw new Error('print button should be hidden in the app');
  await page.click('.modal-foot [data-close]');
  const pill = await page.textContent('#sync-pill');
  if (!/Offline · 1 to sync/.test(pill)) throw new Error('unexpected badge ' + pill);
  step('connection lost: sale saved on phone (' + pill + ')');

  // 4. Connection returns
  blockServer = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => /Online/.test(document.getElementById('sync-pill').textContent), null, { timeout: 20000 });
  if (srv.engine.list('sales').total !== 1) throw new Error('server did not get the sale');
  step('back online: server has the sale');

  // 5. Backup uses the Android share sheet
  await page.goto(appUrl + '#data');
  await page.click('#dt-backup');
  await page.waitForFunction(() => window.__native.includes('Share.share'));
  step('backup handed to Android share sheet: ' + (await page.evaluate(() => window.__native.join(', '))));

  // 6. Read a bill photo on the phone, offline, using the files packaged in the app
  const bill = path.join(os.tmpdir(), 'bz-native-bill.png');
  const bp = await browser.newPage({ viewport: { width: 640, height: 420 } });
  await bp.setContent('<body style="margin:0;background:#fff;font:26px/1.5 monospace;color:#111;padding:30px"><div>CITY MEDICAL AGENCIES</div><div>Bill No: 5521 Date: 04/11/2026</div><div>Paracetamol 10 strip 18.00 180.00</div><div>ORS 20 pcs 19.00 380.00</div><div>Grand Total 560.00</div></body>');
  await bp.screenshot({ path: bill }); await bp.close();
  blockServer = true;   // no internet
  await page.goto(appUrl + '#scan');
  await page.waitForSelector('#sc-engine');
  await page.selectOption('#sc-engine', 'device');
  await page.setInputFiles('#sc-file', bill);
  await page.waitForSelector('#sc-form', { timeout: 120000 });
  const lines = await page.$$eval('#en-items input[data-k="name"]', (els) => els.map((e) => e.value));
  if (lines.length < 2) throw new Error('bill not read on device: ' + JSON.stringify(lines));
  step('bill photo read on the phone with no internet: ' + JSON.stringify(lines));
  blockServer = false;

  await page.screenshot({ path: process.env.SHOT || path.join(os.tmpdir(), 'native.png') });
  await browser.close(); stat.close(); srv.server.close(); srv.server.closeAllConnections();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('NATIVE SIMULATION OK');
})().catch((e) => { console.error(e); process.exit(1); });
