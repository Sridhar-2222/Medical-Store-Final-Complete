/*
 * BizCore Review: the owner / reviewer side.
 *
 * Departments report numbers; the reviewer checks them. Every number is an
 * "entry" of one type:
 *   sale        billed / sold
 *   collection  money actually received (cash, UPI, card…)
 *   expense     running costs, marked fixed or variable
 *   purchase    stock / material bought (optionally with item lines)
 *   received    goods actually delivered against purchases
 *   wastage     spoiled, expired, damaged
 *   misc        anything else
 *
 * Insights can be run on any slice: a date range, a few random days, chosen
 * days, the first or second half of the day, some departments — and are
 * compared with the whole period so unusual days stand out.
 *
 * UMD module. Engine-side install() adds API methods; computeInsights() is pure.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BizReview = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = ['sale', 'collection', 'walkin', 'cash', 'deposit', 'expense', 'purchase', 'received', 'wastage', 'misc', 'supply', 'stock'];
  var TYPE_LABELS = { sale: 'Sales', collection: 'Collections', expense: 'Expenses', purchase: 'Purchases', received: 'Goods received', wastage: 'Wastage', misc: 'Miscellaneous',
    supply: 'Supplied / issued', stock: 'Stock count', walkin: 'Walk-ins (customers)', cash: 'Cash in hand (counted)', deposit: 'Cash deposited / taken out' };
  // Spending = everything paid out to run the business: purchases + expenses + miscellaneous.
  var SPENDING = ['purchase', 'expense', 'misc'];
  var ITEM_ONLY = ['supply', 'stock'];   // inventory movements: item quantities, money optional
  var METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Credit', 'Other'];

  function r2(n) { n = Number(n) || 0; return Math.round((n + Number.EPSILON) * 100) / 100; }
  function num(v) { if (typeof v === 'string') v = v.replace(/,/g, ''); var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function str(v) { return v === undefined || v === null ? '' : String(v).trim(); }
  function pct(a, b) { return b ? r2(a / b * 100) : null; }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(s, n) { var d = toDate(s); d.setDate(d.getDate() + n); return fmt(d); }
  function daysIn(from, to) { var out = []; for (var d = from; d <= to && out.length < 3700; d = addDays(d, 1)) out.push(d); return out; }
  function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
  function sd(a) { var m = mean(a); return Math.sqrt(mean(a.map(function (x) { return (x - m) * (x - m); }))); }
  function itemKey(name) { return str(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function unitKey(u) {
    u = str(u).toLowerCase().replace(/\./g, '');
    var map = { kgs: 'kg', kilo: 'kg', kilogram: 'kg', gm: 'g', gms: 'g', gram: 'g', grams: 'g', ltr: 'l', ltrs: 'l', litre: 'l', liter: 'l', litres: 'l', pc: 'pcs', piece: 'pcs', pieces: 'pcs', no: 'pcs', nos: 'pcs', each: 'pcs' };
    return map[u] || u;
  }
  function halfOf(time, split) {
    if (!/^\d{1,2}:\d{2}$/.test(time || '')) return '';
    var t = time.length === 4 ? '0' + time : time;
    return t < (split || '15:00') ? 'first' : 'second';
  }

  // Seeded random so a "random 3 days" check can be repeated exactly.
  function seededRandom(seed) {
    var s = 0; String(seed).split('').forEach(function (c) { s = (s * 31 + c.charCodeAt(0)) >>> 0; });
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function sampleDays(from, to, count, seed, onlyDays) {
    var pool = (onlyDays && onlyDays.length ? onlyDays : daysIn(from, to)).slice();
    var rnd = seededRandom(seed || Date.now());
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    return pool.slice(0, Math.max(1, Math.min(count || 3, pool.length))).sort();
  }

  // ------------------------------------------------------------------ insights
  function emptyTotals() { var t = { fixed: 0, variable: 0, used: 0, spending: 0, cashIn: 0, cashOut: 0, byMethod: {} }; TYPES.forEach(function (k) { t[k] = 0; }); return t; }
  function addTo(t, e) {
    if (e.type === 'cash') { t.cash = e.amount; return; }        // counted balance, not a flow
    t[e.type] = r2(t[e.type] + e.amount);
    if (SPENDING.indexOf(e.type) >= 0) { t.spending = r2(t.spending + e.amount); if ((e.method || '') === 'Cash') t.cashOut = r2(t.cashOut + e.amount); }
    if (e.type === 'collection' && (e.method || 'Cash') === 'Cash') t.cashIn = r2(t.cashIn + e.amount);
    if (e.type === 'deposit') t.cashOut = r2(t.cashOut + e.amount);
    if (e.type === 'supply') t.used = r2(t.used + (e.usedValue || 0));
    if (e.type === 'collection') t.byMethod[e.method || 'Cash'] = r2((t.byMethod[e.method || 'Cash'] || 0) + e.amount);
    if (e.type === 'expense' || e.type === 'misc') t[e.costType === 'fixed' ? 'fixed' : 'variable'] = r2(t[e.costType === 'fixed' ? 'fixed' : 'variable'] + e.amount);
  }
  function ratios(t) {
    var costs = t.expense + t.misc + t.purchase;
    return {
      collection: pct(t.collection, t.sale), expense: pct(t.expense + t.misc, t.sale), purchase: pct(t.purchase, t.sale),
      wastage: pct(t.wastage, t.purchase), received: pct(t.received, t.purchase), fixedShare: pct(t.fixed, t.fixed + t.variable),
      cost: pct(costs, t.sale), profit: r2(t.sale - costs), margin: pct(t.sale - costs, t.sale),
      avgSpend: t.walkin ? r2(t.sale / t.walkin) : null, used: pct(t.used, t.sale), spending: pct(t.spending, t.sale)
    };
  }

  /*
   * q: { from, to, days:[...], half:'first'|'second'|'', departmentIds:[...] }
   * settings: { halfDaySplit, priceAlertPct, wastageAlertPct, collectionGapPct, currency }
   */
  function selMatch(sel, e) {
    return (!sel.t || sel.t.indexOf(e.type) >= 0) && (!sel.c || sel.c.test(e.category || '')) && (!sel.d || sel.d.test(e.departmentName || ''));
  }
  function computeKpis(entries, kpis) {
    return (kpis || []).map(function (k) {
      var n = 0, d = 0;
      entries.forEach(function (e) { if (selMatch(k.num, e)) n += e.amount; if (selMatch(k.den, e)) d += e.amount; });
      var v = d ? r2(n / d * 100) : null;
      var status = v === null || !n ? 'nodata' : v < k.lo ? 'low' : v > k.hi ? 'high' : 'good';
      return { label: k.label, value: v, lo: k.lo, hi: k.hi, why: k.why, status: status, num: r2(n), den: r2(d) };
    });
  }

  function computeInsights(allEntries, departments, settings, q, today, kpiDefs) {
    q = q || {};
    settings = settings || {};
    var cur = settings.currency || '';
    function money(n) { return cur + (Math.round(n) || 0).toLocaleString('en-IN'); }
    var to = isDate(q.to) ? q.to : today;
    var from = isDate(q.from) ? q.from : addDays(to, -29);
    var deptName = {}, deptKind = {};
    departments.forEach(function (d) { deptName[d.id] = d.name; deptKind[d.id] = d.kind || 'both'; });
    var depts = q.departmentIds && q.departmentIds.length ? q.departmentIds : null;
    var explicitDays = (q.days || []).filter(isDate);
    var dayList = explicitDays.length ? explicitDays.slice().sort() : daysIn(from, to);
    var daySet = {}; dayList.forEach(function (d) { daySet[d] = true; });
    var half = q.half === 'first' || q.half === 'second' ? q.half : '';
    var sample = explicitDays.length > 0 || !!half;
    var periodFrom = explicitDays.length ? dayList[0] < from ? dayList[0] : from : from;
    var periodTo = explicitDays.length ? dayList[dayList.length - 1] > to ? dayList[dayList.length - 1] : to : to;

    var inDept = function (e) { return !depts || depts.indexOf(e.departmentId) >= 0; };
    var periodEntries = allEntries.filter(function (e) { return e.date >= periodFrom && e.date <= periodTo && inDept(e); });
    var excludedFullDay = 0;
    var entries = periodEntries.filter(function (e) {
      if (!daySet[e.date]) return false;
      if (!half) return true;
      if (!e.half) { excludedFullDay++; return false; }
      return e.half === half;
    });

    // Value of stock used (issued) = quantity × the latest purchase rate known on that day
    var rateLog = {};
    allEntries.filter(function (e) { return e.type === 'purchase' && e.items; }).sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (e) {
      e.items.forEach(function (it) { var r = num(it.rate) || (num(it.qty) ? num(it.amount) / num(it.qty) : 0); if (r) (rateLog[itemKey(it.name)] = rateLog[itemKey(it.name)] || []).push([e.date, r]); });
    });
    function rateOn(name, date) { var l = rateLog[itemKey(name)] || [], r = 0; for (var i = 0; i < l.length && l[i][0] <= date; i++) r = l[i][1]; return r || (l[0] ? l[0][1] : 0); }
    entries.forEach(function (e) {
      if (e.type === 'supply' && e.items && !e.usedValue) e.usedValue = e.amount || r2(e.items.reduce(function (a, it) { return a + num(it.qty) * (num(it.rate) || rateOn(it.name, e.date)); }, 0));
    });

    var totals = emptyTotals();
    entries.forEach(function (e) { addTo(totals, e); });
    var rat = ratios(totals);
    var activeDays = Object.keys(entries.reduce(function (m, e) { m[e.date] = 1; return m; }, {})).length;
    var perDay = {}; TYPES.forEach(function (k) { perDay[k] = activeDays ? r2(totals[k] / activeDays) : 0; });

    // Baseline: the whole period (all days, full day) with the same departments.
    var baseline = null;
    if (sample) {
      // Compare like with like: same half of the day (if one was chosen) across every day of the period.
      var basis = half ? periodEntries.filter(function (e) { return e.half === half; }) : periodEntries;
      var bt = emptyTotals();
      basis.forEach(function (e) { addTo(bt, e); });
      var bDays = Object.keys(basis.reduce(function (m, e) { m[e.date] = 1; return m; }, {})).length;
      var bPerDay = {}; TYPES.forEach(function (k) { bPerDay[k] = bDays ? r2(bt[k] / bDays) : 0; });
      baseline = { totals: bt, ratios: ratios(bt), perDay: bPerDay, days: bDays, from: periodFrom, to: periodTo, half: half };
    }

    // By department
    var dmap = {};
    entries.forEach(function (e) {
      var k = e.departmentId || '_';
      if (!dmap[k]) dmap[k] = { id: e.departmentId, name: deptName[e.departmentId] || e.departmentName || 'General', totals: emptyTotals() };
      addTo(dmap[k].totals, e);
    });
    var byDepartment = Object.keys(dmap).map(function (k) { var d = dmap[k]; d.ratios = ratios(d.totals); return d; })
      .sort(function (a, b) { return b.totals.sale - a.totals.sale || b.totals.expense - a.totals.expense; });

    // By day
    var byDayMap = {};
    dayList.forEach(function (d) { byDayMap[d] = { date: d, totals: emptyTotals(), count: 0 }; });
    entries.forEach(function (e) { var d = byDayMap[e.date]; if (d) { addTo(d.totals, e); d.count++; } });
    var byDay = dayList.map(function (d) { return byDayMap[d]; });
    var prevSale = null, prevSpend = null, prevCash = null;
    // cash counted at the close of the day before the range starts (opening cash)
    allEntries.filter(function (e) { return e.type === 'cash' && e.date < dayList[0] && inDept(e); }).sort(function (a, b) { return a.date.localeCompare(b.date); })
      .forEach(function (e) { prevCash = { date: e.date, amount: e.amount }; });
    byDay.forEach(function (d) {
      var t = d.totals;
      d.spendChange = prevSpend && t.spending ? r2((t.spending - prevSpend) / prevSpend * 100) : null;
      if (t.spending) prevSpend = t.spending;
      var counted = entries.filter(function (e) { return e.type === 'cash' && e.date === d.date; });
      if (counted.length) {
        var c = counted.reduce(function (a, e) { return a + e.amount; }, 0);
        if (prevCash !== null && addDays(prevCash.date, 1) === d.date) {
          d.cashExpected = r2(prevCash.amount + t.cashIn - t.cashOut);
          d.cashCounted = r2(c);
          d.cashDiff = r2(c - d.cashExpected);
        } else d.cashCounted = r2(c);
        prevCash = { date: d.date, amount: c };
      }
      d.profit = r2(t.sale - t.purchase - t.expense - t.misc);
      d.avgSpend = t.walkin ? r2(t.sale / t.walkin) : null;
      d.usedPct = t.sale ? pct(t.used, t.sale) : null;
      d.change = prevSale && t.sale ? r2((t.sale - prevSale) / prevSale * 100) : null;
      if (t.sale) prevSale = t.sale;
    });
    // morning vs evening (first vs second half)
    var halves = { first: emptyTotals(), second: emptyTotals(), unsplit: emptyTotals() };
    entries.forEach(function (e) { addTo(halves[e.half || 'unsplit'], e); });

    // Cost categories (fixed vs variable)
    var cmap = {};
    entries.forEach(function (e) {
      if (['expense', 'misc', 'purchase', 'wastage'].indexOf(e.type) < 0) return;
      var k = e.type + '|' + (e.category || 'Other');
      if (!cmap[k]) cmap[k] = { type: e.type, name: e.category || 'Other', costType: e.type === 'purchase' || e.type === 'wastage' ? '' : (e.costType || 'variable'), amount: 0, count: 0 };
      cmap[k].amount = r2(cmap[k].amount + e.amount); cmap[k].count++;
    });
    var byCategory = Object.keys(cmap).map(function (k) { return cmap[k]; }).sort(function (a, b) { return b.amount - a.amount; });

    // Price alerts: an item bought above its usual price (median of earlier purchases, last 120 days).
    var alertPct = settings.priceAlertPct === undefined ? 10 : Number(settings.priceAlertPct);
    var lines = [];
    allEntries.forEach(function (e) {
      if (e.type !== 'purchase' || !e.items) return;
      e.items.forEach(function (it, i) {
        var rate = num(it.rate) || (num(it.qty) ? num(it.amount) / num(it.qty) : 0);
        if (!rate || !itemKey(it.name)) return;
        lines.push({ key: itemKey(it.name), unit: unitKey(it.unit), rate: r2(rate), date: e.date, at: e.createdAt || '', vendor: e.vendor || '', entryId: e.id, idx: i, name: it.name, departmentId: e.departmentId, inScope: daySet[e.date] && inDept(e) && (!half || e.half === half) });
      });
    });
    lines.sort(function (a, b) { return (a.date + a.at).localeCompare(b.date + b.at); });
    var priceAlerts = [], cheaperElsewhere = [];
    lines.forEach(function (l, i) {
      if (!l.inScope) return;
      var lookback = addDays(l.date, -120);
      var prev = lines.slice(0, i).filter(function (p) { return p.key === l.key && (p.unit === l.unit || !p.unit || !l.unit) && p.date >= lookback; });
      if (!prev.length) return;
      var usual = median(prev.map(function (p) { return p.rate; }));
      if (usual && l.rate > usual * (1 + alertPct / 100)) {
        priceAlerts.push({ date: l.date, item: l.name, vendor: l.vendor, rate: l.rate, usual: r2(usual), up: r2((l.rate / usual - 1) * 100), entryId: l.entryId, departmentId: l.departmentId, unit: l.unit, seen: prev.length });
      }
      var others = prev.filter(function (p) { return p.vendor && l.vendor && p.vendor.toLowerCase() !== l.vendor.toLowerCase() && p.date >= addDays(l.date, -60); });
      if (others.length) {
        var best = others.reduce(function (a, b) { return b.rate < a.rate ? b : a; });
        if (best.rate < l.rate * (1 - alertPct / 100)) cheaperElsewhere.push({ date: l.date, item: l.name, vendor: l.vendor, rate: l.rate, otherVendor: best.vendor, otherRate: best.rate, otherDate: best.date });
      }
    });

    // Purchase vs goods received
    var shortfalls = [];
    entries.forEach(function (e) {
      if (e.type !== 'purchase' || !e.items) return;
      e.items.forEach(function (it) {
        if (it.received === undefined || it.received === '' || it.received === null) return;
        var q2 = num(it.qty), rc = num(it.received);
        if (rc < q2) {
          var rate = num(it.rate) || (q2 ? num(it.amount) / q2 : 0);
          shortfalls.push({ date: e.date, item: it.name, vendor: e.vendor || '', billed: q2, received: rc, unit: it.unit || '', value: r2((q2 - rc) * rate), entryId: e.id, departmentId: e.departmentId, kind: 'item' });
        }
      });
    });
    var pr = {};
    entries.forEach(function (e) {
      if (e.type !== 'purchase' && e.type !== 'received') return;
      var k = e.date + '|' + (e.departmentId || '');
      pr[k] = pr[k] || { date: e.date, departmentId: e.departmentId, purchase: 0, received: 0, hasReceived: false };
      pr[k][e.type] = r2(pr[k][e.type] + e.amount);
      if (e.type === 'received') pr[k].hasReceived = true;
    });
    Object.keys(pr).forEach(function (k) {
      var x = pr[k];
      if (x.hasReceived && x.received < x.purchase * 0.98) shortfalls.push({ date: x.date, item: 'All purchases', vendor: '', billed: x.purchase, received: x.received, unit: cur, value: r2(x.purchase - x.received), departmentId: x.departmentId, kind: 'day' });
    });

    // ---- flags ----
    var flags = [];
    function flag(sev, title, detail, extra) { flags.push(Object.assign({ severity: sev, title: title, detail: detail || '' }, extra || {})); }
    var gapPct = settings.collectionGapPct === undefined ? 3 : Number(settings.collectionGapPct);
    var wastePct = settings.wastageAlertPct === undefined ? 5 : Number(settings.wastageAlertPct);

    // 1. collections vs sales, by day and department
    var dd = {};
    entries.forEach(function (e) {
      if (e.type !== 'sale' && e.type !== 'collection') return;
      var k = e.date + '|' + (e.departmentId || '');
      dd[k] = dd[k] || { date: e.date, departmentId: e.departmentId, sale: 0, collection: 0, hasCollection: false };
      dd[k][e.type] = r2(dd[k][e.type] + e.amount);
      if (e.type === 'collection') dd[k].hasCollection = true;
    });
    var noCollection = [];
    Object.keys(dd).sort().forEach(function (k) {
      var x = dd[k], name = deptName[x.departmentId] || 'General';
      if (x.sale <= 0) return;
      if (!x.hasCollection) { noCollection.push(x.date + ' ' + name); return; }
      var gap = x.sale - x.collection;
      if (gap > x.sale * gapPct / 100) {
        flag(gap > x.sale * 0.1 ? 'high' : 'medium', 'Collection short by ' + money(gap) + ' (' + Math.round(gap / x.sale * 100) + '%)',
          name + ' on ' + x.date + ': sales ' + money(x.sale) + ', collected ' + money(x.collection) + '.', { date: x.date, departmentId: x.departmentId, area: 'collections' });
      }
    });
    if (noCollection.length) flag('medium', 'Sales without collections recorded', noCollection.slice(0, 6).join(', ') + (noCollection.length > 6 ? ' and ' + (noCollection.length - 6) + ' more' : '') + '. Was the money received?', { area: 'collections' });

    // 2. wastage
    if (totals.purchase > 0 && totals.wastage > totals.purchase * wastePct / 100) {
      flag(totals.wastage > totals.purchase * wastePct * 2 / 100 ? 'high' : 'medium', 'Wastage is ' + rat.wastage + '% of purchases',
        money(totals.wastage) + ' wasted against ' + money(totals.purchase) + ' bought (alert above ' + wastePct + '%).', { area: 'wastage' });
    }
    byDepartment.forEach(function (d) {
      if (d.totals.purchase > 0 && d.totals.wastage > d.totals.purchase * wastePct * 1.5 / 100 && byDepartment.length > 1) {
        flag('medium', d.name + ': wastage ' + d.ratios.wastage + '% of its purchases', money(d.totals.wastage) + ' wasted.', { departmentId: d.id, area: 'wastage' });
      }
    });

    // 3. compared with the whole period
    if (baseline && baseline.days > activeDays) {
      [['expense', 'Expenses'], ['purchase', 'Purchases']].forEach(function (p) {
        var a = rat[p[0]], b = baseline.ratios[p[0]];
        if (a !== null && b !== null && a > b * 1.2 && a - b >= 3) {
          flag('medium', p[1] + ' are ' + a + '% of sales on the checked days', 'The whole period averages ' + b + '%.', { area: p[0] });
        }
      });
      var sp = perDay.sale, bp = baseline.perDay.sale;
      if (bp && sp < bp * 0.8) flag('medium', 'Sales per day are ' + Math.round((1 - sp / bp) * 100) + '% below the period average', money(sp) + ' a day vs ' + money(bp) + '.', { area: 'sales' });
      var cr = rat.collection, bcr = baseline.ratios.collection;
      if (cr !== null && bcr !== null && cr < bcr - 3) flag('medium', 'Collected ' + cr + '% of sales on the checked days', 'The whole period collected ' + bcr + '%.', { area: 'collections' });
    }

    // 4. prices and deliveries
    priceAlerts.forEach(function (a) {
      flag(a.up >= 25 ? 'high' : 'medium', a.item + ' bought ' + a.up + '% above usual price', (a.vendor ? a.vendor + ', ' : '') + a.date + ': ' + cur + a.rate + (a.unit ? '/' + a.unit : '') + ' vs usual ' + cur + a.usual + '.', { date: a.date, area: 'prices', entryId: a.entryId });
    });
    cheaperElsewhere.slice(0, 10).forEach(function (c) {
      flag('info', c.item + ' was cheaper from ' + c.otherVendor, c.vendor + ' charged ' + cur + c.rate + ' on ' + c.date + '; ' + c.otherVendor + ' charged ' + cur + c.otherRate + ' on ' + c.otherDate + '.', { area: 'prices' });
    });
    shortfalls.forEach(function (s) {
      flag('high', s.kind === 'item' ? s.item + ': billed ' + s.billed + ' ' + s.unit + ', received ' + s.received : 'Goods received ' + money(s.value) + ' less than purchased',
        (s.vendor ? s.vendor + ', ' : '') + s.date + (s.kind === 'item' ? ' (about ' + money(s.value) + ')' : ': purchased ' + money(s.billed) + ', received ' + money(s.received)) + '.', { date: s.date, area: 'deliveries', entryId: s.entryId });
    });

    // 5. unusual days
    var withData = byDay.filter(function (d) { return d.count > 0; });
    // Day-by-day wastage
    byDay.forEach(function (d) {
      if (d.totals.purchase > 0 && d.totals.wastage > d.totals.purchase * wastePct * 2 / 100 && d.totals.wastage > totals.purchase * 0.002) {
        flag('high', 'Wastage ' + Math.round(d.totals.wastage / d.totals.purchase * 100) + '% of purchases on ' + d.date, money(d.totals.wastage) + ' wasted that day against ' + money(d.totals.purchase) + ' bought.', { date: d.date, area: 'wastage' });
      }
    });
    if (withData.length >= 5) {
      // Day-to-day spending (fixed rent and salaries left out) compared with a typical day
      var dayCost = function (d) { return d.totals.spending - d.totals.fixed; };
      var medCost = median(withData.map(dayCost).filter(function (v) { return v > 0; }));
      withData.filter(function (d) { return medCost && dayCost(d) > medCost * Math.max(1.8, 1 + flPct * 3 / 100); })
        .sort(function (a, b) { return dayCost(b) - dayCost(a); }).slice(0, 3).forEach(function (d) {
          flag('medium', 'High spending on ' + d.date, money(dayCost(d)) + ' spent vs ' + money(medCost) + ' on a typical day. Ask what it was for.', { date: d.date, area: 'spending' });
        });
      var sales = withData.map(function (d) { return d.totals.sale; }).filter(function (v) { return v > 0; });
      var med = median(sales);
      withData.forEach(function (d) {
        if (med && d.totals.sale > 0 && d.totals.sale < med * (1 - Math.max(flPct, 40) / 100)) flag('medium', 'Sales dropped on ' + d.date, money(d.totals.sale) + ' vs ' + money(med) + ' on a typical day.', { date: d.date, area: 'sales' });
        if (med && d.totals.sale > med * 1.8) flag('info', 'Unusually high sales on ' + d.date, money(d.totals.sale) + ' vs ' + money(med) + ' typical. What worked?', { date: d.date, area: 'sales' });
      });
    }
    if (baseline && baseline.perDay.walkin && perDay.walkin < baseline.perDay.walkin * 0.8) flag('medium', 'Fewer walk-ins: ' + Math.round(perDay.walkin) + ' a day vs ' + Math.round(baseline.perDay.walkin) + ' usually', 'Check opening hours, staff, competition or local events on these days.', { area: 'walkins' });
    if (baseline && rat.avgSpend && baseline.ratios.avgSpend && rat.avgSpend < baseline.ratios.avgSpend * 0.85) flag('medium', 'Average spend per customer fell to ' + money(rat.avgSpend), 'Usually ' + money(baseline.ratios.avgSpend) + '. Fewer add-ons or more discounts?', { area: 'walkins' });
    var walkDays = byDay.filter(function (d) { return d.totals.walkin > 0 && d.totals.sale > 0; });
    if (walkDays.length >= 5) {
      var medSpend = median(walkDays.map(function (d) { return d.avgSpend; }));
      walkDays.forEach(function (d) {
        if (d.avgSpend < medSpend * 0.6) flag('medium', 'Low sales per walk-in on ' + d.date, money(d.avgSpend) + ' per customer vs ' + money(medSpend) + ' usually. Were all sales recorded?', { date: d.date, area: 'walkins' });
      });
    }
    var flPct = settings.fluctuationPct === undefined ? 25 : Number(settings.fluctuationPct);
    byDay.forEach(function (d) {
      var t = d.totals;
      if (t.sale > 0 && t.spending - t.fixed > t.sale) flag('high', 'Spent more than sold on ' + d.date, 'Spending ' + money(t.spending - t.fixed) + ' (excluding fixed costs) vs sales ' + money(t.sale) + '.', { date: d.date, area: 'spending' });
      if (d.cashDiff !== undefined && Math.abs(d.cashDiff) >= Math.max(100, (t.cashIn || 0) * 0.01)) flag(d.cashDiff < 0 ? 'high' : 'medium', 'Cash ' + (d.cashDiff < 0 ? 'short' : 'over') + ' by ' + money(Math.abs(d.cashDiff)) + ' on ' + d.date,
        'Expected ' + money(d.cashExpected) + ' (opening + cash received − cash paid), counted ' + money(d.cashCounted) + '.', { date: d.date, area: 'cash' });
    });
    if (baseline && baseline.ratios.spending !== null && rat.spending !== null && rat.spending > baseline.ratios.spending * 1.15 && rat.spending - baseline.ratios.spending >= 4)
      flag('medium', 'Spending is ' + rat.spending + '% of sales on the checked days', 'Usually ' + baseline.ratios.spending + '%.', { area: 'spending' });
    var sharpDrops = [];
    if (sharpDrops.length) flag('info', 'Sales fell sharply from the day before on ' + sharpDrops.length + ' day(s)', sharpDrops.slice(0, 6).map(function (d) { return d.date + ' (' + d.change + '%)'; }).join(', ') + '.', { area: 'sales' });
    if (totals.used && totals.sale && byDay.filter(function (d) { return d.usedPct; }).length >= 5) {
      var usedDays = byDay.filter(function (d) { return d.usedPct; });
      var medUsed = median(usedDays.map(function (d) { return d.usedPct; }));
      usedDays.filter(function (d) { return d.usedPct > medUsed * 1.6 && d.usedPct - medUsed > 10; })
        .sort(function (a, b) { return b.usedPct - a.usedPct; }).slice(0, 3).forEach(function (d) {
          flag('medium', 'High stock use against sales on ' + d.date, 'Stock worth ' + d.usedPct + '% of sales was issued, against ' + Math.round(medUsed) + '% usually. Over-issue, waste or unrecorded sales?', { date: d.date, area: 'stock' });
      });
    }
    var empty = byDay.filter(function (d) { return d.count === 0; }).map(function (d) { return d.date; });
    if (empty.length && empty.length < byDay.length) flag('info', empty.length + ' day(s) with no data', empty.slice(0, 8).join(', ') + (empty.length > 8 ? '…' : '') + '. Missing reports or a closed day?', { area: 'data' });
    var costsAll = totals.expense + totals.misc + totals.purchase;
    if (costsAll > 0 && totals.misc > costsAll * 0.1) flag('medium', 'Miscellaneous is ' + Math.round(totals.misc / costsAll * 100) + '% of all costs', money(totals.misc) + ' not assigned to a proper category. Ask for details.', { area: 'misc' });
    if (half && excludedFullDay) flag('info', excludedFullDay + ' full-day entries left out', 'They were not recorded with a time or half, so they cannot be split into halves.', { area: 'data' });

    // Key numbers for this kind of business
    var kpis = computeKpis(entries, kpiDefs);
    kpis.forEach(function (k) {
      if (k.status === 'good' || k.status === 'nodata' || !k.den) return;
      flag('medium', k.label + ' is ' + k.value + '%', 'Healthy range ' + k.lo + '–' + k.hi + '%. ' + k.why, { area: 'kpi' });
    });

    // Stock checks (only once supplies or counts are being recorded)
    var inventory = null;
    if (allEntries.some(function (e) { return e.type === 'supply' || e.type === 'stock'; })) {
      inventory = computeInventory(allEntries.filter(inDept), { from: periodFrom, to: periodTo }, settings, today);
      inventory.flags.forEach(function (f) { flags.push(f); });
    }

    var order = { high: 0, medium: 1, info: 2 };
    flags.sort(function (a, b) { return order[a.severity] - order[b.severity]; });

    // ---- plain-language summary ----
    var summary = [];
    if (totals.sale || totals.spending) summary.push('Sales ' + money(totals.sale) + ' vs spending ' + money(totals.spending) + (rat.spending !== null ? ' (' + rat.spending + '% of sales)' : '') + '.');
    if (totals.sale || totals.collection) summary.push('Sales ' + money(totals.sale) + ', collected ' + money(totals.collection) + (rat.collection !== null ? ' (' + rat.collection + '% of sales)' : '') + '.');
    if (totals.sale && (totals.expense + totals.misc + totals.purchase) > 0) summary.push('Expenses ' + (rat.expense || 0) + '% and purchases ' + (rat.purchase || 0) + '% of sales; estimated profit ' + money(rat.profit) + (rat.margin !== null ? ' (' + rat.margin + '%)' : '') + '.');
    else if (totals.sale) summary.push('No expenses or purchases were recorded in this selection.');
    if (totals.walkin) summary.push('Walk-ins ' + totals.walkin + ' (' + Math.round(perDay.walkin) + ' a day), average spend ' + money(rat.avgSpend) + ' per customer.');
    if (totals.used && totals.sale) summary.push('Stock used ' + money(totals.used) + ' = ' + rat.used + '% of sales.');
    if (totals.fixed + totals.variable) summary.push('Fixed costs ' + money(totals.fixed) + ' (' + (rat.fixedShare || 0) + '%), variable ' + money(totals.variable) + '.');
    if (totals.purchase) summary.push('Wastage ' + money(totals.wastage) + ' (' + (rat.wastage || 0) + '% of purchases)' + (totals.received ? '; goods received ' + money(totals.received) + ' (' + rat.received + '% of purchases)' : '') + '.');
    if (baseline && baseline.perDay.sale) summary.push('Sales per ' + (half ? (half === 'first' ? 'first half' : 'second half') : 'day') + ' on the checked days: ' + money(perDay.sale) + ', against ' + money(baseline.perDay.sale) + ' on average across the whole period.');
    if (!entries.length) summary.push('No entries in this selection.');

    return {
      scope: { from: periodFrom, to: periodTo, days: dayList, sampled: explicitDays.length > 0, half: half, departments: depts ? depts.map(function (id) { return deptName[id] || id; }) : [], dayCount: dayList.length, activeDays: activeDays, entryCount: entries.length, excludedFullDay: excludedFullDay },
      totals: totals, ratios: rat, perDay: perDay, baseline: baseline,
      byDepartment: byDepartment, byDay: byDay, byCategory: byCategory, halves: halves,
      priceAlerts: priceAlerts, cheaperElsewhere: cheaperElsewhere, shortfalls: shortfalls,
      wastageList: entries.filter(function (e) { return e.type === 'wastage'; }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 50),
      miscList: entries.filter(function (e) { return e.type === 'misc'; }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 50),
      flags: flags, summary: summary, inventory: inventory ? inventory.totals : null, kpis: kpis
    };
  }

  // ------------------------------------------------------------------ inventory
  /*
   * Purchased vs supplied vs stock in hand, item by item.
   *   in      purchase lines (the quantity actually received, when entered)
   *   out     supply / issue lines and wastage lines
   *   count   stock count lines: the physical stock in hand on that date
   * Book stock = opening + in − out. A count is compared with the book stock at
   * that moment; the difference is shortage (minus) or excess (plus).
   */
  function computeInventory(allEntries, q, settings, today) {
    q = q || {};
    var to = isDate(q.to) ? q.to : today;
    var from = isDate(q.from) ? q.from : addDays(to, -29);
    var cur = (settings && settings.currency) || '';
    var map = {};
    var evs = [];
    allEntries.forEach(function (e) {
      if (['purchase', 'supply', 'wastage', 'stock'].indexOf(e.type) < 0 || !e.items || !e.items.length || e.date > to) return;
      e.items.forEach(function (it) {
        var key = itemKey(it.name); if (!key) return;
        var k = key + '|' + unitKey(it.unit);
        var qty = e.type === 'purchase' && it.received !== undefined && it.received !== null ? num(it.received) : num(it.qty);
        evs.push({ k: k, name: it.name, unit: unitKey(it.unit) || it.unit || '', date: e.date, at: e.createdAt || '', type: e.type, qty: qty,
          rate: e.type === 'purchase' ? (num(it.rate) || (num(it.qty) ? num(it.amount) / num(it.qty) : 0)) : 0, dep: e.departmentName || '', vendor: e.vendor || '', entryId: e.id });
      });
    });
    // within one day: purchases first, then issues and wastage, counts last
    var order = { purchase: 0, supply: 1, wastage: 1, stock: 2 };
    evs.sort(function (a, b) { return a.date.localeCompare(b.date) || order[a.type] - order[b.type] || a.at.localeCompare(b.at); });
    evs.forEach(function (ev) {
      var m = map[ev.k] || (map[ev.k] = { key: ev.k, name: ev.name, unit: ev.unit, balance: 0, opening: 0, purchased: 0, supplied: 0, wasted: 0, rate: 0,
        counted: null, countDate: '', variance: 0, varianceValue: 0, counts: 0, suppliedTo: {}, known: false, moves: [] });
      if (ev.rate) m.rate = r2(ev.rate);
      var inPeriod = ev.date >= from;
      if (ev.type === 'stock') {
        var diff = r2(ev.qty - m.balance);
        if (inPeriod) {
          if (m.known) { m.variance = r2(m.variance + diff); }
          m.counted = ev.qty; m.countDate = ev.date; m.counts++;
        }
        m.balance = r2(ev.qty); m.known = true;
      } else {
        var sign = ev.type === 'purchase' ? 1 : -1;
        if (ev.type === 'purchase') m.known = true;   // bought through the app: from now on counts are checked
        m.balance = r2(m.balance + sign * ev.qty);
        if (inPeriod) {
          if (ev.type === 'purchase') m.purchased = r2(m.purchased + ev.qty);
          if (ev.type === 'supply') { m.supplied = r2(m.supplied + ev.qty); var d = ev.dep || 'Unassigned'; m.suppliedTo[d] = r2((m.suppliedTo[d] || 0) + ev.qty); }
          if (ev.type === 'wastage') m.wasted = r2(m.wasted + ev.qty);
        }
      }
      if (!inPeriod) m.opening = m.balance;
      if (inPeriod) m.moves.push({ date: ev.date, type: ev.type, qty: ev.qty, balance: m.balance, dep: ev.dep, vendor: ev.vendor });
      m.name = ev.name;
    });
    var items = Object.keys(map).map(function (k) {
      var m = map[k];
      m.book = r2(m.opening + m.purchased - m.supplied - m.wasted);
      m.inHand = m.balance;
      m.varianceValue = r2(m.variance * m.rate);
      delete m.known;
      return m;
    }).filter(function (m) { return m.purchased || m.supplied || m.wasted || m.counts || m.opening; })
      .sort(function (a, b) { return a.varianceValue - b.varianceValue || a.name.localeCompare(b.name); });

    var flags = [];
    var shortValue = 0, uncounted = [];
    items.forEach(function (m) {
      if (m.variance < 0 && (Math.abs(m.varianceValue) >= 50 || !m.rate)) {
        shortValue += -m.varianceValue;
        var share = Math.abs(m.variance) / (Math.abs(m.variance) + Math.max(0, m.counted || 0)) * 100;   // share of the stock that should have been there
        flags.push({ severity: share > 5 ? 'high' : 'medium', title: 'Stock short: ' + m.name + ' ' + Math.abs(m.variance) + ' ' + m.unit + (m.rate ? ' (' + cur + Math.round(-m.varianceValue).toLocaleString('en-IN') + ')' : ''),
          detail: 'Counted ' + m.counted + ' ' + m.unit + ' on ' + m.countDate + ', but purchases minus supplies and wastage say there should be more. Check for unrecorded issues, theft or wrong counts.', area: 'stock' });
      } else if (m.variance > 0 && m.variance * (m.rate || 1) >= 50) {
        flags.push({ severity: 'info', title: 'More ' + m.name + ' in hand than recorded (+' + m.variance + ' ' + m.unit + ')', detail: 'A purchase bill may be missing, or supplies were over-reported.', area: 'stock' });
      }
      if (m.book < 0 && !m.counts) flags.push({ severity: 'medium', title: m.name + ': supplied more than was bought', detail: 'Supplied and wasted ' + r2(m.supplied + m.wasted) + ' ' + m.unit + ' against ' + r2(m.opening + m.purchased) + ' available. A purchase bill may be missing.', area: 'stock' });
      if (!m.counts && (m.purchased || m.supplied)) uncounted.push(m.name);
    });
    if (uncounted.length && items.some(function (m) { return m.counts; })) flags.push({ severity: 'info', title: uncounted.length + ' item(s) moved but not counted', detail: uncounted.slice(0, 8).join(', ') + (uncounted.length > 8 ? '…' : '') + '. Count them to check stock in hand.', area: 'stock' });
    return {
      from: from, to: to, items: items, flags: flags,
      totals: {
        items: items.length, counted: items.filter(function (m) { return m.counts; }).length,
        purchasedValue: r2(items.reduce(function (a, m) { return a + m.purchased * m.rate; }, 0)),
        suppliedValue: r2(items.reduce(function (a, m) { return a + m.supplied * m.rate; }, 0)),
        inHandValue: r2(items.reduce(function (a, m) { return a + Math.max(0, m.inHand) * m.rate; }, 0)),
        shortValue: r2(shortValue)
      }
    };
  }

  // ------------------------------------------------------------------ engine side
  function install(ctx) {
    var api = ctx.api, fail = ctx.fail;
    function db() { return ctx.db(); }
    function s() { return ctx.settings(); }
    function costTypeFor(category) {
      var c = (ctx.preset().review.costCategories || []).filter(function (x) { return x.name.toLowerCase() === str(category).toLowerCase(); })[0];
      return c ? c.type : 'variable';
    }

    function ensureDepartments() {
      if (db().departments.length) return;
      ctx.preset().review.departments.forEach(function (name, i) {
        // predictable ids so the phone and the office system create the same departments
        var d = { id: 'dep' + i + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20), name: name, kind: 'both', active: true, order: i, createdAt: ctx.stamp() };
        db().departments.push(d); ctx.touch('departments', d);
      });
    }
    ctx.onSetup(ensureDepartments);

    function normItems(items) {
      return (items || []).filter(function (it) { return it && str(it.name); }).map(function (it) {
        var qty = num(it.qty), rate = num(it.rate), amount = num(it.amount);
        if (!amount && qty && rate) amount = qty * rate;
        if (!rate && qty && amount) rate = amount / qty;
        var o = { name: str(it.name), qty: r2(qty), unit: str(it.unit), rate: r2(rate), amount: r2(amount) };
        if (it.received !== undefined && it.received !== null && it.received !== '') o.received = r2(num(it.received));
        return o;
      });
    }

    function normEntry(input, existing) {
      var e = existing || { id: ctx.newId(input.id), createdAt: ctx.stamp() };
      var type = str(input.type);
      if (TYPES.indexOf(type) < 0) fail('Choose what kind of entry this is');
      var dep = input.departmentId ? db().departments.filter(function (d) { return d.id === input.departmentId; })[0] : null;
      if (input.departmentId && !dep) fail('Department not found');
      e.type = type;
      e.date = isDate(input.date) ? input.date : ctx.today();
      e.time = /^\d{1,2}:\d{2}$/.test(input.time || '') ? input.time : '';
      e.half = input.half === 'first' || input.half === 'second' ? input.half : halfOf(e.time, s().halfDaySplit);
      e.departmentId = dep ? dep.id : '';
      e.departmentName = dep ? dep.name : '';
      e.items = normItems(input.items);
      var amount = num(input.amount);
      if (!amount && e.items.length) amount = e.items.reduce(function (a, it) { return a + it.amount; }, 0);
      e.amount = r2(amount);
      if (ITEM_ONLY.indexOf(type) >= 0) { if (!e.items.length) fail('Add at least one item with its quantity'); }
      else if (type === 'walkin') { e.amount = Math.round(e.amount); if (!(e.amount > 0)) fail('Enter the number of walk-ins'); }
      else if (type === 'cash') { if (e.amount < 0) fail('Cash in hand cannot be negative'); }
      else if (!(e.amount > 0)) fail('Enter an amount more than zero');
      e.method = type === 'collection' ? (str(input.method) || 'Cash') : str(input.method);
      e.category = str(input.category);
      e.costType = type === 'expense' || type === 'misc' ? (input.costType === 'fixed' || input.costType === 'variable' ? input.costType : costTypeFor(e.category)) : '';
      e.vendor = str(input.vendor); e.billNo = str(input.billNo); e.note = str(input.note);
      e.source = str(input.source) || e.source || 'manual';
      if (input.receiptId) e.receiptId = str(input.receiptId);
      e.updatedAt = ctx.stamp();
      return e;
    }

    api.saveDepartment = function (input) {
      return ctx.tx(function () {
        input = input || {};
        if (!str(input.name)) fail('Department name is required');
        var d = input.id ? db().departments.filter(function (x) { return x.id === input.id; })[0] : null;
        if (!d) { d = { id: ctx.newId(input.id), createdAt: ctx.stamp(), order: db().departments.length }; db().departments.push(d); }
        d.name = str(input.name); d.kind = ['revenue', 'cost', 'both'].indexOf(input.kind) >= 0 ? input.kind : (d.kind || 'both');
        d.active = input.active === undefined ? (d.active !== false) : !!input.active;
        ctx.touch('departments', d);
        return ctx.clone(d);
      });
    };
    api.removeDepartment = function (id) {
      return ctx.tx(function () {
        var d = ctx.mustFind('departments', id, 'Department');
        if (db().entries.some(function (e) { return e.departmentId === id; })) { d.active = false; ctx.touch('departments', d); return { deactivated: true }; }
        db().departments = db().departments.filter(function (x) { return x.id !== id; });
        ctx.drop('departments', id);
        return { deleted: true };
      });
    };

    api.saveEntry = function (input) {
      return ctx.tx(function () {
        input = input || {};
        var existing = input.id ? ctx.find('entries', input.id) : null;
        var e = normEntry(input, existing);
        if (!existing) db().entries.push(e);
        ctx.touch('entries', e);
        return ctx.clone(e);
      });
    };
    api.removeEntry = function (id) {
      return ctx.tx(function () {
        var e = ctx.mustFind('entries', id, 'Entry');
        db().entries = db().entries.filter(function (x) { return x.id !== id; });
        ctx.drop('entries', id);
        if (e.receiptId) {
          var r = ctx.find('receipts', e.receiptId);
          if (r) { db().receipts = db().receipts.filter(function (x) { return x.id !== r.id; }); ctx.drop('receipts', r.id); }
        }
        return { deleted: true };
      });
    };

    // Daily sheet: one row per department with the day's totals.
    var SHEET_FIELDS = { walkin: ['walkin'], cash: ['cashInHand'], deposit: ['deposit'], sale: ['sale'], collection: ['cash', 'upi', 'card', 'otherCollection'], expense: ['expense'], purchase: ['purchase'], received: ['received'], wastage: ['wastage'], misc: ['misc'] };
    var METHOD_OF = { cash: 'Cash', upi: 'UPI', card: 'Card', otherCollection: 'Other' };
    api.getDailySheet = function (date, half) {
      if (!isDate(date)) fail('Pick a date');
      half = half === 'first' || half === 'second' ? half : '';
      return db().departments.filter(function (d) { return d.active !== false; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).map(function (d) {
        var row = { departmentId: d.id, name: d.name };
        db().entries.forEach(function (e) {
          if (e.source !== 'sheet' || e.date !== date || e.departmentId !== d.id || (e.half || '') !== half) return;
          var f = e.type === 'collection' ? Object.keys(METHOD_OF).filter(function (k) { return METHOD_OF[k] === e.method; })[0] || 'otherCollection' : e.type === 'cash' ? 'cashInHand' : e.type;
          row[f] = r2((row[f] || 0) + e.amount);
        });
        return row;
      });
    };
    api.saveDailySheet = function (input) {
      input = input || {};
      if (!isDate(input.date)) fail('Pick a date');
      var half = input.half === 'first' || input.half === 'second' ? input.half : '';
      return ctx.tx(function () {
        var count = 0;
        (input.rows || []).forEach(function (row) {
          var dep = ctx.mustFind('departments', row.departmentId, 'Department');
          db().entries.filter(function (e) { return e.source === 'sheet' && e.date === input.date && e.departmentId === dep.id && (e.half || '') === half; })
            .forEach(function (e) { db().entries = db().entries.filter(function (x) { return x.id !== e.id; }); ctx.drop('entries', e.id); });
          Object.keys(SHEET_FIELDS).forEach(function (type) {
            SHEET_FIELDS[type].forEach(function (f) {
              var v = r2(num(row[f]));
              if (type === 'cash' ? (row[f] === '' || row[f] === undefined || row[f] === null) : !(v > 0)) return;
              var e = normEntry({ id: row.ids && row.ids[f], type: type, date: input.date, half: half, departmentId: dep.id, amount: v,
                method: METHOD_OF[f] || (SPENDING.indexOf(type) >= 0 ? 'Cash' : ''), category: type === 'expense' ? 'Daily expenses' : '', costType: 'variable', source: 'sheet' });
              db().entries.push(e); ctx.touch('entries', e); count++;
            });
          });
        });
        return { saved: count };
      });
    };

    // Receipts read by OCR / AI and checked before saving.
    api.checkReceipt = function (input) {
      input = input || {};
      var items = normItems(input.items);
      var issues = [];
      var sum = r2(items.reduce(function (a, it) { return a + it.amount; }, 0));
      items.forEach(function (it) {
        if (it.qty && it.rate && Math.abs(it.qty * it.rate - it.amount) > Math.max(1, it.amount * 0.02)) issues.push(it.name + ': ' + it.qty + ' × ' + it.rate + ' is ' + r2(it.qty * it.rate) + ', bill shows ' + it.amount);
        if (it.received !== undefined && it.received < it.qty) issues.push(it.name + ': billed ' + it.qty + ', received only ' + it.received);
      });
      var total = num(input.total);
      if (total && items.length && Math.abs(sum - total) > Math.max(2, total * 0.02)) issues.push('Items add up to ' + sum + ' but the bill total is ' + total + ' (tax, discount or a misread number?)');
      var dup = str(input.billNo) && str(input.vendor) ? db().entries.filter(function (e) { return e.billNo && e.vendor && e.billNo.toLowerCase() === str(input.billNo).toLowerCase() && e.vendor.toLowerCase() === str(input.vendor).toLowerCase() && e.id !== input.entryId; })[0] : null;
      var probeEntry = { id: '__probe', type: 'purchase', date: isDate(input.date) ? input.date : ctx.today(), createdAt: '9999', vendor: str(input.vendor), items: items, departmentId: input.departmentId || '', amount: total || sum, half: '' };
      var res = computeInsights(db().entries.concat([probeEntry]), db().departments, s(), { days: [probeEntry.date] }, ctx.today());
      return {
        sum: sum, issues: issues,
        duplicate: dup ? { date: dup.date, amount: dup.amount, id: dup.id } : null,
        priceAlerts: res.priceAlerts.filter(function (a) { return a.entryId === '__probe'; }),
        cheaperElsewhere: res.cheaperElsewhere.filter(function (c) { return c.vendor === probeEntry.vendor; })
      };
    };
    api.saveReceipt = function (input) {
      input = input || {};
      var entryIn = input.entry || {};
      if (!input.allowDuplicate && entryIn.billNo && entryIn.vendor) {
        var dup = db().entries.filter(function (e) { return e.billNo && e.vendor && e.billNo.toLowerCase() === str(entryIn.billNo).toLowerCase() && e.vendor.toLowerCase() === str(entryIn.vendor).toLowerCase(); })[0];
        if (dup) fail('This bill (' + entryIn.vendor + ' #' + entryIn.billNo + ') was already saved on ' + dup.date);
      }
      return ctx.tx(function () {
        var rid = ctx.newId(input.id);
        var e = normEntry(Object.assign({}, entryIn, { source: 'ocr', receiptId: rid, id: entryIn.id }));
        var r = { id: rid, entryId: e.id, date: e.date, vendor: e.vendor, billNo: e.billNo, total: e.amount, type: e.type, departmentId: e.departmentId,
          engine: str(input.engine), text: str(input.text).slice(0, 4000), createdAt: ctx.stamp() };
        db().entries.push(e); ctx.touch('entries', e);
        db().receipts.push(r); ctx.touch('receipts', r);
        return { entry: ctx.clone(e), receipt: ctx.clone(r) };
      });
    };

    // ---- example data: 30 days, with a few planted problems for the insights to find ----
    var SAMPLE_ITEMS = {
      food: [['Tomato', 'kg', 32], ['Onion', 'kg', 36], ['Chicken', 'kg', 230], ['Milk', 'l', 56], ['Paneer', 'kg', 380], ['Cooking oil', 'l', 145], ['Rice', 'kg', 62]],
      pharma: [['Paracetamol 500 strip', 'pcs', 18], ['Amoxicillin 250 strip', 'pcs', 62], ['Cough syrup 100ml', 'pcs', 70], ['Gloves box', 'pcs', 240], ['ORS sachet', 'pcs', 19]],
      general: [['Stock item A', 'pcs', 120], ['Stock item B', 'pcs', 75], ['Packing material', 'kg', 90], ['Consumables', 'pcs', 40]]
    };
    var COST_ONLY = /kitchen|stores|godown|housekeeping|maintenance|office|production|laundry|operations|workshop/i;
    api.loadReviewSamplesInner = function () {
      ensureDepartments();
      // predictable ids (per load) so a phone and the office system build identical example data
      var meta = db().meta; meta.sampleLoads = (meta.sampleLoads || 0) + 1;
      var sn = 0, sid = function () { return 'smp' + meta.sampleLoads + '-' + (++sn); };
      var key = s().industry;
      var list = /restaurant|hotel|bakery|grocery/.test(key) ? SAMPLE_ITEMS.food : /pharmacy|clinic/.test(key) ? SAMPLE_ITEMS.pharma : SAMPLE_ITEMS.general;
      var rnd = seededRandom('bizcore-sample-' + key);
      var deps = db().departments.filter(function (d) { return d.active !== false; });
      var revenue = deps.filter(function (d) { return !COST_ONLY.test(d.name); });
      var buyer = deps.filter(function (d) { return /stores|godown/i.test(d.name); })[0] || deps.filter(function (d) { return COST_ONLY.test(d.name); })[0] || deps[0];
      var user = deps.filter(function (d) { return d !== buyer && /kitchen|production|workshop|housekeeping|operations/i.test(d.name); })[0] || revenue[0] || buyer;
      var bal = {}, lastCount = 29, cashBal = 5000;  // 30 days: index of the last one
      var end = ctx.today();
      var start = addDays(end, -29);
      var days = daysIn(start, end);
      var cats = ctx.preset().review.costCategories;
      var fixed = cats.filter(function (c) { return c.type === 'fixed'; });
      var variable = cats.filter(function (c) { return c.type === 'variable'; });
      function add(o) { var e = normEntry(Object.assign({ source: 'sample', id: sid() }, o)); db().entries.push(e); ctx.touch('entries', e); }
      var gapDays = [days[6], days[19]], hikeDay = days[22], shortDay = days[15], wasteDay = days[11], spikeDay = days[25];
      days.forEach(function (d, di) {
        var wd = toDate(d).getDay(), weekend = wd === 0 || wd === 6;
        revenue.forEach(function (dep, k) {
          var base = (9000 + rnd() * 9000) * (weekend ? 1.35 : 1) / (k + 1);
          ['first', 'second'].forEach(function (h) {
            var sale = Math.round(base * (h === 'first' ? 0.4 : 0.6));
            add({ type: 'sale', date: d, half: h, departmentId: dep.id, amount: sale });
            add({ type: 'walkin', date: d, half: h, departmentId: dep.id, amount: Math.max(1, Math.round(sale / (300 + rnd() * 120) * (d === days[17] ? 2.2 : 1))) });
            var collected = gapDays.indexOf(d) >= 0 && k === 0 && h === 'second' ? sale * 0.82 : sale * (0.985 + rnd() * 0.015);
            var cash = Math.round(collected * 0.45), upi = Math.round(collected * 0.4), card = Math.round(collected) - cash - upi;
            add({ type: 'collection', date: d, half: h, departmentId: dep.id, amount: cash, method: 'Cash' });
            add({ type: 'collection', date: d, half: h, departmentId: dep.id, amount: upi, method: 'UPI' });
            if (card > 0) add({ type: 'collection', date: d, half: h, departmentId: dep.id, amount: card, method: 'Card' });
          });
        });
        // purchases with item lines, from two vendors
        var lines = list.slice(0, 3 + Math.floor(rnd() * (list.length - 2))).map(function (it, i) {
          var qty = Math.round(5 + rnd() * 20), rate = it[2] * (0.97 + rnd() * 0.06);
          if (d === hikeDay && i === 0) rate = it[2] * 1.32;
          var line = { name: it[0], unit: it[1], qty: qty, rate: Math.round(rate * 100) / 100 };
          if (d === shortDay && i === 1) line.received = Math.max(1, qty - 4);
          return line;
        });
        var vendor = di % 3 === 0 ? 'City Wholesale' : 'Sri Lakshmi Traders';
        add({ type: 'purchase', date: d, time: '09:30', departmentId: buyer.id, vendor: vendor, billNo: 'B' + (1000 + di), items: lines, category: variable[0] ? variable[0].name : 'Purchase' });
        var bought = lines.reduce(function (a, l) { return a + l.qty * l.rate; }, 0);
        // the store issues most of what it buys to the department that uses it; stock is counted weekly
        var issue = lines.map(function (l) { var got = l.received !== undefined ? l.received : l.qty; return { name: l.name, unit: l.unit, qty: Math.max(1, Math.round(got * (0.8 + rnd() * 0.15))) }; });
        lines.forEach(function (l, i) { bal[l.name] = (bal[l.name] || 0) + (l.received !== undefined ? l.received : l.qty) - issue[i].qty; });
        add({ type: 'supply', date: d, time: '11:00', departmentId: user.id, items: issue, note: 'Issued from ' + buyer.name });
        if (di % 7 === 6 || di === lastCount) {
          add({ type: 'stock', date: d, time: '22:00', departmentId: buyer.id, note: 'Weekly stock count',
            items: Object.keys(bal).map(function (n, i) {
              var it = list.filter(function (x) { return x[0] === n; })[0];
              var counted = di === lastCount && i === 1 ? Math.max(0, Math.round(bal[n] * 0.7)) : bal[n];
              bal[n] = counted;
              return { name: n, unit: it ? it[1] : '', qty: counted };
            }) });
        }
        add({ type: 'wastage', date: d, time: '21:30', departmentId: buyer.id, amount: Math.round(bought * (d === wasteDay ? 0.16 : 0.015 + rnd() * 0.02)), category: 'Spoiled / expired', note: d === wasteDay ? 'Fridge stopped overnight' : '' });
        // running expenses
        var v = variable[Math.floor(rnd() * variable.length)] || { name: 'Other' };
        add({ type: 'expense', date: d, time: '12:00', departmentId: buyer.id, amount: Math.round((600 + rnd() * 900) * (d === spikeDay ? 4 : 1)), category: v.name, costType: 'variable', method: 'Cash' });
        // cash counted at close: opening + cash sales − cash spent (one day short on purpose)
        if (revenue[0]) {
          var cashIn = db().entries.filter(function (x) { return x.date === d && x.type === 'collection' && x.method === 'Cash'; }).reduce(function (a, x) { return a + x.amount; }, 0);
          var cashOut = db().entries.filter(function (x) { return x.date === d && SPENDING.indexOf(x.type) >= 0 && x.method === 'Cash'; }).reduce(function (a, x) { return a + x.amount; }, 0);
          var deposit = 0;
          if (di % 3 === 2 && cashBal + cashIn - cashOut > 8000) { deposit = Math.round((cashBal + cashIn - cashOut - 5000) / 100) * 100; add({ type: 'deposit', date: d, time: '18:00', departmentId: revenue[0].id, amount: deposit, note: 'Deposited in bank' }); }
          cashBal = Math.max(0, Math.round(cashBal + cashIn - cashOut - deposit - (d === days[20] ? 1500 : 0)));   // one day ₹1,500 short on purpose
          add({ type: 'cash', date: d, time: '23:00', departmentId: revenue[0].id, amount: cashBal, note: 'Counted at close' });
        }
        if (di % 9 === 4) add({ type: 'misc', date: d, time: '18:00', departmentId: revenue[0] ? revenue[0].id : buyer.id, amount: Math.round(300 + rnd() * 1200), category: 'Miscellaneous', note: 'Cash given, no bill' });
      });
      // example customers with vault records and reminders
      var vcfg = ctx.preset().review.vault;
      var withDue = vcfg.records.filter(function (r) { return r.dueLabel; });
      [['Asha Reddy', '9876500011', 2], ['Rahul Verma', '9876500022', -3], ['Fatima Khan', '9876500033', 12], ['Suresh Kumar', '9876500044', 25]].forEach(function (x, i) {
        var c = { id: sid(), name: x[0], phone: x[1], balance: 0, points: 0, createdAt: ctx.stamp(), updatedAt: ctx.stamp(), notes: 'Example customer' };
        db().customers.push(c); ctx.touch('customers', c);
        var kind = (withDue[i % Math.max(1, withDue.length)] || vcfg.records[0]).key;
        var r = { id: sid(), customerId: c.id, customerName: c.name, kind: kind, title: 'Example ' + (vcfg.records.filter(function (k) { return k.key === kind; })[0] || {}).label,
          details: 'Added as example data', date: addDays(end, -20 + i), dueDate: addDays(end, x[2]), amount: 0, done: false, createdAt: ctx.stamp(), updatedAt: ctx.stamp() };
        db().vaultRecords.push(r); ctx.touch('vaultRecords', r);
      });
      fixed.slice(0, 3).forEach(function (c, i) {
        add({ type: 'expense', date: days[1], time: '11:00', departmentId: '', amount: [45000, 120000, 15000][i] || 5000, category: c.name, costType: 'fixed' });
      });
      return true;
    };
    api.loadReviewSamples = function () { return ctx.tx(function () { return api.loadReviewSamplesInner(); }); };

    // Rows from a spreadsheet or another system: {date, time|half, department, type, amount, method, category, costType, vendor, billNo, note}
    var TYPE_WORDS = { sales: 'sale', sale: 'sale', revenue: 'sale', turnover: 'sale', collection: 'collection', collected: 'collection', receipt: 'collection',
      walkin: 'walkin', walkins: 'walkin', footfall: 'walkin', customers: 'walkin', guests: 'walkin', covers: 'walkin', expense: 'expense', expenses: 'expense',
      purchase: 'purchase', purchases: 'purchase', received: 'received', wastage: 'wastage', waste: 'wastage', misc: 'misc', miscellaneous: 'misc' };
    api.importEntries = function (rows) {
      if (!Array.isArray(rows) || !rows.length) fail('Nothing to import');
      return ctx.tx(function () {
        var made = 0, skipped = [];
        rows.forEach(function (raw, i) {
          var r = {}; Object.keys(raw || {}).forEach(function (k) { r[k.toLowerCase().replace(/[^a-z]/g, '')] = raw[k]; });
          var type = TYPE_WORDS[str(r.type).toLowerCase().replace(/[^a-z]/g, '')] || str(r.type).toLowerCase();
          var depName = str(r.department || r.dept);
          var dep = depName ? db().departments.filter(function (d) { return d.name.toLowerCase() === depName.toLowerCase(); })[0] : null;
          if (depName && !dep) { dep = { id: 'dep-' + depName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24), name: depName, kind: 'both', active: true, order: db().departments.length, createdAt: ctx.stamp() }; db().departments.push(dep); ctx.touch('departments', dep); }
          try {
            var e = normEntry({ id: r.id, type: type, date: r.date, time: r.time, half: str(r.half).toLowerCase().replace(/half|morning|evening/g, function (m) { return m === 'morning' ? 'first' : m === 'evening' ? 'second' : ''; }).trim(),
              departmentId: dep ? dep.id : '', amount: r.amount || r.value || r.count, method: r.method || r.mode, category: r.category, costType: str(r.costtype || r.fixedvariable).toLowerCase(),
              vendor: r.vendor || r.party, billNo: r.billno || r.invoice, note: r.note || r.remarks, source: 'import' });
            if (r.id && ctx.find('entries', e.id)) { skipped.push('row ' + (i + 2) + ': already imported'); return; }
            db().entries.push(e); ctx.touch('entries', e); made++;
          } catch (err) { if (!err.userError) throw err; skipped.push('row ' + (i + 2) + ': ' + err.message); }
        });
        return { imported: made, skipped: skipped.slice(0, 20), skippedCount: skipped.length };
      });
    };

    api.inventory = function (q) { return computeInventory(db().entries, q || {}, s(), ctx.today()); };
    api.knownItems = function () {
      var seen = {};
      db().entries.forEach(function (e) { (e.items || []).forEach(function (it) { var k = itemKey(it.name); if (k && !seen[k]) seen[k] = { name: it.name, unit: it.unit || '' }; }); });
      return Object.keys(seen).sort().map(function (k) { return seen[k]; });
    };

    api.reviewInsights = function (q) { return computeInsights(db().entries, db().departments, s(), q || {}, ctx.today(), ctx.preset().review.kpis); };

    // ---------------- Customer Vault ----------------
    function customer(id) { return ctx.mustFind('customers', id, 'Customer'); }
    function token() { var c = 'abcdefghijkmnpqrstuvwxyz23456789', t = ''; for (var i = 0; i < 24; i++) t += c[Math.floor(Math.random() * c.length)]; return t; }
    api.saveVaultRecord = function (input) {
      input = input || {};
      return ctx.tx(function () {
        var c = customer(input.customerId);
        if (!str(input.title) && !str(input.details)) fail('Add a title or details');
        var r = input.id ? ctx.find('vaultRecords', input.id) : null;
        if (!r) { r = { id: ctx.newId(input.id), createdAt: ctx.stamp() }; db().vaultRecords.push(r); }
        r.customerId = c.id; r.customerName = c.name;
        r.kind = str(input.kind) || 'note'; r.title = str(input.title); r.details = str(input.details);
        r.date = isDate(input.date) ? input.date : ctx.today();
        r.dueDate = isDate(input.dueDate) ? input.dueDate : '';
        r.amount = num(input.amount) ? r2(num(input.amount)) : 0;
        r.done = !!input.done;
        r.updatedAt = ctx.stamp();
        ctx.touch('vaultRecords', r);
        return ctx.clone(r);
      });
    };
    api.removeVaultRecord = function (id) {
      return ctx.tx(function () { ctx.mustFind('vaultRecords', id, 'Record'); db().vaultRecords = db().vaultRecords.filter(function (x) { return x.id !== id; }); ctx.drop('vaultRecords', id); return { deleted: true }; });
    };
    api.logMessage = function (input) {
      input = input || {};
      return ctx.tx(function () {
        var c = customer(input.customerId);
        var m = { id: ctx.newId(input.id), customerId: c.id, customerName: c.name, date: ctx.today(), at: ctx.stamp(), channel: 'whatsapp',
          template: str(input.template), recordId: str(input.recordId), text: str(input.text).slice(0, 2000) };
        db().messages.push(m); ctx.touch('messages', m);
        c.lastContact = m.date; ctx.touch('customers', c);
        return ctx.clone(m);
      });
    };
    api.ensureVaultToken = function (customerId, newToken) {
      return ctx.tx(function () {
        var c = customer(customerId);
        if (!c.vaultToken) { c.vaultToken = /^[a-z0-9]{16,40}$/.test(newToken || '') ? newToken : token(); ctx.touch('customers', c); }
        return c.vaultToken;
      });
    };
    function vaultOf(c) {
      var records = db().vaultRecords.filter(function (r) { return r.customerId === c.id; }).sort(function (a, b) { return (b.date + b.createdAt).localeCompare(a.date + a.createdAt); });
      var bills = (db().sales || []).filter(function (x) { return x.customerId === c.id && x.status !== 'void'; }).map(function (x) {
        return { id: x.id, date: x.date, number: x.number, total: x.total, due: x.due, lines: x.lines.map(function (l) { return { name: l.name, qty: l.qty, total: l.total }; }) };
      }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      var messages = db().messages.filter(function (m) { return m.customerId === c.id; }).sort(function (a, b) { return b.at.localeCompare(a.at); });
      return { customer: ctx.clone(c), records: ctx.clone(records), bills: bills, messages: ctx.clone(messages) };
    }
    api.vault = function (customerId) { return vaultOf(customer(customerId)); };
    api.vaultByToken = function (t) {
      if (!/^[a-z0-9]{16,40}$/.test(t || '')) return null;
      var c = db().customers.filter(function (x) { return x.vaultToken === t; })[0];
      if (!c) return null;
      var v = vaultOf(c);
      var sset = s();
      return { shop: { name: sset.businessName, title: sset.vaultTitle || sset.businessName, phone: sset.phone, address: sset.address, industry: ctx.preset().name },
        customer: { name: c.name, points: c.points || 0, balance: c.balance || 0 },
        records: v.records.map(function (r) { return { kind: r.kind, title: r.title, details: r.details, date: r.date, dueDate: r.dueDate, amount: r.amount }; }),
        bills: v.bills, messages: v.messages.map(function (m) { return { date: m.date, text: m.text }; }), labels: ctx.preset().review.vault.records };
    };
    // Who needs a message: due dates from today-30 to today+days, plus who has not been contacted
    api.vaultDue = function (q) {
      q = q || {};
      var t = ctx.today(), until = addDays(t, q.days === undefined ? 7 : +q.days), since = addDays(t, -30);
      var labels = {}; ctx.preset().review.vault.records.forEach(function (r) { labels[r.key] = r; });
      return db().vaultRecords.filter(function (r) { return r.dueDate && !r.done && r.dueDate >= since && r.dueDate <= until; }).map(function (r) {
        var c = ctx.find('customers', r.customerId) || {};
        var last = db().messages.filter(function (m) { return m.recordId === r.id; }).sort(function (a, b) { return b.at.localeCompare(a.at); })[0];
        return { record: ctx.clone(r), customer: { id: c.id, name: c.name, phone: c.phone }, dueLabel: (labels[r.kind] || {}).dueLabel || 'Due', overdue: r.dueDate < t, remindedOn: last ? last.date : '' };
      }).sort(function (a, b) { return a.record.dueDate.localeCompare(b.record.dueDate); });
    };
    api.vaultSummary = function () {
      var t = ctx.today();
      return db().customers.map(function (c) {
        var recs = db().vaultRecords.filter(function (r) { return r.customerId === c.id; });
        var next = recs.filter(function (r) { return r.dueDate && !r.done && r.dueDate >= t; }).sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); })[0];
        return { id: c.id, name: c.name, phone: c.phone, records: recs.length, bills: (db().sales || []).filter(function (x) { return x.customerId === c.id; }).length,
          messages: db().messages.filter(function (m) { return m.customerId === c.id; }).length, lastContact: c.lastContact || '', nextDue: next ? next.dueDate : '', nextTitle: next ? next.title : '', hasLink: !!c.vaultToken };
      }).sort(function (a, b) { return (a.nextDue || '9999').localeCompare(b.nextDue || '9999') || a.name.localeCompare(b.name); });
    };
    api.sampleDays = function (q) { q = q || {}; return sampleDays(q.from, q.to, q.count, q.seed, q.days); };
  }

  return { TYPES: TYPES, SPENDING: SPENDING, TYPE_LABELS: TYPE_LABELS, ITEM_ONLY: ITEM_ONLY, METHODS: METHODS, computeInsights: computeInsights, computeInventory: computeInventory, sampleDays: sampleDays, install: install, halfOf: halfOf, itemKey: itemKey, daysIn: daysIn, addDays: addDays };
});
