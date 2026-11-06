'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, parseCSV } = require('../core/base');
const R = require('../core/review');
const OCR = require('../core/ocr-parse');
const I = require('../core/industries');

const TODAY = '2026-11-06';
const Y = R.addDays(TODAY, -1);
function fresh(industry = 'restaurant', samples = false) {
  const store = { data: null, commits: 0, commit() { this.commits++; } };
  const a = createApp(store, { now: () => new Date(2026, 10, 6, 10) });
  a.setup({ industry, businessName: 'Sai Ram Hotel', loadSamples: samples });
  return a;
}
const dep = (a, i = 0) => a.list('departments').rows[i];

test('14 business types, each with departments, key numbers, guide and a customer vault', () => {
  assert.equal(I.list().length, 14);
  for (const { key } of I.list()) {
    const r = I.get(key).review;
    assert.ok(r.departments.length >= 2 && r.kpis.length >= 3 && r.vault.records.length >= 2 && r.vault.templates.length >= 3, key);
  }
});

test('setup creates the same departments on every device', () => {
  const a = fresh('hotel'), b = fresh('hotel');
  assert.deepEqual(a.list('departments').rows.map((d) => d.id), b.list('departments').rows.map((d) => d.id));
});

test('sales vs spending, cash in hand check and walk-ins', () => {
  const a = fresh();
  const d = dep(a).id;
  a.saveDailySheet({ date: Y, rows: [{ departmentId: d, sale: 10000, cash: 6000, upi: 4000, walkin: 40, expense: 1000, cashInHand: 5000 }] });
  a.saveDailySheet({ date: TODAY, rows: [{ departmentId: d, sale: 12000, cash: 8000, upi: 4000, walkin: 30, purchase: 2000, deposit: 6000, cashInHand: 4500 }] });
  const r = a.reviewInsights({ from: Y, to: TODAY });
  assert.equal(r.totals.spending, 3000);
  assert.equal(r.ratios.spending, 13.64);
  const t = r.byDay.find((x) => x.date === TODAY);
  assert.equal(t.cashExpected, 5000);          // 5000 + 8000 cash in − 2000 cash purchase − 6000 deposited
  assert.equal(t.cashDiff, -500);
  assert.ok(r.flags.some((f) => /Cash short by ₹500/.test(f.title)));
  assert.equal(r.totals.walkin, 70);
  assert.equal(t.change, 20);
  const sheet = a.getDailySheet(TODAY, '').find((x) => x.departmentId === d);
  assert.equal(sheet.cashInHand, 4500); assert.equal(sheet.deposit, 6000);
});

test('spent more than sold is flagged', () => {
  const a = fresh();
  a.saveEntry({ type: 'sale', date: TODAY, amount: 5000 });
  a.saveEntry({ type: 'purchase', date: TODAY, amount: 7000 });
  assert.ok(a.reviewInsights({ from: TODAY, to: TODAY }).flags.some((f) => /Spent more than sold/.test(f.title)));
});

test('example data: identical on two devices, and every planted problem is found', () => {
  const a = fresh('restaurant', true), b = fresh('restaurant', true);
  assert.equal(JSON.stringify(a.exportAll().entries), JSON.stringify(b.exportAll().entries));
  const t = a.reviewInsights({}).flags.map((f) => f.title).join('\n');
  for (const re of [/Collection short/, /above usual price/, /billed .* received/, /Wastage \d+% of purchases on/, /Cash short by ₹1,500/, /Stock short/]) assert.match(t, re);
});

test('price rise and short delivery on a bill photo are caught before saving', () => {
  const a = fresh();
  for (let i = 9; i >= 1; i--) a.saveEntry({ type: 'purchase', date: R.addDays(TODAY, -i), vendor: 'A', items: [{ name: 'Tomato', qty: 10, unit: 'kg', rate: 30 }] });
  const c = a.checkReceipt({ vendor: 'B', date: TODAY, items: [{ name: 'tomato', qty: 10, unit: 'kg', rate: 42, amount: 420, received: 8 }], total: 500 });
  assert.equal(c.priceAlerts[0].up, 40);
  assert.ok(c.issues.some((x) => /received only 8/.test(x)));
  assert.ok(c.issues.some((x) => /add up to 420/.test(x)));
  const saved = a.saveReceipt({ entry: { type: 'purchase', date: TODAY, vendor: 'B', billNo: '9', method: 'Credit', items: [{ name: 'Tomato', qty: 10, rate: 42 }] } });
  assert.equal(saved.entry.amount, 420);
  assert.throws(() => a.saveReceipt({ entry: { type: 'purchase', vendor: 'b', billNo: '9', amount: 1 } }), /already saved/);
});

