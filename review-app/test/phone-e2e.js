// Main phone flows of BizCore 3.0, including reading photos on the device: node test/phone-e2e.js
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
  const bill = await mk('bill.png', '<div>FRESH FARMS SUPPLIERS</div><div>Bill No: 9081 Date: 05/11/2026</div><br><div>Tomato 10 kg 48.00 480.00</div><div>Onion 8 kg 35.00 280.00</div><br><div>Grand Total 760.00</div>');
  const report = await mk('report.png', '<div>SAFFRON</div><div>DAY END REPORT 05/11/2026</div><br><div>No. of Bills 84</div><div>Net Sales 30800.00</div><div>Cash 12400.00</div><div>UPI 14900.00</div><div>Card 3500.00</div>');
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  const step = (m) => console.log('·', m);
  const go = async (r) => { await page.goto(url + '#' + r); await page.waitForTimeout(150); };
  const saved = async (t) => { await page.waitForSelector('.toast:has-text("' + (t || 'Saved') + '")', { timeout: 30000 }); };

  await page.goto(url);
  await page.click('[data-k="restaurant"]'); await page.fill('#su-name', 'Saffron'); await page.click('#su-go');
  await page.waitForSelector('.hdr');
  const heads = await page.$$eval('.hdr b', (e) => e.map((x) => x.textContent));
  step('main page headers: ' + heads.join(' · '));
  if (heads.length !== 6 || !(await page.$('svg.finger'))) throw new Error('main page headers / fingertip line missing');

  // Accounts → Sales → Dine-in: read the day-end report photo
  await page.click('.hdr[href="#accounts"]'); await page.waitForSelector('.feat');
  await page.click('.feat[href="#sales"]'); await page.waitForSelector('[data-dep]');
  await page.click('[data-dep]'); await page.waitForSelector('#sa-sale');
  await page.setInputFiles('#sa-att input[accept="image/*"][capture]', report);
  await page.waitForFunction(() => document.getElementById('sa-sale').value === '30800', null, { timeout: 120000 });
  step('sales: day-end report photo filled sales ' + await page.inputValue('#sa-sale') + ', cash ' + await page.inputValue('#sa-cash') + ', bills ' + await page.inputValue('#sa-walkin'));
  await page.click('#sa-save'); await saved('Sales saved');

  // Accounts → Purchases: bill photo read inside the page
  await go('purchase-add'); await page.waitForSelector('#pa-vendor');
  await page.setInputFiles('#pa-att input[capture]', bill);
  await page.waitForFunction(() => document.getElementById('pa-total').value === '760', null, { timeout: 120000 });
  step('purchase bill photo read: ' + await page.inputValue('#pa-vendor') + ', total ' + await page.inputValue('#pa-total'));
  if ((await page.$$('#pa-att .thumb')).length !== 1) throw new Error('photo not kept with the bill');
  await page.selectOption('#pa-cat', 'Vegetables'); await page.click('#pa-save'); await saved('Bill saved');

  // Expenses: sudden needs a reason
  await go('exp-sudden'); await page.click('#ex-add'); await page.waitForSelector('#xa-amt');
  await page.fill('#xa-amt', '2500'); await page.click('#xa-save');
  await page.waitForSelector('.toast.err');
  await page.fill('#xa-note', 'Mixer motor burnt'); await page.click('#xa-save'); await saved();
  step('sudden expense: refused without a reason, saved with one');

  // Staff + salaries
  await go('staff-edit'); await page.fill('#se-name', 'Ravi'); await page.fill('#se-sal', '18000'); await page.click('#se-save'); await saved();
  await go('salaries'); await page.waitForSelector('[data-sal]'); await page.click('#sy-save'); await saved('Salaries saved');
  step('staff added, salary for the month saved');

  // Profit & Loss
  await go('pl'); await page.click('#pl-p [data-v="today"]'); await page.waitForSelector('.stmt');
  const stmt = (await page.textContent('.stmt')).replace(/\s+/g, ' ');
  step('P&L today: ' + stmt.slice(0, 200));
  if (!/Gross profit/.test(stmt) || !/a month ÷ 30 days/.test(stmt) || !/Net profit/.test(stmt)) throw new Error('P&L statement incomplete');

  // Customers → add, vault photo, special discount
  await go('cust-add'); await page.fill('#ca-name', 'Meena'); await page.fill('#ca-phone', '9000000001'); await page.fill('#ca-disc', '5'); await page.click('#ca-save');
  await page.waitForSelector('#v-att'); await saved('Vault created');
  await page.setInputFiles('#v-att input:not([capture])', bill);
  await page.waitForSelector('#v-att .thumb', { timeout: 60000 });
  await page.click('#v-files'); await saved('Saved in');
  const vtext = await page.textContent('#view');
  step('vault: ' + (/Customer discount 5%/.test(vtext) ? 'discount shown, ' : '') + (await page.$$('#v-att .thumb')).length + ' photo saved');
  await go('offer-add'); await page.fill('#of-title', 'Diwali 10% off'); await page.fill('#of-pct', '10'); await page.click('#of-save'); await saved();
  await page.waitForSelector('[data-send]'); await page.click('[data-send]'); await page.waitForSelector('#ms-text');
  const msg = await page.inputValue('#ms-text');
  if (!/Diwali 10% off/.test(msg)) throw new Error('offer message missing');
  step('special discount message: "' + msg.slice(0, 80) + '…"');

  // Videos + reports pages render
  await go('setup-video'); await page.fill('#vd-cus', 'https://youtu.be/dQw4w9WgXcQ'); await page.click('#vd-save'); await saved();
  await go('alerts'); await page.waitForSelector('#al-share');
  await go('home'); await page.waitForSelector('.hdr');
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'v3-home-after.png') });

  await b.close(); st.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('PHONE E2E OK');
})().catch((e) => { console.error(e); process.exit(1); });
