/* BizCore review screens: Overview, Daily numbers, Scan receipts, All entries,
 * Spot check & insights, Departments. Uses the building blocks app.js exposes
 * on window.BizApp and the review engine (core/review.js). */
(function () {
  'use strict';
  var A = window.BizApp, R = window.BizReview, OCRParse = window.BizOCRParse;
  if (!A || !R) return;
  var $ = A.$, $$ = A.$$, esc = A.esc, money = A.money, api = A.api;
  var TL = R.TYPE_LABELS;

  // Navigation entries go first in the menu.
  A.NAV.unshift(
    { key: 'overview', icon: '◧', text: 'Overview' },
    { key: 'daily', icon: '✎', text: 'Daily numbers' },
    { key: 'scan', icon: '⎙', text: 'Scan receipts' },
    { key: 'stock', icon: '▤', text: 'Stock' },
    { key: 'vault', icon: '♢', text: 'Customer vault' },
    { key: 'review', icon: '⌕', text: 'Spot check' },
    { key: 'entries', icon: '≡', text: 'All entries' },
    { key: 'departments', icon: '▦', text: 'Departments' },
    { key: 'guide', icon: '?', text: 'Guide' }
  );

  // ------------------------------------------------------------ helpers
  function deps() { return api.call('list', 'departments', { sort: 'order' }).then(function (r) { return r.rows; }); }
  function activeDeps(list) { return list.filter(function (d) { return d.active !== false; }); }
  function pctTxt(v) { return v === null || v === undefined ? '–' : (Math.round(v * 10) / 10) + '%'; }
  function shortDate(d) {
    var p = d.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    try { return dt.toLocaleDateString(A.S.locale || 'en-IN', { day: 'numeric', month: 'short' }); } catch (e) { return d; }
  }
  function halfTxt(h) { return h === 'first' ? 'First half' : h === 'second' ? 'Second half' : 'Full day'; }
  function sevPill(s) { return '<span class="pill ' + (s === 'high' ? 'bad' : s === 'medium' ? 'warn' : 'ink') + '">' + (s === 'high' ? 'Check now' : s === 'medium' ? 'Look into' : 'Note') + '</span>'; }
  function typePill(t) {
    var cls = { sale: 'good', collection: 'good', expense: 'warn', purchase: 'ink', received: 'ink', wastage: 'bad', misc: '', supply: 'ink', stock: '' }[t] || '';
    return '<span class="pill ' + cls + '">' + esc(TL[t] || t) + '</span>';
  }
  function costCats() { return (A.P.review && A.P.review.costCategories) || []; }
  function delta(cur, base, goodWhenUp) {
    if (base === null || base === undefined || cur === null || cur === undefined || !base) return '';
    var d = (cur - base) / Math.abs(base) * 100;
    if (Math.abs(d) < 1) return '<span class="delta">same as usual</span>';
    var up = d > 0, good = goodWhenUp ? up : !up;
    return '<span class="delta ' + (good ? 'good' : 'bad') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(Math.round(d)) + '% vs usual</span>';
  }
  function flagList(flags, limit) {
    if (!flags.length) return A.emptyState('Nothing unusual found', 'Collections, prices, deliveries and wastage look normal for this selection.');
    return '<ul class="flags">' + flags.slice(0, limit || 999).map(function (f) {
      return '<li class="flag ' + f.severity + '">' + sevPill(f.severity) + '<div><b>' + esc(f.title) + '</b><div class="muted">' + esc(f.detail) + '</div></div></li>';
    }).join('') + '</ul>' + (limit && flags.length > limit ? '<p class="muted">' + (flags.length - limit) + ' more on the Spot check screen.</p>' : '');
  }

  // Sales vs costs chart: two bars per day.
  function pairChart(days) {
    var W = 680, H = 200, padL = 52, padB = 26, padT = 12;
    var vals = days.map(function (d) { return { s: d.totals.sale, c: d.totals.expense + d.totals.purchase + d.totals.misc }; });
    var max = A.niceMax(Math.max.apply(null, vals.map(function (v) { return Math.max(v.s, v.c); }).concat([0])));
    var bw = (W - padL - 8) / Math.max(days.length, 1), g = '';
    [0, 0.5, 1].forEach(function (f) {
      var y = padT + (H - padT - padB) * (1 - f);
      g += '<line class="grid-line" x1="' + padL + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '"></line><text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + esc(A.short(max * f)) + '</text>';
    });
    days.forEach(function (d, i) {
      var v = vals[i], x = padL + i * bw;
      [['s', 'bar'], ['c', 'bar cost']].forEach(function (k, j) {
        var val = v[k[0]], h = max ? (H - padT - padB) * val / max : 0;
        g += '<rect class="' + k[1] + '" x="' + (x + bw * (0.12 + j * 0.38)).toFixed(1) + '" y="' + (H - padB - Math.max(h, val ? 1 : 0)).toFixed(1) + '" width="' + (bw * 0.36).toFixed(1) + '" height="' + Math.max(h, val ? 1 : 0).toFixed(1) + '" rx="2"><title>' + esc(d.date + ' · ' + (j ? 'Costs ' : 'Sales ') + money(val)) + '</title></rect>';
      });
      if (days.length <= 16 || i % Math.ceil(days.length / 12) === 0) g += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(days.length <= 8 ? shortDate(d.date) : d.date.slice(8)) + '</text>';
    });
    return '<div class="bars"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sales and costs by day">' + g + '</svg>' +
      '<div class="legend"><span><i class="sw ink"></i>Sales</span><span><i class="sw cost"></i>Costs (expenses + purchases + misc)</span></div></div>';
  }

  function deptTable(rows) {
    if (!rows.length) return A.emptyState('No department data');
    return '<div class="table-wrap"><table><thead><tr><th>Department</th><th class="num">Sales</th><th class="num">Collected</th><th class="num">Expenses</th><th class="num">Purchases</th><th class="num">Wastage</th><th class="num">Misc</th></tr></thead><tbody>' +
      rows.map(function (d) {
        var t = d.totals, r = d.ratios;
        return '<tr><td><b>' + esc(d.name) + '</b></td><td class="num">' + money(t.sale) + '</td><td class="num">' + money(t.collection) + (r.collection !== null ? ' <span class="pill ' + (r.collection < 100 - (A.S.collectionGapPct || 3) ? 'bad' : 'good') + '">' + pctTxt(r.collection) + '</span>' : '') + '</td>' +
          '<td class="num">' + money(t.expense) + '</td><td class="num">' + money(t.purchase) + '</td><td class="num">' + money(t.wastage) + (r.wastage !== null ? ' <span class="muted">' + pctTxt(r.wastage) + '</span>' : '') + '</td><td class="num">' + money(t.misc) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function tiles(res) {
    var t = res.totals, r = res.ratios, b = res.baseline, per = res.perDay, bper = b ? b.perDay : null;
    var list = [
      { l: 'Sales', v: money(t.sale), h: b ? delta(per.sale, bper.sale, true) : res.scope.activeDays + ' days with data' },
      { l: 'Collected', v: money(t.collection), h: pctTxt(r.collection) + ' of sales', cls: r.collection !== null && r.collection < 100 - (A.S.collectionGapPct || 3) ? 'danger' : '' },
      { l: 'Expenses', v: money(t.expense + t.misc), h: pctTxt(r.expense) + ' of sales' + (b ? ' · usual ' + pctTxt(b.ratios.expense) : '') },
      { l: 'Purchases', v: money(t.purchase), h: pctTxt(r.purchase) + ' of sales' + (b ? ' · usual ' + pctTxt(b.ratios.purchase) : '') },
      { l: 'Wastage', v: money(t.wastage), h: pctTxt(r.wastage) + ' of purchases', cls: r.wastage !== null && r.wastage > (A.S.wastageAlertPct || 5) ? 'alert' : '' },
      { l: 'Estimated profit', v: money(r.profit), h: r.margin !== null ? pctTxt(r.margin) + ' of sales' : '', cls: r.profit < 0 ? 'danger' : '' },
      { l: 'Fixed vs variable', v: money(t.fixed) + ' / ' + money(t.variable), h: pctTxt(r.fixedShare) + ' of expenses are fixed' }
    ];
    if (t.received) list.push({ l: 'Goods received', v: money(t.received), h: pctTxt(r.received) + ' of purchases', cls: r.received < 98 ? 'alert' : '' });
    return '<div class="tiles">' + list.map(function (x) {
      return '<div class="tile ' + (x.cls || '') + '"><span class="label">' + esc(x.l) + '</span><span class="value">' + esc(x.v) + '</span><span class="hint">' + x.h + '</span></div>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------ Overview
  var overviewDays = 30;
  A.PAGES.overview = function (view) {
    A.setTitle('Overview');
    var to = A.today(), from = R.addDays(to, -(overviewDays - 1));
    return api.call('reviewInsights', { from: from, to: to }).then(function (res) {
      if (!res.scope.entryCount && !api.__sampleOffered) {
        view.innerHTML = '<div class="panel stack"><h2>Start your review</h2><p class="muted" style="max-width:62ch">Enter each department\'s numbers for the day, or scan purchase and expense bills. BizCore then compares sales with collections, expenses, purchases, deliveries and wastage, and tells you what needs checking.</p>' +
          '<div class="row"><a class="btn primary" href="#daily">Enter today\'s numbers</a><a class="btn" href="#scan">Scan a receipt</a><button type="button" class="btn" id="ov-sample">Try with 30 days of example data</button></div></div>';
        $('#ov-sample', view).onclick = function () { api.call('loadReviewSamples').then(function () { A.toast('Example data added'); A.render(); }).catch(A.fail); };
        return;
      }
      view.innerHTML = '<div class="row"><div class="chips" id="ov-range">' + [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(function (x) {
          return '<button type="button" class="chip' + (x[0] === overviewDays ? ' on' : '') + '" data-days="' + x[0] + '">' + x[1] + '</button>';
        }).join('') + '</div><span class="spacer"></span><a class="btn" href="#daily">Enter numbers</a><a class="btn" href="#scan">Scan receipt</a><button type="button" class="btn primary" id="ov-spot">Spot-check 3 random days</button></div>' +
        tiles(res) +
        '<div class="grid grid-2"><div class="panel"><div class="panel-head"><h2>Things to check</h2><a class="btn sm" href="#review">Full review</a></div>' + flagList(res.flags, 8) + '</div>' +
        '<div class="panel"><div class="panel-head"><h2>In short</h2></div><ul class="summary">' + res.summary.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></div>' +
        kpiPanel(res.kpis) +
        '<div class="panel"><div class="panel-head"><h2>Sales and costs by day</h2></div>' + pairChart(res.byDay) + '</div>' +
        '<div class="panel"><div class="panel-head"><h2>Departments</h2><a class="btn sm" href="#departments">Manage</a></div>' + deptTable(res.byDepartment) + '</div>';
      $$('[data-days]', view).forEach(function (b) { b.onclick = function () { overviewDays = +b.dataset.days; A.render(); }; });
      $('#ov-spot', view).onclick = function () { reviewState.mode = 'random'; reviewState.count = 3; reviewState.seed = String(Date.now()); reviewState.run = true; A.go('review'); };
    });
  };

  // ------------------------------------------------------------ Daily numbers
  var dailyState = { date: '', half: '' };
  var SHEET_COLS = [
    ['sale', 'Sales (billed)'], ['cash', 'Collected: cash'], ['upi', 'Collected: UPI'], ['card', 'Collected: card'], ['otherCollection', 'Collected: other'],
    ['expense', 'Expenses'], ['purchase', 'Purchases'], ['received', 'Goods received'], ['wastage', 'Wastage'], ['misc', 'Miscellaneous']
  ];
  A.PAGES.daily = function (view) {
    A.setTitle('Daily numbers');
    if (!dailyState.date) dailyState.date = A.today();
    return api.call('getDailySheet', dailyState.date, dailyState.half).then(function (rows) {
      if (!rows.length) { view.innerHTML = A.emptyState('No departments yet', 'Add your departments first.', '<a class="btn primary sm" href="#departments">Add departments</a>'); return; }
      view.innerHTML = '<div class="panel stack"><div class="row"><label class="field" style="width:auto">Date<input type="date" id="dy-date" value="' + esc(dailyState.date) + '"></label>' +
        '<label class="field" style="width:auto">Part of day<select id="dy-half">' + A.opt([{ value: '', text: 'Full day' }, { value: 'first', text: 'First half (before ' + (A.S.halfDaySplit || '15:00') + ')' }, { value: 'second', text: 'Second half' }], dailyState.half) + '</select></label>' +
        '<span class="spacer"></span><span class="muted" style="max-width:46ch">Each department\'s totals for the day. Use bills on Scan receipts for item-level detail.</span></div></div>' +
        '<div class="dept-cards">' + rows.map(function (r, i) {
          return '<div class="panel dept-card" data-row="' + i + '"><div class="panel-head"><h2>' + esc(r.name) + '</h2><span class="pill" id="dy-gap-' + i + '"></span></div><div class="sheet-grid">' +
            SHEET_COLS.map(function (c) {
              return '<label class="field">' + esc(c[1]) + '<input type="number" inputmode="decimal" step="any" min="0" id="dy-' + i + '-' + c[0] + '" data-f="' + c[0] + '" value="' + esc(r[c[0]] || '') + '" placeholder="0"></label>';
            }).join('') + '</div></div>';
        }).join('') + '</div>' +
        '<div class="sticky-save"><button type="button" class="btn primary big" id="dy-save">Save ' + esc(halfTxt(dailyState.half).toLowerCase()) + ' numbers for ' + esc(A.fmtDate(dailyState.date)) + '</button></div>';
      function gap(i) {
        var card = $('[data-row="' + i + '"]', view);
        var v = function (f) { return parseFloat($('[data-f="' + f + '"]', card).value) || 0; };
        var sale = v('sale'), col = v('cash') + v('upi') + v('card') + v('otherCollection');
        var el = $('#dy-gap-' + i, view);
        if (!sale && !col) { el.textContent = ''; el.className = 'pill'; return; }
        var diff = Math.round(sale - col);
        el.textContent = diff > 0 ? money(diff) + ' not collected' : diff < 0 ? money(-diff) + ' more collected than billed' : 'Fully collected';
        el.className = 'pill ' + (diff > sale * (A.S.collectionGapPct || 3) / 100 ? 'bad' : diff < 0 ? 'warn' : 'good');
      }
      rows.forEach(function (r, i) { gap(i); $$('[data-row="' + i + '"] input', view).forEach(function (inp) { inp.oninput = function () { gap(i); }; }); });
      $('#dy-date', view).onchange = function (e) { dailyState.date = e.target.value || A.today(); A.render(); };
      $('#dy-half', view).onchange = function (e) { dailyState.half = e.target.value; A.render(); };
      $('#dy-save', view).onclick = function () {
        var payload = { date: dailyState.date, half: dailyState.half, rows: rows.map(function (r, i) {
          var o = { departmentId: r.departmentId };
          $$('[data-row="' + i + '"] input', view).forEach(function (inp) { o[inp.dataset.f] = inp.value; });
          return o;
        }) };
        api.call('saveDailySheet', payload).then(function (res) { A.toast('Saved ' + res.saved + ' figures for ' + A.fmtDate(dailyState.date)); }).catch(A.fail);
      };
    });
  };

  // ------------------------------------------------------------ Entry form (manual / receipt)
  function itemsTable(items, withReceived) {
    return '<div class="table-wrap"><table class="items-edit"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th>' + (withReceived ? '<th>Received</th>' : '') + '<th></th></tr></thead><tbody>' +
      items.map(function (it, i) {
        function inp(k, type, w) { return '<td><input data-i="' + i + '" data-k="' + k + '" type="' + type + '" step="any" value="' + esc(it[k] === undefined ? '' : it[k]) + '" style="min-width:' + w + 'px"></td>'; }
        return '<tr>' + inp('name', 'text', 140) + inp('qty', 'number', 60) + inp('unit', 'text', 50) + inp('rate', 'number', 70) + inp('amount', 'number', 80) + (withReceived ? inp('received', 'number', 64) : '') +
          '<td><button type="button" class="btn ghost sm" data-rm="' + i + '" aria-label="Remove line">✕</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="row"><button type="button" class="btn sm" data-additem>＋ Add line</button><span class="muted" data-itemsum></span></div>';
  }

  function entryForm(e, depList, opts) {
    opts = opts || {};
    e = e || { type: opts.type || 'expense', date: A.today(), items: [] };
    var cats = costCats().map(function (c) { return c.name; });
    return '<div class="form-grid">' +
      '<label class="field">What is it<select name="type" id="en-type">' + A.opt(R.TYPES.map(function (t) { return { value: t, text: TL[t] }; }), e.type) + '</select></label>' +
      '<label class="field"><span data-for="sale collection expense purchase received wastage misc stock">Department</span><span data-for="supply">Supplied to (department)</span><select name="departmentId" id="en-dep">' + A.opt(activeDeps(depList).map(function (d) { return { value: d.id, text: d.name }; }), e.departmentId, 'General / whole business') + '</select></label>' +
      '<label class="field">Date<input type="date" name="date" id="en-date" value="' + esc(e.date) + '"></label>' +
      '<label class="field">Time (sets the half of day)<input type="time" name="time" id="en-time" value="' + esc(e.time || '') + '"></label>' +
      '<label class="field">Amount<input type="number" inputmode="decimal" step="any" name="amount" id="en-amount" value="' + esc(e.amount || '') + '" placeholder="Total of the lines if empty"></label>' +
      '<p class="muted wide" data-for="supply stock">List each item and its quantity below. Money is optional; values come from the latest purchase rates.</p>' +
      '<label class="field" data-for="collection">Received by<select name="method" id="en-method">' + A.opt(R.METHODS, e.method || 'Cash') + '</select></label>' +
      '<label class="field" data-for="expense purchase wastage misc">Category<input name="category" id="en-cat" list="en-cats" value="' + esc(e.category || '') + '"><datalist id="en-cats">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></label>' +
      '<label class="field" data-for="expense misc">Fixed or variable<select name="costType" id="en-cost">' + A.opt([{ value: '', text: 'Decide from category' }, { value: 'fixed', text: 'Fixed (rent, salary, EMI…)' }, { value: 'variable', text: 'Variable (changes with business)' }], e.costType || '') + '</select></label>' +
      '<label class="field" data-for="expense purchase received wastage misc">Vendor / paid to<input name="vendor" id="en-vendor" value="' + esc(e.vendor || '') + '"></label>' +
      '<label class="field" data-for="expense purchase received misc">Bill number<input name="billNo" id="en-bill" value="' + esc(e.billNo || '') + '"></label>' +
      '<label class="field wide">Note<input name="note" id="en-note" value="' + esc(e.note || '') + '"></label></div>' +
      '<div data-for="purchase expense wastage received supply stock" class="stack"><b><span data-for="purchase expense wastage received">Items on the bill <span class="muted">(optional: enables price, delivery and stock checks)</span></span><span data-for="supply">Items supplied / issued</span><span data-for="stock">Items counted (quantity in hand)</span></b><div id="en-items"></div></div>';
  }
  function bindEntryForm(form, e) {
    var items = (e && e.items ? e.items : []).map(function (x) { return Object.assign({}, x); });
    var box = $('#en-items', form);
    function sync() {
      var t = $('#en-type', form).value;
      $$('[data-for]', form).forEach(function (el) { el.hidden = el.getAttribute('data-for').split(' ').indexOf(t) < 0; });
    }
    function draw() {
      box.innerHTML = itemsTable(items, $('#en-type', form).value === 'purchase');
      $$('input[data-i]', box).forEach(function (inp) {
        inp.oninput = function () {
          var it = items[+inp.dataset.i]; it[inp.dataset.k] = inp.value;
          if ((inp.dataset.k === 'qty' || inp.dataset.k === 'rate') && it.qty && it.rate) { it.amount = Math.round(it.qty * it.rate * 100) / 100; var a = $('input[data-i="' + inp.dataset.i + '"][data-k="amount"]', box); if (a) a.value = it.amount; }
          sum();
        };
      });
      $$('[data-rm]', box).forEach(function (b) { b.onclick = function () { items.splice(+b.dataset.rm, 1); draw(); }; });
      $('[data-additem]', box).onclick = function () { items.push({ name: '', qty: '', unit: '', rate: '', amount: '' }); draw(); };
      sum();
    }
    function sum() {
      var s = items.reduce(function (a, it) { return a + (parseFloat(it.amount) || 0); }, 0);
      var el = $('[data-itemsum]', box); if (el) el.textContent = items.length ? 'Lines add up to ' + money(s) : '';
    }
    $('#en-type', form).onchange = function () { sync(); draw(); };
    sync(); draw();
    return { items: function () { return items.filter(function (it) { return String(it.name || '').trim(); }); }, set: function (list) { items = list; draw(); } };
  }
  function editEntry(e, depList, after, opts) {
    var ctl;
    A.modal({ title: e && e.id ? 'Edit entry' : 'New entry', wide: true, body: entryForm(e, depList, opts),
      extraFoot: e && e.id ? '<button type="button" class="btn danger" id="en-del">Delete</button>' : '',
      onOpen: function (f, close) {
        ctl = bindEntryForm(f, e);
        var del = $('#en-del', f);
        if (del) del.onclick = function () { close(); A.confirmBox('Delete this entry of ' + money(e.amount) + '?', 'Delete', true).then(function (ok) { if (ok) api.call('removeEntry', e.id).then(function () { A.toast('Deleted'); if (after) after(); }).catch(A.fail); }); };
      },
      onSubmit: function (d) {
        d.items = ctl.items();
        if (e && e.id) { d.id = e.id; d.source = e.source; d.receiptId = e.receiptId; }
        return api.call('saveEntry', d).then(function () { A.toast('Saved'); if (after) after(); });
      } });
  }

  // ------------------------------------------------------------ Scan receipts (OCR)
  var ocr = { worker: null, loading: null };
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function deviceOcrWorker(progress) {
    if (ocr.worker) return Promise.resolve(ocr.worker);
    if (ocr.loading) return ocr.loading;
    var base = new URL('vendor/ocr/', location.href).href;
    ocr.loading = (window.Tesseract ? Promise.resolve() : loadScript(base + 'tesseract.min.js')).then(function () {
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: base + 'worker.min.js', corePath: base + 'tesseract-core-lstm.wasm.js', langPath: base + 'lang',
        workerBlobURL: false, cacheMethod: 'none',
        logger: function (m) { if (progress && m && m.status) progress(m.status, m.progress); }
      });
    }).then(function (w) { ocr.worker = w; ocr.loading = null; return w; }, function (err) {
      ocr.loading = null;
      throw new Error('On-phone reading is not available here (' + err.message + '). Use AI reading or type the bill in.');
    });
    return ocr.loading;
  }
  // Shrink and clean up the photo: faster OCR, smaller upload.
  function prepareImage(file) {
    return A.readFile(file, true).then(function (url) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, 1800 / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          var g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
          var colour = c.toDataURL('image/jpeg', 0.85);
          var d = g.getImageData(0, 0, c.width, c.height), px = d.data;
          for (var i = 0; i < px.length; i += 4) { var y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; y = y > 160 ? 255 : y < 90 ? 0 : (y - 90) * 255 / 70; px[i] = px[i + 1] = px[i + 2] = y; }
          g.putImageData(d, 0, 0);
          resolve({ canvas: c, jpegBase64: colour.split(',')[1], preview: colour });
        };
        img.onerror = function () { reject(new Error('This file is not an image the app can read. Take a photo or choose a JPG/PNG.')); };
        img.src = url;
      });
    });
  }
  function aiAvailable() {
    if (api.mode === 'remote') return api.online && api.health && api.health.ai;
    return !!A.lsGet(A.LS_AIKEY) && navigator.onLine !== false;
  }
  function readWithAI(img, depName) {
    var P = A.P;
    if (api.mode === 'remote') {
      return A.http('api/ai/read-receipt', { base64: img.jpegBase64, mimeType: 'image/jpeg', departmentId: scanState.departmentId, type: scanState.type }, 60000)
        .then(function (j) { if (!j.ok) throw new Error(j.error); return j.result; });
    }
    return A.AI.readReceipt(window.fetch.bind(window), { apiKey: A.lsGet(A.LS_AIKEY), model: A.S.geminiModel, base64: img.jpegBase64, mimeType: 'image/jpeg',
      presetName: P.name, department: depName, hints: P.review.receiptHints, categories: P.review.costCategories.map(function (c) { return c.name; }), expectType: scanState.type });
  }

  var scanState = { departmentId: '', type: 'purchase', engine: 'auto' };
  A.openScan = function (type, departmentId) { scanState.type = type; if (departmentId !== undefined) scanState.departmentId = departmentId; A.go('scan'); };
  A.PAGES.scan = function (view) {
    A.setTitle('Scan receipts');
    return Promise.all([deps(), api.call('list', 'receipts', { sort: '-createdAt', limit: 15 })]).then(function (res) {
      var depList = res[0], recent = res[1].rows;
      var aiOk = aiAvailable();
      view.innerHTML = '<div class="panel stack"><h2>Read a bill</h2>' +
        '<div class="form-grid"><label class="field">Department<select id="sc-dep">' + A.opt(activeDeps(depList).map(function (d) { return { value: d.id, text: d.name }; }), scanState.departmentId, 'General / whole business') + '</select></label>' +
        '<label class="field">Bill type<select id="sc-type">' + A.opt([{ value: 'purchase', text: 'Purchase bill' }, { value: 'expense', text: 'Expense voucher' }, { value: 'supply', text: 'Supply / issue slip' }, { value: 'stock', text: 'Stock count sheet' }, { value: 'wastage', text: 'Wastage sheet' }, { value: 'misc', text: 'Miscellaneous' }], scanState.type) + '</select></label>' +
        '<label class="field">Read with<select id="sc-engine">' + A.opt([{ value: 'auto', text: aiOk ? 'Best available (AI)' : 'Best available (on this phone)' }, { value: 'ai', text: 'AI (needs internet)' }, { value: 'device', text: 'On this phone (works offline)' }], scanState.engine) + '</select></label></div>' +
        '<div class="row"><label class="btn primary" for="sc-camera">📷 Take photo</label><input type="file" id="sc-camera" accept="image/*" capture="environment" hidden>' +
        '<label class="btn" for="sc-file">Choose image</label><input type="file" id="sc-file" accept="image/*" hidden>' +
        '<button type="button" class="btn ghost" id="sc-manual">Type it in instead</button></div>' +
        '<p class="muted" id="sc-status">' + (aiOk ? 'AI reading is on. Without internet, the phone reads the bill itself.' : 'Bills are read on this phone. For handwritten or poor-quality bills, add a Gemini key in Settings for AI reading.') + ' You check everything before it is saved.</p></div>' +
        '<div id="sc-result"></div>' +
        '<div class="panel"><div class="panel-head"><h2>Recently saved bills</h2><a class="btn sm" href="#entries">All entries</a></div>' +
        (recent.length ? '<div class="table-wrap"><table><tbody>' + recent.map(function (r) {
          return '<tr><td>' + esc(A.fmtDate(r.date)) + '</td><td>' + esc(r.vendor || '—') + (r.billNo ? ' <span class="muted mono">#' + esc(r.billNo) + '</span>' : '') + '</td><td>' + typePill(r.type) + '</td><td class="num">' + money(r.total) + '</td><td class="muted">' + esc(r.engine === 'ai' ? 'AI' : r.engine === 'device' ? 'phone' : 'typed') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : A.emptyState('No bills scanned yet')) + '</div>';
      $('#sc-dep', view).onchange = function (e) { scanState.departmentId = e.target.value; };
      $('#sc-type', view).onchange = function (e) { scanState.type = e.target.value; };
      $('#sc-engine', view).onchange = function (e) { scanState.engine = e.target.value; };
      var status = $('#sc-status', view);
      function onFile(e) {
        var file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        var useAI = scanState.engine === 'ai' || (scanState.engine === 'auto' && aiAvailable());
        status.textContent = 'Preparing photo…';
        var img;
        prepareImage(file).then(function (p) {
          img = p;
          var depName = (depList.filter(function (d) { return d.id === scanState.departmentId; })[0] || {}).name || '';
          if (useAI) {
            status.textContent = 'Reading with AI… (5–20 seconds)';
            return readWithAI(img, depName).then(function (out) { return { out: out, engine: 'ai', text: '' }; }, function (err) {
              if (scanState.engine === 'ai') throw err;
              status.textContent = 'AI unavailable (' + err.message + '). Reading on this phone instead…';
              return readDevice();
            });
          }
          return readDevice();
        }).then(function (r) {
          status.textContent = r.out.items.length ? 'Read ' + r.out.items.length + ' lines. Check them below.' : 'Could not find item lines. Fill them in below, or just the total.';
          showResult(r.out, r.engine, r.text, img && img.preview);
        }).catch(function (err) { status.textContent = err.message; A.toast(err.message, true); });
        function readDevice() {
          status.textContent = 'Reading on this phone… the first time takes a little longer.';
          return deviceOcrWorker(function (s, p) { status.textContent = 'Reading on this phone: ' + s + (p ? ' ' + Math.round(p * 100) + '%' : ''); })
            .then(function (w) { return w.recognize(img.canvas); })
            .then(function (res) {
              var text = res.data.text || '';
              var out = OCRParse.parse(text, { mode: R.ITEM_ONLY.indexOf(scanState.type) >= 0 ? 'qty' : 'bill' });
              out.type = scanState.type;
              return { out: out, engine: 'device', text: text };
            });
        }
      }
      $('#sc-camera', view).onchange = onFile;
      $('#sc-file', view).onchange = onFile;
      $('#sc-manual', view).onclick = function () { showResult({ vendor: '', billNo: '', date: A.today(), total: 0, items: [], notes: [], type: scanState.type }, 'typed', '', null); };

      function showResult(out, engine, text, preview) {
        if (R.ITEM_ONLY.indexOf(scanState.type) >= 0) out.type = scanState.type;
        var entry = { type: out.type || scanState.type, departmentId: scanState.departmentId, date: out.date || A.today(), amount: out.total || '', vendor: out.vendor, billNo: out.billNo,
          category: out.category || '', costType: out.costType || '', items: out.items || [], note: '' };
        var box = $('#sc-result', view);
        box.innerHTML = '<form class="panel stack" id="sc-form"><div class="panel-head"><h2>Check and save</h2><span class="pill ink">' + (engine === 'ai' ? 'Read by AI' : engine === 'device' ? 'Read on phone' : 'Typed in') + '</span></div>' +
          '<div class="scan-wrap">' + (preview ? '<img src="' + preview + '" alt="Bill photo" class="scan-img">' : '') + '<div class="stack" style="min-width:0;flex:1">' + entryForm(entry, depList) + '</div></div>' +
          ((out.notes || []).length ? '<div class="banner">' + out.notes.map(esc).join('<br>') + '</div>' : '') +
          '<div id="sc-checks"></div>' +
          (text ? '<details><summary>Text read from the photo</summary><pre class="ocr-text">' + esc(text) + '</pre></details>' : '') +
          '<div class="row"><button type="submit" class="btn primary">Save bill</button><button type="button" class="btn" id="sc-cancel">Discard</button></div></form>';
        var form = $('#sc-form', box);
        var ctl = bindEntryForm(form, entry);
        var runChecks = A.debounce(function () {
          var d = A.formData(form);
          api.call('checkReceipt', { vendor: d.vendor, billNo: d.billNo, date: d.date, items: ctl.items(), total: d.amount, departmentId: d.departmentId }).then(function (c) {
            var html = '';
            if (c.duplicate) html += '<li class="flag high">' + sevPill('high') + '<div><b>Already saved</b><div class="muted">This vendor and bill number were saved on ' + esc(c.duplicate.date) + ' for ' + money(c.duplicate.amount) + '.</div></div></li>';
            c.priceAlerts.forEach(function (a) { html += '<li class="flag ' + (a.up >= 25 ? 'high' : 'medium') + '">' + sevPill(a.up >= 25 ? 'high' : 'medium') + '<div><b>' + esc(a.item) + ' is ' + a.up + '% above the usual price</b><div class="muted">' + money(a.rate) + ' now vs ' + money(a.usual) + ' usually (' + a.seen + ' earlier bills).</div></div></li>'; });
            c.cheaperElsewhere.forEach(function (x) { html += '<li class="flag info">' + sevPill('info') + '<div><b>' + esc(x.item) + ' was cheaper from ' + esc(x.otherVendor) + '</b><div class="muted">' + money(x.otherRate) + ' on ' + esc(x.otherDate) + '.</div></div></li>'; });
            c.issues.forEach(function (t) { html += '<li class="flag medium">' + sevPill('medium') + '<div><b>' + esc(t) + '</b></div></li>'; });
            $('#sc-checks', box).innerHTML = html ? '<b>Checks</b><ul class="flags">' + html + '</ul>' : '<p class="muted">Checks: no price, quantity or duplicate problems found.</p>';
          }).catch(function () { });
        }, 400);
        form.addEventListener('input', runChecks);
        form.addEventListener('change', runChecks);
        runChecks();
        $('#sc-cancel', box).onclick = function () { box.innerHTML = ''; };
        form.onsubmit = function (ev) {
          ev.preventDefault();
          var d = A.formData(form); d.items = ctl.items();
          api.call('saveReceipt', { entry: d, engine: engine, text: text }).then(function () { A.toast('Bill saved'); A.render(); }).catch(function (err) {
            if (/already saved/.test(err.message)) {
              A.confirmBox(err.message + ' Save it again anyway?', 'Save again').then(function (ok) {
                if (ok) api.call('saveReceipt', { entry: d, engine: engine, text: text, allowDuplicate: true }).then(function () { A.toast('Bill saved'); A.render(); }).catch(A.fail);
              });
            } else A.fail(err);
          });
        };
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  // ------------------------------------------------------------ All entries
  var entryFilter = { type: '', departmentId: '', from: '', to: '', search: '' };
  A.PAGES.entries = function (view) {
    A.setTitle('All entries');
    if (!entryFilter.from) { entryFilter.to = A.today(); entryFilter.from = R.addDays(entryFilter.to, -6); }
    return deps().then(function (depList) {
      view.innerHTML = '<div class="panel"><div class="panel-head"><input class="search" id="ent-search" placeholder="Search vendor, bill, note…" value="' + esc(entryFilter.search) + '">' +
        '<select id="ent-dep" style="width:auto">' + A.opt(depList.map(function (d) { return { value: d.id, text: d.name }; }), entryFilter.departmentId, 'All departments') + '</select>' +
        '<div class="row"><input type="date" id="ent-from" style="width:auto" value="' + esc(entryFilter.from) + '" aria-label="From"><input type="date" id="ent-to" style="width:auto" value="' + esc(entryFilter.to) + '" aria-label="To"></div>' +
        '<span class="spacer"></span><button type="button" class="btn primary" id="ent-new">＋ Add entry</button></div>' +
        '<div class="chips" id="ent-types"><button type="button" class="chip' + (!entryFilter.type ? ' on' : '') + '" data-t="">All</button>' + R.TYPES.map(function (t) { return '<button type="button" class="chip' + (entryFilter.type === t ? ' on' : '') + '" data-t="' + t + '">' + esc(TL[t]) + '</button>'; }).join('') + '</div>' +
        '<div id="ent-sum" class="muted" style="margin:10px 0"></div><div class="table-wrap" id="ent-table"></div></div>';
      function load() {
        return api.call('list', 'entries', { type: entryFilter.type, departmentId: entryFilter.departmentId, from: entryFilter.from, to: entryFilter.to, search: entryFilter.search, sort: '-at' }).then(function (res) {
          var rows = res.rows, tbl = $('#ent-table', view); if (!tbl) return;
          var total = rows.reduce(function (a, r) { return a + r.amount; }, 0);
          $('#ent-sum', view).textContent = rows.length + ' entries' + (entryFilter.type ? ' · ' + money(total) : '');
          tbl.innerHTML = rows.length ? '<table><thead><tr><th>Date</th><th>Department</th><th>Type</th><th>Details</th><th class="num">Amount</th></tr></thead><tbody>' + rows.slice(0, 500).map(function (r) {
            var det = [r.category, r.vendor, r.method && r.type === 'collection' ? r.method : '', r.billNo ? '#' + r.billNo : '', r.items && r.items.length ? r.items.length + ' lines' : '', r.note].filter(Boolean).join(' · ');
            return '<tr class="clickable" data-id="' + r.id + '"><td>' + esc(shortDate(r.date)) + (r.half ? ' <span class="muted">' + (r.half === 'first' ? '1st' : '2nd') + ' half</span>' : '') + '</td><td>' + esc(r.departmentName || 'General') + '</td><td>' + typePill(r.type) + (r.costType === 'fixed' ? ' <span class="pill">fixed</span>' : '') + '</td><td class="muted">' + esc(det) + '</td><td class="num">' + money(r.amount) + '</td></tr>';
          }).join('') + '</tbody></table>' : A.emptyState('No entries here', 'Change the dates or filters, or add numbers on Daily numbers.');
          $$('tr[data-id]', tbl).forEach(function (tr) { tr.onclick = function () { editEntry(rows.filter(function (r) { return r.id === tr.dataset.id; })[0], depList, load); }; });
        });
      }
      $('#ent-search', view).oninput = A.debounce(function (e) { entryFilter.search = e.target.value; load(); }, 200);
      $('#ent-dep', view).onchange = function (e) { entryFilter.departmentId = e.target.value; load(); };
      $('#ent-from', view).onchange = function (e) { entryFilter.from = e.target.value; load(); };
      $('#ent-to', view).onchange = function (e) { entryFilter.to = e.target.value; load(); };
      $$('[data-t]', view).forEach(function (b) { b.onclick = function () { entryFilter.type = b.dataset.t; $$('[data-t]', view).forEach(function (x) { x.classList.toggle('on', x === b); }); load(); }; });
      $('#ent-new', view).onclick = function () { editEntry(null, depList, load); };
      return load();
    });
  };

  // ------------------------------------------------------------ Spot check & insights
  var reviewState = { from: '', to: '', mode: 'all', count: 3, seed: '', days: [], half: '', deps: [], run: false };
  A.PAGES.review = function (view) {
    A.setTitle('Spot check');
    var st = reviewState;
    if (!st.to) { st.to = A.today(); st.from = R.addDays(st.to, -29); }
    return deps().then(function (depList) {
      view.innerHTML = '<div class="panel stack"><h2>What to check</h2>' +
        '<div class="row"><label class="field" style="width:auto">From<input type="date" id="rv-from" value="' + esc(st.from) + '"></label><label class="field" style="width:auto">To<input type="date" id="rv-to" value="' + esc(st.to) + '"></label></div>' +
        '<div class="stack"><b>Which days</b><div class="chips">' + [['all', 'Every day'], ['random', 'Random days'], ['pick', 'Days I choose']].map(function (m) { return '<button type="button" class="chip' + (st.mode === m[0] ? ' on' : '') + '" data-mode="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>' +
        '<div class="row" data-show="random"><label class="field" style="width:auto">How many<input type="number" min="1" max="31" id="rv-count" value="' + st.count + '" style="width:90px"></label><button type="button" class="btn" id="rv-again">Pick other days</button><span class="muted" id="rv-picked"></span></div>' +
        '<div class="row" data-show="pick"><input type="date" id="rv-add" style="width:auto" aria-label="Add a day"><div class="chips" id="rv-days"></div></div></div>' +
        '<div class="stack"><b>Part of the day</b><div class="chips">' + [['', 'Full day'], ['first', 'First half'], ['second', 'Second half']].map(function (h) { return '<button type="button" class="chip' + (st.half === h[0] ? ' on' : '') + '" data-half="' + h[0] + '">' + h[1] + '</button>'; }).join('') +
        '</div><span class="muted">Halves split at ' + esc(A.S.halfDaySplit || '15:00') + ' (change in Settings). Entries without a time or half count only in full-day checks.</span></div>' +
        '<div class="stack"><b>Departments</b><div class="chips">' + '<button type="button" class="chip' + (!st.deps.length ? ' on' : '') + '" data-dep="">All</button>' + depList.map(function (d) { return '<button type="button" class="chip' + (st.deps.indexOf(d.id) >= 0 ? ' on' : '') + '" data-dep="' + d.id + '">' + esc(d.name) + '</button>'; }).join('') + '</div></div>' +
        '<div class="row"><button type="button" class="btn primary big" id="rv-run" style="width:auto">Run check</button></div></div><div id="rv-out" class="grid"></div>';
      function showMode() {
        $$('[data-show]', view).forEach(function (el) { el.hidden = el.dataset.show !== st.mode; });
        $('#rv-picked', view).textContent = st.mode === 'random' && st.days.length ? 'Picked: ' + st.days.map(shortDate).join(', ') : '';
        $('#rv-days', view).innerHTML = st.mode === 'pick' ? st.days.map(function (d) { return '<button type="button" class="chip on" data-rmday="' + d + '">' + esc(shortDate(d)) + ' ✕</button>'; }).join('') : '';
        $$('[data-rmday]', view).forEach(function (b) { b.onclick = function () { st.days = st.days.filter(function (x) { return x !== b.dataset.rmday; }); showMode(); }; });
      }
      function pickRandom() {
        st.seed = st.seed || String(Date.now());
        return api.call('sampleDays', { from: st.from, to: st.to, count: st.count, seed: st.seed }).then(function (d) { st.days = d; showMode(); });
      }
      $$('[data-mode]', view).forEach(function (b) { b.onclick = function () { st.mode = b.dataset.mode; st.days = []; $$('[data-mode]', view).forEach(function (x) { x.classList.toggle('on', x === b); }); if (st.mode === 'random') { st.seed = String(Date.now()); pickRandom(); } else showMode(); }; });
      $$('[data-half]', view).forEach(function (b) { b.onclick = function () { st.half = b.dataset.half; $$('[data-half]', view).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      $$('[data-dep]', view).forEach(function (b) {
        b.onclick = function () {
          var id = b.dataset.dep;
          if (!id) st.deps = []; else if (st.deps.indexOf(id) >= 0) st.deps = st.deps.filter(function (x) { return x !== id; }); else st.deps.push(id);
          $$('[data-dep]', view).forEach(function (x) { x.classList.toggle('on', x.dataset.dep ? st.deps.indexOf(x.dataset.dep) >= 0 : !st.deps.length); });
        };
      });
      $('#rv-from', view).onchange = function (e) { st.from = e.target.value; if (st.mode === 'random') pickRandom(); };
      $('#rv-to', view).onchange = function (e) { st.to = e.target.value; if (st.mode === 'random') pickRandom(); };
      $('#rv-count', view).onchange = function (e) { st.count = Math.max(1, +e.target.value || 3); pickRandom(); };
      $('#rv-again', view).onclick = function () { st.seed = String(Date.now()); pickRandom(); };
      $('#rv-add', view).onchange = function (e) { var d = e.target.value; if (d && st.days.indexOf(d) < 0) { st.days.push(d); st.days.sort(); } e.target.value = ''; showMode(); };
      $('#rv-run', view).onclick = run;
      showMode();
      var ready = st.mode === 'random' && !st.days.length ? pickRandom() : Promise.resolve();
      return ready.then(function () { if (st.run) { st.run = false; run(); } });

      function run() {
        if (st.mode !== 'all' && !st.days.length) { A.toast('Choose at least one day', true); return; }
        var q = { from: st.from, to: st.to, days: st.mode === 'all' ? [] : st.days, half: st.half, departmentIds: st.deps };
        var out = $('#rv-out', view);
        out.innerHTML = '<div class="muted">Checking…</div>';
        api.call('reviewInsights', q).then(function (res) {
          var sc = res.scope;
          var scopeTxt = (st.mode === 'all' ? 'Every day from ' + A.fmtDate(sc.from) + ' to ' + A.fmtDate(sc.to) : (st.mode === 'random' ? sc.days.length + ' random day(s): ' : 'Chosen day(s): ') + sc.days.map(shortDate).join(', ')) +
            ' · ' + halfTxt(sc.half) + ' · ' + (sc.departments.length ? sc.departments.join(', ') : 'all departments') + ' · ' + sc.entryCount + ' entries';
          var b = res.baseline;
          out.innerHTML = '<div class="panel stack"><div class="panel-head"><h2>Result</h2><button type="button" class="btn sm" id="rv-copy">Copy summary</button><a class="btn sm" target="_blank" rel="noopener" id="rv-wa" href="#">Share on WhatsApp</a></div>' +
            '<p class="muted">' + esc(scopeTxt) + (b ? ' · compared with ' + b.days + ' days from ' + A.fmtDate(b.from) + ' to ' + A.fmtDate(b.to) + (b.half ? ' (same half of day)' : '') : '') + '</p>' +
            '<ul class="summary">' + res.summary.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
            tiles(res) +
            '<div class="panel"><div class="panel-head"><h2>Things to check</h2><span class="muted">' + res.flags.filter(function (f) { return f.severity === 'high'; }).length + ' urgent · ' + res.flags.length + ' total</span></div>' + flagList(res.flags) + '</div>' +
            kpiPanel(res.kpis) +
            (res.byDay.length > 1 ? '<div class="panel"><div class="panel-head"><h2>Sales and costs by day</h2></div>' + pairChart(res.byDay) + '</div>' : '') +
            '<div class="panel"><div class="panel-head"><h2>Departments</h2></div>' + deptTable(res.byDepartment) + '</div>' +
            '<div class="grid grid-2">' +
            section('Fixed vs variable costs', res.byCategory.filter(function (c) { return c.type === 'expense' || c.type === 'misc'; }), [['Category', function (c) { return esc(c.name); }], ['Type', function (c) { return '<span class="pill ' + (c.costType === 'fixed' ? 'ink' : '') + '">' + esc(c.costType || 'variable') + '</span>'; }], ['Amount', function (c) { return money(c.amount); }, 1]]) +
            section('Purchases by category', res.byCategory.filter(function (c) { return c.type === 'purchase'; }), [['Category', function (c) { return esc(c.name); }], ['Bills', function (c) { return c.count; }, 1], ['Amount', function (c) { return money(c.amount); }, 1]]) +
            section('Price rises', res.priceAlerts, [['Date', function (a) { return esc(shortDate(a.date)); }], ['Item', function (a) { return esc(a.item) + '<div class="muted">' + esc(a.vendor) + '</div>'; }], ['Paid', function (a) { return money(a.rate); }, 1], ['Usual', function (a) { return money(a.usual); }, 1], ['Rise', function (a) { return '<span class="pill ' + (a.up >= 25 ? 'bad' : 'warn') + '">+' + a.up + '%</span>'; }, 1]]) +
            section('Purchased vs received', res.shortfalls, [['Date', function (s) { return esc(shortDate(s.date)); }], ['Item', function (s) { return esc(s.item) + '<div class="muted">' + esc(s.vendor) + '</div>'; }], ['Billed', function (s) { return esc(s.kind === 'day' ? money(s.billed) : s.billed + ' ' + s.unit); }, 1], ['Received', function (s) { return esc(s.kind === 'day' ? money(s.received) : s.received + ' ' + s.unit); }, 1], ['Short by', function (s) { return '<span class="pill bad">' + money(s.value) + '</span>'; }, 1]]) +
            section('Wastage details', res.wastageList, [['Date', function (e) { return esc(shortDate(e.date)); }], ['Department', function (e) { return esc(e.departmentName || 'General'); }], ['Reason', function (e) { return esc([e.category, e.note].filter(Boolean).join(' · ')); }], ['Amount', function (e) { return money(e.amount); }, 1]]) +
            section('Miscellaneous details', res.miscList, [['Date', function (e) { return esc(shortDate(e.date)); }], ['Department', function (e) { return esc(e.departmentName || 'General'); }], ['Note', function (e) { return esc([e.category, e.vendor, e.note].filter(Boolean).join(' · ')); }], ['Amount', function (e) { return money(e.amount); }, 1]]) +
            '</div>';
          var text = '*' + A.S.businessName + ': review*\n' + scopeTxt + '\n\n' + res.summary.join('\n') + (res.flags.length ? '\n\nTo check:\n' + res.flags.slice(0, 12).map(function (f) { return '• ' + f.title + (f.detail ? ' (' + f.detail + ')' : ''); }).join('\n') : '\n\nNothing unusual found.');
          $('#rv-wa', out).href = A.waLink(A.S.phone || '', text);
          $('#rv-copy', out).onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { A.toast('Summary copied'); }).catch(function () { A.toast('Copy is blocked here', true); }); };
          out.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }).catch(A.fail);
      }
    });
  };
  function section(title, rows, cols) {
    return '<div class="panel"><div class="panel-head"><h2>' + esc(title) + '</h2><span class="muted">' + rows.length + '</span></div>' + (rows.length ? '<div class="table-wrap"><table><thead><tr>' +
      cols.map(function (c) { return '<th class="' + (c[2] ? 'num' : '') + '">' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.slice(0, 40).map(function (r) { return '<tr>' + cols.map(function (c) { return '<td class="' + (c[2] ? 'num' : '') + '">' + c[1](r) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="muted">None in this selection.</p>') + '</div>';
  }


  // ------------------------------------------------------------ Stock: purchased vs supplied vs in hand
  var stockState = { from: '', to: '' };
  A.PAGES.stock = function (view) {
    A.setTitle('Stock');
    var st = stockState;
    if (!st.to) { st.to = A.today(); st.from = R.addDays(st.to, -29); }
    return Promise.all([api.call('inventory', { from: st.from, to: st.to }), deps(), api.call('knownItems')]).then(function (res) {
      var inv = res[0], depList = res[1], known = res[2], t = inv.totals;
      var storeDep = depList.filter(function (d) { return /stores|godown/i.test(d.name); })[0];
      view.innerHTML = '<div class="row"><label class="field" style="width:auto">From<input type="date" id="sk-from" value="' + esc(st.from) + '"></label><label class="field" style="width:auto">To<input type="date" id="sk-to" value="' + esc(st.to) + '"></label>' +
        '<span class="spacer"></span><button type="button" class="btn" id="sk-supply">Record supply</button><button type="button" class="btn" id="sk-count">Count stock</button>' +
        '<button type="button" class="btn" id="sk-scan-supply">📷 Issue slip</button><button type="button" class="btn primary" id="sk-scan-count">📷 Stock sheet</button></div>' +
        '<div class="tiles">' +
        '<div class="tile"><span class="label">Items tracked</span><span class="value">' + t.items + '</span><span class="hint">' + t.counted + ' counted in this period</span></div>' +
        '<div class="tile"><span class="label">Purchased</span><span class="value">' + money(t.purchasedValue) + '</span><span class="hint">stock that came in</span></div>' +
        '<div class="tile"><span class="label">Supplied / issued</span><span class="value">' + money(t.suppliedValue) + '</span><span class="hint">given out to departments</span></div>' +
        '<div class="tile"><span class="label">Stock in hand</span><span class="value">' + money(t.inHandValue) + '</span><span class="hint">at latest purchase rates</span></div>' +
        '<div class="tile ' + (t.shortValue > 0 ? 'danger' : '') + '"><span class="label">Missing stock</span><span class="value">' + money(t.shortValue) + '</span><span class="hint">counted less than expected</span></div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Things to check</h2></div>' + (inv.items.length ? flagList(inv.flags) : A.emptyState('No stock movements yet', 'Item lines on purchase bills count as stock in. Record supplies and stock counts here, or scan the sheets.')) + '</div>' +
        '<div class="panel"><div class="panel-head"><h2>Purchased vs supplied vs in hand</h2><span class="muted">Tap an item for its history</span></div>' +
        (inv.items.length ? '<div class="table-wrap"><table><thead><tr><th>Item</th><th class="num">Opening</th><th class="num">Purchased</th><th class="num">Supplied</th><th class="num">Wasted</th><th class="num">Should have</th><th class="num">Counted</th><th class="num">Difference</th></tr></thead><tbody>' +
          inv.items.map(function (m, i) {
            var u = ' <span class="muted">' + esc(m.unit) + '</span>';
            var diff = m.counts ? (m.variance ? '<span class="pill ' + (m.variance < 0 ? 'bad' : 'warn') + '">' + (m.variance > 0 ? '+' : '') + m.variance + (m.rate ? ' · ' + money(m.varianceValue) : '') + '</span>' : '<span class="pill good">matches</span>') : '<span class="muted">not counted</span>';
            return '<tr class="clickable" data-item="' + i + '"><td><b>' + esc(m.name) + '</b></td><td class="num">' + A.qtyFmt(m.opening) + '</td><td class="num">' + A.qtyFmt(m.purchased) + u + '</td><td class="num">' + A.qtyFmt(m.supplied) + u + '</td><td class="num">' + A.qtyFmt(m.wasted) + '</td>' +
              '<td class="num">' + A.qtyFmt(m.book) + u + '</td><td class="num">' + (m.counts ? A.qtyFmt(m.counted) + '<div class="muted">' + esc(shortDate(m.countDate)) + '</div>' : '—') + '</td><td class="num">' + diff + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="muted">Nothing yet.</p>') + '</div>';
      $('#sk-from', view).onchange = function (e) { st.from = e.target.value; A.render(); };
      $('#sk-to', view).onchange = function (e) { st.to = e.target.value; A.render(); };
      $('#sk-scan-count', view).onclick = function () { A.openScan('stock', storeDep ? storeDep.id : ''); };
      $('#sk-scan-supply', view).onclick = function () { A.openScan('supply'); };
      $('#sk-supply', view).onclick = function () { editEntry({ type: 'supply', date: A.today(), items: [{ name: '', qty: '', unit: '' }] }, depList, A.render); };
      $('#sk-count', view).onclick = function () { countDialog(inv, known, depList, storeDep); };
      $$('[data-item]', view).forEach(function (tr) {
        tr.onclick = function () {
          var m = inv.items[+tr.dataset.item];
          A.modal({ title: m.name + ' · stock history', wide: true, submitText: null, cancelText: 'Close',
            body: '<p class="muted">Opening ' + A.qtyFmt(m.opening) + ' ' + esc(m.unit) + ' · supplied to ' + (Object.keys(m.suppliedTo).map(function (k) { return esc(k) + ' ' + m.suppliedTo[k]; }).join(', ') || 'nobody yet') + (m.rate ? ' · latest rate ' + money(m.rate) : '') + '</p>' +
              '<div class="table-wrap"><table><thead><tr><th>Date</th><th>What</th><th>From / to</th><th class="num">Qty</th><th class="num">Balance</th></tr></thead><tbody>' +
              m.moves.slice().reverse().map(function (x) {
                var what = { purchase: 'Purchased', supply: 'Supplied', wastage: 'Wasted', stock: 'Counted' }[x.type];
                return '<tr><td>' + esc(shortDate(x.date)) + '</td><td>' + what + '</td><td class="muted">' + esc(x.type === 'purchase' ? x.vendor : x.dep) + '</td><td class="num">' + (x.type === 'purchase' ? '+' : x.type === 'stock' ? '= ' : '−') + A.qtyFmt(x.qty) + '</td><td class="num">' + A.qtyFmt(x.balance) + '</td></tr>';
              }).join('') + '</tbody></table></div>' });
        };
      });
    });
  };
  function countDialog(inv, known, depList, storeDep) {
    var byKey = {};
    inv.items.forEach(function (m) { byKey[m.name.toLowerCase()] = m; });
    var list = inv.items.map(function (m) { return { name: m.name, unit: m.unit, expected: m.inHand }; });
    known.forEach(function (k) { if (!byKey[k.name.toLowerCase()]) list.push({ name: k.name, unit: k.unit, expected: null }); });
    A.modal({ title: 'Count stock in hand', wide: true, submitText: 'Save count',
      body: '<div class="form-grid"><label class="field">Date<input type="date" name="date" id="ct-date" value="' + A.today() + '"></label>' +
        '<label class="field">Where<select name="departmentId" id="ct-dep">' + A.opt(depList.filter(function (d) { return d.active !== false; }).map(function (d) { return { value: d.id, text: d.name }; }), storeDep ? storeDep.id : '', 'Whole business') + '</select></label></div>' +
        '<p class="muted">Type what you physically count. Leave an item empty if you did not count it.</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Item</th><th class="num">Should have</th><th>Counted</th></tr></thead><tbody>' +
        list.map(function (m, i) { return '<tr><td>' + esc(m.name) + ' <span class="muted">' + esc(m.unit) + '</span></td><td class="num">' + (m.expected === null ? '—' : A.qtyFmt(m.expected)) + '</td><td><input type="number" inputmode="decimal" step="any" min="0" data-ci="' + i + '" style="max-width:120px"></td></tr>'; }).join('') +
        '</tbody></table></div>',
      onSubmit: function (d, form) {
        var items = [];
        $$('[data-ci]', form).forEach(function (inp) { if (inp.value !== '') { var m = list[+inp.dataset.ci]; items.push({ name: m.name, unit: m.unit, qty: inp.value }); } });
        if (!items.length) throw new Error('Enter at least one counted quantity');
        return api.call('saveEntry', { type: 'stock', date: d.date, departmentId: d.departmentId, items: items, note: 'Stock count' }).then(function () { A.toast('Stock count saved'); A.render(); });
      } });
  }


  // ------------------------------------------------------------ Key numbers panel (per business type)
  function kpiPanel(kpis) {
    if (!kpis || !kpis.length) return '';
    var name = A.P.name;
    return '<div class="panel"><div class="panel-head"><h2>Key numbers for ' + esc(name) + '</h2><span class="muted">with healthy ranges</span></div><ul class="kpis">' +
      kpis.map(function (k) {
        var pill = k.status === 'good' ? '<span class="pill good">healthy</span>' : k.status === 'nodata' ? '<span class="pill">no data yet</span>' : '<span class="pill ' + (k.status === 'high' ? 'bad' : 'warn') + '">' + (k.status === 'high' ? 'too high' : 'too low') + '</span>';
        return '<li><div class="kpi-top"><b>' + esc(k.label) + '</b>' + pill + '</div><div class="kpi-val">' + (k.status === 'nodata' ? '–' : pctTxt(k.value)) + ' <span class="muted">healthy ' + k.lo + '–' + k.hi + '%</span></div><div class="muted">' + esc(k.why) + '</div></li>';
      }).join('') + '</ul></div>';
  }
  A.kpiPanel = kpiPanel;

  // ------------------------------------------------------------ Customer Vault
  function fill(text, v) { return String(text).replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined && v[k] !== '' ? v[k] : m === '{date}' ? 'soon' : m === '{item}' ? 'your order' : ''; }); }
  function vaultCfg() { return (A.P.review && A.P.review.vault) || { records: [], templates: [] }; }
  function recLabel(kind) { var r = vaultCfg().records.filter(function (x) { return x.key === kind; })[0]; return r || { label: kind, dueLabel: '' }; }
  function shopLink(token) {
    var base = A.serverBase ? A.serverBase() : '';
    if (api.mode !== 'remote') return '';
    return (base || (location.origin + '/')).replace(/\/+$/, '/') + 'v/' + token;
  }

  function messageDialog(cust, opts, after) {
    opts = opts || {};
    var tpls = vaultCfg().templates;
    var pick = opts.template || (opts.record && opts.record.dueDate ? tpls[0].key : 'thanks');
    var vals = { name: cust.name, shop: A.S.businessName, item: opts.record ? (opts.record.title || recLabel(opts.record.kind).label) : '', date: opts.record && opts.record.dueDate ? A.fmtDate(opts.record.dueDate) : '' };
    var m = A.modal({ title: 'Message ' + cust.name, submitText: null, cancelText: 'Close',
      body: '<div class="form-grid"><label class="field">Message type<select id="ms-tpl">' + A.opt(tpls.map(function (t) { return { value: t.key, text: t.label }; }).concat(opts.extra ? [{ value: '_extra', text: opts.extra.label }] : []), opts.extra ? '_extra' : pick) + '</select></label>' +
        '<label class="field">About<input id="ms-item" value="' + esc(vals.item) + '"></label><label class="field">Date<input id="ms-date" value="' + esc(vals.date) + '"></label></div>' +
        '<label class="field">Message<textarea id="ms-text" style="min-height:120px"></textarea></label>' +
        '<div class="row"><a class="btn primary" id="ms-send" target="_blank" rel="noopener" href="#">Open WhatsApp' + (cust.phone ? ' (' + esc(cust.phone) + ')' : '') + '</a><button type="button" class="btn" id="ms-copy">Copy text</button></div>' +
        (cust.phone ? '' : '<p class="banner">No phone number saved for ' + esc(cust.name) + '. WhatsApp will ask you to pick the contact.</p>'),
      onOpen: function (f) {
        function build() {
          var key = $('#ms-tpl', f).value;
          var t = key === '_extra' ? opts.extra.text : (tpls.filter(function (x) { return x.key === key; })[0] || tpls[0]).text;
          var text = fill(t, { name: cust.name, shop: A.S.businessName, item: $('#ms-item', f).value, date: $('#ms-date', f).value });
          $('#ms-text', f).value = text; link();
        }
        function link() { $('#ms-send', f).href = A.waLink(cust.phone || '', $('#ms-text', f).value); }
        $('#ms-tpl', f).onchange = build; $('#ms-item', f).oninput = build; $('#ms-date', f).oninput = build; $('#ms-text', f).oninput = link;
        $('#ms-send', f).addEventListener('click', function () {
          api.call('logMessage', { customerId: cust.id, template: $('#ms-tpl', f).value, recordId: opts.record ? opts.record.id : '', text: $('#ms-text', f).value })
            .then(function () { A.toast('Saved in ' + cust.name + '\'s vault'); if (after) after(); }).catch(A.fail);
        });
        $('#ms-copy', f).onclick = function () { var tx = $('#ms-text', f).value; (navigator.clipboard ? navigator.clipboard.writeText(tx) : Promise.reject()).then(function () { A.toast('Copied'); }).catch(function () { $('#ms-text', f).select(); }); };
        build();
      } });
    return m;
  }

  function recordDialog(cust, rec, after) {
    var kinds = vaultCfg().records;
    A.modal({ title: (rec ? 'Edit ' : 'Add to ') + cust.name + '\'s vault', body: '<div class="form-grid">' +
      '<label class="field">Kind<select name="kind" id="vr-kind">' + A.opt(kinds.map(function (k) { return { value: k.key, text: k.label }; }).concat([{ value: 'note', text: 'Note' }]), rec ? rec.kind : kinds[0] && kinds[0].key) + '</select></label>' +
      '<label class="field">Title<input name="title" id="vr-title" value="' + esc(rec ? rec.title : '') + '" placeholder="e.g. Dr. Rao prescription, Honda City, iPhone 15"></label>' +
      '<label class="field">Date<input type="date" name="date" id="vr-date" value="' + esc(rec ? rec.date : A.today()) + '"></label>' +
      '<label class="field"><span id="vr-duelabel">Reminder date</span><input type="date" name="dueDate" id="vr-due" value="' + esc(rec ? rec.dueDate : '') + '"></label>' +
      '<label class="field">Amount (optional)<input type="number" step="any" name="amount" id="vr-amt" value="' + esc(rec && rec.amount ? rec.amount : '') + '"></label>' +
      '<label class="field wide">Details<textarea name="details" id="vr-details" placeholder="Medicines and dosage, sizes, vehicle number, warranty card number…">' + esc(rec ? rec.details : '') + '</textarea></label>' +
      (rec ? '<label class="check"><input type="checkbox" name="done" id="vr-done"' + (rec.done ? ' checked' : '') + '> Done (no more reminders)</label>' : '') + '</div>',
      extraFoot: rec ? '<button type="button" class="btn danger" id="vr-del">Delete</button>' : '',
      onOpen: function (f, close) {
        function lab() { var d = recLabel($('#vr-kind', f).value).dueLabel; $('#vr-duelabel', f).textContent = d ? d + ' (reminder)' : 'Reminder date (optional)'; }
        $('#vr-kind', f).onchange = lab; lab();
        var del = $('#vr-del', f);
        if (del) del.onclick = function () { close(); api.call('removeVaultRecord', rec.id).then(function () { A.toast('Deleted'); if (after) after(); }).catch(A.fail); };
      },
      onSubmit: function (d) { d.customerId = cust.id; if (rec) d.id = rec.id; return api.call('saveVaultRecord', d).then(function () { A.toast('Saved to vault'); if (after) after(); }); } });
  }

  function openVault(customerId, refresh) {
    api.call('vault', customerId).then(function (v) {
      var c = v.customer, t = A.today();
      var m = A.modal({ title: c.name + '\'s vault', wide: true, submitText: null, cancelText: 'Close',
        extraFoot: '<button type="button" class="btn" id="vt-share">Share vault with ' + esc(c.name.split(' ')[0]) + '</button><button type="button" class="btn" id="vt-msg">Send message</button><button type="button" class="btn primary" id="vt-add">Add record</button>',
        body: '<p class="muted">' + esc([c.phone, c.email].filter(Boolean).join(' · ') || 'No phone saved') + (c.lastContact ? ' · last message ' + esc(A.fmtDate(c.lastContact)) : '') + (c.points ? ' · ' + c.points + ' points' : '') + (c.balance > 0 ? ' · balance due ' + money(c.balance) : '') + '</p>' +
          '<h3>Records</h3>' + (v.records.length ? '<ul class="vault-list">' + v.records.map(function (r) {
            var l = recLabel(r.kind);
            return '<li data-rec="' + r.id + '"><div><b>' + esc(l.label) + (r.title ? ': ' + esc(r.title) : '') + '</b><div class="muted">' + esc(A.fmtDate(r.date)) + (r.dueDate ? ' · ' + esc(l.dueLabel || 'Reminder') + ' ' : '') + (r.dueDate ? '<span class="pill ' + (r.done ? 'good' : r.dueDate < t ? 'bad' : 'warn') + '">' + esc(r.done ? 'done' : A.fmtDate(r.dueDate)) + '</span>' : '') + '</div>' + (r.details ? '<div>' + esc(r.details) + '</div>' : '') + '</div>' +
              '<div class="row"><button type="button" class="btn sm" data-remind="' + r.id + '">Message</button><button type="button" class="btn sm ghost" data-editrec="' + r.id + '">Edit</button></div></li>';
          }).join('') + '</ul>' : '<p class="muted">Nothing saved yet. Add their ' + esc(vaultCfg().records.map(function (x) { return x.label.toLowerCase(); }).slice(0, 3).join(', ')) + '.</p>') +
          (v.bills.length ? '<h3>Bills</h3><ul class="vault-list">' + v.bills.slice(0, 20).map(function (b) { return '<li><div><b>' + esc(b.number) + ' · ' + money(b.total) + '</b><div class="muted">' + esc(A.fmtDate(b.date)) + ' · ' + esc(b.lines.map(function (l) { return l.name; }).join(', ')) + '</div></div></li>'; }).join('') + '</ul>' : '') +
          '<h3>Messages</h3>' + (v.messages.length ? '<ul class="vault-list">' + v.messages.slice(0, 30).map(function (x) { return '<li><div><div class="muted">' + esc(A.fmtDate(x.date)) + '</div>' + esc(x.text) + '</div></li>'; }).join('') + '</ul>' : '<p class="muted">No messages yet.</p>'),
        onOpen: function (f, close) {
          function again() { close(); openVault(customerId, refresh); if (refresh) refresh(); }
          $('#vt-add', f).onclick = function () { close(); recordDialog(c, null, again); };
          $('#vt-msg', f).onclick = function () { close(); messageDialog(c, {}, again); };
          $$('[data-editrec]', f).forEach(function (b) { b.onclick = function () { close(); recordDialog(c, v.records.filter(function (r) { return r.id === b.dataset.editrec; })[0], again); }; });
          $$('[data-remind]', f).forEach(function (b) { b.onclick = function () { close(); messageDialog(c, { record: v.records.filter(function (r) { return r.id === b.dataset.remind; })[0] }, again); }; });
          $('#vt-share', f).onclick = function () {
            close();
            if (api.mode === 'remote') {
              api.call('ensureVaultToken', c.id).then(function (tok) {
                var link = shopLink(tok);
                messageDialog(c, { extra: { label: 'Vault link', text: 'Dear {name}, your bills, records and reminders from {shop} are saved in your personal vault: ' + link + ' (private link, keep it safe).' } }, again);
              }).catch(A.fail);
            } else {
              var lines = v.records.slice(0, 15).map(function (r) { var l = recLabel(r.kind); return '• ' + l.label + (r.title ? ': ' + r.title : '') + (r.dueDate ? ' (' + (l.dueLabel || 'due') + ' ' + A.fmtDate(r.dueDate) + ')' : ''); });
              messageDialog(c, { extra: { label: 'Vault summary', text: 'Dear {name}, here is your record with {shop}:\n' + (lines.join('\n') || '(nothing saved yet)') + '\nWe will remind you before anything is due.' } }, again);
              A.toast('Phone-only mode sends a summary. A shop server gives each customer a private vault link.');
            }
          };
        } });
      return m;
    }).catch(A.fail);
  }

  var vaultState = { days: 7, search: '' };
  A.PAGES.vault = function (view) {
    A.setTitle('Customer vault');
    return Promise.all([api.call('vaultDue', { days: vaultState.days }), api.call('vaultSummary')]).then(function (res) {
      var due = res[0], all = res[1];
      var cfg = vaultCfg();
      view.innerHTML = '<div class="panel stack"><div class="panel-head"><h2>Stay in touch</h2><div class="chips">' + [[7, 'Next 7 days'], [30, 'Next 30 days']].map(function (x) { return '<button type="button" class="chip' + (vaultState.days === x[0] ? ' on' : '') + '" data-vd="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
        '<p class="muted" style="max-width:70ch">Every customer has a vault with their ' + esc(cfg.records.map(function (x) { return x.label.toLowerCase(); }).join(', ')) + ', bills and your messages. Reminders below come from the dates saved in vaults; one tap sends a ready WhatsApp message and keeps a copy in their vault.</p>' +
        (due.length ? '<ul class="flags">' + due.map(function (d, i) {
          return '<li class="flag ' + (d.overdue ? 'high' : 'medium') + '"><span class="pill ' + (d.overdue ? 'bad' : 'warn') + '">' + esc(d.overdue ? 'overdue' : A.fmtDate(d.record.dueDate)) + '</span><div class="row" style="justify-content:space-between"><div style="min-width:0"><b>' + esc(d.customer.name) + '</b> · ' + esc(d.dueLabel) + ': ' + esc(d.record.title || recLabel(d.record.kind).label) +
            '<div class="muted">' + esc(A.fmtDate(d.record.dueDate)) + (d.remindedOn ? ' · reminded ' + esc(A.fmtDate(d.remindedOn)) : ' · not reminded yet') + '</div></div><button type="button" class="btn sm primary" data-due="' + i + '">Send reminder</button></div></li>';
        }).join('') + '</ul>' : A.emptyState('No reminders due', 'Add reminder dates to vault records (refills, services, renewals, birthdays) and they appear here.')) + '</div>' +
        '<div class="panel"><div class="panel-head"><input class="search" id="vt-search" placeholder="Search customers…" value="' + esc(vaultState.search) + '"><span class="spacer"></span><button type="button" class="btn primary" id="vt-newcust">＋ Add customer</button></div>' +
        '<div class="table-wrap" id="vt-table"></div></div>';
      function table() {
        var q = vaultState.search.toLowerCase();
        var rows = all.filter(function (c) { return !q || (c.name + ' ' + (c.phone || '')).toLowerCase().indexOf(q) >= 0; });
        $('#vt-table', view).innerHTML = rows.length ? '<table><thead><tr><th>Customer</th><th class="num">Records</th><th class="num">Bills</th><th class="num">Messages</th><th>Next reminder</th><th>Last contact</th></tr></thead><tbody>' +
          rows.slice(0, 500).map(function (c) {
            return '<tr class="clickable" data-cust="' + c.id + '"><td><b>' + esc(c.name) + '</b><div class="muted">' + esc(c.phone || '') + '</div></td><td class="num">' + c.records + '</td><td class="num">' + c.bills + '</td><td class="num">' + c.messages + '</td><td>' + (c.nextDue ? esc(A.fmtDate(c.nextDue)) + ' <span class="muted">' + esc(c.nextTitle) + '</span>' : '<span class="muted">—</span>') + '</td><td>' + (c.lastContact ? esc(A.fmtDate(c.lastContact)) : '<span class="muted">never</span>') + '</td></tr>';
          }).join('') + '</tbody></table>' : A.emptyState('No customers yet', 'Add your regular customers to start their vaults.');
        $$('[data-cust]', view).forEach(function (tr) { tr.onclick = function () { openVault(tr.dataset.cust, A.render); }; });
      }
      $$('[data-vd]', view).forEach(function (b) { b.onclick = function () { vaultState.days = +b.dataset.vd; A.render(); }; });
      $$('[data-due]', view).forEach(function (b) { b.onclick = function () { var d = due[+b.dataset.due]; messageDialog(d.customer, { record: d.record }, A.render); }; });
      $('#vt-search', view).oninput = function (e) { vaultState.search = e.target.value; table(); };
      $('#vt-newcust', view).onclick = function () {
        A.modal({ title: 'New customer', body: '<div class="form-grid"><label class="field">Name<input name="name" id="nc-name"></label><label class="field">WhatsApp number<input name="phone" id="nc-phone" type="tel" inputmode="tel"></label>' +
          '<label class="field">Email<input name="email" id="nc-email" type="email"></label><label class="field wide">Notes<input name="notes" id="nc-notes"></label></div>',
          onSubmit: function (d) { return api.call('save', 'customers', d).then(function (c) { A.toast('Vault created for ' + c.name); A.render(); setTimeout(function () { openVault(c.id, A.render); }, 300); }); } });
      };
      table();
    });
  };

  // ------------------------------------------------------------ Guide for each business type
  var guideKey = '';
  A.PAGES.guide = function (view) {
    A.setTitle('Guide');
    var I = A.Industries;
    var key = guideKey || A.S.industry;
    var p = I.get(key), rv = p.review, pb = rv.playbook;
    function list(items) { return '<ul class="summary">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
    view.innerHTML = '<div class="panel stack"><div class="row"><label class="field" style="width:auto">Business type<select id="gd-ind">' + A.opt(I.list().map(function (i) { return { value: i.key, text: i.icon + ' ' + i.name }; }), key) + '</select></label>' +
      '<span class="muted" style="max-width:60ch">How BizCore works for this kind of business: who reports numbers, what to photograph, what you learn, and what your customers get.</span></div></div>' +
      '<div class="grid grid-2">' +
      '<div class="panel stack"><h2>Departments involved</h2>' + list(rv.departments) + '</div>' +
      '<div class="panel stack"><h2>Photograph these</h2>' + list(pb.photos) + '<p class="muted">Use Scan receipts. The phone reads them offline; AI reading is optional.</p></div>' +
      '<div class="panel stack"><h2>Enter these</h2>' + list(pb.inputs) + '</div>' +
      '<div class="panel stack"><h2>What you learn as the owner</h2>' + list(pb.owner) + '</div>' +
      '<div class="panel stack"><h2>What your customers get</h2>' + list(pb.customers) + '</div>' +
      '<div class="panel stack"><h2>Customer vault for ' + esc(p.name) + '</h2><b>Kept for each customer</b>' + list(rv.vault.records.map(function (r) { return r.label + (r.dueLabel ? ' (reminds: ' + r.dueLabel.toLowerCase() + ')' : ''); })) +
        '<b>Ready messages</b>' + list(rv.vault.templates.map(function (t) { return t.label; })) + '</div>' +
      '</div>' +
      '<div class="panel"><div class="panel-head"><h2>Key numbers and healthy ranges</h2></div><ul class="kpis">' + rv.kpis.map(function (k) {
        return '<li><div class="kpi-top"><b>' + esc(k.label) + '</b><span class="pill ink">' + k.lo + '–' + k.hi + '%</span></div><div class="muted">' + esc(k.why) + '</div></li>';
      }).join('') + '</ul></div>';
    $('#gd-ind', view).onchange = function (e) { guideKey = e.target.value; A.render(); };
  };

  // ------------------------------------------------------------ Departments
  A.PAGES.departments = function (view) {
    A.setTitle('Departments');
    return deps().then(function (list) {
      view.innerHTML = '<div class="panel"><div class="panel-head"><h2>Departments</h2><button type="button" class="btn primary" id="dp-new">＋ Add department</button></div>' +
        '<p class="muted">Each department reports its own sales, collections, expenses, purchases and wastage. Suggested ones for ' + esc(A.P.name) + ' were added for you; rename or add as needed.</p>' +
        (list.length ? '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Reports</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(function (d) {
          return '<tr data-id="' + d.id + '"><td><b>' + esc(d.name) + '</b></td><td>' + esc({ revenue: 'Sales only', cost: 'Costs only', both: 'Sales and costs' }[d.kind || 'both']) + '</td><td>' + (d.active === false ? '<span class="pill">hidden</span>' : '<span class="pill good">active</span>') + '</td>' +
            '<td class="actions"><button type="button" class="btn sm ghost" data-edit="' + d.id + '">Edit</button><button type="button" class="btn sm ghost" data-del="' + d.id + '" aria-label="Delete">✕</button></td></tr>';
        }).join('') + '</tbody></table></div>' : A.emptyState('No departments', 'Add the parts of your business that report numbers.')) + '</div>';
      function edit(d) {
        A.modal({ title: d ? 'Edit department' : 'New department', body: '<div class="form-grid"><label class="field">Name<input name="name" id="dp-name" value="' + esc(d ? d.name : '') + '"></label>' +
          '<label class="field">Reports<select name="kind" id="dp-kind">' + A.opt([{ value: 'both', text: 'Sales and costs' }, { value: 'revenue', text: 'Sales only' }, { value: 'cost', text: 'Costs only' }], d ? d.kind : 'both') + '</select></label>' +
          '<label class="check"><input type="checkbox" name="active" id="dp-active"' + (!d || d.active !== false ? ' checked' : '') + '> Active</label></div>',
          onSubmit: function (x) { if (d) x.id = d.id; return api.call('saveDepartment', x).then(function () { A.toast('Saved'); A.render(); }); } });
      }
      $('#dp-new', view).onclick = function () { edit(null); };
      $$('[data-edit]', view).forEach(function (b) { b.onclick = function () { edit(list.filter(function (d) { return d.id === b.dataset.edit; })[0]); }; });
      $$('[data-del]', view).forEach(function (b) {
        b.onclick = function () {
          var d = list.filter(function (x) { return x.id === b.dataset.del; })[0];
          A.confirmBox('Remove ' + d.name + '? If it has entries it is hidden instead, so history stays correct.', 'Remove', true).then(function (ok) {
            if (ok) api.call('removeDepartment', d.id).then(function (r) { A.toast(r.deactivated ? 'Hidden' : 'Removed'); A.render(); }).catch(A.fail);
          });
        };
      });
    });
  };
})();