test('stock: purchased vs issued vs counted', () => {
  const a = fresh();
  a.saveEntry({ type: 'purchase', date: Y, items: [{ name: 'Rice', qty: 50, unit: 'kg', rate: 60 }] });
  a.saveEntry({ type: 'supply', date: TODAY, departmentId: dep(a, 0).id, items: [{ name: 'Rice', qty: 30, unit: 'kg' }] });
  a.saveEntry({ type: 'stock', date: TODAY, items: [{ name: 'Rice', qty: 15, unit: 'kg' }] });
  const m = a.inventory({}).items[0];
  assert.equal(m.book, 20); assert.equal(m.counted, 15); assert.equal(m.variance, -5); assert.equal(m.varianceValue, -300);
});

test('customer vault titled with the business, reminders and messages', () => {
  const a = fresh('pharmacy');
  a.saveSettings({ vaultTitle: 'Sri Sai Medicals' });
  const c = a.saveCustomer({ name: 'Meena', phone: '9000000001' });
  const r = a.saveVaultRecord({ customerId: c.id, kind: 'prescription', title: 'BP tablets', dueDate: R.addDays(TODAY, 2) });
  assert.equal(a.vaultDue({ days: 7 })[0].dueLabel, 'Refill due');
  a.logMessage({ customerId: c.id, recordId: r.id, text: 'Refill due' });
  const tok = a.ensureVaultToken(c.id, 'abcdefghijklmnop1234');
  assert.equal(tok, 'abcdefghijklmnop1234');
  const v = a.vaultByToken(tok);
  assert.equal(v.shop.title, 'Sri Sai Medicals'); assert.equal(v.messages.length, 1);
  a.removeCustomer(c.id);
  assert.equal(a.list('vaultRecords').total, 0);
});

test('import from spreadsheet / billing software; offline changes apply once', () => {
  const a = fresh('hotel');
  const rows = parseCSV('date,department,type,amount,method,half\n2026-11-05,Rooftop Cafe,sales,"32,000",,evening\n2026-11-05,Rooftop Cafe,collection,20000,Cash,\n2026-11-05,,nonsense,5,,');
  const res = a.importEntries(rows);
  assert.equal(res.imported, 2); assert.equal(res.skippedCount, 1);
  assert.ok(a.list('departments').rows.some((d) => d.name === 'Rooftop Cafe'));
  const op = [{ opId: 'x1', method: 'saveEntry', args: [{ id: 'e000001', type: 'walkin', amount: 12, date: TODAY }] }];
  a.applyOps(op); a.applyOps(op);
  assert.equal(a.list('entries', { type: 'walkin' }).total, 1);
});

test('receipt text readers', () => {
  const b = OCR.parse('FRESH FARMS\nBill No: 4521 Date: 03/11/2026\n1 Potato 25 kg 28.00 700.00\nPaneer 2.5 Kg 380 950.00\nGrand Total 1650.00');
  assert.equal(b.vendor, 'FRESH FARMS'); assert.equal(b.items.length, 2); assert.equal(b.total, 1650);
  assert.deepEqual(OCR.parseSalesReport('Z REPORT 05/11/2026\nNo. of Bills 84\nNet Sales 30,800.00\nCash 12,400\nUPI 14,900\nCard 3,500'), { date: '2026-11-05', sale: 30800, cash: 12400, upi: 14900, card: 3500, other: 0, walkins: 84 });
});

test('failed change leaves nothing half-saved; backup round trip', () => {
  const a = fresh();
  const before = a.list('entries').total;
  assert.throws(() => a.saveDailySheet({ date: TODAY, rows: [{ departmentId: 'nope', sale: 5 }] }), /not found/);
  assert.equal(a.list('entries').total, before);
  a.saveEntry({ type: 'sale', amount: 100, date: TODAY });
  const bk = a.exportAll(); a.resetAll(); assert.equal(a.list('entries').total, 0);
  a.importAll(bk); assert.equal(a.list('entries').total, before + 1);
});
