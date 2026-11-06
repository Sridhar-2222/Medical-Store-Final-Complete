// Browser smoke test: node test/e2e.js [url]   (needs Playwright; starts its own server if no url)
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { createServer } = require('../server/server');

(async () => {
  let url = process.argv[2], srv;
  if (!url) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bizcore-e2e-'));
    srv = await createServer({ env: { DATA_DIR: dir, SUPABASE_URL: '', SUPABASE_KEY: '' } });
    await new Promise((r) => srv.server.listen(0, r));
    url = 'http://localhost:' + srv.server.address().port + '/';
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + ' @ ' + page.url() + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.click('[data-ind="pharmacy"]');
  await page.fill('#setup-name', 'Test Medicals');
  await page.click('#setup-form button[type=submit]');
  await page.waitForSelector('.tiles');
  // sale
  await page.goto(url + '#pos');
  await page.waitForSelector('[data-add]');
  await page.click('[data-add]');
  await page.click('#cart-go');
  await page.waitForSelector('#print-area');
  const receipt = await page.textContent('#print-area');
  if (!/Test Medicals/.test(receipt)) throw new Error('receipt missing business name');
  await page.click('.modal-foot [data-close]');
  // new item
  await page.goto(url + '#items');
  await page.click('#it-new');
  await page.fill('#it-name', 'E2E Tablet');
  await page.fill('#it-price', '50');
  await page.fill('#it-cost', '30');
  await page.fill('#it-stock', '12');
  await page.fill('#it-batch', 'E2E1');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('text=E2E Tablet');
  // purchase
  await page.goto(url + '#purchases');
  await page.click('#pu-new');
  await page.fill('input[data-k=name]', 'New Syrup');
  await page.fill('input[data-k=qty]', '5');
  await page.fill('input[data-k=cost]', '40');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('text=PUR-0001');
  for (const r of ['dashboard', 'sales', 'customers', 'suppliers', 'expenses', 'staff', 'reports', 'prefs', 'data']) {
    await page.goto(url + '#' + r);
    await page.waitForTimeout(250);
    if (await page.$('.banner')) { const t = await page.textContent('.banner'); if (/Could not/.test(t)) throw new Error(r + ': ' + t); }
  }
  await page.goto(url + '#reports');
  await page.waitForSelector('.tiles');
  const shot = process.env.SHOT_DIR;
  if (shot) {
    await page.goto(url + '#dashboard'); await page.waitForSelector('.bars');
    await page.screenshot({ path: path.join(shot, 'desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url + '#pos'); await page.waitForSelector('[data-add]'); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(shot, 'phone.png'), fullPage: false });
    const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (ow > 0) errors.push('horizontal overflow on phone: ' + ow + 'px');
  }
  await browser.close();
  if (srv) srv.server.close();
  if (errors.length) { console.error('Errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('E2E OK on ' + url);
})().catch((e) => { console.error(e); process.exit(1); });
