/* WORK AREAS (what each kind of business counts every day) and MASTER (no login: switch features
 * on or off, rename them, change example lines, change the work areas). */
(function () {
  'use strict';
  var A = window.App, api = A.api, $ = A.$, $$ = A.$$, esc = A.esc, money = A.money, R = A.R;
  var stat = A.stat;

  function fmtNum(x) {
    if (x.value === null || x.value === undefined) return '–';
    if (x.as === 'money') return money(x.value);
    if (x.as === 'pct') return A.pct(x.value);
    if (x.as === 'per100') return (Math.round(x.value * 10) / 10) + ' per 100';
    return String(Math.round(x.value * 10) / 10);
  }

  // ================================================================ WORK AREAS (header)
  var wState = { period: '7' };
  function wRange() {
    var t = A.today();
    if (wState.period === 'today') return [t, t];
    if (wState.period === 'month') return [t.slice(0, 8) + '01', t];
    if (wState.period === '30') return [R.addDays(t, -29), t];
    return [R.addDays(t, -6), t];
  }
  A.screen('work', { title: function () { return api.workConfig().title; }, crumb: 'Header', back: 'home', render: function (el) {
    var r = wRange(), rep = api.workReport({ from: r[0], to: r[1] }), cfg = rep.config, today = api.workDay(A.today());
    el.innerHTML = '<button type="button" class="btn primary upload block" id="wk-today">✎ ' + (Object.keys(today.values).length ? 'Change today\'s counts' : 'Count today\'s work') + '</button>' +
      A.seg('wk-p', [['today', 'Today'], ['7', '7 days'], ['month', 'This month'], ['30', '30 days']], wState.period) +
      '<div class="section-title">Key numbers</div>' +
      (rep.daysCounted ? '<div class="today-strip">' + rep.numbers.map(function (x) { return stat(x.label, fmtNum(x), x.from ? 'from ' + x.from + ' sales' : ''); }).join('') + '</div>' :
        A.empty('Nothing counted in this period', 'Tap "Count today\'s work". Key numbers like ' + rep.numbers.slice(0, 2).map(function (x) { return x.label.toLowerCase(); }).join(' and ') + ' appear here.')) +
      '<div class="section-title">Totals (' + rep.daysCounted + ' day(s) counted)</div><div class="card"><div class="tw"><table><tbody>' +
      cfg.counters.map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td class="n">' + (rep.totals[x.key] || 0) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      (rep.days.length ? '<div class="section-title">Day by day</div><ul class="list">' + rep.days.slice().reverse().map(function (d) {
        return '<li><button type="button" class="item" data-d="' + d.date + '"><div class="t"><b>' + esc(A.niceDate(d.date)) + '</b><span>' + esc(cfg.counters.filter(function (x) { return d.values[x.key] !== undefined; }).map(function (x) { return x.label + ' ' + d.values[x.key]; }).join(' · ') + (d.files && d.files.length ? ' · 📷 ' + d.files.length : '')) + '</span></div></button></li>';
      }).join('') + '</ul>' : '') +
      '<a class="btn ghost" href="#master-work">Change what is counted (Master)</a>';
    $('#wk-today', el).onclick = function () { A.go('work-add', { date: A.today() }); };
    A.onSeg($('#wk-p', el), function (v) { wState.period = v; A.render(); });
    $$('[data-d]', el).forEach(function (b) { b.onclick = function () { A.go('work-add', { date: b.dataset.d }); }; });
  } });
  A.screen('work-add', { title: function () { return api.workConfig().title; }, crumb: 'Work areas', back: 'work', render: function (el, st) {
    var date = (st && st.date) || A.today(), cfg = api.workConfig(), d = api.workDay(date);
    el.innerHTML = '<div class="card"><div class="grid2">' + A.field('Date', A.input('wa-date', 'date', date, 'max="' + A.today() + '"')) + '<div></div>' +
      cfg.counters.map(function (x) { return A.field(x.label, A.input('wa-' + x.key, 'number', d.values[x.key] === undefined ? '' : d.values[x.key], 'min="0"')); }).join('') + '</div>' +
      '<label class="f">Note' + A.input('wa-note', 'text', d.note) + '</label>' +
      '<div class="section-title">Register / report page or bill (optional)</div><div id="wa-att"></div>' +
      '<button type="button" class="btn primary block" id="wa-save">Save</button></div>';
    $('#wa-date', el).onchange = function (e) { A.go('work-add', { date: e.target.value || A.today() }); };
    var att = A.files.attach($('#wa-att', el), { files: d.files || [], read: 'text', label: 'Photo of register' });
    $('#wa-save', el).onclick = function () {
      var vals = {}; cfg.counters.forEach(function (x) { vals[x.key] = A.val('wa-' + x.key, el); });
      if (!cfg.counters.some(function (x) { return vals[x.key] !== ''; }) && !Object.keys(d.values).length) { A.toast('Enter at least one count', true); return; }
      if (A.act(function () { return api.saveWorkDay({ date: A.val('wa-date', el), values: vals, note: A.val('wa-note', el), files: att.files() }); }, 'Saved')) A.go('work');
    };
  } });

  // ================================================================ MASTER: features on/off and names
  A.screen('master-features', { title: 'Features', crumb: 'Master', back: 'setup', render: function (el) {
    var ms = api.masterState(), G = { home: 'Main page headers', accounts: 'Accounts', customers: 'Customers', reports: 'Reports', staff: 'Staff' };
    el.innerHTML = '<p class="muted small">Switch off what your business does not use; it disappears from the pages (nothing is deleted). Type a new name to rename a feature, or leave it empty for the usual name.</p>' +
      Object.keys(G).map(function (g) {
        return '<div class="card"><div class="section-title">' + esc(G[g]) + '</div><ul class="list">' + ms.features[g].map(function (f) {
          var title = g === 'home' && f[0] === 'work' ? api.workConfig().title : g === 'home' && f[0] === 'customers' ? api.workConfig().customers : f[1];
          return '<li class="item mf"><label class="chk"><input type="checkbox" data-on="' + f[0] + '"' + (ms.hidden[f[0]] ? '' : ' checked') + '> <b>' + esc(title) + '</b></label>' +
            '<input type="text" data-nm="' + f[0] + '" value="' + esc(ms.names[f[0]] || '') + '" placeholder="Rename (optional)" aria-label="New name for ' + esc(title) + '"></li>';
        }).join('') + '</ul></div>';
      }).join('') +
      '<button type="button" class="btn primary block" id="mf-save">Save</button><button type="button" class="btn ghost block" id="mf-reset">Back to the standard set for ' + esc(A.P().name) + '</button>';
    $('#mf-save', el).onclick = function () {
      var hidden = {}, names = {};
      $$('[data-on]', el).forEach(function (c) { hidden[c.dataset.on] = !c.checked; });
      $$('[data-nm]', el).forEach(function (i) { names[i.dataset.nm] = i.value; });
      if (A.act(function () { return api.saveMaster({ hidden: hidden, names: names }); }, 'Saved')) A.go('setup');
    };
    $('#mf-reset', el).onclick = function () { A.confirmSheet('Show every feature with its usual name again?', 'Reset').then(function (ok) { if (ok && A.act(function () { return api.saveMaster({ reset: true }); }, 'Back to standard')) A.render(); }); };
  } });

  // ================================================================ MASTER: example lines
  var EX = [['sales', 'Sales'], ['purchases', 'Purchases'], ['salaries', 'Salaries'], ['advances', 'Staff advances'], ['fixed', 'Fixed costs'], ['maintenance', 'Maintenance'], ['variable', 'Variable expenses'], ['sudden', 'Sudden / miscellaneous']];
  A.screen('master-examples', { title: 'Example lines', crumb: 'Master', back: 'setup', render: function (el) {
    var ms = api.masterState(), std = api.kinds().featureExamples;
    el.innerHTML = '<p class="muted small">One short line under each feature, so staff know what goes there. Keep it to one example. Empty = the standard line.</p><div class="card">' +
      EX.map(function (x) { return A.field(x[1], A.input('me-' + x[0], 'text', ms.examples[x[0]] || '', 'placeholder="' + esc(std[x[0]] || '') + '"')); }).join('') +
      '<button type="button" class="btn primary block" id="me-save">Save</button></div>';
    $('#me-save', el).onclick = function () {
      var ex = {}; EX.forEach(function (x) { var v = A.val('me-' + x[0], el).trim(); ex[x[0]] = v && !/^e\.g\./i.test(v) ? 'e.g. ' + v : v; });
      if (A.act(function () { return api.saveMaster({ examples: ex }); }, 'Saved')) A.go('setup');
    };
  } });

  // ================================================================ MASTER: work areas for this business
  A.screen('master-work', { title: 'Work areas', crumb: 'Master', back: 'setup', render: function (el, st) {
    var cfg = api.workConfig(), rows = (st && st.rows) || cfg.counters.map(function (x) { return { key: x.key, label: x.label, eg: x.eg }; });
    el.innerHTML = '<p class="muted small">What <b>' + esc(A.P().name) + '</b> counts every day besides money. These boxes appear in <b>' + esc(cfg.title) + '</b> on the main page; key numbers are worked out from them.</p>' +
      '<div class="card"><div class="grid2">' + A.field('Name of this header', A.input('mw-title', 'text', cfg.title)) + A.field('Customers are called', A.input('mw-cust', 'text', cfg.customers)) +
      A.field('Walk-in count is called', A.input('mw-vis', 'text', cfg.visitors)) + '<div></div></div>' +
      '<div class="section-title">Things to count</div><ul class="list" id="mw-list">' + rows.map(function (x, i) {
        return '<li class="item mw"><input type="text" data-l="' + i + '" value="' + esc(x.label) + '" aria-label="Name"><input type="text" data-e="' + i + '" value="' + esc(x.eg) + '" aria-label="Example" style="max-width:110px"><button type="button" class="btn small danger" data-rm="' + i + '" aria-label="Remove">✕</button></li>';
      }).join('') + '</ul><div class="row"><input type="text" id="mw-new" placeholder="Add"><button type="button" class="btn" id="mw-add">Add</button></div>' +
      '<button type="button" class="btn primary block" id="mw-save">Save</button>' + (cfg.custom ? '<button type="button" class="btn ghost block" id="mw-reset">Back to the standard set</button>' : '') + '</div>' +
      '<div class="section-title">Key numbers for ' + esc(A.P().name) + '</div><div class="card"><ul class="plain">' + cfg.numbers.map(function (x) { return '<li>' + esc(x.label) + '</li>'; }).join('') + '</ul><p class="muted small">A key number shows only while the counts it needs are in the list.</p></div>';
    function read() { return rows.map(function (x, i) { return { key: x.key, label: $('[data-l="' + i + '"]', el).value, eg: $('[data-e="' + i + '"]', el).value }; }); }
    $('#mw-add', el).onclick = function () { var v = A.val('mw-new', el).trim(); if (!v) return; var r = read(); r.push({ key: '', label: v, eg: '' }); A.go('master-work', { rows: r }); };
    $$('[data-rm]', el).forEach(function (b) { b.onclick = function () { var r = read(); r.splice(+b.dataset.rm, 1); A.go('master-work', { rows: r }); }; });
    $('#mw-save', el).onclick = function () {
      if (A.act(function () { return api.saveWorkConfig({ title: A.val('mw-title', el), customers: A.val('mw-cust', el), visitors: A.val('mw-vis', el), counters: read() }); }, 'Saved')) A.go('setup');
    };
    var rs = $('#mw-reset', el); if (rs) rs.onclick = function () { if (A.act(function () { return api.saveWorkConfig({ reset: true }); }, 'Back to standard')) A.go('master-work'); };
  } });
})();
