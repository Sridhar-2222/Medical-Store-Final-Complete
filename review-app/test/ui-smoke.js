// Phone-size walk through every screen of the new app: node test/ui-smoke.js [wwwDir]
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { serve } = require('./serve');
(async () => {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, '../build/www'));
  const srv = await serve(dir);
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.click('[data-k="hotel"]');
  await page.fill('#su-name', 'Sai Ram Hotel');
  await page.click('#su-go');
  await page.waitForSelector('.hdr');
  const shots = process.env.SHOT_DIR;
  for (const r of ['home', 'accounts', 'sales', 'sale-add', 'purchases', 'purchase-add', 'salaries', 'fixed', 'exp-variable', 'exp-maintenance', 'exp-sudden', 'exp-add', 'cash', 'pl', 'receipts', 'store', 'staff', 'staff-edit', 'customers', 'cust-list', 'cust-add', 'discounts', 'offers', 'offer-add', 'reminders', 'messages', 'reports', 'alerts', 'rep-sales', 'rep-spend', 'spot', 'ask-ai', 'setup', 'setup-biz', 'setup-depts', 'setup-store', 'setup-fixed', 'setup-video', 'setup-ai', 'sync', 'backup', 'guide', 'advances', 'advance-add', 'attendance', 'daily', 'bulk', 'work', 'work-add', 'master-features', 'master-examples', 'master-work']) {
    await page.goto(url + '#' + r);
    await page.waitForTimeout(r === 'home' ? 2600 : 250);
    const bad = await page.$('#view .banner');
    const banner = bad ? await bad.textContent() : '';
    const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log((ow > 0 ? 'OVERFLOW ' + ow + 'px ' : 'ok ') + r + (banner ? ' · ' + banner.slice(0, 80) : ''));
    if (ow > 0) errors.push(r + ' scrolls sideways');
    if (shots && ['home', 'accounts', 'pl', 'customers', 'purchase-add', 'setup'].includes(r)) await page.screenshot({ path: path.join(shots, 'v2-' + r + '.png') });
  }
  await b.close(); srv.close();
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('UI SMOKE OK');
})().catch((e) => { console.error(e); process.exit(1); });
