// Review screens in a real browser, including reading a bill photo on-device: node test/review-e2e.js
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { createServer } = require('../server/server');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bizcore-rev-'));
  const srv = await createServer({ env: { DATA_DIR: dir, SUPABASE_URL: '', APP_PIN: '', GOOGLE_API_KEY: '' } });
  await new Promise((r) => srv.server.listen(0, r));
  const url = 'http://localhost:' + srv.server.address().port + '/';
  const shots = process.env.SHOT_DIR;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const step = (m) => console.log('·', m);

  // make a bill photo
  const billPng = path.join(dir, 'bill.png');
  const bp = await browser.newPage({ viewport: { width: 700, height: 620 } });
  await bp.setContent(`<body style="margin:0;background:#fff;font:26px/1.5 'DejaVu Sans Mono',monospace;color:#111;padding:30px">
    <div>FRESH FARMS SUPPLIERS</div><div>Bill No: 9081 Date: 05/11/2026</div><br>
    <div>Tomato 10 kg 48.00 480.00</div><div>Onion 8 kg 35.00 280.00</div><div>Paneer 2 kg 380.00 760.00</div><br>
    <div>Grand Total 1520.00</div></body>`);
  await bp.screenshot({ path: billPng });
  await bp.close();

  await page.goto(url);
  await page.click('[data-ind="restaurant"]');
  await page.fill('#setup-name', 'Spice Route');
  await page.click('#setup-form button[type=submit]');
  await page.waitForSelector('.flags');
  const flags = await page.$$eval('.flag b', (els) => els.map((e) => e.textContent));
  step('overview shows ' + flags.length + ' things to check, e.g. "' + flags[0] + '"');
  if (!flags.some((f) => /above usual price/.test(f))) throw new Error('price rise not on overview');
  if (shots) await page.screenshot({ path: path.join(shots, 'review-overview.png') });

  // daily numbers
  await page.goto(url + '#daily');
  await page.waitForSelector('#dy-0-sale');
  await page.fill('#dy-0-sale', '20000');
  await page.fill('#dy-0-cash', '15000');
  await page.fill('#dy-0-upi', '3000');
  const gap = await page.textContent('#dy-gap-0');
  if (!/2,000|2000/.test(gap)) throw new Error('gap not shown: ' + gap);
  await page.click('#dy-save');
  await page.waitForSelector('.toast');
  step('daily numbers saved; shows "' + gap + '"');

  // spot check: 3 random days, second half
  await page.goto(url + '#review');
  await page.click('[data-mode="random"]');
  await page.waitForFunction(() => /Picked/.test(document.getElementById('rv-picked').textContent));
  await page.click('[data-half="second"]');
  await page.click('#rv-run');
  await page.waitForSelector('#rv-out .summary');
  const scope = await page.textContent('#rv-out .panel p.muted');
  step('spot check: ' + scope.slice(0, 120));
  if (!/random day/.test(scope) || !/Second half/.test(scope)) throw new Error('scope wrong');

  // scan a bill, read on device
  await page.goto(url + '#scan');
  await page.selectOption('#sc-engine', 'device');
  await page.setInputFiles('#sc-file', billPng);
  await page.waitForSelector('#sc-form', { timeout: 120000 });
  const vendor = await page.inputValue('#en-vendor');
  const lines = await page.$$eval('#en-items input[data-k="name"]', (els) => els.map((e) => e.value));
  const total = await page.inputValue('#en-amount');
  step('bill read on device: vendor "' + vendor + '", lines ' + JSON.stringify(lines) + ', total ' + total);
  if (lines.length < 3 || !/1520/.test(total)) throw new Error('OCR result incomplete');
  await page.waitForSelector('#sc-checks .flag, #sc-checks p');
  const checks = await page.textContent('#sc-checks');
  step('checks: ' + checks.replace(/\s+/g, ' ').slice(0, 160));
  if (!/Tomato.*above the usual price/.test(checks)) throw new Error('price check missing');
  if (shots) await page.screenshot({ path: path.join(shots, 'review-scan.png'), fullPage: true });
  await page.click('#sc-form button[type=submit]');
  await page.waitForSelector('text=Bill saved');
  if (!srv.engine.list('receipts').total) throw new Error('receipt not saved');
  step('bill saved with ' + srv.engine.list('entries', { search: 'FRESH' }).rows[0].items.length + ' item lines');

  // phone layout
  await page.setViewportSize({ width: 390, height: 844 });
  for (const r of ['overview', 'daily', 'scan', 'review', 'entries', 'departments', 'prefs', 'data']) {
    await page.goto(url + '#' + r);
    await page.waitForTimeout(400);
    const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (ow > 0) errors.push(r + ': page scrolls sideways by ' + ow + 'px');
  }
  if (shots) { await page.goto(url + '#overview'); await page.waitForSelector('.flags'); await page.screenshot({ path: path.join(shots, 'review-phone.png') }); }
  step('phone layout fits on every review screen');

  await browser.close();
  srv.server.close(); srv.server.closeAllConnections();
  if (errors.length) { console.error('Errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('REVIEW E2E OK');
})().catch((e) => { console.error(e); process.exit(1); });
