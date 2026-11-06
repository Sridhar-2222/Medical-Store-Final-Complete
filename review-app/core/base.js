/*
 * BizCore Review: storage and basics.
 * Holds the data (settings, departments, entries, receipts, customers, vault
 * records, messages), saves after every change, and installs the review logic
 * from review.js. Every change is all-or-nothing.
 * UMD: works in the browser and in Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./industries'), require('./review'), require('./accounts'));
  else root.BizBase = factory(root.BizIndustries, root.BizReview, root.BizAccounts);
})(typeof self !== 'undefined' ? self : this, function (Industries, Review, Accounts) {
  'use strict';

  var VERSION = 3;
  var COLLECTIONS = ['departments', 'entries', 'receipts', 'customers', 'vaultRecords', 'messages', 'staff', 'offers', 'advances', 'attendance'];

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function newId(v) { return typeof v === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(v) ? v : uid(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localDate(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function str(v) { return v === undefined || v === null ? '' : String(v).trim(); }
  function num(v) { if (typeof v === 'string') v = v.replace(/,/g, ''); var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fail(msg) { var e = new Error(msg); e.userError = true; throw e; }

  function defaults(industry) {
    var p = Industries.get(industry);
    return {
      setupDone: false, industry: industry || 'generic', businessName: '', phone: '', address: '',
      currency: '₹', locale: 'en-IN', countryCode: '91',
      halfDaySplit: '15:00', priceAlertPct: 10, wastageAlertPct: 5, collectionGapPct: 3, fluctuationPct: 25, vaultTitle: '',
      geminiModel: 'gemini-2.5-flash', taxRate: p.taxRate
    };
  }
  function emptyDb() {
    var db = { meta: { version: VERSION, createdAt: new Date().toISOString(), appliedOps: [] }, settings: defaults('generic') };
    COLLECTIONS.forEach(function (c) { db[c] = []; });
    return db;
  }

  // CSV helpers (import from spreadsheets / billing software, export for Excel)
  function parseCSV(text) {
    var rows = [], row = [], field = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.join('') !== '') rows.push(row); row = []; }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); if (row.join('') !== '') rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.trim(); });
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i] === undefined ? '' : r[i]; }); return o; });
  }
  function toCSV(rows, cols) {
    function esc(v) { if (v === undefined || v === null) return ''; var s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    return [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return esc(r[c]); }).join(','); })).join('\n');
  }
  var CSV_COLS = {
    entries: ['date', 'half', 'time', 'departmentName', 'type', 'kind', 'month', 'storeCategory', 'amount', 'method', 'category', 'vendor', 'billNo', 'staffName', 'note', 'source'],
    customers: ['name', 'phone', 'email', 'discountPct', 'notes', 'lastContact'],
    vaultRecords: ['date', 'customerName', 'kind', 'title', 'dueDate', 'amount', 'details', 'done'],
    messages: ['date', 'customerName', 'template', 'text'],
    departments: ['name', 'kind', 'active'],
    receipts: ['date', 'vendor', 'billNo', 'type', 'total', 'engine'],
    staff: ['name', 'role', 'phone', 'salary', 'active'],
    offers: ['title', 'pct', 'amount', 'validTill', 'reason', 'createdAt'],
    advances: ['date', 'staffName', 'kind', 'amount', 'how', 'givenBy', 'note'],
    attendance: ['date', 'staffName', 'status', 'note', 'markedAt']
  };

  function createApp(store, opts) {
    opts = opts || {};
    var now = opts.now || function () { return new Date(); };
    if (!store.data || typeof store.data !== 'object' || !Array.isArray(store.data.entries)) store.data = emptyDb();
    var db = store.data;
    function fix(d) {
      if (!d.meta) d.meta = { version: VERSION };
      if (!Array.isArray(d.meta.appliedOps)) d.meta.appliedOps = [];
      COLLECTIONS.forEach(function (c) { if (!Array.isArray(d[c])) d[c] = []; });
      d.settings = Object.assign(defaults(d.settings && d.settings.industry), d.settings || {});
    }
    fix(db);

    var changes = null, setupHooks = [];
    var ctxRef = {};
    function ctxNormFiles(f) { return ctxRef.normFiles ? ctxRef.normFiles(f) : []; }
    function today() { return localDate(now()); }
    function stamp() { return now().toISOString(); }
    function settings() { return db.settings; }
    function preset() { return Industries.get(db.settings.industry); }
    function touch(col, doc) { if (changes) changes.upserts.push({ col: col, doc: doc }); }
    function drop(col, id) { if (changes) changes.deletes.push({ col: col, id: id }); }
    function tx(fn) {
      var snapshot = JSON.stringify(db);
      changes = { upserts: [], deletes: [], full: false, settings: false };
      try {
        var res = fn();
        var c = changes; changes = null;
        if (store.commit) store.commit(c);
        return res;
      } catch (e) {
        var back = JSON.parse(snapshot);
        Object.keys(db).forEach(function (k) { delete db[k]; });
        Object.assign(db, back);
        changes = null;
        throw e;
      }
    }
    function find(col, id) { var a = db[col] || []; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
    function mustFind(col, id, label) { var d = find(col, id); if (!d) fail((label || 'Record') + ' not found'); return d; }

    var api = {};
    api.info = function () {
      var counts = {}; COLLECTIONS.forEach(function (c) { counts[c] = db[c].length; });
      return { settings: clone(db.settings), preset: clone(preset()), industries: Industries.list(), counts: counts, today: today(), version: VERSION };
    };
    api.setup = function (input) {
      input = input || {};
      return tx(function () {
        var key = Industries.PRESETS[input.industry] ? input.industry : 'generic';
        db.settings = Object.assign(defaults(key), db.settings.setupDone ? db.settings : {}, {
          industry: key, setupDone: true, businessName: str(input.businessName) || Industries.get(key).name
        });
        ['phone', 'address', 'currency'].forEach(function (k) { if (str(input[k])) db.settings[k] = str(input[k]); });
        changes.settings = true;
        setupHooks.forEach(function (fn) { fn(); });
        if (input.loadSamples && api.loadReviewSamplesInner) api.loadReviewSamplesInner();
        return clone(db.settings);
      });
    };
    api.saveSettings = function (patch) {
      return tx(function () {
        var s = db.settings;
        Object.keys(patch || {}).forEach(function (k) {
          if (k === 'setupDone') return;
          var v = patch[k];
          if (['priceAlertPct', 'wastageAlertPct', 'collectionGapPct', 'fluctuationPct'].indexOf(k) >= 0) v = num(v);
          if (k === 'industry' && !Industries.PRESETS[v]) return;
          s[k] = typeof v === 'string' ? v.trim() : v;
        });
        changes.settings = true;
        return clone(s);
      });
    };

    api.list = function (col, q) {
      if (COLLECTIONS.indexOf(col) < 0) fail('Unknown list ' + col);
      q = q || {};
      var rows = db[col].slice();
      if (q.search) {
        var n = String(q.search).toLowerCase();
        rows = rows.filter(function (r) {
          return [r.name, r.phone, r.vendor, r.billNo, r.category, r.note, r.notes, r.departmentName, r.title, r.details, r.customerName]
            .some(function (v) { return v && String(v).toLowerCase().indexOf(n) >= 0; });
        });
      }
      ['type', 'departmentId', 'half', 'customerId', 'kind'].forEach(function (k) { if (q[k]) rows = rows.filter(function (r) { return r[k] === q[k]; }); });
      if (q.from) rows = rows.filter(function (r) { return (r.date || '') >= q.from; });
      if (q.to) rows = rows.filter(function (r) { return (r.date || '') <= q.to; });
      var key = q.sort || ({ departments: 'order', customers: 'name' }[col] || '-at');
      var desc = key[0] === '-'; if (desc) key = key.slice(1);
      rows.sort(function (a, b) {
        var va = key === 'at' ? (a.date || '') + (a.time || '') + (a.createdAt || '') : a[key];
        var vb = key === 'at' ? (b.date || '') + (b.time || '') + (b.createdAt || '') : b[key];
        if (typeof va === 'number' && typeof vb === 'number') return desc ? vb - va : va - vb;
        va = String(va === undefined ? '' : va).toLowerCase(); vb = String(vb === undefined ? '' : vb).toLowerCase();
        return desc ? vb.localeCompare(va) : va.localeCompare(vb);
      });
      var total = rows.length;
      if (q.limit) rows = rows.slice(0, q.limit);
      return { rows: clone(rows), total: total };
    };
    api.get = function (col, id) { var d = find(col, id); return d ? clone(d) : null; };

    api.saveCustomer = function (input) {
      input = input || {};
      return tx(function () {
        if (!str(input.name)) fail('Enter the customer\'s name');
        var c = input.id ? find('customers', input.id) : null;
        if (!c) { c = { id: newId(input.id), createdAt: stamp(), balance: 0, points: 0 }; db.customers.push(c); }
        ['name', 'phone', 'email', 'notes'].forEach(function (k) { c[k] = str(input[k]); });
        c.discountPct = Math.max(0, Math.min(100, num(input.discountPct)));
        if (input.files) c.files = ctxNormFiles(input.files);
        c.updatedAt = stamp();
        touch('customers', c);
        return clone(c);
      });
    };
    api.save = function (col, input) { if (col !== 'customers') fail('Use the matching screen to change ' + col); return api.saveCustomer(input); };
    api.removeCustomer = function (id) {
      return tx(function () {
        mustFind('customers', id, 'Customer');
        ['vaultRecords', 'messages'].forEach(function (col) { db[col].filter(function (r) { return r.customerId === id; }).forEach(function (r) { drop(col, r.id); }); db[col] = db[col].filter(function (r) { return r.customerId !== id; }); });
        db.customers = db.customers.filter(function (c) { return c.id !== id; }); drop('customers', id);
        return { deleted: true };
      });
    };

    api.exportAll = function () { return clone(db); };
    api.importAll = function (data) {
      if (!data || typeof data !== 'object' || !data.settings || !Array.isArray(data.entries)) fail('This is not a BizCore Review backup');
      return tx(function () { Object.keys(db).forEach(function (k) { delete db[k]; }); Object.assign(db, clone(data)); fix(db); changes.full = true; return api.info().counts; });
    };
    api.resetAll = function () {
      return tx(function () { var s = db.settings; Object.keys(db).forEach(function (k) { delete db[k]; }); Object.assign(db, emptyDb()); db.settings = s; setupHooks.forEach(function (fn) { fn(); }); changes.full = true; return true; });
    };
    api.exportCSV = function (col) { if (!CSV_COLS[col]) fail('Cannot export ' + col); return toCSV(db[col], CSV_COLS[col]); };

    // Changes recorded while offline, applied once each.
    var SYNCABLE = ['setup', 'saveSettings', 'saveCustomer', 'removeCustomer', 'saveDepartment', 'removeDepartment', 'saveEntry', 'removeEntry',
      'saveDailySheet', 'saveReceipt', 'loadReviewSamples', 'saveVaultRecord', 'removeVaultRecord', 'logMessage', 'ensureVaultToken', 'importEntries',
      'saveStaff', 'removeStaff', 'saveSalaries', 'saveOffer', 'removeOffer', 'saveAdvance', 'removeAdvance', 'markAttendance'];
    api.applyOps = function (ops) {
      var out = [];
      (ops || []).forEach(function (op) {
        if (!op || !op.opId || SYNCABLE.indexOf(op.method) < 0) { out.push({ opId: op && op.opId, ok: false, error: 'Unsupported change' }); return; }
        if (db.meta.appliedOps.indexOf(op.opId) >= 0) { out.push({ opId: op.opId, ok: true, duplicate: true }); return; }
        var r;
        try { r = { opId: op.opId, ok: true, result: api[op.method].apply(null, op.args || []) }; }
        catch (e) { if (!e.userError) throw e; r = { opId: op.opId, ok: false, error: e.message }; }
        tx(function () { db.meta.appliedOps.push(op.opId); db.meta.appliedOps = db.meta.appliedOps.slice(-5000); changes.settings = true; });
        out.push(r);
      });
      return out;
    };

    Object.assign(ctxRef, { api: api, db: function () { return db; }, tx: tx, touch: touch, drop: drop, find: find, mustFind: mustFind, fail: fail,
      uid: uid, newId: newId, today: today, stamp: stamp, settings: settings, preset: preset, clone: clone,
      onSetup: function (fn) { setupHooks.push(fn); } });
    Review.install(ctxRef);
    if (Accounts) Accounts.install(ctxRef);

    api.methods = function () { return Object.keys(api).filter(function (k) { return !/Inner$/.test(k); }); };
    return api;
  }

  return { createApp: createApp, emptyDb: emptyDb, parseCSV: parseCSV, toCSV: toCSV, localDate: localDate, VERSION: VERSION, SYNCABLE: null };
});
