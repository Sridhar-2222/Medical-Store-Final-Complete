'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../core/engine');
const Review = require('../core/review');
const OCR = require('../core/ocr-parse');
const AI = require('../core/ai');

const TODAY = '2026-11-06';
function fresh(industry = 'restaurant', samples = false) {
  const store = { data: null, commit() {} };
  const e = createEngine(store, { now: () => new Date(2026, 10, 6, 10, 0, 0) });
  e.setup({ industry, businessName: 'Test', mode: 'review', loadSamples: samples });
  return e;
}
const dep = (e, i = 0) => e.list('departments', { sort: 'order' }).rows[i];

test('review mode sets up departments per business type, including hotel', () => {
  const e = fresh('hotel');
  const names = e.list('departments').rows.map((d) => d.name);
  assert.ok(names.includes('Housekeeping') && names.includes('Banquet'));
  assert.deepEqual(e.info().settings.modules.slice(0, 2), ['overview', 'daily']);
});

test('daily sheet saves, reloads and replaces figures', () => {
  const e = fresh();
  const d = dep(e, 1);
  e.saveDailySheet({ date: TODAY, rows: [{ departmentId: d.id, sale: 10000, cash: 6000, upi: 3500, expense: 800 }] });
  let row = e.getDailySheet(TODAY, '').find((r) => r.departmentId === d.id);
  assert.equal(row.sale, 10000); assert.equal(row.upi, 3500);
  e.saveDailySheet({ date: TODAY, rows: [{ departmentId: d.id, sale: 12000, cash: 12000 }] });
  row = e.getDailySheet(TODAY, '').find((r) => r.departmentId === d.id);
  assert.equal(row.sale, 12000); assert.equal(row.upi, undefined);
  assert.equal(e.list('entries').total, 2);
});

test('insights: totals, ratios, fixed vs variable, collection gap', () => {
  const e = fresh();
  const d = dep(e, 1);
  e.saveEntry({ type: 'sale', date: TODAY, departmentId: d.id, amount: 10000 });
  e.saveEntry({ type: 'collection', date: TODAY, departmentId: d.id, amount: 8500, method: 'UPI' });
  e.saveEntry({ type: 'expense', date: TODAY, amount: 30000, category: 'Rent' });
  e.saveEntry({ type: 'expense', date: TODAY, amount: 1000, category: 'Gas' });
  e.saveEntry({ type: 'purchase', date: TODAY, amount: 4000 });
  e.saveEntry({ type: 'wastage', date: TODAY, amount: 400 });
  const r = e.reviewInsights({ from: TODAY, to: TODAY });
  assert.equal(r.totals.sale, 10000);
  assert.equal(r.ratios.collection, 85);
  assert.equal(r.totals.fixed, 30000, 'rent defaults to fixed');
  assert.equal(r.totals.variable, 1000);
  assert.equal(r.ratios.wastage, 10);
  assert.ok(r.flags.some((f) => /Collection short by/.test(f.title) && f.severity === 'high'));
  assert.ok(r.flags.some((f) => /Wastage is 10% of purchases/.test(f.title)));
});

test('price rise against earlier bills and delivery shortfall are flagged', () => {
  const e = fresh();
  for (let i = 10; i >= 2; i--) {
    const d = Review.addDays(TODAY, -i);
    e.saveEntry({ type: 'purchase', date: d, vendor: 'A', items: [{ name: 'Tomato', qty: 10, unit: 'kg', rate: 30 }] });
  }
  e.saveEntry({ type: 'purchase', date: TODAY, vendor: 'B', items: [{ name: 'tomato', qty: 10, unit: 'kgs', rate: 40, received: 7 }] });
  const r = e.reviewInsights({ from: Review.addDays(TODAY, -10), to: TODAY });
  assert.equal(r.priceAlerts.length, 1);
  assert.equal(r.priceAlerts[0].up, 33.33);
  assert.equal(r.shortfalls[0].value, 120);
  assert.ok(r.cheaperElsewhere.length >= 1);
  const c = e.checkReceipt({ vendor: 'B', date: TODAY, items: [{ name: 'Tomato', qty: 5, unit: 'kg', rate: 45, amount: 225 }], total: 300 });
  assert.equal(c.priceAlerts.length, 1);
  assert.ok(c.issues.some((x) => /add up to 225/.test(x)));
});

