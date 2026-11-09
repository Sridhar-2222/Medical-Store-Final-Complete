'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, parseCSV } = require('../core/engine');
const Industries = require('../core/industries');
const AI = require('../core/ai');

function fresh(industry = 'pharmacy') {
  const store = { data: null, commits: 0, commit() { this.commits++; } };
  const e = createEngine(store, { now: () => new Date(2026, 10, 6, 10, 0, 0) });
  e.setup({ industry, businessName: 'Test Biz' });
  return { e, store };
}

test('every industry preset can be set up with samples', () => {
  for (const { key } of Industries.list()) {
    const { e } = fresh(key);
    e.loadSamples();
    const info = e.info();
    assert.equal(info.settings.industry, key);
    assert.ok(info.counts.items > 0, key + ' has sample items');
    assert.ok(info.settings.modules.includes('dashboard'));
  }
});

test('sale reduces stock, computes tax and profit', () => {
  const { e } = fresh('grocery');
  const it = e.save('items', { name: 'Soap', price: 100, cost: 60, stock: 10, taxRate: 5 });
  assert.equal(it.stock, 10);
  const sale = e.createSale({ lines: [{ itemId: it.id, qty: 3 }] });
  assert.equal(sale.subtotal, 300);
  assert.equal(sale.tax, 15);
  assert.equal(sale.total, 315);
  assert.equal(sale.cost, 180);
  assert.equal(sale.profit, 120);
  assert.equal(sale.status, 'paid');
  assert.equal(e.get('items', it.id).stock, 7);
  assert.match(sale.number, /^INV-0001$/);
});

test('tax inclusive pricing', () => {
  const { e } = fresh('generic');
  e.saveSettings({ taxInclusive: true });
  const it = e.save('items', { name: 'X', price: 118, cost: 50, stock: 5, taxRate: 18 });
  const s = e.createSale({ lines: [{ itemId: it.id, qty: 1 }] });
  assert.equal(s.total, 118);
  assert.equal(s.tax, 18);
  assert.equal(s.net, 100);
});

test('cannot oversell unless allowed; failed sale leaves no trace', () => {
  const { e } = fresh();
  const it = e.save('items', { name: 'Med', price: 10, stock: 2 });
  assert.throws(() => e.createSale({ lines: [{ itemId: it.id, qty: 5 }] }), /Not enough stock/);
  assert.equal(e.get('items', it.id).stock, 2);
  assert.equal(e.list('sales').total, 0);
  e.saveSettings({ allowNegativeStock: true });
  e.createSale({ lines: [{ itemId: it.id, qty: 5 }] });
  assert.equal(e.get('items', it.id).stock, -3);
});

test('credit sale needs customer, creates due, payment settles oldest invoices', () => {
  const { e } = fresh();
  const it = e.save('items', { name: 'Med', price: 100, stock: 50, taxRate: 0 });
  assert.throws(() => e.createSale({ lines: [{ itemId: it.id, qty: 1 }], paid: 0 }), /customer/);
  const c = e.save('customers', { name: 'Ravi', phone: '123' });
  const s1 = e.createSale({ customerId: c.id, lines: [{ itemId: it.id, qty: 2 }], paid: 50 });
  const s2 = e.createSale({ customerId: c.id, lines: [{ itemId: it.id, qty: 1 }], paid: 0 });
  assert.equal(s1.status, 'partial');
  assert.equal(s2.status, 'unpaid');
  assert.equal(e.get('customers', c.id).balance, 250);
  e.recordPayment({ partyType: 'customer', partyId: c.id, amount: 200 });
  assert.equal(e.get('customers', c.id).balance, 50);
  assert.equal(e.get('sales', s1.id).status, 'paid');
  assert.equal(e.get('sales', s2.id).due, 50);
  const led = e.ledger('customer', c.id);
  assert.equal(led.docs.length, 2);
  assert.ok(led.payments.length >= 2);
  assert.throws(() => e.remove('customers', c.id), /balance/);
});

test('void sale restores stock and balances', () => {
  const { e } = fresh();
  const it = e.save('items', { name: 'Med', price: 100, stock: 10, taxRate: 0 });
  const c = e.save('customers', { name: 'A' });
  const s = e.createSale({ customerId: c.id, lines: [{ itemId: it.id, qty: 4 }], paid: 100 });
  assert.equal(e.get('customers', c.id).balance, 300);
  e.voidSale(s.id, 'mistake');
  assert.equal(e.get('items', it.id).stock, 10);
  assert.equal(e.get('customers', c.id).balance, 0);
  assert.equal(e.report({ from: '2026-11-01', to: '2026-11-30' }).salesCount, 0);
  assert.throws(() => e.voidSale(s.id), /Already/);
});

