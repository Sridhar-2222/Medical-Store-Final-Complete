// Walks every screen of Fingertip Hotel at phone size and exercises the four actions.
// Run: node test/e2e.js  (needs Playwright). Fails on any page error.
const { chromium } = require('playwright');
const path = require('path');
const shots = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.dismiss());
  await p.goto('file://' + path.join(__dirname, '..', 'web', 'index.html'));
  const ok = (m) => console.log('· ' + m);
  const snap = async (n) => { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); };

  // first start: nothing but the business name
  if (await p.locator('text=e.g.').count()) throw new Error('example text on first start');
  await p.fill('#su-name', 'Saffron House'); await p.click('#su-go');
  await p.waitForSelector('.hdr'); await snap('01-home');
  const heads = await p.$$eval('.hdr', a => a.map(x => x.getAttribute('href')));
  if (heads.length !== 8) throw new Error('expected 8 headers, got ' + heads.length);
  if (await p.locator('.hdr .fig, .stat').count()) throw new Error('figures on the main page');
  ok('main page: 8 headers, names only, title ' + await p.textContent('h1'));

  // every header → every sub-header renders
  const plan = await p.evaluate(() => PLAN.headers.map(h => ({ key: h.key, subs: h.subs.map(s => s.key) })));
  for (const h of plan) {
    await p.evaluate(k => { location.hash = 'h/' + k; }, h.key); await p.waitForSelector('.feats');
    const n = await p.locator('.feats .feat').count(); if (n !== h.subs.length) throw new Error(h.key + ': ' + n + ' sub-headers');
    for (const s of h.subs) { await p.evaluate(k => { location.hash = 's/' + k; }, s); await p.waitForSelector('main > *'); }
  }
  ok('every header and sub-header opens');

  // a data sub-header shows exactly the four actions
  await p.evaluate(() => { location.hash = 's/roomsales'; }); await p.waitForSelector('.acts');
  const acts = await p.$$eval('.acts .feat b', a => a.map(x => x.textContent));
  if (acts.join() !== 'Upload,Download,Combine,Understand') throw new Error('actions: ' + acts);
  await snap('02-sub'); ok('sub-header: ' + acts.join(' · '));

  // settings: rooms list
  await p.evaluate(() => { location.hash = 's/s-rooms'; }); await p.fill('#rl', '101\n102\n103\n104'); await p.click('#rl-save');
  // upload → type it
  await p.evaluate(() => { location.hash = 'up/roomsales'; }); await p.waitForSelector('.feats'); await snap('03-upload');
  await p.click('a[href="#entry/roomsales"]'); await p.fill('#e-room', '101'); await p.fill('#e-qty', '3'); await p.fill('#e-amount', '4500'); await p.click('#e-save');
  await p.waitForSelector('[data-r]'); ok('typed entry saved');
  // upload → Excel / CSV
  const t = await p.evaluate(() => { const d = new Date(); const f = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toLocaleDateString('en-GB'); }; return { a: f(1), b: f(2) }; });
  await p.evaluate(([a, b]) => Hotel.importCsv('roomsales', 'Date,Room,Rooms sold,Total,Remarks\n' + a + ',102,2,3200,walk-in\n' + b + ',103,4,6400,"OTA, net"\n'), [t.a, t.b]);
  await p.click('#ci-ok'); await p.waitForTimeout(200);
  const n = await p.evaluate(() => Hotel.db().records.filter(r => r.sub === 'roomsales').length);
  if (n !== 3) throw new Error('csv import: ' + n); ok('CSV import: 2 rows read by column names');
  await p.evaluate(() => { location.hash = 'up/payments'; }); await p.click('a[href="#entry/payments"]'); await p.fill('#e-amount', '4000'); await p.selectOption('#e-mode', 'UPI'); await p.click('#e-save');
  await p.evaluate(() => { location.hash = 'up/expenses'; }); await p.click('a[href="#entry/expenses"]'); await p.fill('#e-amount', '1200'); await p.click('#e-save');

  // download, combine, understand
  await p.evaluate(() => { location.hash = 'down/roomsales'; }); await p.waitForSelector('#d-csv'); await snap('04-download'); ok('download page');
  await p.evaluate(() => { location.hash = 'comb/roomsales'; }); await p.selectOption('#c-o', 'payments'); await p.waitForSelector('tr.tot');
  const diff = await p.textContent('tr.tot td:last-child'); await snap('05-combine'); ok('combine room sales ⇄ payments, difference ' + diff);
  await p.evaluate(() => { location.hash = 'und/roomsales'; }); await p.waitForSelector('.stats'); await snap('06-understand');
  ok('understand: ' + (await p.$$eval('.stat', a => a.map(x => x.textContent.replace(/\s+/g, ' ')))).slice(0, 3).join(' | '));

  // reports
  await p.evaluate(() => { location.hash = 's/r-profit'; }); await p.waitForSelector('tr.tot'); ok('profit: ' + (await p.textContent('tr.tot:last-child')).replace(/\s+/g, ' '));
  await p.evaluate(() => { location.hash = 's/r-occupancy'; }); await p.waitForSelector('table'); ok('occupancy table');
  await p.evaluate(() => { location.hash = 's/r-daily'; }); await p.waitForSelector('table');
  await p.evaluate(() => { location.hash = 's/r-monthly'; }); await p.waitForSelector('table');

  // guest vault
  await p.evaluate(() => { location.hash = 's/vaults'; }); await p.click('a[href="#guest"]');
  await p.fill('#g-name', 'Meena Rao'); await p.fill('#g-phone', '9876543210'); await p.click('#g-save');
  await p.waitForSelector('.vault-banner'); const vt = await p.textContent('.vault-banner b');
  if (vt !== 'Saffron House') throw new Error('vault title ' + vt);
  await p.evaluate(() => { location.hash = 'up/bookings'; }); await p.click('a[href="#entry/bookings"]'); await p.fill('#e-guest', 'Meena Rao'); await p.fill('#e-room', '102'); await p.fill('#e-amount', '3000'); await p.click('#e-save');
  const gid = await p.evaluate(() => Hotel.db().guests[0].id);
  await p.evaluate(id => { location.hash = 'vault/' + id; }, gid); await p.waitForSelector('.vault-banner'); await snap('07-vault');
  await p.click('#v-send'); await p.waitForSelector('#m-text'); const msg = await p.inputValue('#m-text');
  if (!/Saffron House vault/.test(msg) || !/room 102/.test(msg)) throw new Error('vault message: ' + msg);
  ok('guest vault titled "' + vt + '"; message: ' + msg.split('\n')[0]);
  // a new vault from the link starts empty (no leftover values)
  await p.evaluate(() => { location.hash = 's/vaults'; }); await p.click('a[href="#guest"]');
  if (await p.inputValue('#g-name')) throw new Error('new vault form not empty');
  await p.evaluate(() => { location.hash = 's/reminders'; }); await p.selectOption('#rm-g', gid); await p.fill('#rm-t', 'Anniversary'); await p.click('#rm-add'); await p.waitForSelector('[data-send]'); ok('reminder added');
  await p.evaluate(() => { location.hash = 's/messages'; }); await p.evaluate(() => { location.hash = 's/s-backup'; }); await p.waitForSelector('#bk-save');
  await p.evaluate(() => { location.hash = 's/s-business'; }); await p.fill('#b-vault', 'Saffron House, Karimnagar'); await p.click('#b-save');
  await p.evaluate(id => { location.hash = 'vault/' + id; }, gid); await p.waitForSelector('.vault-banner');
  if (await p.textContent('.vault-banner b') !== 'Saffron House, Karimnagar') throw new Error('vault title change not shown'); ok('vault name can differ from business name');

  // no examples anywhere in the screens visited
  if (await p.evaluate(() => /e\.g\./.test(document.body.innerText))) throw new Error('example text found');
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
  console.log('HOTEL E2E OK'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
