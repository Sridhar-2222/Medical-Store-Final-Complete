/*
 * BizCore engine: all business rules live here, so the same code runs
 *   - inside the browser (offline / standalone mode, data in localStorage), and
 *   - inside the Node server (shared multi-device mode, data in a JSON file
 *     and optionally mirrored to Supabase).
 *
 * The engine works on an in-memory database object and asks the store to
 * persist after every successful mutation. JavaScript is single-threaded, so
 * each public method is atomic: it either fully applies or throws before
 * anything is committed (we validate first, then mutate).
 *
 * Store contract:  { data: <db object or null>, commit(changes) }
 *   changes = { upserts: [{col, doc}], deletes: [{col, id}], full: bool }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./industries'));
  else root.BizEngine = factory(root.BizIndustries);
})(typeof self !== 'undefined' ? self : this, function (Industries) {
  'use strict';

  var VERSION = 1;
  var COLLECTIONS = ['items', 'customers', 'suppliers', 'sales', 'purchases', 'payments',
    'expenses', 'appointments', 'staff', 'stockMoves'];
  var EDITABLE = ['items', 'customers', 'suppliers', 'expenses', 'appointments', 'staff'];
  var PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque', 'Credit', 'Other'];

  // ---------- small helpers ----------
  function r2(n) { n = Number(n) || 0; return Math.round((n + Number.EPSILON) * 100) / 100; }
  function num(v, d) { var n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : parseFloat(v); return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function str(v) { return v === undefined || v === null ? '' : String(v).trim(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localDate(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function addDays(dateStr, days) {
    var p = dateStr.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + days);
    return localDate(d);
  }
  function daysBetween(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    return Math.round((new Date(+pb[0], +pb[1] - 1, +pb[2]) - new Date(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
  }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  function fail(msg) { var e = new Error(msg); e.userError = true; throw e; }

  function emptyDb() {
    var db = { meta: { version: VERSION, seq: {}, createdAt: new Date().toISOString() }, settings: null };
    COLLECTIONS.forEach(function (c) { db[c] = []; });
    return db;
  }

  function defaultSettings(industry) {
    var p = Industries.get(industry);
    return {
      setupDone: false,
      industry: industry || 'generic',
      businessName: 'My Business',
      tagline: '', address: '', phone: '', email: '', taxId: '',
      currency: '₹', locale: 'en-IN', countryCode: '91',
      taxLabel: 'GST', taxRate: p.taxRate, taxInclusive: false,
      invoicePrefix: 'INV-', purchasePrefix: 'PUR-',
      lowStockDefault: 5, expiryWarnDays: 30,
      allowNegativeStock: false,
      loyaltyPercent: 0,
      receiptFooter: 'Thank you! Visit again.',
      modules: p.modules.slice(),
      geminiModel: 'gemini-2.5-flash'
    };
  }

  // ---------- CSV ----------
  function csvEscape(v) {
    if (v === undefined || v === null) return '';
    var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows, headers) {
    var out = [headers.map(csvEscape).join(',')];
    rows.forEach(function (r) { out.push(headers.map(function (h) { return csvEscape(r[h]); }).join(',')); });
    return out.join('\n');
  }
  function parseCSV(text) {
    var rows = [], row = [], field = '', i = 0, q = false;
    text = String(text || '').replace(/^﻿/, '');
    while (i < text.length) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
      i++;
    }
    if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
    if (!rows.length) return [];
    var headers = rows[0].map(function (h) { return h.trim(); });
    return rows.slice(1).map(function (r) {
      var o = {};
      headers.forEach(function (h, idx) { o[h] = r[idx] === undefined ? '' : r[idx]; });
      return o;
    });
  }

  // =====================================================================
  function createEngine(store, opts) {
    opts = opts || {};
    var now = opts.now || function () { return new Date(); };
    var changes = null;

    if (!store.data || typeof store.data !== 'object') store.data = emptyDb();
    var db = store.data;
    migrate(db);

    function migrate(d) {
      if (!d.meta) d.meta = { version: VERSION, seq: {} };
      if (!d.meta.seq) d.meta.seq = {};
      COLLECTIONS.forEach(function (c) { if (!Array.isArray(d[c])) d[c] = []; });
      var defs = defaultSettings(d.settings && d.settings.industry);
      d.settings = Object.assign(defs, d.settings || {});
    }

    function today() { return localDate(now()); }
    function stamp() { return now().toISOString(); }
    function settings() { return db.settings; }
    function preset() { return Industries.get(db.settings.industry); }

    // --- change tracking / transactions ---
    function begin() { changes = { upserts: [], deletes: [], full: false, settings: false }; }
    function touch(col, doc) { if (changes) changes.upserts.push({ col: col, doc: doc }); }
    function drop(col, id) { if (changes) changes.deletes.push({ col: col, id: id }); }
    function tx(fn) {
      // Snapshot so a failure in the middle can never leave half-applied data.
      var snapshot = JSON.stringify(db);
      begin();
      try {
        var result = fn();
        var c = changes; changes = null;
        if (store.commit) store.commit(c);
        return result;
      } catch (e) {
        var restored = JSON.parse(snapshot);
        Object.keys(db).forEach(function (k) { delete db[k]; });
        Object.assign(db, restored);
        changes = null;
        throw e;
      }
    }

    function find(col, id) {
      var arr = db[col];
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
      return null;
    }
    function mustFind(col, id, label) {
      var d = find(col, id);
      if (!d) fail((label || col) + ' not found');
      return d;
    }
    function nextNumber(prefix) {
      var n = (db.meta.seq[prefix] || 0) + 1;
      db.meta.seq[prefix] = n;
      return prefix + String(n).padStart(4, '0');
    }

    // --- normalisers ---
    function normItem(input, existing) {
      var s = settings();
      var it = existing ? existing : { id: uid(), createdAt: stamp(), stock: 0 };
      var isService = !!input.isService;
      if (!str(input.name)) fail('Name is required');
      it.name = str(input.name);
      it.sku = str(input.sku);
      it.barcode = str(input.barcode);
      it.category = str(input.category);
      it.unit = str(input.unit) || (isService ? 'service' : 'pcs');
      it.price = r2(num(input.price));
      it.cost = r2(num(input.cost));
      it.taxRate = input.taxRate === '' || input.taxRate === undefined || input.taxRate === null ? null : num(input.taxRate);
      it.isService = isService;
      it.trackStock = !isService;
      it.reorderLevel = input.reorderLevel === '' || input.reorderLevel === undefined ? s.lowStockDefault : num(input.reorderLevel);
      it.batch = str(input.batch);
      it.expiry = isDate(input.expiry) ? input.expiry : '';
      it.durationMin = num(input.durationMin) || (isService ? 30 : 0);
      it.active = input.active === undefined ? true : !!input.active;
      it.custom = Object.assign({}, it.custom || {}, input.custom || {});
      it.updatedAt = stamp();
      if (it.price < 0 || it.cost < 0) fail('Price and cost cannot be negative');
      return it;
    }
    function normParty(input, existing) {
      var p = existing ? existing : { id: uid(), createdAt: stamp(), balance: 0, points: 0 };
      if (!str(input.name)) fail('Name is required');
      ['name', 'phone', 'email', 'address', 'taxId', 'notes'].forEach(function (k) { p[k] = str(input[k]); });
      if (input.custom) p.custom = Object.assign({}, p.custom || {}, input.custom);
      p.updatedAt = stamp();
      return p;
    }

    function itemTaxRate(it) {
      return it && it.taxRate !== null && it.taxRate !== undefined ? it.taxRate : settings().taxRate;
    }

    function moveStock(item, qty, reason, refId, note) {
      if (!item.trackStock || !qty) return;
      item.stock = r2(item.stock + qty);
      item.updatedAt = stamp();
      var m = { id: uid(), date: today(), at: stamp(), itemId: item.id, itemName: item.name, qty: r2(qty), reason: reason, refId: refId || '', note: note || '', balance: item.stock };
      db.stockMoves.push(m);
      touch('stockMoves', m);
      touch('items', item);
    }

    // Allocate a payment against the oldest unpaid documents of a party.
    function allocate(col, partyKey, partyId, amount) {
      var docs = db[col].filter(function (d) { return d[partyKey] === partyId && d.status !== 'void' && d.due > 0.004; })
        .sort(function (a, b) { return (a.date + a.number).localeCompare(b.date + b.number); });
      var left = amount;
      docs.forEach(function (d) {
        if (left <= 0) return;
        var take = Math.min(left, d.due);
        d.paid = r2(d.paid + take); d.due = r2(d.due - take); left = r2(left - take);
        d.status = d.due <= 0.004 ? 'paid' : 'partial';
        touch(col, d);
      });
      return left;
    }

    // ---------- price calculation (shared by POS preview and createSale) ----------
    function quote(input) {
      var s = settings();
      var lines = (input.lines || []).filter(function (l) { return l && (l.itemId || str(l.name)) && num(l.qty) !== 0; });
      var out = { lines: [], subtotal: 0, lineDiscount: 0, tax: 0, billDiscount: r2(num(input.discount)), total: 0, cost: 0 };
      lines.forEach(function (l) {
        var it = l.itemId ? find('items', l.itemId) : null;
        var qty = num(l.qty);
        var price = l.price === undefined || l.price === '' ? (it ? it.price : 0) : num(l.price);
        var rate = l.taxRate === undefined || l.taxRate === '' || l.taxRate === null ? itemTaxRate(it) : num(l.taxRate);
        var gross = r2(qty * price);
        var disc = r2(num(l.discount));
        var taxable = r2(gross - disc), tax, total;
        if (s.taxInclusive) { total = taxable; tax = r2(taxable - taxable / (1 + rate / 100)); }
        else { tax = r2(taxable * rate / 100); total = r2(taxable + tax); }
        var cost = r2(qty * (l.cost !== undefined ? num(l.cost) : (it ? it.cost : 0)));
        out.lines.push({ itemId: it ? it.id : '', name: it ? it.name : str(l.name), unit: it ? it.unit : str(l.unit), batch: it ? it.batch : '',
          category: it ? it.category : '', qty: qty, price: r2(price), discount: disc, taxRate: rate, tax: tax, total: total, cost: cost });
        out.subtotal = r2(out.subtotal + gross); out.lineDiscount = r2(out.lineDiscount + disc);
        out.tax = r2(out.tax + tax); out.cost = r2(out.cost + cost);
        out.total = r2(out.total + total);
      });
      out.total = r2(Math.max(0, out.total - out.billDiscount));
      out.net = r2(out.total - out.tax);              // revenue excluding tax
      out.profit = r2(out.net - out.cost);
      return out;
    }

    // ===================================================================
    var api = {};

    api.info = function () {
      var counts = {};
      COLLECTIONS.forEach(function (c) { counts[c] = db[c].length; });
      return { settings: clone(settings()), preset: clone(preset()), industries: Industries.list(),
        allModules: Industries.ALL_MODULES, paymentMethods: PAYMENT_METHODS, counts: counts, today: today(), version: VERSION };
    };

    api.setup = function (input) {
      input = input || {};
      return tx(function () {
        var key = Industries.PRESETS[input.industry] ? input.industry : 'generic';
        var p = Industries.get(key);
        var s = settings();
        var keep = s.setupDone ? s : defaultSettings(key);
        db.settings = Object.assign(keep, {
          industry: key, setupDone: true, modules: p.modules.slice(), taxRate: p.taxRate,
          businessName: str(input.businessName) || s.businessName || p.name
        });
        ['currency', 'phone', 'address', 'locale'].forEach(function (k) { if (str(input[k])) db.settings[k] = str(input[k]); });
        changes.settings = true;
        if (input.loadSamples) loadSamplesInner();
        return clone(db.settings);
      });
    };

    api.saveSettings = function (patch) {
      return tx(function () {
        patch = patch || {};
        var s = settings();
        Object.keys(patch).forEach(function (k) {
          if (k === 'setupDone') return;
          var v = patch[k];
          if (['taxRate', 'lowStockDefault', 'expiryWarnDays', 'loyaltyPercent'].indexOf(k) >= 0) v = num(v);
          if (['taxInclusive', 'allowNegativeStock'].indexOf(k) >= 0) v = !!v;
          if (k === 'modules') v = (v || []).filter(function (m) { return Industries.ALL_MODULES.indexOf(m) >= 0; });
          if (k === 'industry' && !Industries.PRESETS[v]) return;
          s[k] = v;
        });
        if (s.modules.indexOf('settings') < 0) s.modules.push('settings');
        changes.settings = true;
        return clone(s);
      });
    };

    function loadSamplesInner() {
      var p = preset();
      p.samples.forEach(function (sm) {
        var inp = Object.assign({}, sm);
        if (sm.expiryDays) inp.expiry = addDays(today(), sm.expiryDays);
        var it = normItem(inp);
        db.items.push(it); touch('items', it);
        if (sm.stock) moveStock(it, sm.stock, 'opening', '', 'Sample data');
      });
      var c = normParty({ name: 'Walk-in Regular', phone: '9999999999' });
      db.customers.push(c); touch('customers', c);
      var sp = normParty({ name: 'Main Supplier', phone: '8888888888' });
      db.suppliers.push(sp); touch('suppliers', sp);
      var st = { id: uid(), name: 'Owner', role: 'Owner', phone: '', commissionRate: 0, active: true, createdAt: stamp() };
      db.staff.push(st); touch('staff', st);
    }
    api.loadSamples = function () { return tx(function () { loadSamplesInner(); return true; }); };

    // ---------- generic list/get/save/remove ----------
    api.list = function (col, q) {
      if (COLLECTIONS.indexOf(col) < 0) fail('Unknown collection ' + col);
      q = q || {};
      var s = settings();
      var t = today();
      var rows = db[col].slice();
      if (q.search) {
        var needle = String(q.search).toLowerCase();
        rows = rows.filter(function (r) {
          return [r.name, r.sku, r.barcode, r.phone, r.email, r.number, r.customerName, r.supplierName, r.category, r.batch, r.note, r.notes, r.itemName]
            .concat(r.custom ? Object.keys(r.custom).map(function (k) { return r.custom[k]; }) : [])
            .some(function (v) { return v !== undefined && v !== null && String(v).toLowerCase().indexOf(needle) >= 0; });
        });
      }
      if (q.from) rows = rows.filter(function (r) { return (r.date || '') >= q.from; });
      if (q.to) rows = rows.filter(function (r) { return (r.date || '') <= q.to; });
      if (q.partyId) rows = rows.filter(function (r) { return r.customerId === q.partyId || r.supplierId === q.partyId || r.partyId === q.partyId; });
      if (q.itemId) rows = rows.filter(function (r) { return r.itemId === q.itemId; });
      if (q.status) rows = rows.filter(function (r) { return r.status === q.status; });
      if (q.category) rows = rows.filter(function (r) { return r.category === q.category; });
      if (col === 'items' && q.filter) {
        var warn = addDays(t, s.expiryWarnDays);
        rows = rows.filter(function (r) {
          if (q.filter === 'low') return r.trackStock && r.stock <= r.reorderLevel;
          if (q.filter === 'out') return r.trackStock && r.stock <= 0;
          if (q.filter === 'expiring') return r.expiry && r.expiry >= t && r.expiry <= warn && r.stock > 0;
          if (q.filter === 'expired') return r.expiry && r.expiry < t && r.stock > 0;
          if (q.filter === 'services') return r.isService;
          if (q.filter === 'products') return !r.isService;
          return true;
        });
      }
      if (col === 'customers' || col === 'suppliers') {
        if (q.filter === 'due') rows = rows.filter(function (r) { return r.balance > 0.004; });
      }
      var sortKey = q.sort || ({ items: 'name', customers: 'name', suppliers: 'name', staff: 'name' }[col] || '-at');
      var desc = sortKey[0] === '-'; if (desc) sortKey = sortKey.slice(1);
      rows.sort(function (a, b) {
        var va = a[sortKey], vb = b[sortKey];
        if (sortKey === 'at') { va = (a.date || '') + (a.time || '') + (a.createdAt || a.at || ''); vb = (b.date || '') + (b.time || '') + (b.createdAt || b.at || ''); }
        if (typeof va === 'number' && typeof vb === 'number') return desc ? vb - va : va - vb;
        va = String(va === undefined ? '' : va).toLowerCase(); vb = String(vb === undefined ? '' : vb).toLowerCase();
        return desc ? vb.localeCompare(va) : va.localeCompare(vb);
      });
      var total = rows.length;
      if (q.limit) rows = rows.slice(q.offset || 0, (q.offset || 0) + q.limit);
      return { rows: clone(rows), total: total };
    };

    api.get = function (col, id) {
      if (COLLECTIONS.indexOf(col) < 0) fail('Unknown collection ' + col);
      var d = find(col, id);
      return d ? clone(d) : null;
    };

    api.findItemByCode = function (code) {
      code = str(code).toLowerCase();
      if (!code) return null;
      var it = db.items.filter(function (i) { return i.active !== false && ((i.barcode && i.barcode.toLowerCase() === code) || (i.sku && i.sku.toLowerCase() === code)); })[0];
      return it ? clone(it) : null;
    };

    api.save = function (col, input) {
      if (EDITABLE.indexOf(col) < 0) fail('Cannot edit ' + col + ' directly');
      return tx(function () {
        input = input || {};
        var existing = input.id ? find(col, input.id) : null;
        var doc;
        if (col === 'items') {
          var oldStock = existing ? existing.stock : 0;
          doc = normItem(input, existing);
          if (!existing) { db.items.push(doc); }
          touch('items', doc);
          if (input.stock !== undefined && input.stock !== '' && doc.trackStock) {
            var diff = r2(num(input.stock) - oldStock);
            if (diff) moveStock(doc, diff, existing ? 'adjust' : 'opening', '', existing ? 'Edited stock' : 'Opening stock');
          }
        } else if (col === 'customers' || col === 'suppliers') {
          doc = normParty(input, existing);
          if (!existing) {
            if (input.openingBalance) doc.balance = r2(num(input.openingBalance));
            db[col].push(doc);
          }
          touch(col, doc);
        } else if (col === 'staff') {
          if (!str(input.name)) fail('Name is required');
          doc = existing || { id: uid(), createdAt: stamp() };
          doc.name = str(input.name); doc.role = str(input.role); doc.phone = str(input.phone);
          doc.commissionRate = num(input.commissionRate); doc.salary = num(input.salary);
          doc.active = input.active === undefined ? true : !!input.active;
          if (!existing) db.staff.push(doc);
          touch('staff', doc);
        } else if (col === 'expenses') {
          if (num(input.amount) <= 0) fail('Amount must be more than zero');
          doc = existing || { id: uid(), createdAt: stamp() };
          doc.date = isDate(input.date) ? input.date : today();
          doc.category = str(input.category) || 'Other';
          doc.amount = r2(num(input.amount)); doc.method = str(input.method) || 'Cash';
          doc.note = str(input.note); doc.staffId = str(input.staffId);
          if (!existing) db.expenses.push(doc);
          touch('expenses', doc);
        } else if (col === 'appointments') {
          if (!isDate(input.date)) fail('Date is required');
          var cust = input.customerId ? find('customers', input.customerId) : null;
          if (!cust && !str(input.customerName)) fail('Customer name is required');
          doc = existing || { id: uid(), createdAt: stamp(), status: 'booked' };
          doc.date = input.date; doc.time = str(input.time) || '10:00';
          doc.customerId = cust ? cust.id : ''; doc.customerName = cust ? cust.name : str(input.customerName);
          doc.phone = cust ? cust.phone : str(input.phone);
          var svc = input.itemId ? find('items', input.itemId) : null;
          doc.itemId = svc ? svc.id : ''; doc.itemName = svc ? svc.name : str(input.itemName);
          doc.durationMin = num(input.durationMin) || (svc ? svc.durationMin : 30);
          doc.staffId = str(input.staffId); doc.notes = str(input.notes);
          if (input.status) doc.status = input.status;
          if (!existing) db.appointments.push(doc);
          touch('appointments', doc);
        }
        return clone(doc);
      });
    };

    api.remove = function (col, id) {
      if (EDITABLE.indexOf(col) < 0) fail('Cannot delete ' + col);
      return tx(function () {
        var d = mustFind(col, id);
        if ((col === 'customers' || col === 'suppliers') && Math.abs(d.balance) > 0.004) fail('Settle the balance before deleting');
        if (col === 'items' && (db.sales.some(function (s) { return s.lines.some(function (l) { return l.itemId === id; }); }) ||
          db.purchases.some(function (p) { return p.lines.some(function (l) { return l.itemId === id; }); }))) {
          // keep history intact: deactivate instead of deleting
          d.active = false; touch('items', d);
          return { deactivated: true };
        }
        db[col] = db[col].filter(function (x) { return x.id !== id; });
        drop(col, id);
        return { deleted: true };
      });
    };

    // ---------- Sales ----------
    api.quote = function (input) { return quote(input || {}); };

    api.createSale = function (input) {
      input = input || {};
      return tx(function () {
        var s = settings();
        var q = quote(input);
        if (!q.lines.length) fail('Add at least one item');
        var cust = input.customerId ? mustFind('customers', input.customerId, 'Customer') : null;
        var paid = input.paid === undefined || input.paid === '' ? q.total : r2(num(input.paid));
        if (paid < 0) fail('Paid amount cannot be negative');
        var change = 0;
        if (paid > q.total) { change = r2(paid - q.total); paid = q.total; }
        var due = r2(q.total - paid);
        if (due > 0.004 && !cust) fail('Select a customer to give credit (amount due ' + due + ')');

        // stock check first
        var need = {};
        q.lines.forEach(function (l) { if (l.itemId) need[l.itemId] = (need[l.itemId] || 0) + l.qty; });
        Object.keys(need).forEach(function (id) {
          var it = find('items', id);
          if (it.trackStock && !s.allowNegativeStock && it.stock < need[id]) fail('Not enough stock for ' + it.name + ' (available ' + it.stock + ')');
        });

        var sale = Object.assign({ id: uid(), number: nextNumber(s.invoicePrefix || 'INV-'), date: isDate(input.date) ? input.date : today(), at: stamp(),
          customerId: cust ? cust.id : '', customerName: cust ? cust.name : (str(input.customerName) || 'Walk-in'),
          customerPhone: cust ? cust.phone : str(input.customerPhone),
          staffId: str(input.staffId), method: str(input.method) || 'Cash', notes: str(input.notes),
          paid: paid, due: due, change: change, status: due > 0.004 ? (paid > 0 ? 'partial' : 'unpaid') : 'paid',
          appointmentId: str(input.appointmentId) }, q);
        q.lines.forEach(function (l) { if (l.itemId) moveStock(find('items', l.itemId), -l.qty, 'sale', sale.id, sale.number); });
        if (cust) {
          cust.balance = r2(cust.balance + due);
          if (s.loyaltyPercent > 0) { sale.pointsEarned = Math.floor(q.total * s.loyaltyPercent / 100); cust.points = (cust.points || 0) + sale.pointsEarned; }
          cust.lastVisit = sale.date; cust.totalSpent = r2((cust.totalSpent || 0) + q.total);
          touch('customers', cust);
        }
        if (paid > 0) {
          var pay = { id: uid(), date: sale.date, at: stamp(), direction: 'in', partyType: 'customer', partyId: sale.customerId, partyName: sale.customerName, amount: paid, method: sale.method, refId: sale.id, note: 'Against ' + sale.number };
          db.payments.push(pay); touch('payments', pay);
        }
        db.sales.push(sale); touch('sales', sale);
        return clone(sale);
      });
    };

    api.voidSale = function (id, reason) {
      return tx(function () {
        var sale = mustFind('sales', id, 'Sale');
        if (sale.status === 'void') fail('Already cancelled');
        sale.lines.forEach(function (l) { var it = l.itemId && find('items', l.itemId); if (it) moveStock(it, l.qty, 'void', sale.id, 'Cancelled ' + sale.number); });
        var cust = sale.customerId && find('customers', sale.customerId);
        if (cust) {
          cust.balance = r2(cust.balance - sale.due);
          if (sale.pointsEarned) cust.points = Math.max(0, (cust.points || 0) - sale.pointsEarned);
          cust.totalSpent = r2((cust.totalSpent || 0) - sale.total);
          touch('customers', cust);
        }
        if (sale.paid > 0) {
          var refund = { id: uid(), date: today(), at: stamp(), direction: 'out', partyType: 'customer', partyId: sale.customerId, partyName: sale.customerName, amount: sale.paid, method: sale.method, refId: sale.id, note: 'Refund for cancelled ' + sale.number };
          db.payments.push(refund); touch('payments', refund);
        }
        sale.status = 'void'; sale.voidReason = str(reason); sale.voidedAt = stamp(); sale.due = 0;
        touch('sales', sale);
        return clone(sale);
      });
    };

    // ---------- Purchases ----------
    api.createPurchase = function (input) {
      input = input || {};
      return tx(function () {
        var s = settings();
        var p = preset();
        var sup = input.supplierId ? mustFind('suppliers', input.supplierId, 'Supplier') : null;
        var lines = (input.lines || []).filter(function (l) { return l && (l.itemId || str(l.name)) && num(l.qty) > 0; });
        if (!lines.length) fail('Add at least one item with quantity');
        var pur = { id: uid(), number: nextNumber(s.purchasePrefix || 'PUR-'), date: isDate(input.date) ? input.date : today(), at: stamp(),
          supplierId: sup ? sup.id : '', supplierName: sup ? sup.name : (str(input.supplierName) || 'Cash purchase'),
          billNo: str(input.billNo), notes: str(input.notes), method: str(input.method) || 'Cash', lines: [], subtotal: 0, tax: 0, total: 0 };
        lines.forEach(function (l) {
          var it = l.itemId ? mustFind('items', l.itemId, 'Item') : null;
          var batch = str(l.batch);
          if (!it) {
            var nm = str(l.name).toLowerCase();
            it = db.items.filter(function (x) { return x.name.toLowerCase() === nm && (!p.flags.batch || (x.batch || '') === batch); })[0] || null;
          }
          if (!it) {
            it = normItem({ name: l.name, category: l.category, unit: l.unit, price: l.price || 0, cost: l.cost, batch: batch, expiry: l.expiry, taxRate: l.taxRate, barcode: l.barcode });
            db.items.push(it);
          }
          if (it.isService) fail(it.name + ' is a service and has no stock');
          var qty = num(l.qty), cost = r2(num(l.cost, it.cost));
          var free = num(l.free);
          var rate = l.taxRate === undefined || l.taxRate === '' || l.taxRate === null ? 0 : num(l.taxRate);
          var sub = r2(qty * cost), tax = r2(sub * rate / 100);
          it.cost = cost;
          if (num(l.price) > 0) it.price = r2(num(l.price));
          if (batch) it.batch = batch;
          if (isDate(l.expiry)) it.expiry = l.expiry;
          if (it.active === false) it.active = true;
          moveStock(it, qty + free, 'purchase', pur.id, pur.number);
          touch('items', it);
          pur.lines.push({ itemId: it.id, name: it.name, qty: qty, free: free, cost: cost, taxRate: rate, tax: tax, total: r2(sub + tax), batch: it.batch, expiry: it.expiry });
          pur.subtotal = r2(pur.subtotal + sub); pur.tax = r2(pur.tax + tax);
        });
        pur.total = r2(pur.subtotal + pur.tax - num(input.discount));
        var paid = input.paid === undefined || input.paid === '' ? pur.total : Math.min(pur.total, r2(num(input.paid)));
        pur.paid = paid; pur.due = r2(pur.total - paid);
        if (pur.due > 0.004 && !sup) fail('Select a supplier to record an unpaid amount');
        pur.status = pur.due > 0.004 ? (paid > 0 ? 'partial' : 'unpaid') : 'paid';
        if (sup) { sup.balance = r2(sup.balance + pur.due); touch('suppliers', sup); }
        if (paid > 0) {
          var pay = { id: uid(), date: pur.date, at: stamp(), direction: 'out', partyType: 'supplier', partyId: pur.supplierId, partyName: pur.supplierName, amount: paid, method: pur.method, refId: pur.id, note: 'Against ' + pur.number };
          db.payments.push(pay); touch('payments', pay);
        }
        db.purchases.push(pur); touch('purchases', pur);
        return clone(pur);
      });
    };

    api.voidPurchase = function (id, reason) {
      return tx(function () {
        var pur = mustFind('purchases', id, 'Purchase');
        if (pur.status === 'void') fail('Already cancelled');
        pur.lines.forEach(function (l) { var it = find('items', l.itemId); if (it) moveStock(it, -(l.qty + (l.free || 0)), 'void', pur.id, 'Cancelled ' + pur.number); });
        var sup = pur.supplierId && find('suppliers', pur.supplierId);
        if (sup) { sup.balance = r2(sup.balance - pur.due); touch('suppliers', sup); }
        if (pur.paid > 0) {
          var back = { id: uid(), date: today(), at: stamp(), direction: 'in', partyType: 'supplier', partyId: pur.supplierId, partyName: pur.supplierName, amount: pur.paid, method: pur.method, refId: pur.id, note: 'Return for cancelled ' + pur.number };
          db.payments.push(back); touch('payments', back);
        }
        pur.status = 'void'; pur.voidReason = str(reason); pur.due = 0; touch('purchases', pur);
        return clone(pur);
      });
    };

    // ---------- Stock ----------
    api.adjustStock = function (input) {
      return tx(function () {
        var it = mustFind('items', input.itemId, 'Item');
        if (!it.trackStock) fail('Stock is not tracked for services');
        var qty = num(input.qty);
        if (input.mode === 'set') qty = r2(num(input.qty) - it.stock);
        if (!qty) fail('No change in quantity');
        moveStock(it, qty, str(input.reason) || 'adjust', '', str(input.note));
        return clone(it);
      });
    };

    // ---------- Payments (dues) ----------
    api.recordPayment = function (input) {
      return tx(function () {
        var type = input.partyType === 'supplier' ? 'supplier' : 'customer';
        var col = type + 's';
        var party = mustFind(col, input.partyId, type);
        var amount = r2(num(input.amount));
        if (amount <= 0) fail('Amount must be more than zero');
        party.balance = r2(party.balance - amount);
        touch(col, party);
        allocate(type === 'customer' ? 'sales' : 'purchases', type === 'customer' ? 'customerId' : 'supplierId', party.id, amount);
        var pay = { id: uid(), date: isDate(input.date) ? input.date : today(), at: stamp(), direction: type === 'customer' ? 'in' : 'out',
          partyType: type, partyId: party.id, partyName: party.name, amount: amount, method: str(input.method) || 'Cash', refId: '', note: str(input.note) || 'Due payment' };
        db.payments.push(pay); touch('payments', pay);
        return clone(party);
      });
    };

    api.ledger = function (partyType, id) {
      var type = partyType === 'supplier' ? 'supplier' : 'customer';
      var party = mustFind(type + 's', id, type);
      var key = type + 'Id';
      var docs = db[type === 'customer' ? 'sales' : 'purchases'].filter(function (d) { return d[key] === id; });
      var pays = db.payments.filter(function (p) { return p.partyType === type && p.partyId === id; });
      return { party: clone(party), docs: clone(docs).sort(function (a, b) { return b.at.localeCompare(a.at); }),
        payments: clone(pays).sort(function (a, b) { return b.at.localeCompare(a.at); }) };
    };

    // ---------- Appointments ----------
    api.setAppointmentStatus = function (id, status) {
      if (['booked', 'confirmed', 'done', 'cancelled', 'no-show'].indexOf(status) < 0) fail('Invalid status');
      return tx(function () { var a = mustFind('appointments', id, 'Appointment'); a.status = status; touch('appointments', a); return clone(a); });
    };

    api.billAppointment = function (id, input) {
      input = input || {};
      var a = mustFind('appointments', id, 'Appointment');
      if (a.saleId) fail('Already billed');
      var lines = input.lines && input.lines.length ? input.lines : (a.itemId ? [{ itemId: a.itemId, qty: 1 }] : []);
      var sale = api.createSale(Object.assign({}, input, { lines: lines, customerId: a.customerId || input.customerId, customerName: a.customerName, staffId: a.staffId, appointmentId: a.id }));
      tx(function () { var ap = find('appointments', id); ap.status = 'done'; ap.saleId = sale.id; touch('appointments', ap); });
      return sale;
    };

    // ---------- Dashboard & reports ----------
    api.dashboard = function () {
      var s = settings(), t = today(), month = t.slice(0, 7), warn = addDays(t, s.expiryWarnDays);
      var live = db.sales.filter(function (x) { return x.status !== 'void'; });
      function sum(arr, k) { return r2(arr.reduce(function (a, x) { return a + (x[k] || 0); }, 0)); }
      var todays = live.filter(function (x) { return x.date === t; });
      var monthSales = live.filter(function (x) { return x.date.slice(0, 7) === month; });
      var monthExp = db.expenses.filter(function (x) { return x.date.slice(0, 7) === month; });
      var activeItems = db.items.filter(function (i) { return i.active !== false; });
      var days = [];
      for (var i = 13; i >= 0; i--) {
        var d = addDays(t, -i);
        var ds = live.filter(function (x) { return x.date === d; });
        days.push({ date: d, total: sum(ds, 'total'), count: ds.length });
      }
      return {
        today: t,
        todaySales: sum(todays, 'total'), todayCount: todays.length, todayProfit: sum(todays, 'profit'),
        todayCollected: r2(db.payments.filter(function (p) { return p.date === t && p.direction === 'in'; }).reduce(function (a, p) { return a + p.amount; }, 0)),
        monthSales: sum(monthSales, 'total'), monthProfit: sum(monthSales, 'profit'), monthExpenses: sum(monthExp, 'amount'),
        monthNet: r2(sum(monthSales, 'profit') - sum(monthExp, 'amount')),
        receivables: r2(db.customers.reduce(function (a, c) { return a + Math.max(0, c.balance); }, 0)),
        payables: r2(db.suppliers.reduce(function (a, c) { return a + Math.max(0, c.balance); }, 0)),
        stockValue: r2(activeItems.reduce(function (a, i) { return a + (i.trackStock ? Math.max(0, i.stock) * i.cost : 0); }, 0)),
        itemCount: activeItems.length,
        lowStock: clone(activeItems.filter(function (i) { return i.trackStock && i.stock <= i.reorderLevel; }).sort(function (a, b) { return a.stock - b.stock; }).slice(0, 10)),
        lowStockCount: activeItems.filter(function (i) { return i.trackStock && i.stock <= i.reorderLevel; }).length,
        expiring: clone(activeItems.filter(function (i) { return i.expiry && i.expiry <= warn && i.stock > 0; }).sort(function (a, b) { return a.expiry.localeCompare(b.expiry); }).slice(0, 10)),
        appointments: clone(db.appointments.filter(function (a) { return a.date >= t && a.status !== 'cancelled' && a.status !== 'done'; })
          .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).slice(0, 8)),
        recentSales: clone(db.sales.slice().sort(function (a, b) { return b.at.localeCompare(a.at); }).slice(0, 6)),
        last14: days
      };
    };

    api.report = function (q) {
      q = q || {};
      var t = today();
      var from = isDate(q.from) ? q.from : t.slice(0, 8) + '01';
      var to = isDate(q.to) ? q.to : t;
      function inR(x) { return x.date >= from && x.date <= to; }
      var sales = db.sales.filter(function (x) { return x.status !== 'void' && inR(x); });
      var exps = db.expenses.filter(inR);
      var purs = db.purchases.filter(function (x) { return x.status !== 'void' && inR(x); });
      var pays = db.payments.filter(inR);
      function sum(arr, k) { return r2(arr.reduce(function (a, x) { return a + (x[k] || 0); }, 0)); }
      function group(arr, keyFn, valFn) {
        var m = {};
        arr.forEach(function (x) { var k = keyFn(x); if (!m[k]) m[k] = { key: k }; valFn(m[k], x); });
        return Object.keys(m).map(function (k) { return m[k]; });
      }
      var lines = [];
      sales.forEach(function (sl) { sl.lines.forEach(function (l) { lines.push(l); }); });
      var staffNames = {}; db.staff.forEach(function (st) { staffNames[st.id] = st; });
      var r = {
        from: from, to: to,
        salesCount: sales.length, salesTotal: sum(sales, 'total'), tax: sum(sales, 'tax'), net: sum(sales, 'net'),
        discount: r2(sum(sales, 'billDiscount') + sum(sales, 'lineDiscount')),
        cost: sum(sales, 'cost'), grossProfit: sum(sales, 'profit'), expenses: sum(exps, 'amount'),
        purchases: sum(purs, 'total'), creditGiven: sum(sales, 'due'),
        collected: r2(pays.filter(function (p) { return p.direction === 'in'; }).reduce(function (a, p) { return a + p.amount; }, 0)),
        paidOut: r2(pays.filter(function (p) { return p.direction === 'out'; }).reduce(function (a, p) { return a + p.amount; }, 0)
          + exps.reduce(function (a, e) { return a + e.amount; }, 0)),
        byDay: group(sales, function (x) { return x.date; }, function (g, x) { g.total = r2((g.total || 0) + x.total); g.profit = r2((g.profit || 0) + x.profit); g.count = (g.count || 0) + 1; })
          .sort(function (a, b) { return a.key.localeCompare(b.key); }),
        byItem: group(lines, function (l) { return l.name; }, function (g, l) { g.qty = r2((g.qty || 0) + l.qty); g.total = r2((g.total || 0) + l.total); g.profit = r2((g.profit || 0) + (l.total - l.tax - l.cost)); })
          .sort(function (a, b) { return b.total - a.total; }),
        byCategory: group(lines, function (l) { return l.category || 'Uncategorised'; }, function (g, l) { g.qty = r2((g.qty || 0) + l.qty); g.total = r2((g.total || 0) + l.total); })
          .sort(function (a, b) { return b.total - a.total; }),
        byMethod: group(pays.filter(function (p) { return p.direction === 'in'; }), function (p) { return p.method; }, function (g, p) { g.total = r2((g.total || 0) + p.amount); g.count = (g.count || 0) + 1; })
          .sort(function (a, b) { return b.total - a.total; }),
        byTaxRate: group(lines, function (l) { return String(l.taxRate) + '%'; }, function (g, l) { g.taxable = r2((g.taxable || 0) + l.total - l.tax); g.tax = r2((g.tax || 0) + l.tax); }),
        byStaff: group(sales.filter(function (x) { return x.staffId; }), function (x) { return x.staffId; }, function (g, x) {
          var st = staffNames[x.staffId] || {}; g.name = st.name || 'Unknown'; g.total = r2((g.total || 0) + x.total); g.count = (g.count || 0) + 1;
          g.commission = r2((g.commission || 0) + x.net * (st.commissionRate || 0) / 100);
        }).sort(function (a, b) { return b.total - a.total; }),
        expensesByCategory: group(exps, function (e) { return e.category; }, function (g, e) { g.total = r2((g.total || 0) + e.amount); }).sort(function (a, b) { return b.total - a.total; })
      };
      r.netProfit = r2(r.grossProfit - r.expenses);
      return r;
    };

    // ---------- Data management ----------
    api.exportAll = function () { return clone(db); };

    api.importAll = function (data) {
      if (!data || typeof data !== 'object' || !data.settings) fail('This is not a valid backup file');
      return tx(function () {
        Object.keys(db).forEach(function (k) { delete db[k]; });
        Object.assign(db, clone(data));
        migrate(db);
        changes.full = true;
        return api.info().counts;
      });
    };

    api.resetAll = function (keepSettings) {
      return tx(function () {
        var s = db.settings;
        Object.keys(db).forEach(function (k) { delete db[k]; });
        Object.assign(db, emptyDb());
        migrate(db);
        if (keepSettings) db.settings = s;
        changes.full = true;
        return true;
      });
    };

    var CSV_COLUMNS = {
      items: ['name', 'sku', 'barcode', 'category', 'unit', 'price', 'cost', 'taxRate', 'stock', 'reorderLevel', 'batch', 'expiry', 'isService', 'durationMin'],
      customers: ['name', 'phone', 'email', 'address', 'taxId', 'balance', 'points', 'notes'],
      suppliers: ['name', 'phone', 'email', 'address', 'taxId', 'balance', 'notes'],
      sales: ['number', 'date', 'customerName', 'customerPhone', 'subtotal', 'lineDiscount', 'billDiscount', 'tax', 'total', 'paid', 'due', 'method', 'status', 'cost', 'profit'],
      purchases: ['number', 'date', 'supplierName', 'billNo', 'subtotal', 'tax', 'total', 'paid', 'due', 'status'],
      expenses: ['date', 'category', 'amount', 'method', 'note'],
      payments: ['date', 'direction', 'partyType', 'partyName', 'amount', 'method', 'note'],
      appointments: ['date', 'time', 'customerName', 'phone', 'itemName', 'durationMin', 'status', 'notes'],
      staff: ['name', 'role', 'phone', 'commissionRate', 'salary', 'active'],
      stockMoves: ['date', 'itemName', 'qty', 'reason', 'note', 'balance']
    };

    api.exportCSV = function (col) {
      var cols = CSV_COLUMNS[col];
      if (!cols) fail('Cannot export ' + col);
      var extra = [];
      if (col === 'items') extra = preset().itemFields.map(function (f) { return 'custom.' + f.key; });
      var rows = db[col].map(function (r) {
        var o = Object.assign({}, r);
        extra.forEach(function (k) { o[k] = r.custom ? r.custom[k.slice(7)] : ''; });
        return o;
      });
      return toCSV(rows, cols.concat(extra));
    };

    api.importCSV = function (col, text) {
      if (['items', 'customers', 'suppliers'].indexOf(col) < 0) fail('CSV import supports items, customers and suppliers');
      var rows = parseCSV(text);
      if (!rows.length) fail('The CSV file is empty');
      return tx(function () {
        var created = 0, updated = 0, skipped = 0;
        rows.forEach(function (raw) {
          var r = {}; var custom = {};
          Object.keys(raw).forEach(function (k) {
            var key = k.trim();
            if (/^custom\./i.test(key)) { custom[key.slice(7)] = raw[k]; return; }
            var match = (CSV_COLUMNS[col].filter(function (c) { return c.toLowerCase() === key.toLowerCase().replace(/[\s_]/g, ''); })[0]) ||
              ({ mrp: 'price', 'sellingprice': 'price', 'sale price': 'price', qty: 'stock', quantity: 'stock', 'purchaseprice': 'cost', mobile: 'phone' }[key.toLowerCase()]);
            if (match) { r[match] = raw[k]; return; }
            if (col !== 'items' || raw[k] === '') return;
            var f = preset().itemFields.filter(function (x) { return x.key.toLowerCase() === key.toLowerCase() || x.label.toLowerCase() === key.toLowerCase(); })[0];
            custom[f ? f.key : key] = raw[k];
          });
          if (!str(r.name)) { skipped++; return; }
          if (col === 'items') {
            r.isService = /^(true|yes|1|y)$/i.test(str(r.isService));
            r.custom = custom;
            var existing = db.items.filter(function (x) { return x.name.toLowerCase() === str(r.name).toLowerCase() && (x.batch || '') === str(r.batch); })[0];
            var oldStock = existing ? existing.stock : 0;
            var it = normItem(r, existing);
            if (!existing) { db.items.push(it); created++; } else updated++;
            touch('items', it);
            if (r.stock !== undefined && r.stock !== '' && it.trackStock) {
              var diff = r2(num(r.stock) - oldStock);
              if (diff) moveStock(it, diff, existing ? 'adjust' : 'opening', '', 'CSV import');
            }
          } else {
            var ex = db[col].filter(function (x) { return x.name.toLowerCase() === str(r.name).toLowerCase() && (x.phone || '') === str(r.phone); })[0];
            var p = normParty(r, ex);
            if (!ex) { p.balance = r2(num(r.balance)); if (col === 'customers') p.points = num(r.points); db[col].push(p); created++; } else updated++;
            touch(col, p);
          }
        });
        return { created: created, updated: updated, skipped: skipped };
      });
    };

    api.methods = function () { return Object.keys(api); };

    return api;
  }

  return { createEngine: createEngine, emptyDb: emptyDb, parseCSV: parseCSV, toCSV: toCSV, localDate: localDate, addDays: addDays,
    daysBetween: daysBetween, COLLECTIONS: COLLECTIONS, VERSION: VERSION, PAYMENT_METHODS: PAYMENT_METHODS };
});
