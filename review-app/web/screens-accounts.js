/* Main page (6 headers + fingertip line), ACCOUNTS, STORE and STAFF. */
(function () {
  'use strict';
  var A = window.App, api = A.api, $ = A.$, $$ = A.$$, esc = A.esc, money = A.money, R = A.R;

  function deps() { return api.list('departments', { sort: 'order' }).rows.filter(function (d) { return d.active !== false; }); }
  function stat(l, v, h, cls) { return '<div class="stat ' + (cls || '') + '"><span class="l">' + esc(l) + '</span><span class="v">' + esc(v) + '</span>' + (h ? '<span class="h">' + esc(h) + '</span>' : '') + '</div>'; }
  function feat(href, ic, title, sub, fig, figCls) {
    return '<li><a class="feat" href="#' + href + '"><span class="ic" aria-hidden="true">' + ic + '</span><span class="t"><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span>' + (fig !== undefined ? '<span class="fig ' + (figCls || '') + '">' + esc(fig) + '</span>' : '') + '</a></li>';
  }
  function monthOf(d) { return (d || A.today()).slice(0, 7); }
  function monthName(ym) { try { return new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); } catch (e) { return ym; } }
  function shiftMonth(ym, n) { var d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1); }
  function ytId(u) { var m = String(u || '').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : ''; }
  function videoCard(url, title, sub) {
    var id = ytId(url); if (!id) return '';
    return '<a class="video" href="https://www.youtube.com/watch?v=' + id + '" target="_blank" rel="noopener"><img src="https://img.youtube.com/vi/' + id + '/hqdefault.jpg" alt=""><span class="t"><b>▶ ' + esc(title) + '</b><br><span class="muted small">' + esc(sub) + '</span></span></a>';
  }
  // "Bill written by": the staff member who wrote a manual bill. Used for attendance; remembered on this phone.
  var LASTSTAFF = 'bizreview-last-staff';
  function staffPick(id, sel) {
    var rows = api.list('staff', { sort: 'name' }).rows.filter(function (x) { return x.active !== false || x.id === sel; });
    if (!rows.length) return '';
    var cur = sel === undefined ? (A.lsGet(LASTSTAFF) || '') : sel;
    return A.field('Bill written by (counts as present)', '<select id="' + id + '">' + A.opt(rows.map(function (x) { return { value: x.id, text: x.name }; }), cur, 'Not recorded') + '</select>');
  }
  function staffOf(id, el) { var v = A.val(id, el); if (v !== '' || $('#' + id, el)) A.lsSet(LASTSTAFF, v); var st = v ? api.get('staff', v) : null; return { staffId: st ? st.id : '', staffName: st ? st.name : '' }; }
  function nowTime() { var d = new Date(); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
  function eg(key) { var x = api.kinds().featureExamples[key]; return x ? '<p class="eg">' + esc(x) + '</p>' : ''; }
  function uploadBtn(id, text) { return '<button type="button" class="btn upload block" id="' + id + '">📷 ' + esc(text || 'Upload bill (photo / file)') + '</button>'; }
  A.staffPick = staffPick; A.staffOf = staffOf; A.eg = eg; A.uploadBtn = uploadBtn;
  A.stat = stat; A.feat = feat; A.ytId = ytId; A.videoCard = videoCard; A.monthName = monthName; A.shiftMonth = shiftMonth;

  // ================================================================ MAIN PAGE
  A.screen('home', { title: function () { return A.S().businessName; }, render: function (el) {
    var t = A.today(), s = A.S();
    var pl = api.profitLoss({ from: t, to: t });
    var month = api.profitLoss({ from: t.slice(0, 8) + '01', to: t });
    var due = api.vaultDue({ days: 7 }).length;
    var alerts = api.alerts({}).flags.filter(function (f) { return f.severity !== 'info'; }).length;
    var bills = api.list('entries', { type: 'purchase', from: R.addDays(t, -6), to: t }).total;
    var staff = api.list('staff').rows.filter(function (x) { return x.active !== false; }).length;
    var H = [
      ['accounts', '₹', 'Accounts', 'Net profit this month ' + money(month.net), month.net < 0],
      ['customers', '☺', 'Customers', due ? due + ' to contact this week' : api.info().counts.customers + ' customers'],
      ['store', '▦', 'Store', bills + ' purchase bills this week'],
      ['reports', '▤', 'Reports', alerts ? alerts + ' things to check' : 'All looks normal', alerts > 0],
      ['staff', '◎', 'Staff', staff + ' people'],
      ['setup', '⚙', 'Business setup', 'Departments, store, fixed costs']
    ];
    el.innerHTML = '<div class="today-strip">' + stat('Sales today', money(pl.sales)) + stat('Net profit today', money(pl.net), 'after a day\'s share of fixed costs', pl.net < 0 ? 'bad' : 'good') + '</div>' +
      videoCard(s.ownerVideo, 'How to use Fingertrip.biz AI', 'Video for the owner and staff') +
      '<div class="section-title">Main headers</div>' +
      '<div class="hdr-wrap" id="hw"><div class="hdr-grid" id="hg">' + H.map(function (h) {
        return '<a class="hdr" href="#' + h[0] + '"><span class="cap">Header</span><span class="body"><span class="ic" aria-hidden="true">' + h[1] + '</span><b>' + esc(h[2]) + '</b><span class="fig' + (h[4] ? ' bad' : '') + '">' + esc(h[3]) + '</span></span></a>';
      }).join('') + '</div></div>' +
      (api.info().counts.entries ? '' : '<div class="card"><p class="muted">No numbers yet. Open <b>Accounts → Sales</b> to add today\'s sales, or <b>Store</b> to photograph a purchase bill.</p><button type="button" class="btn ghost" id="h-sample">Show me 30 days of example numbers</button></div>');
    var hs = $('#h-sample', el); if (hs) hs.onclick = function () { if (A.act(function () { return api.loadReviewSamples(); }, 'Example numbers added')) A.render(); };
    requestAnimationFrame(function () { fingertip($('#hw', el), $('#hg', el)); });
  } });

  // The fingertip line: two ridge lines that run around all six headers, through each one.
  function fingertip(wrap, grid) {
    if (!wrap || !grid) return;
    var tiles = $$('.hdr', grid); if (tiles.length < 2) return;
    var wr = wrap.getBoundingClientRect();
    var pts = tiles.map(function (t) { var r = t.getBoundingClientRect(); return { x: r.left - wr.left + r.width / 2, y: r.top - wr.top + r.height / 2, w: r.width, h: r.height }; });
    var cols = Math.round(grid.getBoundingClientRect().width / (pts[0].w + 10)) || 2;
    // loop order: along the top row, down the right column, back along the bottom, up the left
    var rows = []; pts.forEach(function (p, i) { (rows[Math.floor(i / cols)] = rows[Math.floor(i / cols)] || []).push(p); });
    var ring = rows[0].slice();
    for (var r = 1; r < rows.length; r++) ring.push(rows[r][rows[r].length - 1]);
    for (var r2 = rows.length - 1; r2 >= 1; r2--) { var row = rows[r2].slice(0, -1).reverse(); if (r2 === rows.length - 1) ring = ring.concat(row); else ring.push(row[row.length - 1]); }
    for (var r3 = rows.length - 2; r3 >= 1; r3--) if (rows[r3].length > 1 && cols > 1) ring.push(rows[r3][0]);
    var seen = {}; ring = ring.filter(function (p) { var k = Math.round(p.x) + ',' + Math.round(p.y); if (seen[k]) return false; seen[k] = 1; return true; });
    function path(off) {
      var cx = ring.reduce(function (a, p) { return a + p.x; }, 0) / ring.length, cy = ring.reduce(function (a, p) { return a + p.y; }, 0) / ring.length;
      var q = ring.map(function (p) { var dx = p.x - cx, dy = p.y - cy, d = Math.sqrt(dx * dx + dy * dy) || 1; return { x: p.x + dx / d * off, y: p.y + dy / d * off }; });
      var dStr = 'M' + ((q[0].x + q[q.length - 1].x) / 2).toFixed(1) + ' ' + ((q[0].y + q[q.length - 1].y) / 2).toFixed(1);
      for (var i = 0; i < q.length; i++) { var n = q[(i + 1) % q.length]; dStr += ' Q' + q[i].x.toFixed(1) + ' ' + q[i].y.toFixed(1) + ' ' + ((q[i].x + n.x) / 2).toFixed(1) + ' ' + ((q[i].y + n.y) / 2).toFixed(1); }
      return dStr + ' Z';
    }
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'finger'); svg.setAttribute('aria-hidden', 'true');
    [['r1', 0], ['r2', 14], ['r2', -14]].forEach(function (x) { var p = document.createElementNS(ns, 'path'); p.setAttribute('class', x[0]); p.setAttribute('d', path(x[1])); svg.appendChild(p); });
    wrap.insertBefore(svg, wrap.firstChild);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      $$('path', svg).forEach(function (p) { var L = p.getTotalLength(); p.style.setProperty('--len', L); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
      svg.classList.add('draw');
    }
  }

  // ================================================================ ACCOUNTS (level 2)
  A.screen('accounts', { title: 'Accounts', crumb: 'Header', back: 'home', render: function (el) {
    var t = A.today(), m0 = t.slice(0, 8) + '01';
    var today = api.profitLoss({ from: t, to: t }), month = api.profitLoss({ from: m0, to: t });
    var sumKind = function (k) { return api.list('entries', { type: 'expense', from: m0, to: t }).rows.filter(function (e) { return e.kind === k; }).reduce(function (a, e) { return a + e.amount; }, 0); };
    var fixedM = api.monthlyFixed(monthOf(t));
    var sal = api.salaries(monthOf(t)), salPaid = sal.filter(function (x) { return x.paid; }).length;
    var FX = api.kinds().featureExamples, adv = api.advanceBalances();
    el.innerHTML = uploadBtn('ac-up', 'Upload a bill (photo / file)') + '<div class="today-strip">' + stat('This month: sales', money(month.sales)) + stat('Net profit', money(month.net), month.margin !== null ? A.pct(month.margin) + ' of sales' : '', month.net < 0 ? 'bad' : 'good') + '</div>' +
      '<ul class="feats">' +
      feat('sales', '₹', 'Sales', FX.sales, money(today.sales) + ' today') +
      feat('purchases', '🧾', 'Purchases', FX.purchases + ' · bill photo', money(month.purchases) + ' this month') +
      feat('salaries', '◎', 'Salaries', salPaid + ' of ' + sal.length + ' paid for ' + monthName(monthOf(t)), money(sal.reduce(function (a, x) { return a + x.paid; }, 0))) +
      feat('advances', '⇄', 'Staff advances', FX.advances, money(adv.outstanding) + ' to recover') +
      feat('fixed', '▣', 'Fixed costs', FX.fixed + ' · spread per day', money(fixedM.total) + '/month') +
      feat('exp-maintenance', '🛠', 'Maintenance', FX.maintenance, money(sumKind('maintenance'))) +
      feat('exp-variable', '↕', 'Variable expenses', FX.variable, money(sumKind('variable'))) +
      feat('exp-sudden', '⚠', 'Sudden / miscellaneous', FX.sudden + ' · always reviewed', money(sumKind('sudden'))) +
      feat('daily', '☰', 'Daily summary', 'One day on one page · share on WhatsApp') +
      feat('cash', '◍', 'Cash in hand', 'Count at close; checked against expected') +
      feat('pl', '∑', 'Profit & Loss', 'Sales − purchases − expenses − fixed share', money(month.net), month.net < 0 ? 'bad' : '') +
      feat('receipts', '🧾', 'All receipts', 'Every photo and file saved in Accounts, searchable') +
      '</ul>';
    $('#ac-up', el).onclick = function () { pickKind(); };
  } });
  // "Upload a bill" from the Accounts page: choose where the bill belongs, then its entry page opens.
  function pickKind() {
    var back = document.createElement('div'); back.className = 'sheet-back';
    var K = [['purchase', 'Purchase bill'], ['fixed', 'Fixed cost (rent, electricity…)'], ['maintenance', 'Maintenance'], ['variable', 'Variable expense'], ['sudden', 'Sudden / miscellaneous'], ['advance', 'Staff advance'], ['sale', 'Sales / day-end report']];
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><b>Which bill is it?</b><div class="stack">' + K.map(function (k) { return '<button type="button" class="btn block" data-k="' + k[0] + '">' + esc(k[1]) + '</button>'; }).join('') + '</div><button type="button" class="btn ghost block" id="pk-x">Cancel</button></div>';
    document.body.appendChild(back);
    $('#pk-x', back).onclick = function () { back.remove(); };
    back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
    $$('[data-k]', back).forEach(function (b) { b.onclick = function () {
      back.remove(); var k = b.dataset.k;
      if (k === 'purchase') A.go('purchase-add'); else if (k === 'sale') A.go('sale-add', {}); else if (k === 'advance') A.go('advance-add', {}); else A.go('exp-add', { kind: k });
    }; });
  }
  A.pickKind = pickKind;

  // ---------------------------------------------------------------- Sales
  var salesState = { date: '' };
  A.screen('sales', { title: 'Sales', crumb: 'Accounts', back: 'accounts', render: function (el) {
    if (!salesState.date) salesState.date = A.today();
    var sheet = api.getDailySheet(salesState.date, ''), first = api.getDailySheet(salesState.date, 'first'), second = api.getDailySheet(salesState.date, 'second');
    var tot = function (rows, id) { var r = rows.filter(function (x) { return x.departmentId === id; })[0] || {}; return (r.sale || 0); };
    el.innerHTML = uploadBtn('sl-up', 'Upload day-end report / bill page') + eg('sales') + '<div class="card"><div class="grid2">' + A.field('Date', A.input('sl-date', 'date', salesState.date)) + '<div></div></div></div>' +
      '<div class="section-title">Sales departments</div><ul class="feats">' + deps().map(function (d) {
        var v = tot(sheet, d.id) + tot(first, d.id) + tot(second, d.id);
        return '<li><a class="feat" href="#sale-add" data-dep="' + d.id + '"><span class="ic">' + esc(d.name.charAt(0).toUpperCase()) + '</span><span class="t"><b>' + esc(d.name) + '</b><span>' + (v ? 'Entered' : 'Tap to enter sales') + '</span></span><span class="fig">' + money(v) + '</span></a></li>';
      }).join('') + '</ul>' + A.receiptsButton('sales') + '<a class="btn ghost" href="#setup-depts">Rename or add departments</a>';
    A.bindReceipts(el);
    $('#sl-date', el).onchange = function (e) { salesState.date = e.target.value || A.today(); A.render(); };
    $('#sl-up', el).onclick = function () { var d0 = deps()[0]; A.go('sale-add', { dep: d0 && d0.id, date: salesState.date }); };
    $$('[data-dep]', el).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); A.go('sale-add', { dep: a.dataset.dep, date: salesState.date }); }; });
  } });
  A.screen('sale-add', { title: 'Enter sales', crumb: 'Accounts › Sales', back: 'sales', render: function (el, st) {
    var d = st && st.dep ? api.get('departments', st.dep) : deps()[0];
    if (!d) { A.go('sales'); return; }
    var date = (st && st.date) || A.today(), half = (st && st.half) || '';
    var row = api.getDailySheet(date, half).filter(function (r) { return r.departmentId === d.id; })[0] || {};
    var F = [['sale', 'Sales (billed) ₹'], ['cash', 'Received in cash ₹'], ['upi', 'Received by UPI ₹'], ['card', 'Received by card ₹'], ['otherCollection', 'Other / online ₹'], ['walkin', 'Walk-ins (optional)']];
    el.innerHTML = '<div class="card"><h2>' + esc(d.name) + '</h2><div class="grid2">' + A.field('Date', A.input('sa-date', 'date', date)) +
      A.field('Part of day', '<select id="sa-half">' + A.opt([{ value: '', text: 'Whole day' }, { value: 'first', text: 'Morning' }, { value: 'second', text: 'Evening' }], half) + '</select>') + '</div>' +
      '<div class="section-title">Day-end report or bill book page</div><div id="sa-att"></div>' +
      '<div class="grid2">' + F.map(function (f) { return A.field(f[1], A.input('sa-' + f[0], 'number', row[f[0]] || '', 'min="0"')); }).join('') + '</div>' +
      staffPick('sa-staff', row.staffId) + '<div id="sa-gap"></div><button type="button" class="btn primary block" id="sa-save">Save sales</button></div>';
    var att = A.files.attach($('#sa-att', el), { files: row.files || [], read: 'report', label: 'Photo of day-end report', onRead: function (o) {
      if (o.date) $('#sa-date', el).value = o.date;
      [['sale', o.sale], ['cash', o.cash], ['upi', o.upi], ['card', o.card], ['otherCollection', o.other], ['walkin', o.walkins]].forEach(function (x) { if (x[1]) $('#sa-' + x[0], el).value = x[1]; });
      gap();
    } });
    function gap() {
      var v = function (k) { return parseFloat(A.val('sa-' + k, el)) || 0; };
      var s = v('sale'), c = v('cash') + v('upi') + v('card') + v('otherCollection');
      $('#sa-gap', el).innerHTML = s || c ? '<span class="pill ' + (s - c > 1 ? 'bad' : 'good') + '">' + (s - c > 1 ? money(s - c) + ' not received' : 'Fully received') + '</span>' : '';
    }
    $$('input[id^="sa-"]', el).forEach(function (i) { i.oninput = gap; }); gap();
    $('#sa-half', el).onchange = function (e) { A.go('sale-add', { dep: d.id, date: A.val('sa-date', el), half: e.target.value }); };
    $('#sa-save', el).onclick = function () {
      var date2 = A.val('sa-date', el), half2 = A.val('sa-half', el);
      var ok = A.act(function () {
        var r = api.getDailySheet(date2, half2).filter(function (x) { return x.departmentId === d.id; })[0] || { departmentId: d.id };
        F.forEach(function (f) { r[f[0]] = A.val('sa-' + f[0], el); });
        r.files = att.files();
        var who = staffOf('sa-staff', el); r.staffId = who.staffId; r.staffName = who.staffName; if (who.staffId && date2 === A.today()) r.time = nowTime();
        return api.saveDailySheet({ date: date2, half: half2, rows: [r] });
      }, 'Sales saved');
      if (ok) { salesState.date = date2; A.go('sales'); }
    };
  } });

  // ---------------------------------------------------------------- Purchases (shared with Store)
  function billList(rows) {
    if (!rows.length) return A.empty('No purchase bills yet', 'Tap "Add purchase bill" and take a photo of the bill.');
    return '<ul class="list">' + rows.map(function (e) {
      return '<li><button type="button" class="item" data-bill="' + e.id + '"><div class="t"><b>' + esc(e.vendor || 'Supplier not written') + (e.billNo ? ' · #' + esc(e.billNo) : '') + '</b><span>' + esc(A.niceDate(e.date) + ' · ' + (e.storeCategory || 'No category') + ' · ' + (e.method || '') + (e.files && e.files.length ? ' · 📷 ' + e.files.length : '')) + '</span></div><div class="end">' + money(e.amount) + '</div></button></li>';
    }).join('') + '</ul>';
  }
  A.screen('purchases', { title: 'Purchases', crumb: 'Accounts', back: 'accounts', render: function (el) {
    var t = A.today(), rows = api.list('entries', { type: 'purchase', from: R.addDays(t, -59), to: t, sort: '-at', limit: 200 }).rows;
    var pl = api.profitLoss({ from: t.slice(0, 8) + '01', to: t });
    el.innerHTML = '<a class="btn primary upload block" href="#purchase-add">📷 Upload purchase bill (photo / file)</a>' + eg('purchases') +
      '<div class="today-strip">' + stat('This month', money(pl.purchases), pl.purchasePct !== null ? A.pct(pl.purchasePct) + ' of sales' : '') + stat('4-week average', pl.purchasePct4w !== null ? A.pct(pl.purchasePct4w) : '–', 'purchases as % of sales') + '</div>' +
      A.receiptsButton('purchase') + '<div class="section-title">Last 60 days</div>' + billList(rows);
    A.bindReceipts(el);
    $$('[data-bill]', el).forEach(function (b) { b.onclick = function () { A.go('purchase-add', { id: b.dataset.bill }); }; });
  } });
  A.screen('purchase-add', { title: 'Purchase bill', crumb: 'Accounts › Purchases', back: 'purchases', render: function (el, st) {
    var e = st && st.id ? api.get('entries', st.id) : null;
    var cats = api.storeCategories();
    el.innerHTML = '<div class="card"><div class="section-title">Bill photo or file</div><div id="pa-att"></div>' +
      '<div class="grid2">' + A.field('Supplier', A.input('pa-vendor', 'text', e ? e.vendor : '')) + A.field('Bill number', A.input('pa-bill', 'text', e ? e.billNo : '')) +
      A.field('Bill date', A.input('pa-date', 'date', e ? e.date : A.today())) + A.field('Total ₹', A.input('pa-total', 'number', e ? e.amount : '', 'min="0"')) +
      A.field('Store category', '<select id="pa-cat">' + A.opt(cats, e ? e.storeCategory : (st && st.cat) || cats[0]) + '</select>') +
      A.field('Paid by', '<select id="pa-paid">' + A.opt([{ value: 'Credit', text: 'Credit (pay later)' }, 'Cash', 'UPI', 'Card', 'Bank transfer'], e ? e.method : 'Credit') + '</select>') +
      '<label class="f full">Note' + A.input('pa-note', 'text', e ? e.note : '') + '</label></div>' + staffPick('pa-staff', e ? e.staffId : undefined) + '<div id="pa-check"></div>' +
      '<div class="row"><button type="button" class="btn primary grow" id="pa-save">Save bill</button>' + (e ? '<button type="button" class="btn danger" id="pa-del">Delete</button>' : '') + '</div></div>';
    var att = A.files.attach($('#pa-att', el), { files: e ? e.files : [], read: 'bill', label: 'Photo of bill', onRead: function (o) {
      if (o.vendor) $('#pa-vendor', el).value = o.vendor; if (o.billNo) $('#pa-bill', el).value = o.billNo;
      if (o.date) $('#pa-date', el).value = o.date; if (o.total) $('#pa-total', el).value = o.total; check();
    } });
    function check() {
      var v = A.val('pa-vendor', el).toLowerCase(), b = A.val('pa-bill', el).toLowerCase();
      var dup = v && b ? api.list('entries', { type: 'purchase' }).rows.filter(function (x) { return x.id !== (e && e.id) && (x.vendor || '').toLowerCase() === v && (x.billNo || '').toLowerCase() === b; })[0] : null;
      $('#pa-check', el).innerHTML = dup ? '<div class="banner">This supplier\'s bill #' + esc(dup.billNo) + ' was already saved on ' + esc(A.niceDate(dup.date, true)) + '.</div>' : '';
    }
    ['pa-vendor', 'pa-bill'].forEach(function (id) { $('#' + id, el).oninput = check; }); check();
    $('#pa-save', el).onclick = function () {
      if (A.act(function () { return api.saveEntry({ id: e ? e.id : undefined, type: 'purchase', vendor: A.val('pa-vendor', el), billNo: A.val('pa-bill', el), date: A.val('pa-date', el), amount: A.val('pa-total', el),
        storeCategory: A.val('pa-cat', el), method: A.val('pa-paid', el), note: A.val('pa-note', el), files: att.files(), source: e ? e.source : 'bill',
        staffId: staffOf('pa-staff', el).staffId, staffName: staffOf('pa-staff', el).staffName, time: e ? e.time : (A.val('pa-date', el) === A.today() ? nowTime() : '') }); }, 'Bill saved')) A.go(st && st.cat ? 'store-cat' : 'purchases', { cat: st && st.cat });
    };
    var del = $('#pa-del', el); if (del) del.onclick = function () { A.confirmSheet('Delete this bill?', 'Delete', true).then(function (ok) { if (ok && A.act(function () { return api.removeEntry(e.id); }, 'Deleted')) A.go('purchases'); }); };
  } });

  // ---------------------------------------------------------------- Expenses (variable, maintenance, sudden, fixed)
  var KL = { variable: 'Variable expenses', maintenance: 'Maintenance', sudden: 'Sudden / miscellaneous', fixed: 'Fixed costs' };
  ['variable', 'maintenance', 'sudden'].forEach(function (kind) {
    A.screen('exp-' + kind, { title: KL[kind], crumb: 'Accounts', back: 'accounts', render: function (el) {
      var t = A.today(), rows = api.list('entries', { type: 'expense', from: R.addDays(t, -59), to: t, sort: '-at' }).rows.filter(function (e) { return e.kind === kind; });
      var m = rows.filter(function (e) { return e.date >= t.slice(0, 8) + '01'; }).reduce(function (a, e) { return a + e.amount; }, 0);
      el.innerHTML = '<a class="btn primary upload block" href="#exp-add" id="ex-add">📷 Upload bill / add ' + esc(KL[kind].toLowerCase()) + '</a>' + eg(kind) +
        (kind === 'sudden' ? '<p class="muted small">Every sudden expense appears in Reports → Alerts for review. A reason is required.</p>' : '') +
        '<div class="today-strip">' + stat('This month', money(m)) + stat('Entries (60 days)', String(rows.length)) + '</div>' + A.receiptsButton(kind) +
        (rows.length ? '<ul class="list">' + rows.map(function (e) {
          return '<li><button type="button" class="item" data-x="' + e.id + '"><div class="t"><b>' + esc(e.category || 'Other') + '</b><span>' + esc(A.niceDate(e.date) + (e.vendor ? ' · ' + e.vendor : '') + (e.note ? ' · ' + e.note : '') + (e.files && e.files.length ? ' · 📷 ' + e.files.length : '')) + '</span></div><div class="end">' + money(e.amount) + '</div></button></li>';
        }).join('') + '</ul>' : A.empty('Nothing yet', ''));
      A.bindReceipts(el);
      $('#ex-add', el).onclick = function (ev) { ev.preventDefault(); A.go('exp-add', { kind: kind }); };
      $$('[data-x]', el).forEach(function (b) { b.onclick = function () { A.go('exp-add', { kind: kind, id: b.dataset.x }); }; });
    } });
  });
  A.screen('exp-add', { title: function () { return 'Expense'; }, crumb: 'Accounts', back: 'accounts', render: function (el, st) {
    var kind = (st && st.kind) || 'variable', e = st && st.id ? api.get('entries', st.id) : null;
    var ex = api.kinds().examples[kind];
    var cat = e ? e.category : (st && st.category) || '';
    el.innerHTML = '<div class="card"><h2>' + esc(KL[kind]) + '</h2>' +
      A.field('What for (examples)', A.seg('xa-cat', ex.map(function (c) { return [c, 'e.g. ' + c]; }), cat)) + A.field('Or type it', A.input('xa-cat2', 'text', ex.indexOf(cat) < 0 ? cat : '')) +
      '<div class="section-title">Bill / voucher</div><div id="xa-att"></div>' +
      '<div class="grid2">' + A.field(kind === 'fixed' ? 'Amount for the month ₹' : 'Amount ₹', A.input('xa-amt', 'number', e ? e.amount : '', 'min="0"')) +
      (kind === 'fixed' ? A.field('For month', A.input('xa-month', 'month', e ? e.month : (st && st.month) || monthOf())) : A.field('Date', A.input('xa-date', 'date', e ? e.date : A.today()))) +
      A.field('Paid to', A.input('xa-to', 'text', e ? e.vendor : '')) + A.field('Paid by', '<select id="xa-paid">' + A.opt(['Cash', 'UPI', 'Card', 'Bank transfer', 'Credit'], e ? e.method : 'Cash') + '</select>') +
      '<label class="f full">' + (kind === 'sudden' ? 'Reason (required)' : 'Note') + A.input('xa-note', 'text', e ? e.note : '') + '</label></div>' + (kind === 'fixed' ? '' : staffPick('xa-staff', e ? e.staffId : undefined)) +
      '<div class="row"><button type="button" class="btn primary grow" id="xa-save">Save</button>' + (e ? '<button type="button" class="btn danger" id="xa-del">Delete</button>' : '') + '</div></div>';
    A.onSeg($('#xa-cat', el), function (v) { cat = v; $('#xa-cat2', el).value = ''; });
    var att = A.files.attach($('#xa-att', el), { files: e ? e.files : [], read: 'bill', label: 'Photo of bill', onRead: function (o) {
      if (o.total) $('#xa-amt', el).value = o.total; if (o.vendor) $('#xa-to', el).value = o.vendor; if (o.date && $('#xa-date', el)) $('#xa-date', el).value = o.date;
    } });
    $('#xa-save', el).onclick = function () {
      var c = A.val('xa-cat2', el).trim() || cat;
      var month = kind === 'fixed' ? A.val('xa-month', el) : '';
      if (A.act(function () { return api.saveEntry({ id: e ? e.id : undefined, type: 'expense', kind: kind, category: c, amount: A.val('xa-amt', el), month: month, date: kind === 'fixed' ? (month ? month + '-01' : A.today()) : A.val('xa-date', el),
        vendor: A.val('xa-to', el), method: A.val('xa-paid', el), note: A.val('xa-note', el), files: att.files(),
        staffId: staffOf('xa-staff', el).staffId, staffName: staffOf('xa-staff', el).staffName, time: e ? e.time : (kind !== 'fixed' && A.val('xa-date', el) === A.today() ? nowTime() : '') }); }, 'Saved')) A.go(kind === 'fixed' ? 'fixed' : 'exp-' + kind, { month: month });
    };
    var del = $('#xa-del', el); if (del) del.onclick = function () { A.confirmSheet('Delete this expense?', 'Delete', true).then(function (ok) { if (ok && A.act(function () { return api.removeEntry(e.id); }, 'Deleted')) A.go(kind === 'fixed' ? 'fixed' : 'exp-' + kind); }); };
  } });

  // ---------------------------------------------------------------- Fixed costs
  A.screen('fixed', { title: 'Fixed costs', crumb: 'Accounts', back: 'accounts', render: function (el, st) {
    var ym = (st && st.month) || monthOf(), mf = api.monthlyFixed(ym), dim = A.Base && window.BizAccounts ? window.BizAccounts.daysInMonth(ym) : 30;
    var entered = api.list('entries', { type: 'expense' }).rows.filter(function (e) { return e.kind === 'fixed' && e.month === ym && e.category !== 'Salaries'; });
    el.innerHTML = '<div class="card"><div class="row"><button type="button" class="btn small" id="fx-prev">‹</button><h2 class="grow" style="text-align:center">' + esc(monthName(ym)) + '</h2><button type="button" class="btn small" id="fx-next">›</button></div>' +
      '<div class="today-strip">' + stat('Fixed this month', money(mf.total)) + stat('Per day', money(mf.total / dim), '÷ ' + dim + ' days, counted in each day\'s profit') + '</div></div>' +
      '<ul class="list">' + mf.detail.map(function (d) {
        return '<li><button type="button" class="item" data-f="' + esc(d.name) + '"><div class="t"><b>' + esc(d.name) + '</b><span>' + (d.source === 'entered' ? 'Entered for this month' : d.source === 'usual' ? 'Usual amount (bill not entered yet)' : 'From the staff list') + '</span></div><div class="end">' + money(d.monthly) + '</div></button></li>';
      }).join('') + '</ul>' +
      '<a class="btn primary upload block" href="#exp-add" id="fx-add">📷 Upload fixed bill for ' + esc(monthName(ym)) + '</a>' + eg('fixed') + A.receiptsButton('fixed') + '<a class="btn ghost" href="#setup-fixed">Change usual monthly amounts</a>' +
      (entered.length ? '<div class="section-title">Bills entered</div><ul class="list">' + entered.map(function (e) { return '<li><button type="button" class="item" data-x="' + e.id + '"><div class="t"><b>' + esc(e.category) + '</b><span>' + esc((e.vendor || '') + (e.files && e.files.length ? ' · 📷 ' + e.files.length : '')) + '</span></div><div class="end">' + money(e.amount) + '</div></button></li>'; }).join('') + '</ul>' : '');
    A.bindReceipts(el);
    $('#fx-prev', el).onclick = function () { A.go('fixed', { month: shiftMonth(ym, -1) }); };
    $('#fx-next', el).onclick = function () { A.go('fixed', { month: shiftMonth(ym, 1) }); };
    $('#fx-add', el).onclick = function (ev) { ev.preventDefault(); A.go('exp-add', { kind: 'fixed', month: ym }); };
    $$('[data-f]', el).forEach(function (b) { b.onclick = function () { if (b.dataset.f === 'Salaries') A.go('salaries', { month: ym }); else A.go('exp-add', { kind: 'fixed', month: ym, category: b.dataset.f }); }; });
    $$('[data-x]', el).forEach(function (b) { b.onclick = function () { A.go('exp-add', { kind: 'fixed', id: b.dataset.x }); }; });
  } });

  // ---------------------------------------------------------------- Salaries
  A.screen('salaries', { title: 'Salaries', crumb: 'Accounts', back: 'accounts', render: function (el, st) {
    var ym = (st && st.month) || monthOf(), rows = api.salaries(ym);
    el.innerHTML = '<div class="card"><div class="row"><button type="button" class="btn small" id="sy-prev">‹</button><h2 class="grow" style="text-align:center">' + esc(monthName(ym)) + '</h2><button type="button" class="btn small" id="sy-next">›</button></div>' +
      eg('salaries') + '<p class="muted small">Salaries are a fixed cost: the month\'s total is spread over its days in Profit & Loss. Advances are kept separately under Staff advances.</p>' +
      (rows.length ? '<ul class="list">' + rows.map(function (r, i) {
        return '<li class="item"><div class="t"><b>' + esc(r.name) + '</b><span>' + esc((r.role || '') + ' · monthly ' + money(r.salary)) + '</span></div><input type="number" inputmode="decimal" min="0" style="max-width:120px" data-sal="' + i + '" value="' + esc(r.paid || r.salary || '') + '" aria-label="Paid to ' + esc(r.name) + '">' + (r.paid ? '<span class="pill good">paid</span>' : '') + '</li>';
      }).join('') + '</ul>' : A.empty('No staff yet', 'Add staff under the Staff header first.', '<a class="btn primary" href="#staff-edit">Add staff</a>')) +
      (rows.length ? '<div class="grid2">' + A.field('Paid on', A.input('sy-date', 'date', A.today())) + A.field('Paid by', '<select id="sy-paid">' + A.opt(['Cash', 'Bank transfer', 'UPI']) + '</select>') + '</div>' +
        '<div class="section-title">Salary sheet / receipts</div><div id="sy-att"></div><button type="button" class="btn primary block" id="sy-save">Save salaries for ' + esc(monthName(ym)) + '</button>' : '') + '</div>' + A.receiptsButton('salaries');
    A.bindReceipts(el);
    $('#sy-prev', el).onclick = function () { A.go('salaries', { month: shiftMonth(ym, -1) }); };
    $('#sy-next', el).onclick = function () { A.go('salaries', { month: shiftMonth(ym, 1) }); };
    if (!rows.length) return;
    var att = A.files.attach($('#sy-att', el), { files: rows[0].files || [], read: 'text', label: 'Photo of salary sheet' });
    $('#sy-save', el).onclick = function () {
      var files = att.files();
      var data = rows.map(function (r, i) { return { staffId: r.staffId, amount: $('[data-sal="' + i + '"]', el).value, paidOn: A.val('sy-date', el), method: A.val('sy-paid', el), files: files }; });
      if (A.act(function () { return api.saveSalaries({ month: ym, rows: data }); }, 'Salaries saved')) A.render();
    };
  } });

  // ---------------------------------------------------------------- Cash in hand
  A.screen('cash', { title: 'Cash in hand', crumb: 'Accounts', back: 'accounts', render: function (el) {
    var t = A.today(), d0 = deps()[0];
    if (!d0) { el.innerHTML = A.empty('Add a sales department first', '', '<a class="btn primary" href="#setup-depts">Departments</a>'); return; }
    var row = api.getDailySheet(t, '').filter(function (r) { return r.departmentId === d0.id; })[0] || {};
    var ins = api.reviewInsights({ from: R.addDays(t, -13), to: t });
    var days = ins.byDay.filter(function (d) { return d.cashCounted !== undefined; }).reverse();
    el.innerHTML = '<div class="card"><p class="muted small">Count the cash at closing. Expected = yesterday\'s count + cash received − cash paid out − cash deposited.</p><div class="grid2">' +
      A.field('Date', A.input('ch-date', 'date', t)) + A.field('Cash counted ₹', A.input('ch-count', 'number', row.cashInHand === undefined ? '' : row.cashInHand, 'min="0"')) +
      A.field('Deposited / taken out ₹', A.input('ch-dep', 'number', row.deposit || '', 'min="0"')) + '</div><button type="button" class="btn primary block" id="ch-save">Save</button></div>' +
      '<div class="section-title">Last 14 days</div>' + (days.length ? '<div class="card"><div class="tw"><table><thead><tr><th>Day</th><th class="n">Expected</th><th class="n">Counted</th><th class="n">Difference</th></tr></thead><tbody>' + days.map(function (d) {
        return '<tr><td>' + esc(A.niceDate(d.date)) + '</td><td class="n">' + (d.cashExpected === undefined ? '–' : money(d.cashExpected)) + '</td><td class="n">' + money(d.cashCounted) + '</td><td class="n ' + (d.cashDiff < -1 ? 'down' : '') + '">' + (d.cashDiff === undefined ? '–' : (d.cashDiff > 0 ? '+' : '') + money(d.cashDiff)) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' : A.empty('No counts yet', ''));
    $('#ch-save', el).onclick = function () {
      var date = A.val('ch-date', el);
      if (A.act(function () { var r = api.getDailySheet(date, '').filter(function (x) { return x.departmentId === d0.id; })[0] || { departmentId: d0.id }; r.cashInHand = A.val('ch-count', el); r.deposit = A.val('ch-dep', el); return api.saveDailySheet({ date: date, half: '', rows: [r] }); }, 'Saved')) A.render();
    };
  } });

  // ---------------------------------------------------------------- Profit & Loss
  var plState = { period: 'month', from: '', to: '', dep: '' };
  function plRange() {
    var t = A.today(), d = new Date();
    switch (plState.period) {
      case 'today': return [t, t];
      case 'yesterday': return [R.addDays(t, -1), R.addDays(t, -1)];
      case '7': return [R.addDays(t, -6), t];
      case 'lastmonth': { var f = new Date(d.getFullYear(), d.getMonth() - 1, 1), l = new Date(d.getFullYear(), d.getMonth(), 0); return [A.Base.localDate(f), A.Base.localDate(l)]; }
      case 'custom': return [plState.from || t.slice(0, 8) + '01', plState.to || t];
      default: return [t.slice(0, 8) + '01', t];
    }
  }
  A.screen('pl', { title: 'Profit & Loss', crumb: 'Accounts', back: 'accounts', render: function (el) {
    var r = plRange(), pl = api.profitLoss({ from: r[0], to: r[1], departmentId: plState.dep });
    var line = function (l, v, cls) { return '<tr class="' + (cls || '') + '"><td>' + l + '</td><td class="n">' + money(v) + '</td></tr>'; };
    el.innerHTML = '<div class="card">' + A.seg('pl-p', [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', '7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Pick dates']], plState.period) +
      (plState.period === 'custom' ? '<div class="grid2">' + A.field('From', A.input('pl-from', 'date', r[0])) + A.field('To', A.input('pl-to', 'date', r[1])) + '</div>' : '') +
      A.field('Department', '<select id="pl-dep">' + A.opt(deps().map(function (d) { return { value: d.id, text: d.name }; }), plState.dep, 'Whole business') + '</select>') + '</div>' +
      '<div class="card"><p class="muted small">' + esc(A.niceDate(r[0], true) + ' – ' + A.niceDate(r[1], true) + ' · ' + pl.days + ' day(s)') + '</p><div class="tw"><table class="stmt"><tbody>' +
      line('Sales', pl.sales) + line('− Purchases', pl.purchases) + line('= Gross profit', pl.gross, 'tot') +
      line('− Variable expenses', pl.variable) + line('− Maintenance', pl.maintenance) + line('− Sudden / miscellaneous', pl.sudden) +
      line('− Fixed costs for ' + pl.days + ' day(s)', pl.fixed) +
      pl.fixedMonths.map(function (m) { return '<tr class="sub"><td colspan="2">' + esc(monthName(m.month)) + ': ' + money(m.total) + ' a month ÷ ' + window.BizAccounts.daysInMonth(m.month) + ' days = ' + money(m.perDay) + ' a day</td></tr>'; }).join('') +
      line('= Net profit', pl.net, 'tot') + '</tbody></table></div>' +
      '<div class="row">' + (pl.margin !== null ? '<span class="pill ' + (pl.net < 0 ? 'bad' : 'good') + '">' + A.pct(pl.margin) + ' of sales</span>' : '') +
      (pl.purchasePct !== null ? '<span class="pill">Purchases ' + A.pct(pl.purchasePct) + ' of sales</span>' : '') + (pl.purchasePct4w !== null ? '<span class="pill ink">4-week average ' + A.pct(pl.purchasePct4w) + '</span>' : '') + '</div></div>' +
      (pl.perDay.length > 1 ? '<div class="card"><h2>Day by day</h2>' + A.barChart(pl.perDay.map(function (d) { return { a: d.sales, b: d.purchases + d.variable + d.maintenance + d.sudden + d.fixed, label: d.date, tick: d.date.slice(8) }; }), { two: true, la: 'Sales', lb: 'All costs', aria: 'Sales and costs' }) +
        '<div class="tw"><table><thead><tr><th>Day</th><th class="n">Sales</th><th class="n">Purchases</th><th class="n">Expenses</th><th class="n">Fixed share</th><th class="n">Net</th></tr></thead><tbody>' +
        pl.perDay.slice().reverse().map(function (d) { return '<tr><td>' + esc(A.niceDate(d.date)) + '</td><td class="n">' + money(d.sales) + '</td><td class="n">' + money(d.purchases) + '</td><td class="n">' + money(d.variable + d.maintenance + d.sudden) + '</td><td class="n">' + money(d.fixed) + '</td><td class="n ' + (d.net < 0 ? 'down' : '') + '">' + money(d.net) + '</td></tr>'; }).join('') +
        '</tbody></table></div></div>' : '') +
      '<div class="card"><h2>Sales by department</h2>' + list2(pl.salesByDept) + '<h2>Purchases by store category</h2>' + list2(pl.purchasesByCategory) + '<h2>Expenses</h2>' + list2(pl.expensesByCategory) + '</div>';
    A.onSeg($('#pl-p', el), function (v) { plState.period = v; A.render(); });
    var f = $('#pl-from', el); if (f) { f.onchange = function (e) { plState.from = e.target.value; A.render(); }; $('#pl-to', el).onchange = function (e) { plState.to = e.target.value; A.render(); }; }
    $('#pl-dep', el).onchange = function (e) { plState.dep = e.target.value; A.render(); };
  } });
  function list2(rows) { return rows.length ? '<ul class="list">' + rows.map(function (x) { return '<li class="item"><div class="t"><b style="font-weight:500">' + esc(x.name) + '</b></div><div class="end">' + money(x.amount) + '</div></li>'; }).join('') + '</ul>' : '<p class="muted small">None.</p>'; }

  // ================================================================ STORE
  A.screen('store', { title: 'Store', crumb: 'Header', back: 'home', render: function (el) {
    var t = A.today(), cats = api.storeCategories();
    var sumCat = function (c, from, to) { return api.list('entries', { type: 'purchase', from: from, to: to }).rows.filter(function (e) { return (e.storeCategory || '') === c; }).reduce(function (a, e) { return a + e.amount; }, 0); };
    el.innerHTML = '<a class="btn primary upload block" href="#purchase-add">📷 Upload store bill (photo / file)</a><p class="muted small">Only bills are kept here, no item-by-item stock. Each category shows this week against the 4-week average.</p>' +
      '<ul class="feats">' + cats.map(function (c) {
        var wk = sumCat(c, R.addDays(t, -6), t), avg = sumCat(c, R.addDays(t, -34), R.addDays(t, -7)) / 4;
        return '<li><a class="feat" href="#store-cat" data-cat="' + esc(c) + '"><span class="ic">▦</span><span class="t"><b>' + esc(c) + '</b><span>4-week average ' + money(avg) + ' a week</span></span><span class="fig ' + (avg && wk > avg * 1.3 ? 'down' : '') + '">' + money(wk) + '</span></a></li>';
      }).join('') + '</ul><a class="btn ghost" href="#setup-store">Rename or add store categories</a>';
    $$('[data-cat]', el).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); A.go('store-cat', { cat: a.dataset.cat }); }; });
  } });
  A.screen('store-cat', { title: function () { return 'Store'; }, crumb: 'Store', back: 'store', render: function (el, st) {
    var cat = st && st.cat; if (!cat) { A.go('store'); return; }
    var t = A.today(), rows = api.list('entries', { type: 'purchase', from: R.addDays(t, -89), to: t, sort: '-at' }).rows.filter(function (e) { return (e.storeCategory || '') === cat; });
    var wk = rows.filter(function (e) { return e.date > R.addDays(t, -7); }).reduce(function (a, e) { return a + e.amount; }, 0);
    var lw = rows.filter(function (e) { return e.date > R.addDays(t, -14) && e.date <= R.addDays(t, -7); }).reduce(function (a, e) { return a + e.amount; }, 0);
    el.innerHTML = '<h2>' + esc(cat) + '</h2><div class="today-strip">' + stat('This week', money(wk)) + stat('Last week', money(lw)) + '</div>' +
      '<button type="button" class="btn primary upload block" id="sc-add">📷 Upload ' + esc(cat) + ' bill (photo / file)</button>' + A.receiptsButton('purchase', cat) + billList(rows);
    A.bindReceipts(el);
    $('#sc-add', el).onclick = function () { A.go('purchase-add', { cat: cat }); };
    $$('[data-bill]', el).forEach(function (b) { b.onclick = function () { A.go('purchase-add', { id: b.dataset.bill, cat: cat }); }; });
  } });

  // ================================================================ STAFF
  A.screen('staff', { title: 'Staff', crumb: 'Header', back: 'home', render: function (el) {
    var rows = api.list('staff', { sort: 'name' }).rows, ym = monthOf();
    var sal = api.salaries(ym);
    var att = api.attendanceDay(A.today()), here = att.filter(function (x) { return x.status === 'present' || x.status === 'half'; }).length, adv = api.advanceBalances();
    el.innerHTML = '<ul class="feats">' +
      feat('attendance', '✓', 'Attendance', 'From bills each person writes · mark the rest', here + ' of ' + att.length + ' present today') +
      feat('advances', '⇄', 'Staff advances', api.kinds().featureExamples.advances, money(adv.outstanding) + ' to recover') +
      feat('salaries', '◎', 'Salaries', 'Pay for ' + monthName(ym)) + '</ul>' +
      '<div class="row"><a class="btn primary grow" href="#staff-edit">＋ Add staff</a></div>' +
      (rows.length ? '<ul class="list">' + rows.map(function (s) {
        var p = sal.filter(function (x) { return x.staffId === s.id; })[0];
        return '<li><button type="button" class="item" data-s="' + s.id + '"><div class="t"><b>' + esc(s.name) + (s.active === false ? ' (left)' : '') + '</b><span>' + esc([s.role, s.phone, 'monthly ' + money(s.salary), (s.files || []).length ? '📎 ' + s.files.length : ''].filter(Boolean).join(' · ')) + '</span></div>' + (p && p.paid ? '<span class="pill good">paid</span>' : '<span class="pill">not paid</span>') + '</button></li>';
      }).join('') + '</ul>' : A.empty('No staff yet', 'Add the people who work here; their salaries feed Profit & Loss.'));
    $$('[data-s]', el).forEach(function (b) { b.onclick = function () { A.go('staff-edit', { id: b.dataset.s }); }; });
  } });
  A.screen('staff-edit', { title: 'Staff member', crumb: 'Staff', back: 'staff', render: function (el, st) {
    var s = st && st.id ? api.get('staff', st.id) : null;
    el.innerHTML = '<div class="card"><div class="grid2">' + A.field('Name', A.input('se-name', 'text', s ? s.name : '')) + A.field('Role', A.input('se-role', 'text', s ? s.role : '', 'placeholder="Cook, cashier, pharmacist…"')) +
      A.field('Phone', A.input('se-phone', 'tel', s ? s.phone : '')) + A.field('Monthly salary ₹', A.input('se-sal', 'number', s ? s.salary : '', 'min="0"')) + '</div>' +
      '<div class="section-title">ID proof and documents</div><div id="se-att"></div>' +
      (s ? '<label class="chk"><input type="checkbox" id="se-act"' + (s.active !== false ? ' checked' : '') + '> Still working here</label>' : '') +
      '<div class="row"><button type="button" class="btn primary grow" id="se-save">Save</button>' + (s ? '<button type="button" class="btn danger" id="se-del">Remove</button>' : '') + '</div></div>';
    var att = A.files.attach($('#se-att', el), { files: s ? s.files : [], read: 'card', label: 'Photo of ID', onRead: function (o) { if (o.name && !A.val('se-name', el)) $('#se-name', el).value = o.name; if (o.phone && !A.val('se-phone', el)) $('#se-phone', el).value = o.phone; } });
    $('#se-save', el).onclick = function () {
      if (A.act(function () { return api.saveStaff({ id: s ? s.id : undefined, name: A.val('se-name', el), role: A.val('se-role', el), phone: A.val('se-phone', el), salary: A.val('se-sal', el), active: $('#se-act', el) ? $('#se-act', el).checked : true, files: att.files() }); }, 'Saved')) A.go('staff');
    };
    var del = $('#se-del', el); if (del) del.onclick = function () { A.confirmSheet('Remove ' + s.name + '?', 'Remove', true).then(function (ok) { if (ok && A.act(function () { return api.removeStaff(s.id); }, 'Removed')) A.go('staff'); }); };
  } });
})();

