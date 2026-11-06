/*
 * BizCore 3.0 accounts: sales departments, store categories, the four kinds of
 * expenses, staff & salaries, Profit & Loss with fixed costs spread per day,
 * customer discounts and special offers, alerts, and example data.
 *
 *   Gross profit = Sales − Purchases
 *   Net profit   = Gross − Variable − Maintenance − Sudden − Fixed for the period
 *   Fixed for the period = Σ over days ( monthly fixed of that month ÷ days in that month )
 *
 * UMD; installs onto the app built by base.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./industries'), require('./review'));
  else root.BizAccounts = factory(root.BizIndustries, root.BizReview);
})(typeof self !== 'undefined' ? self : this, function (Industries, R) {
  'use strict';

  // Sales departments (A, B, C… the owner renames them) and store categories per business type
  var SALES_DEPTS = {
    generic: ['Department A', 'Department B', 'Department C'],
    pharmacy: ['Counter', 'Home delivery', 'Wholesale'],
    grocery: ['Counter', 'Home delivery'],
    restaurant: ['Dine-in', 'Catering', 'Door delivery', 'Takeaway'],
    hotel: ['Rooms', 'Restaurant', 'Banquet', 'Bar'],
    salon: ['Hair', 'Skin & spa', 'Retail products'],
    clinic: ['OPD', 'Lab', 'Pharmacy', 'Procedures'],
    apparel: ['Showroom', 'Online orders', 'Alterations'],
    electronics: ['Sales', 'Repairs', 'Accessories'],
    hardware: ['Counter', 'Site orders'],
    bakery: ['Counter', 'Cake orders'],
    auto: ['Workshop', 'Parts counter', 'Washing'],
    fitness: ['Memberships', 'Personal training', 'Shop'],
    services: ['Jobs', 'AMC / contracts']
  };
  var STORE_CATS = {
    generic: ['Stock', 'Packing material', 'Consumables'],
    pharmacy: ['Medicines', 'Surgical', 'OTC / FMCG'],
    grocery: ['Staples', 'Fruits & vegetables', 'Dairy', 'Packed goods'],
    restaurant: ['Vegetables', 'Meat & fish', 'Dairy', 'Groceries', 'Gas'],
    hotel: ['Food', 'Beverages', 'Linen & amenities', 'Housekeeping supplies'],
    salon: ['Products', 'Consumables'],
    clinic: ['Medicines', 'Consumables', 'Lab reagents'],
    apparel: ['Garments', 'Footwear', 'Packing'],
    electronics: ['Products', 'Spare parts'],
    hardware: ['Cement & steel', 'Plumbing', 'Electrical', 'Paint'],
    bakery: ['Flour & sugar', 'Dairy & eggs', 'Packing'],
    auto: ['Spare parts', 'Oils & lubricants'],
    fitness: ['Supplements', 'Merchandise'],
    services: ['Materials', 'Tools']
  };
  var FIXED_DEFAULTS = [{ name: 'Rent', amount: 0 }, { name: 'Electricity', amount: 0 }, { name: 'Internet & phone', amount: 0 }];
  var KINDS = { fixed: 'Fixed', variable: 'Variable', maintenance: 'Maintenance', sudden: 'Sudden / miscellaneous' };
  var KIND_EXAMPLES = {
    fixed: ['Rent', 'Electricity', 'Internet & phone', 'Loan / EMI', 'Insurance', 'Licences'],
    variable: ['Packing', 'Fuel & transport', 'Commission', 'Daily wages', 'Gas'],
    maintenance: ['Repairs', 'AMC', 'Equipment service', 'Painting', 'Plumbing / electrical'],
    sudden: ['Emergency repair', 'Breakage', 'Fine / penalty', 'Cash given', 'Other']
  };
  // Sales departments replace the earlier mixed department list
  Object.keys(Industries.PRESETS).forEach(function (k) { Industries.PRESETS[k].review.departments = (SALES_DEPTS[k] || SALES_DEPTS.generic).slice(); });

  function r2(n) { n = Number(n) || 0; return Math.round((n + Number.EPSILON) * 100) / 100; }
  function num(v) { if (typeof v === 'string') v = v.replace(/,/g, ''); var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function str(v) { return v === undefined || v === null ? '' : String(v).trim(); }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  function daysInMonth(ym) { var p = ym.split('-'); return new Date(+p[0], +p[1], 0).getDate(); }

  function install(ctx) {
    var api = ctx.api, fail = ctx.fail;
    function db() { return ctx.db(); }
    function s() { return ctx.settings(); }

    ctx.onSetup(function () {
      var set = s(), key = set.industry;
      if (!Array.isArray(set.storeCategories) || !set.storeCategories.length) set.storeCategories = (STORE_CATS[key] || STORE_CATS.generic).slice();
      if (!Array.isArray(set.fixedCosts) || !set.fixedCosts.length) set.fixedCosts = FIXED_DEFAULTS.map(function (f) { return { name: f.name, amount: f.amount }; });
    });
    api.storeCategories = function () { var c = s().storeCategories; return Array.isArray(c) && c.length ? c.slice() : (STORE_CATS[s().industry] || STORE_CATS.generic).slice(); };
    api.kinds = function () { return { labels: KINDS, examples: KIND_EXAMPLES }; };

    // ---------------- staff & salaries ----------------
    api.saveStaff = function (input) {
      input = input || {};
      return ctx.tx(function () {
        if (!str(input.name)) fail('Enter the staff member\'s name');
        var st = input.id ? ctx.find('staff', input.id) : null;
        if (!st) { st = { id: ctx.newId(input.id), createdAt: ctx.stamp() }; db().staff.push(st); }
        st.name = str(input.name); st.role = str(input.role); st.phone = str(input.phone);
        st.salary = r2(Math.max(0, num(input.salary))); st.active = input.active === undefined ? st.active !== false : !!input.active;
        st.files = ctx.normFiles(input.files || st.files);
        st.updatedAt = ctx.stamp();
        ctx.touch('staff', st);
        return ctx.clone(st);
      });
    };
    api.removeStaff = function (id) {
      return ctx.tx(function () {
        var st = ctx.mustFind('staff', id, 'Staff member');
        if (db().entries.some(function (e) { return e.staffId === id; })) { st.active = false; ctx.touch('staff', st); return { deactivated: true }; }
        db().staff = db().staff.filter(function (x) { return x.id !== id; }); ctx.drop('staff', id);
        return { deleted: true };
      });
    };
    // One salary entry per staff member per month (replaces what was saved before for that month)
    api.saveSalaries = function (input) {
      input = input || {};
      if (!/^\d{4}-\d{2}$/.test(input.month || '')) fail('Choose the month');
      return ctx.tx(function () {
        var saved = 0;
        (input.rows || []).forEach(function (row) {
          var st = ctx.mustFind('staff', row.staffId, 'Staff member');
          db().entries.filter(function (e) { return e.type === 'expense' && e.kind === 'fixed' && e.category === 'Salaries' && e.staffId === st.id && e.month === input.month; })
            .forEach(function (e) { db().entries = db().entries.filter(function (x) { return x.id !== e.id; }); ctx.drop('entries', e.id); });
          var amt = r2(num(row.amount));
          if (!(amt > 0)) return;
          var e = ctx.normEntry({ id: row.id, type: 'expense', kind: 'fixed', category: 'Salaries', month: input.month, date: isDate(row.paidOn) ? row.paidOn : input.month + '-01',
            amount: amt, staffId: st.id, staffName: st.name, method: str(row.method) || 'Cash', note: str(row.note), files: row.files, source: 'salary' });
          db().entries.push(e); ctx.touch('entries', e); saved++;
        });
        return { saved: saved };
      });
    };
    api.salaries = function (month) {
      var paid = {};
      db().entries.forEach(function (e) { if (e.type === 'expense' && e.category === 'Salaries' && e.month === month && e.staffId) paid[e.staffId] = e; });
      return db().staff.filter(function (st) { return st.active !== false || paid[st.id]; }).map(function (st) {
        var e = paid[st.id];
        return { staffId: st.id, name: st.name, role: st.role, salary: st.salary || 0, paid: e ? e.amount : 0, paidOn: e ? e.date : '', entryId: e ? e.id : '', files: e ? e.files : [] };
      });
    };

    // ---------------- Profit & Loss ----------------
    // Monthly fixed costs for a month: what was entered for that month, otherwise the default amount
    // from Business setup; salaries entered for the month, otherwise the staff list's monthly salaries.
    function monthlyFixed(ym) {
      var entered = {}, detail = [];
      db().entries.forEach(function (e) {
        if (e.type === 'expense' && e.kind === 'fixed' && (e.month || e.date.slice(0, 7)) === ym) {
          var k = e.category || 'Other fixed';
          entered[k] = r2((entered[k] || 0) + e.amount);
        }
      });
      Object.keys(entered).forEach(function (k) { detail.push({ name: k, monthly: entered[k], source: 'entered' }); });
      (s().fixedCosts || []).forEach(function (f) { if (!entered[f.name] && num(f.amount) > 0) detail.push({ name: f.name, monthly: r2(num(f.amount)), source: 'usual' }); });
      if (!entered.Salaries) {
        var sal = db().staff.filter(function (st) { return st.active !== false; }).reduce(function (a, st) { return a + (st.salary || 0); }, 0);
        if (sal > 0) detail.push({ name: 'Salaries', monthly: r2(sal), source: 'staff list' });
      }
      return { total: r2(detail.reduce(function (a, d) { return a + d.monthly; }, 0)), detail: detail };
    }
    api.monthlyFixed = monthlyFixed;

    api.profitLoss = function (q) {
      q = q || {};
      var t = ctx.today();
      var to = isDate(q.to) ? q.to : t, from = isDate(q.from) ? q.from : to.slice(0, 8) + '01';
      var days = R.daysIn(from, to);
      var inRange = function (e) { return e.date >= from && e.date <= to && (!q.departmentId || e.departmentId === q.departmentId); };
      var es = db().entries.filter(inRange);
      var sum = function (f) { return r2(es.filter(f).reduce(function (a, e) { return a + e.amount; }, 0)); };
      var sales = sum(function (e) { return e.type === 'sale'; });
      var purchases = sum(function (e) { return e.type === 'purchase'; });
      var byKind = {};
      ['variable', 'maintenance', 'sudden'].forEach(function (k) { byKind[k] = sum(function (e) { return (e.type === 'expense' && e.kind === k) || (k === 'sudden' && e.type === 'misc'); }); });
      // fixed spread per day
      var monthCache = {}, fixed = 0, perDay = [];
      var dayMap = {};
      days.forEach(function (d) { dayMap[d] = { date: d, sales: 0, purchases: 0, variable: 0, maintenance: 0, sudden: 0, fixed: 0 }; });
      days.forEach(function (d) {
        var ym = d.slice(0, 7);
        if (!monthCache[ym]) monthCache[ym] = monthlyFixed(ym);
        var share = r2(monthCache[ym].total / daysInMonth(ym));
        dayMap[d].fixed = share; fixed += share;
      });
      es.forEach(function (e) {
        var d = dayMap[e.date]; if (!d) return;
        if (e.type === 'sale') d.sales += e.amount;
        else if (e.type === 'purchase') d.purchases += e.amount;
        else if (e.type === 'misc') d.sudden += e.amount;
        else if (e.type === 'expense' && e.kind && e.kind !== 'fixed') d[e.kind] += e.amount;
      });
      days.forEach(function (d) {
        var x = dayMap[d];
        ['sales', 'purchases', 'variable', 'maintenance', 'sudden'].forEach(function (k) { x[k] = r2(x[k]); });
        x.gross = r2(x.sales - x.purchases);
        x.net = r2(x.gross - x.variable - x.maintenance - x.sudden - x.fixed);
        perDay.push(x);
      });
      fixed = r2(fixed);
      var gross = r2(sales - purchases);
      var net = r2(gross - byKind.variable - byKind.maintenance - byKind.sudden - fixed);
      // 4-week view of purchases: smooths heavy and light buying weeks
      var f28 = R.addDays(to, -27);
      var e28 = db().entries.filter(function (e) { return e.date >= f28 && e.date <= to; });
      var s28 = e28.filter(function (e) { return e.type === 'sale'; }).reduce(function (a, e) { return a + e.amount; }, 0);
      var p28 = e28.filter(function (e) { return e.type === 'purchase'; }).reduce(function (a, e) { return a + e.amount; }, 0);
      var salesByDept = {}, purchByCat = {}, expByCat = {};
      es.forEach(function (e) {
        if (e.type === 'sale') { var k = e.departmentName || 'Not set'; salesByDept[k] = r2((salesByDept[k] || 0) + e.amount); }
        if (e.type === 'purchase') { var c = e.storeCategory || e.category || 'Not set'; purchByCat[c] = r2((purchByCat[c] || 0) + e.amount); }
        if ((e.type === 'expense' && e.kind !== 'fixed') || e.type === 'misc') { var x = (KINDS[e.kind] || 'Sudden / miscellaneous') + ': ' + (e.category || 'Other'); expByCat[x] = r2((expByCat[x] || 0) + e.amount); }
      });
      var toList = function (o) { return Object.keys(o).map(function (k) { return { name: k, amount: o[k] }; }).sort(function (a, b) { return b.amount - a.amount; }); };
      return {
        from: from, to: to, days: days.length,
        sales: sales, purchases: purchases, gross: gross, variable: byKind.variable, maintenance: byKind.maintenance, sudden: byKind.sudden, fixed: fixed, net: net,
        margin: sales ? r2(net / sales * 100) : null, purchasePct: sales ? r2(purchases / sales * 100) : null,
        purchasePct4w: s28 ? r2(p28 / s28 * 100) : null,
        fixedMonths: Object.keys(monthCache).map(function (ym) { return { month: ym, total: monthCache[ym].total, perDay: r2(monthCache[ym].total / daysInMonth(ym)), detail: monthCache[ym].detail }; }),
        perDay: perDay, salesByDept: toList(salesByDept), purchasesByCategory: toList(purchByCat), expensesByCategory: toList(expByCat)
      };
    };

    // ---------------- alerts ----------------
    api.alerts = function (q) {
      q = q || {};
      var t = ctx.today();
      var to = isDate(q.to) ? q.to : t, from = isDate(q.from) ? q.from : R.addDays(to, -29);
      var ins = api.reviewInsights({ from: from, to: to, departmentIds: q.departmentId ? [q.departmentId] : [] });
      var cur = s().currency || '';
      var money = function (n) { return cur + Math.round(n).toLocaleString('en-IN'); };
      var keep = /collection|cash|spent more|sales dropped|unusually high|spending|walk-in|no data|without collections|kpi/i;
      var flags = ins.flags.filter(function (f) { return keep.test(f.area || '') || keep.test(f.title); }).filter(function (f) { return f.area !== 'prices' && f.area !== 'stock' && f.area !== 'deliveries'; });
      // sudden expenses: always shown for review
      db().entries.filter(function (e) { return (e.kind === 'sudden' || e.type === 'misc') && e.date >= from && e.date <= to; }).forEach(function (e) {
        flags.push({ severity: e.amount >= 2000 ? 'medium' : 'info', title: 'Sudden expense ' + money(e.amount) + ' on ' + e.date, detail: [e.category, e.note, e.vendor].filter(Boolean).join(' · ') || 'No reason written', area: 'sudden', entryId: e.id });
      });
      // purchases this week vs the 4 weeks before
      var wk = db().entries.filter(function (e) { return e.type === 'purchase' && e.date > R.addDays(to, -7) && e.date <= to; }).reduce(function (a, e) { return a + e.amount; }, 0);
      var prev4 = db().entries.filter(function (e) { return e.type === 'purchase' && e.date > R.addDays(to, -35) && e.date <= R.addDays(to, -7); }).reduce(function (a, e) { return a + e.amount; }, 0) / 4;
      if (prev4 > 0 && wk > prev4 * 1.3) flags.push({ severity: 'medium', title: 'Purchases this week ' + Math.round((wk / prev4 - 1) * 100) + '% above the 4-week average', detail: money(wk) + ' vs ' + money(prev4) + ' a week usually. Stocking up, or prices up?', area: 'purchases' });
      // fixed costs month on month
      var ym = to.slice(0, 7), pd = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1);
      var pym = pd.getFullYear() + '-' + (pd.getMonth() < 9 ? '0' : '') + (pd.getMonth() + 1);
      var a = monthlyFixed(ym), b = monthlyFixed(pym);
      a.detail.forEach(function (d) {
        var o = b.detail.filter(function (x) { return x.name === d.name; })[0];
        if (o && d.source === 'entered' && o.monthly > 0 && d.monthly > o.monthly * 1.1) flags.push({ severity: 'medium', title: d.name + ' up ' + Math.round((d.monthly / o.monthly - 1) * 100) + '% this month', detail: money(d.monthly) + ' vs ' + money(o.monthly) + ' last month.', area: 'fixed' });
      });
      // loss days
      var pl = api.profitLoss({ from: from, to: to, departmentId: q.departmentId });
      var loss = pl.perDay.filter(function (d) { return d.sales > 0 && d.net < 0; });
      if (loss.length) flags.push({ severity: loss.length > 3 ? 'medium' : 'info', title: loss.length + ' day(s) with a net loss', detail: loss.slice(0, 6).map(function (d) { return d.date + ' (' + money(d.net) + ')'; }).join(', ') + (loss.length > 6 ? '…' : '') + '.', area: 'pl' });
      var order = { high: 0, medium: 1, info: 2 };
      flags.sort(function (x, y) { return order[x.severity] - order[y.severity]; });
      return { from: from, to: to, flags: flags, insights: ins, pl: pl };
    };

    // ---------------- customer offers ----------------
    api.saveOffer = function (input) {
      input = input || {};
      return ctx.tx(function () {
        if (!str(input.title)) fail('Give the offer a name, e.g. "Diwali 10% off"');
        if (!(num(input.pct) > 0) && !(num(input.amount) > 0)) fail('Enter a discount % or an amount');
        var o = input.id ? ctx.find('offers', input.id) : null;
        if (!o) { o = { id: ctx.newId(input.id), createdAt: ctx.stamp() }; db().offers.push(o); }
        o.title = str(input.title); o.pct = r2(Math.min(100, Math.max(0, num(input.pct)))); o.amount = r2(Math.max(0, num(input.amount)));
        o.validTill = isDate(input.validTill) ? input.validTill : ''; o.reason = str(input.reason);
        o.customerIds = (Array.isArray(input.customerIds) ? input.customerIds : []).filter(function (id) { return ctx.find('customers', id); });
        o.allCustomers = !o.customerIds.length;
        o.updatedAt = ctx.stamp();
        ctx.touch('offers', o);
        return ctx.clone(o);
      });
    };
    api.removeOffer = function (id) { return ctx.tx(function () { ctx.mustFind('offers', id, 'Offer'); db().offers = db().offers.filter(function (x) { return x.id !== id; }); ctx.drop('offers', id); return { deleted: true }; }); };
    api.offersFor = function (customerId) {
      var t = ctx.today();
      return ctx.clone(db().offers.filter(function (o) { return (!o.validTill || o.validTill >= t) && (o.allCustomers || o.customerIds.indexOf(customerId) >= 0); }));
    };

    // ---------------- example data (30 days, a few planted problems) ----------------
    api.loadReviewSamplesInner = function () {
      var set = s(), key = set.industry;
      if (!db().departments.length) R.install && 0;
      var deps = db().departments.filter(function (d) { return d.active !== false; });
      var cats = api.storeCategories();
      var meta = db().meta; meta.sampleLoads = (meta.sampleLoads || 0) + 1;
      var sn = 0, sid = function () { return 'smp' + meta.sampleLoads + '-' + (++sn); };
      var seed = 0; ('acc' + key).split('').forEach(function (c) { seed = (seed * 31 + c.charCodeAt(0)) >>> 0; });
      var rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      var end = ctx.today(), days = R.daysIn(R.addDays(end, -29), end);
      function add(o) { var e = ctx.normEntry(Object.assign({ source: 'sample', id: sid() }, o)); db().entries.push(e); ctx.touch('entries', e); return e; }
      // staff
      var staffRows = [['Ravi', 'Manager', 22000], ['Lakshmi', 'Cashier', 15000], ['Suresh', 'Helper', 12000], ['Anil', 'Delivery', 11000]].map(function (x) {
        var st = { id: sid(), name: x[0], role: x[1], phone: '', salary: x[2], active: true, files: [], createdAt: ctx.stamp() }; db().staff.push(st); ctx.touch('staff', st); return st;
      });
      set.fixedCosts = [{ name: 'Rent', amount: 45000 }, { name: 'Electricity', amount: 9000 }, { name: 'Internet & phone', amount: 1200 }];
      // last month's fixed bills as entered (electricity a bit lower) and this month's
      var thisM = end.slice(0, 7), lm = new Date(+thisM.slice(0, 4), +thisM.slice(5, 7) - 2, 1);
      var lastM = lm.getFullYear() + '-' + (lm.getMonth() < 9 ? '0' : '') + (lm.getMonth() + 1);
      [[lastM, 45000, 8100], [thisM, 45000, 9900]].forEach(function (m) {
        add({ type: 'expense', kind: 'fixed', category: 'Rent', month: m[0], date: m[0] + '-05', amount: m[1], method: 'Bank transfer', vendor: 'Landlord' });
        add({ type: 'expense', kind: 'fixed', category: 'Electricity', month: m[0], date: m[0] + '-10', amount: m[2], method: 'UPI', vendor: 'Electricity board' });
        staffRows.forEach(function (st) { add({ type: 'expense', kind: 'fixed', category: 'Salaries', month: m[0], date: m[0] + '-01', amount: st.salary, staffId: st.id, staffName: st.name, method: 'Bank transfer', source: 'salary' }); });
      });
      var cashBal = 5000, vendors = ['Sri Lakshmi Traders', 'City Wholesale', 'Fresh Farms'];
      days.forEach(function (d, di) {
        var weekend = [0, 6].indexOf(new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)).getDay()) >= 0;
        var cashIn = 0, cashOut = 0;
        deps.forEach(function (dep, k) {
          ['first', 'second'].forEach(function (h) {
            var sale = Math.round((8000 + rnd() * 6000) * (weekend ? 1.3 : 1) / (k + 1) * (h === 'first' ? 0.4 : 0.6) * (d === days[16] && k === 0 ? 0.45 : 1));
            add({ type: 'sale', date: d, half: h, departmentId: dep.id, amount: sale });
            add({ type: 'walkin', date: d, half: h, departmentId: dep.id, amount: Math.max(1, Math.round(sale / (320 + rnd() * 100))) });
            var col = d === days[9] && k === 0 && h === 'second' ? Math.round(sale * 0.85) : sale;
            var cash = Math.round(col * 0.45); cashIn += cash;
            add({ type: 'collection', date: d, half: h, departmentId: dep.id, amount: cash, method: 'Cash' });
            add({ type: 'collection', date: d, half: h, departmentId: dep.id, amount: col - cash, method: 'UPI' });
          });
        });
        // purchase bills by store category (the last week buys heavier)
        var bills = 1 + Math.floor(rnd() * 3);
        for (var b = 0; b < bills; b++) {
          var amt = Math.round((1900 + rnd() * 3000) * (di >= 23 ? 1.5 : 1));
          var paid = b === 0 ? 'Cash' : 'Credit';
          if (paid === 'Cash') cashOut += amt;
          add({ type: 'purchase', date: d, time: '09:30', storeCategory: cats[Math.floor(rnd() * cats.length)], vendor: vendors[(di + b) % 3], billNo: 'B' + (1000 + di * 3 + b), amount: amt, method: paid });
        }
        var v = Math.round(400 + rnd() * 700); cashOut += v;
        add({ type: 'expense', kind: 'variable', category: KIND_EXAMPLES.variable[di % 5], date: d, time: '12:00', amount: v, method: 'Cash' });
        if (di % 8 === 3) { var m = Math.round(1500 + rnd() * 2500); cashOut += m; add({ type: 'expense', kind: 'maintenance', category: KIND_EXAMPLES.maintenance[di % 5], date: d, time: '15:00', amount: m, method: 'Cash', vendor: 'Service vendor' }); }
        if (di === 12 || di === 26) { var x = di === 12 ? 6500 : 1800; cashOut += x; add({ type: 'expense', kind: 'sudden', category: di === 12 ? 'Emergency repair' : 'Breakage', note: di === 12 ? 'Fridge compressor failed' : 'Glasses broken', date: d, time: '17:00', amount: x, method: 'Cash' }); }
        var dep0 = deps[0];
        if (dep0) {
          var deposit = 0;
          if (di % 3 === 2 && cashBal + cashIn - cashOut > 8000) { deposit = Math.round((cashBal + cashIn - cashOut - 5000) / 100) * 100; add({ type: 'deposit', date: d, time: '18:00', departmentId: dep0.id, amount: deposit, note: 'Deposited in bank' }); }
          cashBal = Math.max(0, Math.round(cashBal + cashIn - cashOut - deposit - (d === days[20] ? 1500 : 0)));
          add({ type: 'cash', date: d, time: '23:00', departmentId: dep0.id, amount: cashBal, note: 'Counted at close' });
        }
      });
      // customers with vault records, a standing discount and an offer
      var vcfg = ctx.preset().review.vault, withDue = vcfg.records.filter(function (r) { return r.dueLabel; });
      var custs = [['Asha Reddy', '9876500011', 2, 5], ['Rahul Verma', '9876500022', -3, 0], ['Fatima Khan', '9876500033', 12, 10], ['Suresh Kumar', '9876500044', 25, 0]].map(function (x, i) {
        var c = { id: sid(), name: x[0], phone: x[1], balance: 0, points: 0, discountPct: x[3], createdAt: ctx.stamp(), updatedAt: ctx.stamp(), notes: 'Example customer', files: [] };
        db().customers.push(c); ctx.touch('customers', c);
        var kind = (withDue[i % Math.max(1, withDue.length)] || vcfg.records[0]).key;
        var r = { id: sid(), customerId: c.id, customerName: c.name, kind: kind, title: 'Example ' + (vcfg.records.filter(function (k) { return k.key === kind; })[0] || {}).label,
          details: 'Added as example data', date: R.addDays(end, -20 + i), dueDate: R.addDays(end, x[2]), amount: 0, done: false, files: [], createdAt: ctx.stamp(), updatedAt: ctx.stamp() };
        db().vaultRecords.push(r); ctx.touch('vaultRecords', r);
        return c;
      });
      var o = { id: sid(), title: 'Festival offer 10% off', pct: 10, amount: 0, validTill: R.addDays(end, 10), reason: 'Festival', customerIds: [], allCustomers: true, createdAt: ctx.stamp() };
      db().offers.push(o); ctx.touch('offers', o);
      return true;
    };
  }

  return { install: install, SALES_DEPTS: SALES_DEPTS, STORE_CATS: STORE_CATS, KINDS: KINDS, KIND_EXAMPLES: KIND_EXAMPLES, daysInMonth: daysInMonth };
});