test('purchase creates items by name+batch, updates stock, supplier due', () => {
  const { e } = fresh('pharmacy');
  const sup = e.save('suppliers', { name: 'Distributor' });
  const p = e.createPurchase({ supplierId: sup.id, paid: 0, lines: [
    { name: 'Dolo 650', qty: 10, free: 2, cost: 20, price: 30, batch: 'B1', expiry: '2027-01-31', taxRate: 12 },
    { name: 'Dolo 650', qty: 5, cost: 21, batch: 'B2' }
  ] });
  assert.equal(p.total, r(10 * 20 * 1.12 + 5 * 21));
  const items = e.list('items', { search: 'dolo' }).rows;
  assert.equal(items.length, 2);
  assert.equal(items.find((i) => i.batch === 'B1').stock, 12);
  assert.equal(e.get('suppliers', sup.id).balance, p.total);
  // same batch again merges
  e.createPurchase({ lines: [{ name: 'dolo 650', qty: 3, cost: 20, batch: 'B1' }] });
  assert.equal(e.list('items', { search: 'dolo' }).rows.find((i) => i.batch === 'B1').stock, 15);
  e.voidPurchase(p.id);
  assert.equal(e.get('suppliers', sup.id).balance, 0);
  function r(n) { return Math.round(n * 100) / 100; }
});

test('services do not track stock; appointment billing', () => {
  const { e } = fresh('salon');
  const svc = e.save('items', { name: 'Haircut', price: 300, isService: true, taxRate: 0 });
  const appt = e.save('appointments', { date: '2026-11-06', time: '11:00', customerName: 'Priya', itemId: svc.id });
  assert.equal(appt.durationMin, 30);
  const sale = e.billAppointment(appt.id, { method: 'UPI' });
  assert.equal(sale.total, 300);
  assert.equal(e.get('appointments', appt.id).status, 'done');
  assert.equal(e.get('items', svc.id).stock, 0);
  assert.throws(() => e.billAppointment(appt.id), /Already billed/);
});

test('dashboard, filters and report', () => {
  const { e } = fresh('pharmacy');
  e.save('items', { name: 'Old', price: 10, stock: 3, reorderLevel: 5, expiry: '2026-11-20' });
  e.save('items', { name: 'Expired', price: 10, stock: 3, expiry: '2026-10-01' });
  const it = e.save('items', { name: 'Good', price: 50, cost: 30, stock: 100, taxRate: 0 });
  e.createSale({ lines: [{ itemId: it.id, qty: 2 }] });
  e.save('expenses', { amount: 30, category: 'Rent' });
  const d = e.dashboard();
  assert.equal(d.todaySales, 100);
  assert.equal(d.lowStockCount, 2);
  assert.equal(d.expiring.length, 2);
  assert.equal(e.list('items', { filter: 'expired' }).total, 1);
  assert.equal(e.list('items', { filter: 'expiring' }).total, 1);
  const rep = e.report({});
  assert.equal(rep.grossProfit, 40);
  assert.equal(rep.netProfit, 10);
  assert.equal(rep.byItem[0].key, 'Good');
});

test('CSV round trip and backup restore', () => {
  const { e } = fresh('apparel');
  const n = e.importCSV('items', 'Name,Price,Cost,Qty,Category,Size\nShirt,"1,000",500,4,Men,M\n,1,1,1,,\nTee,300,100,10,Men,L');
  assert.deepEqual(n, { created: 2, updated: 0, skipped: 1 });
  const shirt = e.list('items', { search: 'shirt' }).rows[0];
  assert.equal(shirt.stock, 4);
  assert.equal(shirt.custom.size, 'M');
  const csv = e.exportCSV('items');
  assert.equal(parseCSV(csv).length, 2);
  const backup = e.exportAll();
  e.resetAll();
  assert.equal(e.list('items').total, 0);
  e.importAll(backup);
  assert.equal(e.list('items').total, 2);
});

test('items with history are deactivated instead of deleted', () => {
  const { e } = fresh();
  const a = e.save('items', { name: 'A', price: 5, stock: 5 });
  const b = e.save('items', { name: 'B', price: 5, stock: 5 });
  e.createSale({ lines: [{ itemId: a.id, qty: 1 }] });
  assert.deepEqual(e.remove('items', a.id), { deactivated: true });
  assert.deepEqual(e.remove('items', b.id), { deleted: true });
});

test('AI response parsing is tolerant', () => {
  const lines = AI.parseResponse('```json\n[{"name":"Crocin","qty":"10","cost":"12.5","expiry":"2027-03"},{"name":"","qty":1}]\n```');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 10);
  assert.equal(lines[0].expiry, '2027-03-31');
  assert.deepEqual(AI.parseResponse('not json'), []);
});