/* Receipts: look up every photo / file saved in a feature (sales, purchases, each expense kind,
 * salaries, fixed costs) or across all of Accounts. */
(function () {
  'use strict';
  var A = window.App, api = A.api, $ = A.$, $$ = A.$$, esc = A.esc, money = A.money, R = A.R;
  var SCOPES = {
    all: 'All receipts', sales: 'Sales receipts', purchase: 'Purchase bills', salaries: 'Salary receipts', fixed: 'Fixed cost bills',
    variable: 'Variable expense receipts', maintenance: 'Maintenance receipts', sudden: 'Sudden expense receipts'
  };
  function matches(e, scope, cat) {
    if (!e.files || !e.files.length) return false;
    if (scope === 'all') return true;
    if (scope === 'sales') return e.type === 'sale';
    if (scope === 'purchase') return e.type === 'purchase' && (!cat || e.storeCategory === cat);
    if (scope === 'salaries') return e.type === 'expense' && e.category === 'Salaries';
    if (scope === 'fixed') return e.type === 'expense' && e.kind === 'fixed' && e.category !== 'Salaries';
    return e.type === 'expense' && e.kind === scope;
  }
  function receiptEntries(scope, cat, from) {
    return api.list('entries', { from: from || '', sort: '-at' }).rows.filter(function (e) { return matches(e, scope, cat); });
  }
  // a small button that shows how many receipts a feature has and opens them
  A.receiptsButton = function (scope, cat) {
    var n = receiptEntries(scope, cat).length;
    return '<a class="btn block" href="#receipts" data-receipts="' + scope + '"' + (cat ? ' data-cat="' + esc(cat) + '"' : '') + '>🧾 ' + esc(cat ? cat + ' bills' : SCOPES[scope]) + ' (' + n + ')</a>';
  };
  A.bindReceipts = function (el) {
    $$('[data-receipts]', el).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); A.go('receipts', { scope: a.dataset.receipts, cat: a.dataset.cat || '' }); }; });
  };
  var rs = { days: 30, q: '', dep: '' };
  A.screen('receipts', { title: 'Receipts', crumb: 'Accounts', back: 'accounts', render: function (el, st) {
    var scope = (st && st.scope) || 'all', cat = (st && st.cat) || '';
    if (rs.key !== scope + '|' + cat) { rs.key = scope + '|' + cat; rs.q = ''; rs.dep = ''; }   // new list: start without a search
    var from = rs.days ? R.addDays(A.today(), -(rs.days - 1)) : '';
    var deps = api.list('departments', { sort: 'order' }).rows;
    var rows = receiptEntries(scope, cat, from).filter(function (e) {
      if (rs.dep && e.departmentId !== rs.dep) return false;
      if (!rs.q) return true;
      var q = rs.q.toLowerCase();
      return [e.vendor, e.billNo, e.category, e.storeCategory, e.note, e.departmentName, e.staffName].concat(e.files.map(function (f) { return f.name + ' ' + (f.text || ''); }))
        .some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    });
    var total = rows.reduce(function (a, e) { return a + e.amount; }, 0);
    el.innerHTML = '<h2>' + esc(cat ? cat + ' bills' : SCOPES[scope]) + '</h2>' +
      '<div class="card">' + A.seg('rc-days', [[7, '7 days'], [30, '30 days'], [90, '90 days'], [0, 'All']], rs.days) +
      (scope === 'sales' || scope === 'all' ? A.field('Department', '<select id="rc-dep">' + A.opt(deps.map(function (d) { return { value: d.id, text: d.name }; }), rs.dep, 'All departments') + '</select>') : '') +
      A.input('rc-q', 'search', rs.q, 'placeholder="Search supplier, bill no, text in the photo…"') + '</div>' +
      '<p class="muted small">' + rows.length + ' receipt(s) · ' + money(total) + '</p>' +
      (rows.length ? '<ul class="list">' + rows.map(function (e) {
        var title = e.type === 'sale' ? (e.departmentName || 'Sales') + (e.half ? ' · ' + (e.half === 'first' ? 'morning' : 'evening') : '')
          : e.type === 'purchase' ? (e.vendor || 'Supplier') + (e.billNo ? ' #' + e.billNo : '') : (e.staffName || e.category || 'Expense');
        var sub = A.niceDate(e.date, true) + ' · ' + (e.type === 'sale' ? 'Sales' : e.type === 'purchase' ? (e.storeCategory || 'Purchase') : (A.api.kinds().labels[e.kind] || 'Expense') + (e.vendor ? ' · ' + e.vendor : ''));
        return '<li class="card" style="gap:8px"><button type="button" class="item" data-open="' + e.id + '" style="border:0;padding:0"><div class="t"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div><div class="end">' + money(e.amount) + '</div></button>' +
          '<div class="thumbs">' + e.files.map(function (f, i) {
            return '<div class="thumb"><button type="button" class="tview" data-view="' + e.id + ':' + i + '" aria-label="Open ' + esc(f.name) + '">' + (/^image\//.test(f.type) ? '<img data-img="' + esc(f.id) + '" alt="">' : '<span class="fic">' + (/pdf/.test(f.type) ? 'PDF' : 'FILE') + '</span>') + '</button><span class="tname">' + esc(f.name) + '</span></div>';
          }).join('') + '</div></li>';
      }).join('') + '</ul>' : A.empty('No receipts here yet', 'Photos and files you attach when entering ' + (scope === 'all' ? 'accounts' : SCOPES[scope].toLowerCase()) + ' appear here.'));
    $$('[data-img]', el).forEach(function (im) { A.files.get(im.dataset.img).then(function (r) { if (r) im.src = r.data; }); });
    var byId = {}; rows.forEach(function (e) { byId[e.id] = e; });
    $$('[data-view]', el).forEach(function (b) { b.onclick = function () { var p = b.dataset.view.split(':'); A.files.view(byId[p[0]].files[+p[1]]); }; });
    $$('[data-open]', el).forEach(function (b) {
      b.onclick = function () {
        var e = byId[b.dataset.open];
        if (e.type === 'sale') A.go('sale-add', { dep: e.departmentId, date: e.date, half: e.half });
        else if (e.type === 'purchase') A.go('purchase-add', { id: e.id });
        else if (e.category === 'Salaries') A.go('salaries', { month: e.month });
        else A.go('exp-add', { kind: e.kind, id: e.id });
      };
    });
    A.onSeg($('#rc-days', el), function (v) { rs.days = +v; A.go('receipts', { scope: scope, cat: cat }); });
    var dp = $('#rc-dep', el); if (dp) dp.onchange = function (e) { rs.dep = e.target.value; A.go('receipts', { scope: scope, cat: cat }); };
    $('#rc-q', el).onchange = function (e) { rs.q = e.target.value; A.go('receipts', { scope: scope, cat: cat }); };
  } });
})();