test('half-day and random-day selections compare with the same half across the period', () => {
  const e = fresh('restaurant', true);
  const all = e.reviewInsights({});
  assert.ok(all.scope.entryCount > 300);
  const days = e.sampleDays({ from: all.scope.from, to: all.scope.to, count: 3, seed: 'x' });
  assert.equal(days.length, 3);
  assert.deepEqual(days, e.sampleDays({ from: all.scope.from, to: all.scope.to, count: 3, seed: 'x' }), 'same seed, same days');
  const s = e.reviewInsights({ days, half: 'second' });
  assert.equal(s.scope.days.length, 3);
  assert.equal(s.baseline.half, 'second');
  assert.ok(s.perDay.sale > 0 && s.baseline.perDay.sale > 0);
  // sample data plants these problems
  const titles = all.flags.map((f) => f.title).join('\n');
  assert.match(titles, /above usual price/);
  assert.match(titles, /billed .* received/);
  assert.match(titles, /Collection short/);
  assert.match(titles, /Wastage \d+% of purchases on/);
});

test('saving a receipt creates an entry and blocks duplicates', () => {
  const e = fresh();
  const out = e.saveReceipt({ engine: 'device', text: 'raw', entry: { type: 'purchase', date: TODAY, vendor: 'Veg Mart', billNo: '77', items: [{ name: 'Onion', qty: 5, rate: 30 }] } });
  assert.equal(out.entry.amount, 150);
  assert.equal(out.entry.receiptId, out.receipt.id);
  assert.throws(() => e.saveReceipt({ entry: { type: 'purchase', vendor: 'veg mart', billNo: '77', amount: 10 } }), /already saved/);
  e.removeEntry(out.entry.id);
  assert.equal(e.list('receipts').total, 0);
});

test('offline sync applies review changes once', () => {
  const e = fresh();
  const ops = [{ opId: 'o1', method: 'saveEntry', args: [{ id: 'entry0001', type: 'sale', amount: 500, date: TODAY }] }];
  e.applyOps(ops); e.applyOps(ops);
  assert.equal(e.list('entries').total, 1);
});

test('OCR text parser handles common bill layouts', () => {
  const r = OCR.parse('FRESH FARMS\nInvoice No: 4521  Dt: 3-Nov-26\n1 Potato 25 kg 28.00 700.00\nCoriander 2 bunch 15 30\nPaneer 2.5 Kg MRP 420 380 950.00\nTOTAL 1680.00\nCash 2000');
  assert.equal(r.vendor, 'FRESH FARMS');
  assert.equal(r.billNo, '4521');
  assert.equal(r.date, '2026-11-03');
  assert.equal(r.total, 1680);
  assert.equal(r.items.length, 3);
  assert.deepEqual(r.items[2], { name: 'Paneer', qty: 2.5, unit: 'kg', rate: 380, amount: 950 });
  assert.equal(r.items[1].rate, 15);
  assert.match(OCR.parse('X\nTomato 5 kg 30 150\nReturned damaged 1 kg').notes[0], /damaged/);
});

test('AI receipt answer is cleaned up', () => {
  const o = AI.parseReceipt('{"vendor":"Gas Agency","total":"1850","type":"expense","costType":"variable","items":[],"notes":["no bill number"],"date":"2026-11-02"}');
  assert.equal(o.total, 1850); assert.equal(o.type, 'expense'); assert.equal(o.notes.length, 1);
  assert.match(AI.receiptPrompt({ presetName: 'Hotel', department: 'Kitchen', categories: ['Gas'] }), /Kitchen/);
});

test('every business type has key numbers, a guide and a customer vault', () => {
  const I = require('../core/industries');
  assert.equal(I.list().length, 14);
  for (const { key } of I.list()) {
    const r = I.get(key).review;
    assert.ok(r.kpis.length >= 3, key + ' kpis');
    assert.ok(r.playbook.photos.length && r.playbook.owner.length && r.playbook.customers.length >= 3, key + ' guide');
    assert.ok(r.vault.records.length >= 2 && r.vault.templates.length >= 3, key + ' vault');
    assert.match(r.playbook.customers[0], /vault/);
  }
  assert.ok(!JSON.stringify(I.PRESETS).toLowerCase().includes('chemist'));
});

test('key numbers are judged against healthy ranges', () => {
  const e = fresh('restaurant');
  e.saveEntry({ type: 'sale', date: TODAY, amount: 10000 });
  e.saveEntry({ type: 'purchase', date: TODAY, amount: 4500 });
  const k = e.reviewInsights({ from: TODAY, to: TODAY }).kpis;
  const food = k.find((x) => /Food cost/.test(x.label));
  assert.equal(food.value, 45); assert.equal(food.status, 'high');
  assert.equal(k.find((x) => /Beverage/.test(x.label)).status, 'nodata');
});

