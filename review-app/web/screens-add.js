/* Home and everything under the Add tab. */
(function () {
  'use strict';
  var A = window.App, api = A.api, $ = A.$, $$ = A.$$, esc = A.esc, money = A.money, R = A.R;

  function deps() { return api.list('departments', { sort: 'order' }).rows.filter(function (d) { return d.active !== false; }); }
  function depOpts(sel, blank) { return A.opt(deps().map(function (d) { return { value: d.id, text: d.name }; }), sel, blank); }

  // ================================================================ HOME
  A.screen('home', { title: 'Home', render: function (el) {
    var t = A.today();
    var hasData = api.info().counts.entries > 0;
    if (!hasData) {
      el.innerHTML = '<div class="card"><h2>Let\'s start</h2><p class="muted">Add today\'s numbers or take a photo of a purchase bill. BizCore starts showing insights from the first day.</p>' +
        '<a class="btn primary block" href="#add-day">Add today\'s numbers</a><a class="btn block" href="#add-bill">Photo of a bill</a>' +
        '<button type="button" class="btn ghost block" id="h-sample">Show me 30 days of example numbers</button></div>';
      $('#h-sample', el).onclick = function () { if (A.act(function () { return api.loadReviewSamples(); }, 'Example numbers added')) A.render(); };
      return;
    }
    var day = api.reviewInsights({ from: t, to: t });
    var week = api.reviewInsights({ from: A.addDays(t, -6), to: t });
    var prevWeek = api.reviewInsights({ from: A.addDays(t, -13), to: A.addDays(t, -7) });
    var month = api.reviewInsights({ from: A.addDays(t, -29), to: t });
    var due = api.vaultDue({ days: 7 });
    var dt = day.totals;
    var change = prevWeek.totals.sale ? Math.round((week.totals.sale - prevWeek.totals.sale) / prevWeek.totals.sale * 100) : null;
    el.innerHTML =
      '<div class="card"><div class="card-head"><h2>Today</h2><a class="btn small" href="#add-day">' + (day.scope.entryCount ? 'Update' : 'Add numbers') + '</a></div>' +
      (day.scope.entryCount ? '<div class="stats">' +
        stat('Sales', money(dt.sale)) + stat('Collected', money(dt.collection), day.ratios.collection !== null ? A.pct(day.ratios.collection) + ' of sales' : '', day.ratios.collection !== null && day.ratios.collection < 97 ? 'bad' : '') +
        stat('Walk-ins', String(dt.walkin || 0), day.ratios.avgSpend ? money(day.ratios.avgSpend) + ' each' : '') + stat('Spending', money(dt.spending), 'purchases + expenses') +
        stat('Cash in hand', cashToday(day), cashNote(day), cashCls(day)) +
        '</div>'
        : '<p class="muted">Nothing entered for today yet.</p>') + '</div>' +
      '<div class="card"><div class="card-head"><h2>Last 7 days</h2>' + (change === null ? '' : '<span class="pill ' + (change >= 0 ? 'good' : 'bad') + '">' + (change >= 0 ? '▲ ' : '▼ ') + Math.abs(change) + '% vs week before</span>') + '</div>' +
        '<div class="stats">' + stat('Sales', money(week.totals.sale)) + stat('Spending', money(week.totals.spending), week.ratios.spending !== null ? A.pct(week.ratios.spending) + ' of sales' : '') + stat('Sales − spending', money(week.totals.sale - week.totals.spending), '', week.totals.sale < week.totals.spending ? 'bad' : 'good') + stat('Walk-ins', String(week.totals.walkin || 0), week.ratios.avgSpend ? money(week.ratios.avgSpend) + ' per customer' : '') + '</div>' +
        A.barChart(week.byDay.map(function (d) { return { a: d.totals.sale, b: d.totals.expense + d.totals.purchase + d.totals.misc, label: d.date, tick: A.niceDate(d.date).split(' ')[0] }; }), { two: true, la: 'Sales', lb: 'Spending', aria: 'Sales and spending, last 7 days' }) + '</div>' +
      '<div class="card"><div class="card-head"><h2>Needs attention</h2><a class="btn small" href="#reports">Reports</a></div>' + A.flagItems(month.flags, 5) +
        (month.flags.length > 5 ? '<a class="btn ghost" href="#reports">See all ' + month.flags.length + '</a>' : '') + '</div>' +
      (due.length ? '<a class="item" href="#customers"><div class="t"><b>' + due.length + ' customer' + (due.length === 1 ? '' : 's') + ' to contact this week</b><span>Refills, services, renewals and occasions due</span></div><span class="pill warn">Send</span></a>' : '') +
      kpiCard(month.kpis);
  } });
  function cashDay(res) { return res.byDay.filter(function (d) { return d.cashCounted !== undefined; })[0]; }
  function cashToday(res) { var d = cashDay(res); return d ? money(d.cashCounted) : 'not counted'; }
  function cashNote(res) { var d = cashDay(res); return !d ? 'count it at close' : d.cashDiff === undefined ? '' : Math.abs(d.cashDiff) < 1 ? 'matches expected' : (d.cashDiff < 0 ? 'short ' : 'over ') + money(Math.abs(d.cashDiff)); }
  function cashCls(res) { var d = cashDay(res); return d && d.cashDiff < -1 ? 'bad' : ''; }
  function stat(l, v, h, cls) { return '<div class="stat ' + (cls || '') + '"><span class="l">' + esc(l) + '</span><span class="v">' + esc(v) + '</span>' + (h ? '<span class="h">' + esc(h) + '</span>' : '') + '</div>'; }
  function kpiCard(kpis) {
    if (!kpis || !kpis.length) return '';
    return '<div class="card"><div class="card-head"><h2>Key numbers (30 days)</h2></div><ul class="list">' + kpis.map(function (k) {
      var pill = k.status === 'good' ? '<span class="pill good">healthy</span>' : k.status === 'nodata' ? '<span class="pill">no data</span>' : '<span class="pill ' + (k.status === 'high' ? 'bad' : 'warn') + '">' + (k.status === 'high' ? 'too high' : 'too low') + '</span>';
      return '<li class="item"><div class="t"><b>' + esc(k.label) + '</b><span>Healthy: ' + k.lo + '–' + k.hi + '%. ' + esc(k.why) + '</span></div><div class="end">' + (k.status === 'nodata' ? '–' : A.pct(k.value)) + '<br>' + pill + '</div></li>';
    }).join('') + '</ul></div>';
  }
  A.stat = stat; A.kpiCard = kpiCard;

  // ================================================================ ADD (hub)
  A.screen('add', { title: 'Add', render: function (el) {
    var tiles = [
      ['add-day', '✎', 'Today\'s numbers', 'Sales, collections, walk-ins, expenses per department', 'main'],
      ['add-bill', '📷', 'Photo of a bill', 'Purchase bill: items, rates and total are read for you'],
      ['add-report', '🧾', 'Day-end report', 'Photo of the printout from your billing machine'],
      ['add-expense', '₹', 'Expense', 'Rent, salary, gas, repairs… fixed or variable'],
      ['add-count', '▦', 'Stock count', 'What is physically in hand now'],
      ['add-issue', '⇢', 'Stock issued', 'Given from the store to a department'],
      ['add-wastage', '⌫', 'Wastage', 'Spoiled, expired, damaged'],
      ['import', '⇪', 'Import', 'From Excel or your billing software']
    ];
    el.innerHTML = '<div class="tiles">' + tiles.map(function (t) {
      return '<a class="tile ' + (t[4] || '') + '" href="#' + t[0] + '"><span class="ic" aria-hidden="true">' + t[1] + '</span><b>' + esc(t[2]) + '</b><span>' + esc(t[3]) + '</span></a>';
    }).join('') + '</div><a class="item" href="#entries"><div class="t"><b>Everything entered</b><span>See, change or delete any entry</span></div><span aria-hidden="true">›</span></a>';
  } });

  // ================================================================ Today's numbers (per department)
  var dayState = { date: '', half: '', dep: '' };
  var DAY_FIELDS = [['walkin', 'Walk-ins (customers)'], ['sale', 'Sales (billed)'], ['cash', 'Collected in cash'], ['upi', 'Collected by UPI'], ['card', 'Collected by card'],
    ['otherCollection', 'Collected: other / online'], ['expense', 'Expenses paid in cash'], ['purchase', 'Purchases paid in cash'], ['misc', 'Miscellaneous paid in cash'],
    ['received', 'Goods received (value)'], ['wastage', 'Wastage (value)'], ['deposit', 'Cash deposited / taken out'], ['cashInHand', 'Cash in hand at close (counted)']];
  A.screen('add-day', { title: 'Today\'s numbers', back: 'add', tab: 'add', render: function (el) {
    var list = deps();
    if (!list.length) { el.innerHTML = A.empty('No departments', 'Add the parts of your business first.', '<a class="btn primary" href="#departments">Departments</a>'); return; }
    if (!dayState.date) dayState.date = A.today();
    if (!dayState.dep || !list.some(function (d) { return d.id === dayState.dep; })) dayState.dep = list[0].id;
    var sheet = api.getDailySheet(dayState.date, dayState.half);
    var row = sheet.filter(function (r) { return r.departmentId === dayState.dep; })[0] || {};
    var filled = {}; sheet.forEach(function (r) { filled[r.departmentId] = DAY_FIELDS.some(function (f) { return r[f[0]]; }); });
    el.innerHTML = '<div class="card"><div class="grid2">' + A.field('Date', A.input('d-date', 'date', dayState.date)) +
      A.field('Part of day', '<select id="d-half">' + A.opt([{ value: '', text: 'Whole day' }, { value: 'first', text: 'Morning (before ' + A.S().halfDaySplit + ')' }, { value: 'second', text: 'Evening' }], dayState.half) + '</select>') + '</div>' +
      '<div class="seg" id="d-deps">' + list.map(function (d) { return '<button type="button" data-v="' + d.id + '"' + (d.id === dayState.dep ? ' class="on"' : '') + '>' + (filled[d.id] ? '✓ ' : '') + esc(d.name) + '</button>'; }).join('') + '</div></div>' +
      '<div class="card"><div class="grid2">' + DAY_FIELDS.map(function (f) { return A.field(f[1], A.input('d-' + f[0], 'number', row[f[0]] || '', 'min="0" placeholder="0"')); }).join('') + '</div>' +
      '<div id="d-gap"></div><button type="button" class="btn primary block" id="d-save">Save ' + esc((list.filter(function (d) { return d.id === dayState.dep; })[0] || {}).name || '') + '</button></div>';
    function gap() {
      var v = function (k) { return parseFloat(A.val('d-' + k, el)) || 0; };
      var s = v('sale'), c = v('cash') + v('upi') + v('card') + v('otherCollection'), w = v('walkin');
      var bits = [];
      if (s || c) { var d = Math.round(s - c); bits.push(d > 0 ? '<span class="pill bad">' + money(d) + ' not collected</span>' : d < 0 ? '<span class="pill warn">' + money(-d) + ' more collected than sold</span>' : '<span class="pill good">Fully collected</span>'); }
      if (s && w) bits.push('<span class="pill ink">' + money(s / w) + ' per customer</span>');
      $('#d-gap', el).innerHTML = bits.length ? '<div class="row">' + bits.join('') + '</div>' : '';
    }
    $$('input[id^="d-"]', el).forEach(function (i) { i.oninput = gap; }); gap();
    $('#d-date', el).onchange = function (e) { dayState.date = e.target.value || A.today(); A.render(); };
    $('#d-half', el).onchange = function (e) { dayState.half = e.target.value; A.render(); };
    A.onSeg($('#d-deps', el), function (v) { dayState.dep = v; A.render(); });
    $('#d-save', el).onclick = function () {
      var r = { departmentId: dayState.dep }; DAY_FIELDS.forEach(function (f) { r[f[0]] = A.val('d-' + f[0], el); });
      var res = A.act(function () { return api.saveDailySheet({ date: dayState.date, half: dayState.half, rows: [r] }); });
      if (res) {
        A.toast('Saved');
        var next = list[list.findIndex(function (d) { return d.id === dayState.dep; }) + 1];
        if (next) dayState.dep = next.id;
        A.render();
      }
    };
  } });

  // ================================================================ Photo of a bill (OCR)
  var ocr = { worker: null, loading: null };
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('missing ' + src)); }; document.head.appendChild(s); }); }
  function ocrWorker(progress) {
    if (ocr.worker) return Promise.resolve(ocr.worker);
    if (ocr.loading) return ocr.loading;
    var base = new URL('vendor/ocr/', location.href).href;
    ocr.loading = (window.Tesseract ? Promise.resolve() : loadScript(base + 'tesseract.min.js')).then(function () {
      return window.Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base + 'tesseract-core-lstm.wasm.js', langPath: base + 'lang',
        workerBlobURL: false, cacheMethod: 'none', gzip: false, logger: function (m) { if (progress && m && m.status) progress(m.status, m.progress); } });
    }).then(function (w) { ocr.worker = w; ocr.loading = null; return w; }, function (e) {
      ocr.loading = null; throw new Error('Reading on this device is not available here. Use the BizCore app, add an AI key in Settings, or type the bill in.');
    });
    return ocr.loading;
  }
  function prepareImage(file) {
    return A.readFile(file, true).then(function (url) {
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, 1800 / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          var g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
          var colour = c.toDataURL('image/jpeg', .85);
          var d = g.getImageData(0, 0, c.width, c.height), px = d.data;
          for (var i = 0; i < px.length; i += 4) { var y = .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2]; y = y > 160 ? 255 : y < 90 ? 0 : (y - 90) * 255 / 70; px[i] = px[i + 1] = px[i + 2] = y; }
          g.putImageData(d, 0, 0);
          res({ canvas: c, base64: colour.split(',')[1], preview: colour });
        };
        img.onerror = function () { rej(new Error('That file is not a photo the app can read.')); };
        img.src = url;
      });
    });
  }
  function aiKey() { return A.lsGet(A.AIKEY) || ''; }
  function readPhoto(img, kind, depName, status) {
    var useAI = !!aiKey() && navigator.onLine !== false;
    var P = A.P();
    function device() {
      status('Reading on this phone… (first time takes longer)');
      return ocrWorker(function (s, p) { status('Reading on this phone: ' + s + (p ? ' ' + Math.round(p * 100) + '%' : '')); })
        .then(function (w) { return w.recognize(img.canvas); })
        .then(function (r) { var text = r.data.text || ''; return { out: kind === 'report' ? A.OCR.parseSalesReport(text) : A.OCR.parse(text, { mode: kind === 'stock' || kind === 'supply' ? 'qty' : 'bill' }), text: text, engine: 'phone' }; });
    }
    if (!useAI) return device();
    status('Reading with AI…');
    var call = kind === 'report'
      ? A.AI.readSalesReport(window.fetch.bind(window), { apiKey: aiKey(), model: A.S().geminiModel, base64: img.base64, mimeType: 'image/jpeg', presetName: P.name })
      : A.AI.readReceipt(window.fetch.bind(window), { apiKey: aiKey(), model: A.S().geminiModel, base64: img.base64, mimeType: 'image/jpeg', presetName: P.name, department: depName,
        hints: P.review.receiptHints, categories: P.review.costCategories.map(function (c) { return c.name; }), expectType: kind });
    return call.then(function (out) { return { out: out, text: '', engine: 'AI' }; }, function (e) { status('AI not available (' + e.message + '). Reading on this phone…'); return device(); });
  }
  A.readPhoto = readPhoto; A.prepareImage = prepareImage;

  function photoButtons(prefix) {
    return '<div class="row"><label class="btn primary grow" for="' + prefix + '-cam">📷 Take photo</label><input type="file" id="' + prefix + '-cam" accept="image/*" capture="environment" hidden>' +
      '<label class="btn grow" for="' + prefix + '-file">Choose photo</label><input type="file" id="' + prefix + '-file" accept="image/*" hidden></div>';
  }
  function onPhoto(el, prefix, fn) {
    [prefix + '-cam', prefix + '-file'].forEach(function (id) { $('#' + id, el).onchange = function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) fn(f); }; });
  }

  // Item lines editor used by bills, stock counts and issues
  function linesEditor(box, items, opts) {
    opts = opts || {};
    function draw() {
      box.innerHTML = '<div class="lines">' + items.map(function (it, i) {
        return '<div class="line"><div class="name"><input data-i="' + i + '" data-k="name" value="' + esc(it.name) + '" placeholder="Item" aria-label="Item"><button type="button" class="btn small ghost" data-rm="' + i + '" aria-label="Remove">✕</button></div>' +
          '<label class="f">' + (opts.qtyLabel || 'Qty') + '<input data-i="' + i + '" data-k="qty" type="number" inputmode="decimal" step="any" value="' + esc(it.qty) + '"></label>' +
          '<label class="f">Unit<input data-i="' + i + '" data-k="unit" value="' + esc(it.unit) + '" placeholder="kg"></label>' +
          (opts.noRate ? '' : '<label class="f">Rate<input data-i="' + i + '" data-k="rate" type="number" inputmode="decimal" step="any" value="' + esc(it.rate) + '"></label>') +
          (opts.noRate ? '' : '<label class="f">Amount<input data-i="' + i + '" data-k="amount" type="number" inputmode="decimal" step="any" value="' + esc(it.amount) + '"></label>') +
          (opts.received ? '<label class="f">Received<input data-i="' + i + '" data-k="received" type="number" inputmode="decimal" step="any" value="' + esc(it.received) + '" placeholder="all"></label>' : '') + '</div>';
      }).join('') + '</div><div class="row"><button type="button" class="btn small" data-add>＋ Add item</button><span class="muted small grow" data-sum></span></div>';
      $$('input[data-i]', box).forEach(function (inp) {
        inp.oninput = function () {
          var it = items[+inp.dataset.i]; it[inp.dataset.k] = inp.value;
          if ((inp.dataset.k === 'qty' || inp.dataset.k === 'rate') && it.qty && it.rate && !opts.noRate) { it.amount = Math.round(it.qty * it.rate * 100) / 100; var a = $('input[data-i="' + inp.dataset.i + '"][data-k="amount"]', box); if (a) a.value = it.amount; }
          sum(); if (opts.onChange) opts.onChange();
        };
      });
      $$('[data-rm]', box).forEach(function (b) { b.onclick = function () { items.splice(+b.dataset.rm, 1); draw(); if (opts.onChange) opts.onChange(); }; });
      $('[data-add]', box).onclick = function () { items.push({ name: '', qty: '', unit: '', rate: '', amount: '' }); draw(); };
      sum();
    }
    function sum() { var s = items.reduce(function (a, it) { return a + (parseFloat(it.amount) || 0); }, 0); var el = $('[data-sum]', box); if (el) el.textContent = opts.noRate ? items.length + ' item(s)' : 'Lines add up to ' + money(s, 2); }
    draw();
    return { items: function () { return items.filter(function (it) { return String(it.name || '').trim(); }); } };
  }
  A.linesEditor = linesEditor;

  var billState = { type: 'purchase', dep: '' };
  A.screen('add-bill', { title: 'Photo of a bill', back: 'add', tab: 'add', render: function (el, st) {
    if (st && st.type) billState.type = st.type;
    var types = [['purchase', 'Purchase bill'], ['expense', 'Expense voucher'], ['wastage', 'Wastage sheet'], ['supply', 'Stock issue slip'], ['stock', 'Stock count sheet']];
    el.innerHTML = '<div class="card">' + A.field('What is it', A.seg('b-type', types, billState.type)) +
      A.field('Department', '<select id="b-dep">' + depOpts(billState.dep, 'Whole business') + '</select>') + photoButtons('b') +
      '<button type="button" class="btn ghost" id="b-type-in">Type it in instead</button>' +
      '<p class="muted small" id="b-status">' + (aiKey() ? 'Read with AI when online, on the phone when offline.' : 'Read on this phone, no internet needed. Flat bill, good light, fill the frame.') + '</p></div><div id="b-out"></div>';
    A.onSeg($('#b-type', el), function (v) { billState.type = v; });
    $('#b-dep', el).onchange = function (e) { billState.dep = e.target.value; };
    var status = function (t) { $('#b-status', el).textContent = t; };
    onPhoto(el, 'b', function (file) {
      var img;
      status('Preparing photo…');
      prepareImage(file).then(function (p) { img = p; var d = deps().filter(function (x) { return x.id === billState.dep; })[0]; return readPhoto(img, billState.type, d ? d.name : '', status); })
        .then(function (r) { status(r.out.items && r.out.items.length ? 'Read ' + r.out.items.length + ' lines. Check below and save.' : 'No item lines found. Fill in the total, or the lines, below.'); billForm($('#b-out', el), r.out, r.engine, r.text, img.preview); })
        .catch(function (e) { status(e.message); A.toast(e.message, true); });
    });
    $('#b-type-in', el).onclick = function () { billForm($('#b-out', el), { vendor: '', billNo: '', date: A.today(), total: 0, items: [], notes: [] }, 'typed', '', null); };
  } });

  function billForm(box, out, engine, text, preview) {
    var type = billState.type;
    var itemOnly = type === 'stock' || type === 'supply';
    var cats = A.P().review.costCategories;
    box.innerHTML = '<div class="card"><div class="card-head"><h2>Check and save</h2><span class="pill ink">' + esc(engine === 'typed' ? 'Typed' : 'Read by ' + engine) + '</span></div>' +
      (preview ? '<img class="photo" src="' + preview + '" alt="Bill photo">' : '') +
      '<div class="grid2">' + A.field('Date', A.input('bf-date', 'date', out.date || A.today())) +
        (itemOnly ? '' : A.field('Total amount', A.input('bf-total', 'number', out.total || ''))) +
        (itemOnly ? '' : A.field(type === 'purchase' ? 'Supplier' : 'Paid to', A.input('bf-vendor', 'text', out.vendor))) +
        (itemOnly ? '' : A.field('Bill number', A.input('bf-bill', 'text', out.billNo))) +
        (itemOnly ? A.field(type === 'supply' ? 'Issued to' : 'Counted at', '<select id="bf-dep">' + depOpts(billState.dep, 'Whole business') + '</select>') : '') +
        (itemOnly ? '' : A.field('Paid by', '<select id="bf-paid">' + A.opt([{ value: 'Cash', text: 'Cash' }, { value: 'UPI', text: 'UPI' }, { value: 'Card', text: 'Card' }, { value: 'Bank transfer', text: 'Bank transfer' }, { value: 'Credit', text: 'Credit (pay later)' }], type === 'purchase' ? 'Credit' : 'Cash') + '</select>')) +
        (type === 'expense' || type === 'purchase' ? A.field('Category', '<select id="bf-cat">' + A.opt(cats.map(function (c) { return { value: c.name, text: c.name + (c.type === 'fixed' ? ' (fixed)' : '') }; }), out.category || '', 'Choose…') + '</select>') : '') + '</div>' +
      ((out.notes || []).length ? '<div class="banner">' + out.notes.map(esc).join('<br>') + '</div>' : '') +
      '<b>' + (type === 'stock' ? 'Items counted' : type === 'supply' ? 'Items issued' : 'Items on the bill') + '</b><div id="bf-lines"></div><div id="bf-checks"></div>' +
      (text ? '<details><summary class="muted small">Text read from the photo</summary><pre class="ocr">' + esc(text) + '</pre></details>' : '') +
      '<div class="row"><button type="button" class="btn grow" id="bf-cancel">Discard</button><button type="button" class="btn primary grow" id="bf-save">Save</button></div></div>';
    var ed = linesEditor($('#bf-lines', box), (out.items || []).map(function (x) { return Object.assign({}, x); }), { noRate: itemOnly, received: type === 'purchase', qtyLabel: type === 'stock' ? 'Counted' : 'Qty', onChange: function () { checks(); } });
    function data() {
      return { type: type, date: A.val('bf-date', box), amount: A.val('bf-total', box), vendor: A.val('bf-vendor', box), billNo: A.val('bf-bill', box),
        departmentId: itemOnly ? A.val('bf-dep', box) : billState.dep, category: A.val('bf-cat', box), method: A.val('bf-paid', box), items: ed.items(), note: type === 'stock' ? 'Stock count' : '' };
    }
    var checks = function () {
      if (type !== 'purchase') return;
      var d = data(), c;
      try { c = api.checkReceipt({ vendor: d.vendor, billNo: d.billNo, date: d.date, items: d.items, total: d.amount, departmentId: d.departmentId }); } catch (e) { return; }
      var f = [];
      if (c.duplicate) f.push({ severity: 'high', title: 'Already saved', detail: 'Same supplier and bill number saved on ' + c.duplicate.date + '.' });
      c.priceAlerts.forEach(function (a) { f.push({ severity: a.up >= 25 ? 'high' : 'medium', title: a.item + ' is ' + a.up + '% above the usual price', detail: money(a.rate, 2) + ' now vs ' + money(a.usual, 2) + ' usually.' }); });
      c.cheaperElsewhere.forEach(function (x) { f.push({ severity: 'info', title: x.item + ' was cheaper from ' + x.otherVendor, detail: money(x.otherRate, 2) + ' on ' + x.otherDate + '.' }); });
      c.issues.forEach(function (t) { f.push({ severity: 'medium', title: t, detail: '' }); });
      $('#bf-checks', box).innerHTML = f.length ? A.flagItems(f) : '<p class="muted small">Checks: prices, totals and duplicates look fine.</p>';
    };
    ['bf-total', 'bf-vendor', 'bf-bill', 'bf-date'].forEach(function (id) { var x = $('#' + id, box); if (x) x.oninput = checks; });
    checks();
    $('#bf-cancel', box).onclick = function () { box.innerHTML = ''; };
    $('#bf-save', box).onclick = function () {
      var d = data();
      if (!itemOnly && !d.items.length && !(parseFloat(d.amount) > 0)) { A.toast('Enter the total amount or the item lines', true); return; }
      var saved = A.act(function () { return api.saveReceipt({ entry: d, engine: engine, text: text }); });
      if (!saved) {
        var dup = d.billNo && d.vendor;
        if (dup) A.confirmSheet('This bill number from this supplier is already saved. Save it again anyway?', 'Save again').then(function (ok) {
          if (ok && A.act(function () { return api.saveReceipt({ entry: d, engine: engine, text: text, allowDuplicate: true }); }, 'Saved')) A.go('add');
        });
        return;
      }
      A.toast('Saved'); box.innerHTML = '';
      window.scrollTo(0, 0);
    };
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ================================================================ Day-end report photo
  A.screen('add-report', { title: 'Day-end report', back: 'add', tab: 'add', render: function (el) {
    el.innerHTML = '<div class="card"><p class="muted">Photograph the day-end / Z report printed by your billing machine. Sales, cash, UPI, card and the number of bills are read for you.</p>' +
      photoButtons('r') + '<p class="muted small" id="r-status"></p></div><div id="r-out"></div>';
    var status = function (t) { $('#r-status', el).textContent = t; };
    onPhoto(el, 'r', function (file) {
      var img;
      status('Preparing photo…');
      prepareImage(file).then(function (p) { img = p; return readPhoto(img, 'report', '', status); })
        .then(function (r) { status('Check the figures below.'); reportForm($('#r-out', el), r.out, r.text, img.preview); })
        .catch(function (e) { status(e.message); A.toast(e.message, true); });
    });
  } });
  function reportForm(box, o, text, preview) {
    box.innerHTML = '<div class="card"><img class="photo" src="' + preview + '" alt="Report photo"><div class="grid2">' +
      A.field('Date', A.input('rf-date', 'date', o.date || A.today())) +
      A.field('Part of day', '<select id="rf-half">' + A.opt([{ value: '', text: 'Whole day' }, { value: 'first', text: 'Morning' }, { value: 'second', text: 'Evening' }], '') + '</select>') +
      A.field('Department', '<select id="rf-dep">' + depOpts(deps()[0] && deps()[0].id) + '</select>') +
      A.field('Net sales', A.input('rf-sale', 'number', o.sale || '')) + A.field('Cash', A.input('rf-cash', 'number', o.cash || '')) +
      A.field('UPI', A.input('rf-upi', 'number', o.upi || '')) + A.field('Card', A.input('rf-card', 'number', o.card || '')) +
      A.field('Other / online', A.input('rf-other', 'number', o.other || '')) + A.field('Walk-ins / bills', A.input('rf-walk', 'number', o.walkins || '')) + '</div>' +
      (text ? '<details><summary class="muted small">Text read from the photo</summary><pre class="ocr">' + esc(text) + '</pre></details>' : '') +
      '<button type="button" class="btn primary block" id="rf-save">Save</button></div>';
    $('#rf-save', box).onclick = function () {
      var date = A.val('rf-date', box), half = A.val('rf-half', box), dep = A.val('rf-dep', box);
      var ok = A.act(function () {
        var row = api.getDailySheet(date, half).filter(function (r) { return r.departmentId === dep; })[0] || { departmentId: dep };
        row.sale = A.val('rf-sale', box); row.cash = A.val('rf-cash', box); row.upi = A.val('rf-upi', box); row.card = A.val('rf-card', box);
        row.otherCollection = A.val('rf-other', box); row.walkin = A.val('rf-walk', box);
        return api.saveDailySheet({ date: date, half: half, rows: [row] });
      }, 'Saved');
      if (ok) box.innerHTML = '';
    };
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ================================================================ Expense
  A.screen('add-expense', { title: 'Expense', back: 'add', tab: 'add', render: function (el) {
    var cats = A.P().review.costCategories;
    var st = { cat: '', misc: false };
    el.innerHTML = '<div class="card">' + A.field('What for', '<div class="seg" id="e-cats">' + cats.map(function (c) { return '<button type="button" data-v="' + esc(c.name) + '">' + esc(c.name) + '</button>'; }).join('') + '</div>') +
      '<div class="grid2">' + A.field('Amount', A.input('e-amt', 'number', '', 'min="0"')) + A.field('Date', A.input('e-date', 'date', A.today())) +
      A.field('Fixed or variable', '<select id="e-cost">' + A.opt([{ value: '', text: 'From category' }, { value: 'fixed', text: 'Fixed (rent, salary, EMI…)' }, { value: 'variable', text: 'Variable' }], '') + '</select>') +
      A.field('Department', '<select id="e-dep">' + depOpts('', 'Whole business') + '</select>') +
      A.field('Paid to', A.input('e-to', 'text', '')) + A.field('Paid by', '<select id="e-paid">' + A.opt(['Cash', 'UPI', 'Card', 'Bank transfer', 'Credit']) + '</select>') + A.field('Time (optional)', A.input('e-time', 'time', '')) +
      '<label class="f full">Note' + A.input('e-note', 'text', '') + '</label></div>' +
      '<label class="chk"><input type="checkbox" id="e-misc"> Miscellaneous (no proper category or bill)</label>' +
      '<button type="button" class="btn primary block" id="e-save">Save expense</button><a class="btn ghost" href="#add-bill">Have a voucher? Take a photo instead</a></div>';
    A.onSeg($('#e-cats', el), function (v) { st.cat = v; });
    $('#e-save', el).onclick = function () {
      var ok = A.act(function () {
        return api.saveEntry({ type: $('#e-misc', el).checked ? 'misc' : 'expense', amount: A.val('e-amt', el), date: A.val('e-date', el), time: A.val('e-time', el), category: st.cat || ($('#e-misc', el).checked ? 'Miscellaneous' : 'Other'),
          costType: A.val('e-cost', el), departmentId: A.val('e-dep', el), vendor: A.val('e-to', el), method: A.val('e-paid', el), note: A.val('e-note', el) });
      }, 'Expense saved');
      if (ok) A.render();
    };
  } });

  // ================================================================ Stock count / issued / wastage
  function knownItemRows() {
    var inv = api.inventory({});
    var seen = {}, rows = [];
    inv.items.forEach(function (m) { seen[m.name.toLowerCase()] = 1; rows.push({ name: m.name, unit: m.unit, expected: m.inHand }); });
    api.knownItems().forEach(function (k) { if (!seen[k.name.toLowerCase()]) rows.push({ name: k.name, unit: k.unit, expected: null }); });
    return rows;
  }
  A.screen('add-count', { title: 'Stock count', back: 'add', tab: 'add', render: function (el) {
    var rows = knownItemRows();
    var store = deps().filter(function (d) { return /store|godown/i.test(d.name); })[0];
    el.innerHTML = '<div class="card"><div class="grid2">' + A.field('Date', A.input('c-date', 'date', A.today())) + A.field('Counted at', '<select id="c-dep">' + depOpts(store ? store.id : '', 'Whole business') + '</select>') + '</div>' +
      '<p class="muted small">Type what you physically count. Leave blank what you did not count.</p>' +
      (rows.length ? '<ul class="list">' + rows.map(function (r, i) {
        return '<li class="item"><div class="t"><b>' + esc(r.name) + '</b><span>' + (r.expected === null ? 'not tracked yet' : 'should be ' + r.expected + ' ' + esc(r.unit)) + '</span></div><input style="max-width:110px" type="number" inputmode="decimal" step="any" min="0" data-c="' + i + '" aria-label="Counted ' + esc(r.name) + '"></li>';
      }).join('') + '</ul>' : '') +
      '<b>Other items</b><div id="c-more"></div><button type="button" class="btn primary block" id="c-save">Save count</button><a class="btn ghost" href="#add-bill" id="c-photo">Have a count sheet? Take a photo</a></div>';
    var more = linesEditor($('#c-more', el), [], { noRate: true, qtyLabel: 'Counted' });
    $('#c-photo', el).onclick = function (e) { e.preventDefault(); billState.type = 'stock'; A.go('add-bill', { type: 'stock' }); };
    $('#c-save', el).onclick = function () {
      var items = [];
      $$('[data-c]', el).forEach(function (inp) { if (inp.value !== '') { var r = rows[+inp.dataset.c]; items.push({ name: r.name, unit: r.unit, qty: inp.value }); } });
      items = items.concat(more.items());
      if (!items.length) { A.toast('Enter at least one counted quantity', true); return; }
      if (A.act(function () { return api.saveEntry({ type: 'stock', date: A.val('c-date', el), departmentId: A.val('c-dep', el), items: items, note: 'Stock count' }); }, 'Stock count saved')) A.go('stock');
    };
  } });
  A.screen('add-issue', { title: 'Stock issued', back: 'add', tab: 'add', render: function (el) {
    var rows = knownItemRows();
    el.innerHTML = '<div class="card"><div class="grid2">' + A.field('Date', A.input('i-date', 'date', A.today())) + A.field('Issued to', '<select id="i-dep">' + depOpts(deps()[0] && deps()[0].id) + '</select>') + '</div>' +
      (rows.length ? '<ul class="list">' + rows.map(function (r, i) {
        return '<li class="item"><div class="t"><b>' + esc(r.name) + '</b><span>' + (r.expected === null ? '' : r.expected + ' ' + esc(r.unit) + ' in hand') + '</span></div><input style="max-width:110px" type="number" inputmode="decimal" step="any" min="0" data-q="' + i + '" aria-label="Issued ' + esc(r.name) + '"></li>';
      }).join('') + '</ul>' : '') +
      '<b>Other items</b><div id="i-more"></div><button type="button" class="btn primary block" id="i-save">Save</button><a class="btn ghost" href="#add-bill" id="i-photo">Have an issue slip? Take a photo</a></div>';
    var more = linesEditor($('#i-more', el), [], { noRate: true });
    $('#i-photo', el).onclick = function (e) { e.preventDefault(); billState.type = 'supply'; A.go('add-bill', { type: 'supply' }); };
    $('#i-save', el).onclick = function () {
      var items = [];
      $$('[data-q]', el).forEach(function (inp) { if (inp.value !== '') { var r = rows[+inp.dataset.q]; items.push({ name: r.name, unit: r.unit, qty: inp.value }); } });
      items = items.concat(more.items());
      if (!items.length) { A.toast('Enter at least one quantity', true); return; }
      if (A.act(function () { return api.saveEntry({ type: 'supply', date: A.val('i-date', el), departmentId: A.val('i-dep', el), items: items }); }, 'Saved')) A.render();
    };
  } });
  A.screen('add-wastage', { title: 'Wastage', back: 'add', tab: 'add', render: function (el) {
    el.innerHTML = '<div class="card"><div class="grid2">' + A.field('Value (₹)', A.input('w-amt', 'number', '', 'min="0"')) + A.field('Date', A.input('w-date', 'date', A.today())) +
      A.field('Department', '<select id="w-dep">' + depOpts(deps()[0] && deps()[0].id) + '</select>') + A.field('Reason', '<select id="w-why">' + A.opt(['Spoiled', 'Expired', 'Damaged', 'Leftover / unsold', 'Returned', 'Other']) + '</select>') +
      '<label class="f full">Note' + A.input('w-note', 'text', '') + '</label></div><b>Items (optional, keeps stock right)</b><div id="w-items"></div>' +
      '<button type="button" class="btn primary block" id="w-save">Save wastage</button></div>';
    var ed = linesEditor($('#w-items', el), [], {});
    $('#w-save', el).onclick = function () {
      if (A.act(function () { return api.saveEntry({ type: 'wastage', amount: A.val('w-amt', el), date: A.val('w-date', el), departmentId: A.val('w-dep', el), category: A.val('w-why', el), note: A.val('w-note', el), items: ed.items() }); }, 'Wastage saved')) A.render();
    };
  } });

  // ================================================================ Import
  A.screen('import', { title: 'Import', back: 'add', tab: 'add', render: function (el) {
    el.innerHTML = '<div class="card"><p>Bring in numbers from Excel, Google Sheets, Tally or your billing software as a <b>CSV</b> file.</p>' +
      '<p class="muted small">Columns: <b>date, department, type, amount</b>; optional: half (morning / evening), time, method (Cash / UPI / Card), category, fixed/variable, vendor, bill no, note. Type: sales, collection, walk-ins, expense, purchase, received, wastage or misc.</p>' +
      '<label class="btn" for="im-file">Choose CSV file</label><input type="file" id="im-file" accept=".csv,text/csv" hidden>' +
      A.field('…or paste it here', '<textarea id="im-text" placeholder="date,department,type,amount,method&#10;2026-11-05,Restaurant,sales,32000,&#10;2026-11-05,Restaurant,collection,20000,Cash&#10;2026-11-05,Restaurant,walk-ins,96,"></textarea>') +
      '<button type="button" class="btn primary block" id="im-go">Import</button><div id="im-out"></div></div>';
    $('#im-file', el).onchange = function (e) { var f = e.target.files[0]; if (f) A.readFile(f).then(function (t) { $('#im-text', el).value = t; }); };
    $('#im-go', el).onclick = function () {
      var rows = A.Base.parseCSV(A.val('im-text', el));
      if (!rows.length) { A.toast('No rows found. The first line must be the column names.', true); return; }
      var r = A.act(function () { return api.importEntries(rows); });
      if (r) $('#im-out', el).innerHTML = '<div class="banner info">Imported ' + r.imported + ' row(s).' + (r.skippedCount ? ' Skipped ' + r.skippedCount + ': ' + esc(r.skipped.slice(0, 5).join('; ')) : '') + '</div>';
    };
  } });

  // ================================================================ All entries
  var entState = { type: '', days: 7 };
  A.screen('entries', { title: 'Everything entered', back: 'add', tab: 'add', render: function (el) {
    var t = A.today();
    var res = api.list('entries', { type: entState.type, from: A.addDays(t, -(entState.days - 1)), to: t, sort: '-at', limit: 300 });
    el.innerHTML = A.seg('en-days', [[1, 'Today'], [7, '7 days'], [30, '30 days']], entState.days) +
      A.seg('en-type', [['', 'All']].concat(R.TYPES.map(function (k) { return [k, R.TYPE_LABELS[k]]; })), entState.type) +
      (res.rows.length ? '<ul class="list">' + res.rows.map(function (e) {
        var det = [e.departmentName || 'Whole business', e.half === 'first' ? 'morning' : e.half === 'second' ? 'evening' : '', e.category, e.vendor, e.items && e.items.length ? e.items.length + ' items' : ''].filter(Boolean).join(' · ');
        return '<li><button type="button" class="item" data-id="' + e.id + '"><div class="t"><b>' + esc(R.TYPE_LABELS[e.type]) + '</b><span>' + esc(A.niceDate(e.date) + ' · ' + det) + '</span></div><div class="end">' + (e.type === 'walkin' ? e.amount : e.type === 'stock' || e.type === 'supply' ? '' : money(e.amount)) + '</div></button></li>';
      }).join('') + '</ul>' + (res.total > 300 ? '<p class="muted small">Showing the latest 300 of ' + res.total + '.</p>' : '') : A.empty('Nothing here', 'Change the days or the type.'));
    A.onSeg($('#en-days', el), function (v) { entState.days = +v; A.render(); });
    A.onSeg($('#en-type', el), function (v) { entState.type = v; A.render(); });
    $$('[data-id]', el).forEach(function (b) { b.onclick = function () { A.go('entry', { id: b.dataset.id }); }; });
  } });
  A.screen('entry', { title: 'Entry', back: 'entries', tab: 'add', render: function (el, st) {
    var e = st && st.id ? api.get('entries', st.id) : null;
    if (!e) { A.go('entries'); return; }
    var itemOnly = e.type === 'stock' || e.type === 'supply';
    el.innerHTML = '<div class="card"><div class="card-head"><h2>' + esc(R.TYPE_LABELS[e.type]) + '</h2><span class="pill">' + esc(e.source || 'manual') + '</span></div><div class="grid2">' +
      A.field('Date', A.input('x-date', 'date', e.date)) + A.field('Department', '<select id="x-dep">' + depOpts(e.departmentId, 'Whole business') + '</select>') +
      (itemOnly ? '' : A.field(e.type === 'walkin' ? 'Number of walk-ins' : 'Amount', A.input('x-amt', 'number', e.amount))) +
      A.field('Part of day', '<select id="x-half">' + A.opt([{ value: '', text: 'Whole day' }, { value: 'first', text: 'Morning' }, { value: 'second', text: 'Evening' }], e.half) + '</select>') +
      (e.type === 'collection' ? A.field('Received by', '<select id="x-method">' + A.opt(R.METHODS, e.method) + '</select>') : '') +
      (e.type === 'expense' || e.type === 'misc' ? A.field('Fixed or variable', '<select id="x-cost">' + A.opt([{ value: 'fixed', text: 'Fixed' }, { value: 'variable', text: 'Variable' }], e.costType) + '</select>') : '') +
      (['expense', 'misc', 'purchase', 'wastage'].indexOf(e.type) >= 0 ? A.field('Category', A.input('x-cat', 'text', e.category)) : '') +
      (['expense', 'misc', 'purchase', 'received'].indexOf(e.type) >= 0 ? A.field('Vendor / paid to', A.input('x-vendor', 'text', e.vendor)) : '') +
      '<label class="f full">Note' + A.input('x-note', 'text', e.note) + '</label></div>' +
      (e.items && e.items.length || ['purchase', 'stock', 'supply', 'wastage'].indexOf(e.type) >= 0 ? '<b>Items</b><div id="x-items"></div>' : '') +
      '<div class="row"><button type="button" class="btn danger grow" id="x-del">Delete</button><button type="button" class="btn primary grow" id="x-save">Save</button></div></div>';
    var ed = $('#x-items', el) ? linesEditor($('#x-items', el), (e.items || []).map(function (x) { return Object.assign({}, x); }), { noRate: itemOnly, received: e.type === 'purchase' }) : null;
    $('#x-save', el).onclick = function () {
      var d = { id: e.id, type: e.type, source: e.source, receiptId: e.receiptId, date: A.val('x-date', el), departmentId: A.val('x-dep', el), half: A.val('x-half', el), time: '',
        amount: itemOnly ? '' : A.val('x-amt', el), method: A.val('x-method', el), costType: A.val('x-cost', el), category: A.val('x-cat', el) || e.category, vendor: A.val('x-vendor', el) || e.vendor, billNo: e.billNo, note: A.val('x-note', el), items: ed ? ed.items() : [] };
      if (A.act(function () { return api.saveEntry(d); }, 'Saved')) A.go('entries');
    };
    $('#x-del', el).onclick = function () { A.confirmSheet('Delete this entry?', 'Delete', true).then(function (ok) { if (ok && A.act(function () { return api.removeEntry(e.id); }, 'Deleted')) A.go('entries'); }); };
  } });
})();
