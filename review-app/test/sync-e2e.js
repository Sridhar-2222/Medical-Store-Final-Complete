// Two phones and the office system: node test/sync-e2e.js
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const { createServer } = require('../server/server');
(async () => {
  const srv = await createServer({ env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'bzs-')), APP_PIN: '2468', SUPABASE_URL: '', WWW_DIR: path.join(__dirname, '../build/www') } });
  await new Promise((r) => srv.server.listen(0, r));
  const office = 'http://127.0.0.1:' + srv.server.address().port + '/';
  const { serve } = require('./serve');
  const st = await serve(path.join(__dirname, '../build/www'));        // the phone app runs from its own origin (like the APK)
  const app = 'http://localhost:' + st.address().port + '/';
  const b = await chromium.launch();
  const errors = [];
  const step = (m) => console.log('·', m);
  async function phone() { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); return { ctx, p }; }
  async function connect(p, accept) {
    await p.goto(app + '#sync'); await p.waitForSelector('#sy-url');
    await p.fill('#sy-url', office); await p.fill('#sy-pin', '2468'); await p.click('#sy-go');
    await p.waitForSelector('#cf-yes'); await p.click('#cf-yes');
    await p.waitForSelector('#sy-now', { timeout: 15000 });
  }

  // Phone A: used on its own first, then connected (sends its data to the empty office)
  const A = await phone();
  await A.p.goto(app); await A.p.click('[data-k="restaurant"]'); await A.p.fill('#su-name', 'Spice Route'); await A.p.click('#su-go');
  await A.p.waitForSelector('.tabs');
  const phoneEntries = await A.p.evaluate(() => App.api.info().counts.entries);
  await connect(A.p);
  if (srv.app.list('entries').total !== phoneEntries) throw new Error('office did not receive the phone data');
  step('phone A worked alone, then sent its ' + phoneEntries + ' entries to the office');

  // Phone B: connects and gets the office data
  const B = await phone();
  await B.p.goto(app); await B.p.click('[data-k="restaurant"]'); await B.p.fill('#su-name', 'temp'); await B.p.uncheck('#su-sample'); await B.p.click('#su-go');
  await B.p.waitForSelector('.tabs');
  await connect(B.p);
  const nameB = await B.p.evaluate(() => App.S().businessName);
  if (nameB !== 'Spice Route') throw new Error('phone B did not get office data: ' + nameB);
  step('phone B connected and now shows "' + nameB + '"');

  // A enters an expense; B sees it after syncing
  await A.p.goto(app + '#add-expense'); await A.p.waitForSelector('#e-amt');
  await A.p.fill('#e-amt', '777'); await A.p.fill('#e-to', 'Gas agency'); await A.p.click('#e-save');
  await A.p.waitForFunction(() => App.sync.outbox.length === 0, null, { timeout: 15000 });
  await B.p.evaluate(() => App.runSync());
  const seen = await B.p.evaluate(() => App.api.list('entries', { search: 'Gas agency' }).total);
  if (seen !== 1) throw new Error('phone B does not see the expense');
  step('expense entered on phone A appears on phone B');

  // A offline: entries wait, then go through
  await A.ctx.setOffline(true);
  await A.p.goto(app + '#add-day'); await A.p.waitForSelector('#d-sale');
  await A.p.fill('#d-walkin', '40'); await A.p.fill('#d-sale', '15000'); await A.p.fill('#d-cash', '15000'); await A.p.fill('#d-cashInHand', '9000');
  await A.p.click('#d-save');
  await A.p.waitForTimeout(2500);
  const waiting = await A.p.evaluate(() => App.sync.outbox.length);
  if (!waiting) throw new Error('nothing queued while offline');
  await A.ctx.setOffline(false);
  await A.p.evaluate(() => App.runSync());
  await A.p.waitForFunction(() => App.sync.outbox.length === 0, null, { timeout: 15000 });
  step('offline: numbers waited on phone A (' + waiting + ' change), then reached the office');

  // vault link titled with the business
  await A.p.evaluate(() => App.api.saveSettings({ vaultTitle: 'Spice Route Restaurant' }));
  const cid = await A.p.evaluate(() => App.api.list('customers').rows[0].id);
  await A.p.evaluate((id) => App.go('message', { id, share: true }), cid);
  await A.p.waitForSelector('#ms-text');
  const text = await A.p.inputValue('#ms-text');
  const link = (text.match(/https?:\/\/\S+\/v\/[a-z0-9]+/) || [])[0];
  if (!link) throw new Error('no vault link in message: ' + text);
  await A.p.evaluate(() => App.runSync());
  await A.p.waitForFunction(() => App.sync.outbox.length === 0);
  const page = await (await fetch(link)).text();
  if (!/<h1>Spice Route Restaurant<\/h1>/.test(page)) throw new Error('vault page not titled');
  step('customer gets a private vault link; the page is titled "Spice Route Restaurant"');

  await b.close(); st.close(); srv.server.close(); srv.server.closeAllConnections();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('SYNC E2E OK');
})().catch((e) => { console.error(e); process.exit(1); });
