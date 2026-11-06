/*
 * Work areas: what each kind of business counts every day, besides money, and the key numbers
 * worked out from those counts (occupancy for a hotel, average bill per diner for a restaurant,
 * pending alterations for a garment shop…).
 *
 * Each business type has:
 *   title      name of the Work areas feature for that business ("Rooms & guests")
 *   customers  what the business calls its customers ("Guests", "Patients")
 *   visitors   what the walk-in count is called ("Guests", "Diners", "Patients")
 *   counters   daily counts: { key, label, eg }  (eg = one short example)
 *   numbers    key numbers: { label, a, b, as, good }
 *              a / b: 'sales', 'purchases', 'walkins', 'dep:N' (sales of the Nth sales department)
 *              or a counter key; result = a ÷ b shown as 'pct', 'money' or 'num';
 *              'gap' = a − b (e.g. alterations received − delivered = pending).
 *   features   which optional features fit this business (others start switched off in Master)
 *
 * The owner can change all of this for their own business in Master → Work areas.
 * UMD; installs onto the app built by base.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./review'));
  else root.BizWorkAreas = factory(root.BizReview);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  function c(key, label, eg) { return { key: key, label: label, eg: eg || '' }; }
  function n(label, a, b, as, good) { return { label: label, a: a, b: b, as: as || 'num', good: good || '' }; }

  var AREAS = {
    generic: { title: 'Daily work', customers: 'Customers', visitors: 'Customers',
      counters: [c('bills', 'Bills written', 'e.g. 45'), c('orders', 'Orders taken', 'e.g. 6')],
      numbers: [n('Average bill', 'sales', 'bills', 'money'), n('Customers per bill', 'walkins', 'bills')] },
    pharmacy: { title: 'Counter work', customers: 'Customers', visitors: 'Customers',
      counters: [c('bills', 'Bills written', 'e.g. 120'), c('prescriptions', 'Prescriptions filled', 'e.g. 40'), c('deliveries', 'Home deliveries', 'e.g. 8'), c('notInStock', 'Asked for but not in stock', 'e.g. 5')],
      numbers: [n('Average bill', 'sales', 'bills', 'money'), n('Prescription share', 'prescriptions', 'bills', 'pct'), n('Average home delivery', 'dep:1', 'deliveries', 'money'), n('Lost sales (not in stock) per 100 bills', 'notInStock', 'bills', 'per100', 'low')] },
    grocery: { title: 'Counter work', customers: 'Customers', visitors: 'Customers',
      counters: [c('bills', 'Bills written', 'e.g. 150'), c('deliveries', 'Home deliveries', 'e.g. 12'), c('notInStock', 'Asked for but not in stock', 'e.g. 6')],
      numbers: [n('Average bill', 'sales', 'bills', 'money'), n('Average home delivery', 'dep:1', 'deliveries', 'money'), n('Lost sales per 100 bills', 'notInStock', 'bills', 'per100', 'low')] },
    restaurant: { title: 'Tables & orders', customers: 'Guests', visitors: 'Diners',
      counters: [c('covers', 'Diners (dine-in)', 'e.g. 180'), c('tables', 'Tables served', 'e.g. 60'), c('takeaway', 'Takeaway orders', 'e.g. 25'), c('delivery', 'Delivery orders', 'e.g. 30'), c('wasteKg', 'Food thrown away (kg)', 'e.g. 4')],
      numbers: [n('Average bill per diner', 'dep:0', 'covers', 'money'), n('Diners per table', 'covers', 'tables'), n('Average delivery order', 'dep:2', 'delivery', 'money'), n('Average takeaway order', 'dep:3', 'takeaway', 'money'), n('Food cost (purchases ÷ sales)', 'purchases', 'sales', 'pct', 'low')] },
    hotel: { title: 'Rooms & guests', customers: 'Guests', visitors: 'Guests',
      counters: [c('roomsAvailable', 'Rooms available', 'e.g. 40'), c('roomsSold', 'Rooms sold (occupied)', 'e.g. 31'), c('checkIns', 'Check-ins', 'e.g. 12'), c('checkOuts', 'Check-outs', 'e.g. 10'), c('guests', 'Guests staying', 'e.g. 58'), c('covers', 'Restaurant diners', 'e.g. 90')],
      numbers: [n('Occupancy', 'roomsSold', 'roomsAvailable', 'pct', 'high'), n('Average room rate', 'dep:0', 'roomsSold', 'money'), n('Room income per available room', 'dep:0', 'roomsAvailable', 'money'), n('Guests per room', 'guests', 'roomsSold'), n('Average restaurant bill per diner', 'dep:1', 'covers', 'money')] },
    salon: { title: 'Services & appointments', customers: 'Clients', visitors: 'Clients',
      counters: [c('services', 'Services done', 'e.g. 35'), c('appointments', 'Booked appointments', 'e.g. 20'), c('noShows', 'No-shows', 'e.g. 2')],
      numbers: [n('Average per service', 'sales', 'services', 'money'), n('Services per client', 'services', 'walkins'), n('No-show rate', 'noShows', 'appointments', 'pct', 'low')] },
    clinic: { title: 'Patients & tests', customers: 'Patients', visitors: 'Patients',
      counters: [c('opd', 'OPD patients', 'e.g. 60'), c('newPatients', 'New patients', 'e.g. 15'), c('labTests', 'Lab tests done', 'e.g. 45'), c('procedures', 'Procedures', 'e.g. 4')],
      numbers: [n('Average per OPD patient', 'dep:0', 'opd', 'money'), n('New patients share', 'newPatients', 'opd', 'pct'), n('Lab tests per patient', 'labTests', 'opd'), n('Average per lab test', 'dep:1', 'labTests', 'money')] },
    apparel: { title: 'Pieces & alterations', customers: 'Customers', visitors: 'Customers',
      counters: [c('bills', 'Bills written', 'e.g. 40'), c('pieces', 'Pieces sold', 'e.g. 95'), c('altIn', 'Alterations received', 'e.g. 12'), c('altOut', 'Alterations delivered', 'e.g. 10'), c('returns', 'Returns / exchanges', 'e.g. 3')],
      numbers: [n('Average bill', 'sales', 'bills', 'money'), n('Pieces per bill', 'pieces', 'bills'), n('Average price per piece', 'sales', 'pieces', 'money'), n('Alterations still pending', 'altIn', 'altOut', 'gap', 'low'), n('Returns per 100 bills', 'returns', 'bills', 'per100', 'low')] },
    electronics: { title: 'Sales & repairs', customers: 'Customers', visitors: 'Customers',
      counters: [c('units', 'Units sold', 'e.g. 14'), c('repairsIn', 'Repairs received', 'e.g. 9'), c('repairsOut', 'Repairs delivered', 'e.g. 7')],
      numbers: [n('Average price per unit', 'dep:0', 'units', 'money'), n('Repairs still pending', 'repairsIn', 'repairsOut', 'gap', 'low'), n('Average per repair', 'dep:1', 'repairsOut', 'money')] },
    hardware: { title: 'Counter & site orders', customers: 'Customers', visitors: 'Customers',
      counters: [c('bills', 'Bills written', 'e.g. 55'), c('siteOrders', 'Site deliveries', 'e.g. 4'), c('loads', 'Loads received in godown', 'e.g. 2')],
      numbers: [n('Average counter bill', 'dep:0', 'bills', 'money'), n('Average site order', 'dep:1', 'siteOrders', 'money')] },
    bakery: { title: 'Baking & orders', customers: 'Customers', visitors: 'Customers',
      counters: [c('bills', 'Bills written', 'e.g. 140'), c('cakeOrders', 'Cake orders', 'e.g. 6'), c('trays', 'Trays baked', 'e.g. 30'), c('unsoldTrays', 'Trays left unsold at close', 'e.g. 2')],
      numbers: [n('Average bill', 'dep:0', 'bills', 'money'), n('Average cake order', 'dep:1', 'cakeOrders', 'money'), n('Unsold share', 'unsoldTrays', 'trays', 'pct', 'low')] },
    auto: { title: 'Vehicles & jobs', customers: 'Customers', visitors: 'Vehicles',
      counters: [c('vehiclesIn', 'Vehicles received', 'e.g. 12'), c('vehiclesOut', 'Vehicles delivered', 'e.g. 10'), c('washes', 'Washes', 'e.g. 15')],
      numbers: [n('Average per vehicle (workshop)', 'dep:0', 'vehiclesOut', 'money'), n('Vehicles still in the workshop', 'vehiclesIn', 'vehiclesOut', 'gap', 'low'), n('Average per wash', 'dep:2', 'washes', 'money')] },
    fitness: { title: 'Members & visits', customers: 'Members', visitors: 'Visits',
      counters: [c('checkIns', 'Member check-ins', 'e.g. 140'), c('newMembers', 'New members', 'e.g. 3'), c('renewals', 'Renewals', 'e.g. 5'), c('ptSessions', 'Personal training sessions', 'e.g. 12')],
      numbers: [n('Average per new member / renewal', 'dep:0', 'joins', 'money'), n('Average per PT session', 'dep:1', 'ptSessions', 'money')] },
    services: { title: 'Jobs & enquiries', customers: 'Clients', visitors: 'Clients',
      counters: [c('enquiries', 'New enquiries', 'e.g. 8'), c('jobsDone', 'Jobs completed', 'e.g. 5'), c('amcVisits', 'AMC visits', 'e.g. 3')],
      numbers: [n('Average per job', 'dep:0', 'jobsDone', 'money'), n('Enquiries turned into jobs', 'jobsDone', 'enquiries', 'pct', 'high')] }
  };
  // fitness: new members + renewals together
  var DERIVED = { joins: ['newMembers', 'renewals'] };

  // Headers / features every business can switch on or off in Master (key = page name).
  var FEATURES = {
    home: [['accounts', 'Accounts'], ['customers', 'Customers'], ['store', 'Store'], ['reports', 'Reports'], ['staff', 'Staff'], ['work', 'Work areas']],
    accounts: [['sales', 'Sales'], ['purchases', 'Purchases'], ['salaries', 'Salaries'], ['advances', 'Staff advances'], ['fixed', 'Fixed costs'], ['exp-maintenance', 'Maintenance'], ['exp-variable', 'Variable expenses'], ['exp-sudden', 'Sudden / miscellaneous'], ['daily', 'Daily summary'], ['cash', 'Cash in hand'], ['pl', 'Profit & Loss'], ['receipts', 'All receipts']],
    customers: [['cust-list', 'Customer list'], ['bulk', 'Bulk reminder'], ['reminders', 'Reminders due'], ['discounts', 'Customer discount'], ['offers', 'Special discount'], ['messages', 'Messages'], ['setup-video', 'Customer video']],
    reports: [['daily', 'Daily summary'], ['pl', 'Profit & Loss'], ['alerts', 'Alerts'], ['rep-sales', 'Sales report'], ['rep-spend', 'Spending report'], ['spot', 'Spot check'], ['ask-ai', 'Ask AI']],
    staff: [['attendance', 'Attendance'], ['advances', 'Staff advances'], ['salaries', 'Salaries']]
  };
  // Features that do not fit a business start switched off (the owner can switch them on).
  var OFF = {
    services: ['store'],
    fitness: ['store'],
    clinic: ['discounts']
  };

  function str(v) { return v === undefined || v === null ? '' : String(v).trim(); }
  function num(v) { if (typeof v === 'string') v = v.replace(/,/g, ''); var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  function r2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  function slug(s) { return str(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'count'; }

  function install(ctx) {
    var api = ctx.api, fail = ctx.fail;
    function db() { return ctx.db(); }
    function s() { return ctx.settings(); }
    function master() { var m = s().master; return m && typeof m === 'object' ? m : {}; }

    // The work areas in use: the business type's own, or the owner's version from Master.
    function config() {
      var key = s().industry, base = AREAS[key] || AREAS.generic, m = master(), own = m.work && m.work[key];
      return {
        industry: key, title: (own && own.title) || base.title, customers: (own && own.customers) || base.customers, visitors: (own && own.visitors) || base.visitors,
        counters: (own && Array.isArray(own.counters) ? own.counters : base.counters).map(function (x) { return { key: x.key, label: x.label, eg: x.eg || '' }; }),
        numbers: base.numbers.slice(), custom: !!own
      };
    }
    api.workConfig = function () { return ctx.clone(config()); };
    api.workAreasFor = function (industry) { return ctx.clone(AREAS[industry] || AREAS.generic); };

    // Master: change the work areas for this business (title, names, counters). Empty = back to the standard set.
    api.saveWorkConfig = function (input) {
      input = input || {};
      return ctx.tx(function () {
        var key = s().industry, m = Object.assign({}, master()), work = Object.assign({}, m.work || {});
        if (input.reset) delete work[key];
        else {
          var seen = {}, counters = (Array.isArray(input.counters) ? input.counters : []).map(function (x) {
            var label = str(x.label); if (!label) return null;
            var k = /^[A-Za-z0-9]{1,30}$/.test(x.key || '') ? x.key : slug(label);
            while (seen[k]) k = k + '2'; seen[k] = 1;
            return { key: k, label: label.slice(0, 60), eg: str(x.eg).slice(0, 40) };
          }).filter(Boolean);
          if (!counters.length) fail('Keep at least one thing to count');
          work[key] = { title: str(input.title).slice(0, 40) || (AREAS[key] || AREAS.generic).title, customers: str(input.customers).slice(0, 30), visitors: str(input.visitors).slice(0, 30), counters: counters };
        }
        m.work = work; s().master = m; ctx.markSettings();
        return ctx.clone(config());
      });
    };

    // Example data: 30 days of counts around each counter's "e.g." value, so key numbers show at once.
    var sampleInner = api.loadReviewSamplesInner;
    if (sampleInner) api.loadReviewSamplesInner = function () {
      var res = sampleInner.apply(null, arguments), cfg = config(), end = ctx.today(), seed = 7;
      var rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (var i = 29; i >= 0; i--) {
        var d = R.addDays(end, -i), id = 'wd-' + d;
        if (ctx.find('workdays', id)) continue;
        var vals = {};
        cfg.counters.forEach(function (x) {
          var mm = /\d+(\.\d+)?/.exec(String(x.eg)), base = mm ? +mm[0] : 5;
          vals[x.key] = x.key === 'roomsAvailable' ? base : Math.max(0, Math.round(base * (0.75 + rnd() * 0.5)));
        });
        if (vals.roomsSold > vals.roomsAvailable) vals.roomsSold = vals.roomsAvailable;
        Object.keys(vals).forEach(function (k) { var inK = k.replace(/Out$/, 'In'); if (inK !== k && vals[inK] !== undefined && vals[k] > vals[inK]) vals[k] = vals[inK]; });
        var w = { id: id, date: d, values: vals, note: '', files: [], createdAt: ctx.stamp(), updatedAt: ctx.stamp(), source: 'sample' };
        db().workdays.push(w); ctx.touch('workdays', w);
      }
      return res;
    };

    // Master: switch features on/off, rename them, change the "e.g." lines. hidden[key] true/false; missing = default.
    api.masterState = function () {
      var m = master(), off = OFF[s().industry] || [], hidden = {};
      Object.keys(FEATURES).forEach(function (g) { FEATURES[g].forEach(function (f) { var h = m.hidden && m.hidden[f[0]]; hidden[f[0]] = h === undefined ? off.indexOf(f[0]) >= 0 : !!h; }); });
      return { hidden: hidden, names: ctx.clone(m.names || {}), examples: ctx.clone(m.examples || {}), features: FEATURES };
    };
    api.saveMaster = function (input) {
      input = input || {};
      return ctx.tx(function () {
        var m = Object.assign({}, master());
        if (input.hidden) { m.hidden = Object.assign({}, m.hidden || {}); Object.keys(input.hidden).forEach(function (k) { m.hidden[k] = !!input.hidden[k]; }); }
        ['names', 'examples'].forEach(function (g) {
          if (!input[g]) return;
          m[g] = Object.assign({}, m[g] || {});
          Object.keys(input[g]).forEach(function (k) { var v = str(input[g][k]).slice(0, 80); if (v) m[g][k] = v; else delete m[g][k]; });
        });
        if (input.reset) { m.hidden = {}; m.names = {}; m.examples = {}; }
        s().master = m; ctx.markSettings();
        return api.masterState();
      });
    };

    // One day's counts (one record per day, so two phones entering the same day end up with one).
    api.saveWorkDay = function (input) {
      input = input || {};
      if (!isDate(input.date)) fail('Choose the date');
      if (input.date > R.addDays(ctx.today(), 1)) fail('That date is in the future. Check the date.');
      return ctx.tx(function () {
        var id = 'wd-' + input.date, d = ctx.find('workdays', id), vals = {}, any = false;
        Object.keys(input.values || {}).forEach(function (k) {
          if (!/^[A-Za-z0-9-]{1,30}$/.test(k)) return;
          var raw = input.values[k]; if (raw === '' || raw === null || raw === undefined) return;
          var v = num(raw); if (v < 0) fail('Counts cannot be negative'); vals[k] = r2(v); any = true;
        });
        if (!any) {
          if (d) { db().workdays = db().workdays.filter(function (x) { return x.id !== id; }); ctx.drop('workdays', id); }
          return { cleared: true };
        }
        if (!d) { d = { id: id, createdAt: ctx.stamp() }; db().workdays.push(d); }
        d.date = input.date; d.values = vals; d.note = str(input.note); d.files = ctx.normFiles(input.files || d.files); d.updatedAt = ctx.stamp();
        ctx.touch('workdays', d);
        return ctx.clone(d);
      });
    };
    api.workDay = function (date) { var d = ctx.find('workdays', 'wd-' + date); return d ? ctx.clone(d) : { id: 'wd-' + date, date: date, values: {}, note: '', files: [] }; };

    // Totals for a period and the key numbers.
    api.workReport = function (q) {
      q = q || {};
      var t = ctx.today(), to = isDate(q.to) ? q.to : t, from = isDate(q.from) ? q.from : R.addDays(to, -6);
      var cfg = config(), days = db().workdays.filter(function (d) { return d.date >= from && d.date <= to; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
      var totals = {}; cfg.counters.forEach(function (x) { totals[x.key] = 0; });
      days.forEach(function (d) { Object.keys(d.values || {}).forEach(function (k) { totals[k] = r2((totals[k] || 0) + d.values[k]); }); });
      Object.keys(DERIVED).forEach(function (k) { totals[k] = DERIVED[k].reduce(function (a, x) { return a + (totals[x] || 0); }, 0); });
      var pl = api.profitLoss({ from: from, to: to });
      var deps = db().departments.filter(function (x) { return x.active !== false; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var es = db().entries.filter(function (e) { return e.date >= from && e.date <= to; });
      // counts only matter on days that have counts, so money is taken from the same days
      var dayset = {}; days.forEach(function (d) { dayset[d.date] = 1; });
      var onDays = function (e) { return dayset[e.date]; };
      function val(src) {
        if (src === 'sales') return es.filter(function (e) { return e.type === 'sale' && onDays(e); }).reduce(function (a, e) { return a + e.amount; }, 0);
        if (src === 'purchases') return es.filter(function (e) { return e.type === 'purchase' && onDays(e); }).reduce(function (a, e) { return a + e.amount; }, 0);
        if (src === 'walkins') return es.filter(function (e) { return e.type === 'walkin' && onDays(e); }).reduce(function (a, e) { return a + e.amount; }, 0);
        var m = /^dep:(\d+)$/.exec(src);
        if (m) { var dp = deps[+m[1]]; return dp ? es.filter(function (e) { return e.type === 'sale' && e.departmentId === dp.id && onDays(e); }).reduce(function (a, e) { return a + e.amount; }, 0) : null; }
        return totals[src] === undefined ? null : totals[src];
      }
      var known = {}; cfg.counters.forEach(function (x) { known[x.key] = 1; }); Object.keys(DERIVED).forEach(function (k) { known[k] = DERIVED[k].every(function (x) { return known[x]; }); });
      var numbers = cfg.numbers.filter(function (x) { return [x.a, x.b].every(function (src) { return /^(sales|purchases|walkins|dep:\d+)$/.test(src) || known[src]; }); }).map(function (x) {
        var a = val(x.a), b = val(x.b), v = null;
        if (a !== null && b !== null) {
          if (x.as === 'gap') v = r2(a - b);
          else if (b > 0) v = x.as === 'pct' ? r2(a / b * 100) : x.as === 'per100' ? r2(a / b * 100) : r2(a / b);
        }
        var depName = function (src) { var m = /^dep:(\d+)$/.exec(src); return m && deps[+m[1]] ? deps[+m[1]].name : ''; };
        return { label: x.label, value: v, as: x.as, good: x.good, from: [depName(x.a), depName(x.b)].filter(Boolean).join(', ') };
      });
      return { from: from, to: to, config: cfg, days: ctx.clone(days), daysCounted: days.length, totals: totals, numbers: numbers, sales: pl.sales };
    };
  }

  return { install: install, AREAS: AREAS, FEATURES: FEATURES, OFF: OFF };
});