test('customer vault: records, reminders, messages and a private link', () => {
  const e = fresh('pharmacy');
  const c = e.save('customers', { name: 'Meena', phone: '9000000001' });
  const rec = e.saveVaultRecord({ customerId: c.id, kind: 'prescription', title: 'BP tablets', dueDate: Review.addDays(TODAY, 3) });
  e.saveVaultRecord({ customerId: c.id, kind: 'allergy', title: 'Penicillin' });
  const due = e.vaultDue({ days: 7 });
  assert.equal(due.length, 1); assert.equal(due[0].dueLabel, 'Refill due'); assert.equal(due[0].remindedOn, '');
  e.logMessage({ customerId: c.id, recordId: rec.id, text: 'Refill due' });
  assert.equal(e.vaultDue({ days: 7 })[0].remindedOn, TODAY);
  const tok = e.ensureVaultToken(c.id);
  assert.equal(e.ensureVaultToken(c.id), tok, 'same link every time');
  const pub = e.vaultByToken(tok);
  assert.equal(pub.records.length, 2); assert.equal(pub.messages.length, 1);
  assert.equal(pub.customer.name, 'Meena'); assert.equal(pub.customer.phone, undefined, 'public page hides contact details');
  assert.equal(e.vaultByToken('nope'), null);
  assert.equal(e.vaultSummary()[0].records, 2);
});

test('walk-ins, average spend, day-on-day change and stock used', () => {
  const e = fresh('restaurant');
  const y = Review.addDays(TODAY, -1);
  e.saveEntry({ type: 'sale', date: y, amount: 10000 }); e.saveEntry({ type: 'walkin', date: y, amount: 40 });
  e.saveEntry({ type: 'sale', date: TODAY, amount: 12000, half: 'first' }); e.saveEntry({ type: 'walkin', date: TODAY, amount: 30, half: 'first' });
  e.saveEntry({ type: 'purchase', date: y, items: [{ name: 'Rice', qty: 10, unit: 'kg', rate: 50 }] });
  e.saveEntry({ type: 'supply', date: TODAY, items: [{ name: 'Rice', qty: 6, unit: 'kg' }] });
  const r = e.reviewInsights({ from: y, to: TODAY });
  assert.equal(r.totals.walkin, 70);
  assert.equal(r.ratios.avgSpend, 314.29);
  const d = r.byDay.find((x) => x.date === TODAY);
  assert.equal(d.change, 20); assert.equal(d.avgSpend, 400);
  assert.equal(r.totals.used, 300, '6 kg at the purchase rate of 50');
  assert.equal(r.halves.first.walkin, 30);
  assert.throws(() => e.saveEntry({ type: 'walkin', amount: 0 }), /number of walk-ins/);
});

test('importing rows from a spreadsheet or billing software', () => {
  const e = fresh('hotel');
  const res = e.importEntries([
    { Date: TODAY, Department: 'Restaurant', Type: 'Sales', Amount: '32,000' },
    { Date: TODAY, Department: 'Restaurant', Type: 'collection', Amount: 20000, Method: 'Cash' },
    { Date: TODAY, Department: 'Rooftop Cafe', Type: 'walk-ins', Amount: 96, Half: 'Evening' },
    { Date: TODAY, Type: 'unknown', Amount: 5 }
  ]);
  assert.equal(res.imported, 3); assert.equal(res.skippedCount, 1);
  assert.ok(e.list('departments').rows.some((d) => d.name === 'Rooftop Cafe'));
  assert.equal(e.list('entries', { type: 'walkin' }).rows[0].half, 'second');
});

test('day-end sales printout text is read', () => {
  const r = OCR.parseSalesReport('Z REPORT 05/11/2026\nNo. of Bills 84\nGross Sales 31,250.00\nNet Sales 30,800.00\nCash 12,400\nUPI 14,900\nCard 3,500\nZomato 1,200');
  assert.deepEqual(r, { date: '2026-11-05', sale: 30800, cash: 12400, upi: 14900, card: 3500, other: 1200, walkins: 84 });
});

test('an install saved by the old billing version switches to the review screens', () => {
  const old = createEngine({ data: null, commit() {} });
  old.setup({ industry: 'pharmacy', businessName: 'Old Shop', mode: 'pos' });
  const data = old.exportAll();
  delete data.settings.appMode;                    // version 1.0 did not have this setting
  data.departments = [];
  const store = { data, commits: 0, commit() { this.commits++; } };
  const e = createEngine(store);
  const info = e.info();
  assert.equal(info.settings.appMode, 'review');
  assert.ok(info.settings.modules.includes('overview') && !info.settings.modules.includes('pos'));
  assert.ok(e.list('departments').total >= 3, 'suggested departments added');
  assert.ok(store.commits >= 1, 'upgrade saved');
  // a new-version billing install is left alone
  const pos = createEngine({ data: null, commit() {} });
  pos.setup({ industry: 'grocery', mode: 'pos' });
  const again = createEngine({ data: pos.exportAll(), commit() {} });
  assert.ok(again.info().settings.modules.includes('pos'));
});
