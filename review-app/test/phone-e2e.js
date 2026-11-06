// Main phone flows incl. reading photos on the device: node test/phone-e2e.js
'use strict';
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');
const { serve } = require('./serve');
(async () => {
  const www = path.resolve(process.env.WWW || path.join(__dirname, '../build/www'));
  const st = await serve(www);
  const url = 'http://127.0.0.1:' + st.address().port + '/';
  const b = await chromium.launch();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bzp-'));
  const mk = async (name, html) => { const p = await b.newPage({ viewport: { width: 700, height: 600 } }); await p.setContent('<body style="margin:0;background:#fff;font:26px/1.5 monospace;color:#111;padding:30px">' + html + '</body>'); const f = path.join(dir, name); await p.screenshot({ path: f }); await p.close(); return f; };
  const bill = await mk('bill.png', '<div>FRESH FARMS SUPPLIERS</div><div>Bill No: 9081 Date: 05/11/2026</div><br><div>Tomato 10 kg 48.00 480.00</div><div>Onion 8 kg 35.00 280.00</div><div>Paneer 2 kg 380.00 760.00</div><br><div>Grand Total 1520.00</div>');
  const report = await mk('report.png', '<div>SPICE ROUTE</div><div>DAY END REPORT 05/11/2026</div><br><div>No. of Bills 84</div><div>Net Sales 30800.00</div><div>Cash 12400.00</div><div>UPI 14900.00</div><div>Card 3500.00</div>');
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const step = (m) => console.log('·', m);
  const shots = process.env.SHOT_DIR;

  await page.goto(url);
  await page.click('[data-k="restaurant"]'); await page.fill('#su-name', 'Spice Route'); await page.click('#su-go');
  await page.waitForSelector('.tabs');
  step('home: ' + (await page.$$eval('.stat .l', (e) => e.map((x) => x.textContent).slice(0, 6).join(', '))));

  // today's numbers with cash in hand
  await page.goto(url + '#add-day'); await page.waitForSelector('#d-sale');
  await page.fill('#d-walkin', '60'); await page.fill('#d-sale', '20000'); await page.fill('#d-cash', '15000'); await page.fill('#d-upi', '3000');
  const gap = await page.textContent('#d-gap');
  await page.click('#d-save'); await page.waitForSelector('text=Saved');
  step('today\'s numbers saved · shows "' + gap.trim() + '"');

  // bill photo read on the device
  await page.goto(url + '#add-bill'); await page.waitForSelector('#b-file', { state: 'attached' });
  await page.setInputFiles('#b-file', bill);
  await page.waitForSelector('#bf-save', { timeout: 120000 });
  const lines = await page.$$eval('#bf-lines input[data-k="name"]', (e) => e.map((x) => x.value));
  const total = await page.inputValue('#bf-total');
  const checks = (await page.textContent('#bf-checks')).replace(/\s+/g, ' ');
  step('bill read on the phone: ' + JSON.stringify(lines) + ' total ' + total + ' · ' + checks.slice(0, 70));
  if (lines.length < 3 || total !== '1520' || !/Tomato.*above the usual price/.test(checks)) throw new Error('bill not read / not checked');
  if (shots) await page.screenshot({ path: path.join(shots, 'v2-bill.png'), fullPage: true });
  await page.click('#bf-save'); await page.waitForSelector('text=Saved');

  // day-end report photo
  await page.goto(url + '#add-report'); await page.waitForSelector('#r-file', { state: 'attached' });
  await page.setInputFiles('#r-file', report);
  await page.waitForSelector('#rf-save', { timeout: 120000 });
  const rep = [await page.inputValue('#rf-sale'), await page.inputValue('#rf-cash'), await page.inputValue('#rf-upi'), await page.inputValue('#rf-walk')];
  step('day-end report read: sales ' + rep[0] + ', cash ' + rep[1] + ', UPI ' + rep[2] + ', bills ' + rep[3]);
  if (rep[0] !== '30800' || rep[3] !== '84') throw new Error('report not read');
  await page.click('#rf-save'); await page.waitForSelector('text=Saved');

  // reports: random 3 days, evenings, weekly view
  await page.goto(url + '#reports'); await page.waitForSelector('#rp-period');
  await page.click('details summary.muted'); await page.click('#rp-mode [data-v="random"]');
  await page.waitForSelector('#rp-half'); await page.click('#rp-half [data-v="second"]');
  await page.waitForSelector('#rp-scale'); await page.click('#rp-scale [data-v="week"]');
  const scope = await page.textContent('.card p.muted.small');
  step('spot check: ' + scope.trim().slice(0, 90));
  if (shots) await page.screenshot({ path: path.join(shots, 'v2-reports-spot.png') });

  // customer vault message
  await page.goto(url + '#customers'); await page.waitForSelector('[data-due]');
  await page.click('[data-due]'); await page.waitForSelector('#ms-text');
  const msg = await page.inputValue('#ms-text');
  step('vault reminder: "' + msg.slice(0, 70) + '…"');
  await page.evaluate(() => { window.open = () => null; });
  await page.click('#ms-send'); await page.waitForSelector('text=Saved in');

  // stock count
  await page.goto(url + '#add-count'); await page.waitForSelector('[data-c]');
  await page.fill('[data-c="0"]', '1'); await page.click('#c-save'); await page.waitForSelector('text=Stock count saved');
  step('stock count saved; stock screen: ' + (await page.$$eval('#view .list .item', (e) => e.length)) + ' items');

  await b.close(); st.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('PHONE E2E OK');
})().catch((e) => { console.error(e); process.exit(1); });
