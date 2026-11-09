// Offline test: node test/offline-e2e.js   (needs Playwright)
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { createServer } = require('../server/server');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bizcore-off-'));
  const srv = await createServer({ env: { DATA_DIR: dir, SUPABASE_URL: '', SUPABASE_KEY: '', APP_PIN: '' } });
  await new Promise((r) => srv.server.listen(0, r));
  const url = 'http://localhost:' + srv.server.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const step = (m) => console.log('·', m);

  await page.goto(url);
  await page.click('[data-ind="grocery"]');
  await page.fill('#setup-name', 'Offline Mart');
  await page.click('#setup-form button[type=submit]');
  await page.waitForSelector('.flags');
  await page.waitForFunction(() => document.getElementById('sync-pill').textContent.includes('Online'));
  await page.waitForFunction(() => !!localStorage.getItem('bizcore-cache-v1') && JSON.parse(localStorage.getItem('bizcore-cache-v1')).entries.length > 0, null, { timeout: 15000 });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(() => {});
  step('online and cached');

  const before = srv.engine.list('entries').total;
  await ctx.setOffline(true);
  await page.reload();                                   // must open from the service worker cache
  await page.waitForSelector('#sync-pill', { timeout: 15000 });
  const pill = await page.textContent('#sync-pill');
  if (!/Offline/.test(pill)) throw new Error('expected offline badge, got ' + pill);
  step('reopened with no network: ' + pill);

  // enter the day's numbers and an expense while offline
  await page.goto(url + '#daily');
  await page.waitForSelector('#dy-0-sale');
  await page.fill('#dy-0-walkin', '55');
  await page.fill('#dy-0-sale', '18000');
  await page.fill('#dy-0-cash', '18000');
  await page.click('#dy-save');
  await page.waitForSelector('text=Saved 3 figures');
  await page.goto(url + '#entries');
  await page.click('#ent-new');
  await page.selectOption('#en-type', 'expense');
  await page.fill('#en-amount', '750');
  await page.fill('#en-cat', 'Transport');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('text=Saved');
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('bizcore-outbox-v1')).length);
  if (queued !== 2) throw new Error('expected 2 queued changes, got ' + queued);
  if (srv.engine.list('entries').total !== before) throw new Error('server changed while offline?');
  step('2 changes queued offline');

  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('bizcore-outbox-v1') || '[]').length === 0, null, { timeout: 20000 });
  const after = srv.engine.list('entries').total;
  if (after !== before + 4) throw new Error('server should have 4 new entries, has ' + (after - before));
  step('synced: server has the walk-ins, sales, collection and expense');

  // replaying the same ops again must not duplicate
  const ops = [{ opId: 'dup-test-1', method: 'save', args: ['expenses', { amount: 10, category: 'Other', id: 'expdup0001' }] }];
  srv.engine.applyOps(ops); srv.engine.applyOps(ops);
  if (srv.engine.list('expenses').total !== 1) throw new Error('duplicate op applied twice');
  step('duplicate upload ignored');

  // a second device sees the data
  const page2 = await (await browser.newContext()).newPage();
  await page2.goto(url + '#entries');
  await page2.waitForSelector('tr[data-id]');
  step('second device sees ' + (await page2.$$('tr[data-id]')).length + ' entries from the last 7 days');

  await browser.close();
  srv.server.close(); srv.server.closeAllConnections();
  if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('OFFLINE E2E OK');
})().catch((e) => { console.error(e); process.exit(1); });
