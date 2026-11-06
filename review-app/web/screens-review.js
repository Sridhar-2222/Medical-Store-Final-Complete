/* Reports, Customers (vault) and More. */
(function () {
  'use strict';
  var A = window.App, api = A.api, $ = A.$, $$ = A.$$, esc = A.esc, money = A.money, R = A.R;
  function deps() { return api.list('departments', { sort: 'order' }).rows; }

  // ================================================================ REPORTS
  var rs = { period: '30', from: '', to: '', scale: 'day', mode: 'all', count: 3, seed: '', days: [], half: '', deps: [] };
  function periodRange() {
    var t = A.today(), d = new Date();
    switch (rs.period) {
      case 'today': return [t, t];
      case 'yesterday': return [A.addDays(t, -1), A.addDays(t, -1)];
      case '7': return [A.addDays(t, -6), t];
      case 'month': return [t.slice(0, 8) + '01', t];
      case 'lastmonth': { var f = new Date(d.getFullYear(), d.getMonth() - 1, 1), l = new Date(d.getFullYear(), d.getMonth(), 0); return [A.Base.localDate(f), A.Base.localDate(l)]; }
      case 'custom': return [rs.from || A.addDays(t, -29), rs.to || t];
      default: return [A.addDays(t, -29), t];
    }
  }
  function group(byDay, scale) {
    if (scale === 'day') return byDay.map(function (d) { return { key: d.date, label: A.niceDate(d.date), t: d.totals, n: d.count }; });
    var m = {}, order = [];
    byDay.forEach(function (d) {
      var k;
      if (scale === 'month') k = d.date.slice(0, 7);
      else { var p = d.date.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); k = A.Base.localDate(dt); }
      if (!m[k]) { m[k] = { key: k, t: { sale: 0, spending: 0, fixed: 0, walkin: 0, collection: 0, purchase: 0, expense: 0, misc: 0 }, n: 0 }; order.push(k); }
      ['sale', 'spending', 'fixed', 'walkin', 'collection', 'purchase', 'expense', 'misc'].forEach(function (f) { m[k].t[f] += d.totals[f] || 0; });
      m[k].n += d.count;
    });
    return order.map(function (k) {
      var g = m[k];
      g.label = scale === 'month' ? new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'Week of ' + A.niceDate(k);
      return g;
    });
  }
  function chg(cur, prev) {
    if (!prev || !cur) return '<span class="muted">–</span>';
    var c = Math.round((cur - prev) / prev * 100);
    return '<span class="' + (c >= 0 ? 'up' : 'down') + '">' + (c >= 0 ? '▲' : '▼') + Math.abs(c) + '%</span>';
  }
  function chgSpend(cur, prev) {
    if (!prev || !cur) return '<span class="muted">–</span>';
    var c = Math.round((cur - prev) / prev * 100);
    return '<span class="' + (c <= 0 ? 'up' : 'down') + '">' + (c >= 0 ? '▲' : '▼') + Math.abs(c) + '%</span>';
  }
  function sec(title, body, open, count) {
    return '<details class="sec"' + (open ? ' open' : '') + '><summary><span>' + esc(title) + '</span>' + (count !== undefined ? '<span class="pill">' + count + '</span>' : '') + '</summary><div class="in">' + body + '</div></details>';
  }
  function table(cols, rows) {
    if (!rows.length) return '<p class="muted small">Nothing in this selection.</p>';
    return '<div class="tw"><table><thead><tr>' + cols.map(function (c) { return '<th class="' + (c[2] ? 'n' : '') + '">' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td class="' + (c[2] ? 'n' : '') + '">' + c[1](r) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }

  A.screen('reports', { title: 'Reports', render: function (el) {
    var range = periodRange();
    var all = rs.mode === 'all';
    if (rs.mode === 'random' && !rs.days.length) { rs.seed = rs.seed || String(Date.now()); rs.days = api.sampleDays({ from: range[0], to: range[1], count: rs.count, seed: rs.seed }); }
    var res = api.reviewInsights({ from: range[0], to: range[1], days: all ? [] : rs.days, half: rs.half, departmentIds: rs.deps });
    var t = res.totals, r = res.ratios, b = res.baseline;
    var groups = group(res.byDay, rs.scale);
    var cashDays = res.byDay.filter(function (d) { return d.cashCounted !== undefined; });
    var cashDiff = cashDays.reduce(function (a, d) { return a + (d.cashDiff || 0); }, 0);
    var scope = (all ? A.niceDate(range[0], true) + ' – ' + A.niceDate(range[1], true) : (rs.mode === 'random' ? 'Random days: ' : 'Chosen days: ') + res.scope.days.map(function (d) { return A.niceDate(d); }).join(', ')) +
      (rs.half ? ' · ' + (rs.half === 'first' ? 'mornings' : 'evenings') : '') + (res.scope.departments.length ? ' · ' + res.scope.departments.join(', ') : '');
    var depList = deps();

    el.innerHTML =
      '<div class="card">' + A.seg('rp-period', [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', '7 days'], ['30', '30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Pick dates']], rs.period) +
      (rs.period === 'custom' ? '<div class="grid2">' + A.field('From', A.input('rp-from', 'date', range[0])) + A.field('To', A.input('rp-to', 'date', range[1])) + '</div>' : '') +
      '<details' + (rs.mode !== 'all' || rs.half || rs.deps.length ? ' open' : '') + '><summary class="muted small">Spot check: random days, morning / evening, departments</summary><div class="stack" style="margin-top:10px">' +
        A.seg('rp-mode', [['all', 'Every day'], ['random', 'Random days'], ['pick', 'Days I pick']], rs.mode) +
        (rs.mode === 'random' ? '<div class="row">' + A.input('rp-count', 'number', rs.count, 'min="1" max="31" style="max-width:90px" aria-label="How many days"') + '<button type="button" class="btn small" id="rp-again">Pick other days</button></div>' : '') +
        (rs.mode === 'pick' ? '<div class="row">' + A.input('rp-add', 'date', '', 'style="max-width:180px" aria-label="Add a day"') + '<span class="muted small">' + rs.days.length + ' day(s) chosen</span>' + (rs.days.length ? '<button type="button" class="btn small ghost" id="rp-clear">Clear</button>' : '') + '</div>' : '') +
        A.seg('rp-half', [['', 'Whole day'], ['first', 'Morning'], ['second', 'Evening']], rs.half) +
        '<div class="seg" id="rp-deps"><button type="button" data-v=""' + (!rs.deps.length ? ' class="on"' : '') + '>All departments</button>' + depList.map(function (d) { return '<button type="button" data-v="' + d.id + '"' + (rs.deps.indexOf(d.id) >= 0 ? ' class="on"' : '') + '>' + esc(d.name) + '</button>'; }).join('') + '</div>' +
      '</div></details></div>' +
      '<div class="card"><p class="muted small">' + esc(scope) + (b ? ' · compared with ' + b.days + ' days around them' : '') + '</p>' +
        '<ul class="list">' + res.summary.map(function (x) { return '<li class="small">• ' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<div class="row"><button type="button" class="btn small grow" id="rp-share">Share on WhatsApp</button><button type="button" class="btn small grow" id="rp-copy">Copy</button></div></div>' +
      '<div class="stats">' +
        A.stat('Sales', money(t.sale), b ? 'usual ' + money(b.perDay.sale) + ' a day' : res.scope.activeDays + ' days') +
        A.stat('Spending', money(t.spending), r.spending !== null ? A.pct(r.spending) + ' of sales' : '', r.spending > 100 ? 'bad' : '') +
        A.stat('Sales − spending', money(t.sale - t.spending), r.margin !== null ? A.pct(r.margin) + ' margin' : '', t.sale - t.spending < 0 ? 'bad' : 'good') +
        A.stat('Collected', money(t.collection), r.collection !== null ? A.pct(r.collection) + ' of sales' : '', r.collection !== null && r.collection < 97 ? 'warn' : '') +
        A.stat('Walk-ins', String(t.walkin || 0), r.avgSpend ? money(r.avgSpend) + ' per customer' : '') +
        A.stat('Cash check', cashDays.length ? (Math.abs(cashDiff) < 1 ? 'Matches' : (cashDiff < 0 ? '−' : '+') + money(Math.abs(cashDiff))) : '–', cashDays.length ? cashDays.length + ' day(s) counted' : 'enter cash in hand', cashDiff < -1 ? 'bad' : '') +
      '</div>' +
      '<div class="card"><div class="card-head"><h2>Sales vs spending</h2>' + A.seg('rp-scale', [['day', 'Day'], ['week', 'Week'], ['month', 'Month']], rs.scale) + '</div>' +
        A.barChart(groups.map(function (g) { return { a: g.t.sale, b: g.t.spending, label: g.label, tick: rs.scale === 'day' ? g.key.slice(8) : rs.scale === 'week' ? g.key.slice(5) : g.label.split(' ')[0] }; }), { two: true, la: 'Sales', lb: 'Spending', aria: 'Sales and spending' }) + '</div>' +
      '<div class="card"><div class="card-head"><h2>Things to check</h2><span class="pill">' + res.flags.length + '</span></div>' + A.flagItems(res.flags) + '</div>' +
      sec((rs.scale === 'day' ? 'Day' : rs.scale === 'week' ? 'Week' : 'Month') + ' by ' + rs.scale + ': sales, spending and changes', table(
        [['', function (g) { return esc(g.label); }], ['Sales', function (g) { return money(g.t.sale); }, 1], ['Change', function (g) { return chg(g.t.sale, g.prev && g.prev.t.sale); }, 1],
         ['Spending', function (g) { return money(g.t.spending); }, 1], ['Change', function (g) { return chgSpend(g.t.spending, g.prev && g.prev.t.spending); }, 1],
         ['Sales − spending', function (g) { var v = g.t.sale - g.t.spending; return '<span class="' + (v < 0 ? 'down' : '') + '">' + money(v) + '</span>'; }, 1],
         ['Walk-ins', function (g) { return g.t.walkin || '–'; }, 1]],
        groups.filter(function (g) { return g.n; }).map(function (g, i, arr) { g.prev = arr[i - 1]; return g; }).reverse()), true) +
      A.kpiCard(res.kpis) +
      sec('Morning vs evening', table([['', function (x) { return esc(x[0]); }], ['Sales', function (x) { return money(x[1].sale); }, 1], ['Walk-ins', function (x) { return x[1].walkin || '–'; }, 1], ['Per customer', function (x) { return x[1].walkin ? money(x[1].sale / x[1].walkin) : '–'; }, 1], ['Spending', function (x) { return money(x[1].spending); }, 1]],
        [['Morning', res.halves.first], ['Evening', res.halves.second]].concat(res.halves.unsplit.sale || res.halves.unsplit.spending ? [['Whole day (not split)', res.halves.unsplit]] : []))) +
      sec('Departments', table([['', function (d) { return esc(d.name); }], ['Sales', function (d) { return money(d.totals.sale); }, 1], ['Spending', function (d) { return money(d.totals.spending); }, 1], ['Sales − spending', function (d) { var v = d.totals.sale - d.totals.spending; return '<span class="' + (v < 0 ? 'down' : '') + '">' + money(v) + '</span>'; }, 1], ['Collected', function (d) { return A.pct(d.ratios.collection); }, 1], ['Walk-ins', function (d) { return d.totals.walkin || '–'; }, 1]], res.byDepartment), false, res.byDepartment.length) +
      sec('Where the money went', table([['', function (c) { return esc(c.name); }], ['Kind', function (c) { return c.type === 'purchase' ? 'Purchase' : c.type === 'wastage' ? 'Wastage' : c.costType === 'fixed' ? 'Fixed' : 'Variable'; }], ['Amount', function (c) { return money(c.amount); }, 1]], res.byCategory), false, res.byCategory.length) +
      sec('Cash in hand', cashDays.length ? table([['Day', function (d) { return esc(A.niceDate(d.date)); }], ['Expected', function (d) { return d.cashExpected === undefined ? '–' : money(d.cashExpected); }, 1], ['Counted', function (d) { return money(d.cashCounted); }, 1], ['Difference', function (d) { return d.cashDiff === undefined ? '–' : '<span class="' + (d.cashDiff < -1 ? 'down' : '') + '">' + (d.cashDiff > 0 ? '+' : '') + money(d.cashDiff) + '</span>'; }, 1]], cashDays.slice().reverse())
        : '<p class="muted small">Enter "Cash in hand at close" in Today\'s numbers each day. Expected cash = yesterday\'s count + cash received − cash paid out − cash deposited.</p>') +
      sec('Prices and deliveries', table([['Day', function (a) { return esc(A.niceDate(a.date)); }], ['Item', function (a) { return esc(a.item) + '<br><span class="muted small">' + esc(a.vendor) + '</span>'; }], ['Paid', function (a) { return money(a.rate, 2); }, 1], ['Usual', function (a) { return money(a.usual, 2); }, 1], ['Rise', function (a) { return '<span class="down">+' + a.up + '%</span>'; }, 1]], res.priceAlerts) +
        table([['Day', function (s) { return esc(A.niceDate(s.date)); }], ['Short delivery', function (s) { return esc(s.item + (s.vendor ? ' · ' + s.vendor : '')); }], ['Billed', function (s) { return esc(s.kind === 'day' ? money(s.billed) : s.billed + ' ' + s.unit); }, 1], ['Received', function (s) { return esc(s.kind === 'day' ? money(s.received) : s.received + ' ' + s.unit); }, 1]], res.shortfalls), false, res.priceAlerts.length + res.shortfalls.length) +
      sec('Wastage and miscellaneous', table([['Day', function (e) { return esc(A.niceDate(e.date)); }], ['What', function (e) { return esc(R.TYPE_LABELS[e.type] + ' · ' + [e.departmentName, e.category, e.note].filter(Boolean).join(' · ')); }], ['Amount', function (e) { return money(e.amount); }, 1]], res.wastageList.concat(res.miscList)), false, res.wastageList.length + res.miscList.length) +
      '<a class="item" href="#stock"><div class="t"><b>Stock: purchased vs issued vs in hand</b><span>' + (res.inventory ? money(res.inventory.shortValue) + ' missing in this period' : 'Count stock to see what is missing') + '</span></div><span aria-hidden="true">›</span></a>';

    A.onSeg($('#rp-period', el), function (v) { rs.period = v; rs.days = rs.mode === 'pick' ? rs.days : []; A.render(); });
    A.onSeg($('#rp-scale', el), function (v) { rs.scale = v; A.render(); });
    A.onSeg($('#rp-mode', el), function (v) { rs.mode = v; rs.days = []; rs.seed = String(Date.now()); A.render(); });
    A.onSeg($('#rp-half', el), function (v) { rs.half = v; A.render(); });
    $$('#rp-deps button', el).forEach(function (bt) {
      bt.onclick = function () { var id = bt.dataset.v; if (!id) rs.deps = []; else if (rs.deps.indexOf(id) >= 0) rs.deps = rs.deps.filter(function (x) { return x !== id; }); else rs.deps.push(id); A.render(); };
    });
    var f = $('#rp-from', el); if (f) { f.onchange = function (e) { rs.from = e.target.value; A.render(); }; $('#rp-to', el).onchange = function (e) { rs.to = e.target.value; A.render(); }; }
    var c = $('#rp-count', el); if (c) c.onchange = function (e) { rs.count = Math.max(1, +e.target.value || 3); rs.days = []; A.render(); };
    var ag = $('#rp-again', el); if (ag) ag.onclick = function () { rs.seed = String(Date.now()); rs.days = []; A.render(); };
    var ad = $('#rp-add', el); if (ad) ad.onchange = function (e) { if (e.target.value && rs.days.indexOf(e.target.value) < 0) { rs.days.push(e.target.value); rs.days.sort(); } A.render(); };
    var cl = $('#rp-clear', el); if (cl) cl.onclick = function () { rs.days = []; A.render(); };
    var text = '*' + A.S().businessName + ': review*\n' + scope + '\n\n' + res.summary.join('\n') + (res.flags.length ? '\n\nTo check:\n' + res.flags.slice(0, 10).map(function (x) { return '• ' + x.title; }).join('\n') : '\n\nNothing unusual.');
    $('#rp-share', el).onclick = function () { A.openLink(A.waLink(A.S().phone || '', text)); };
    $('#rp-copy', el).onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { A.toast('Copied'); }).catch(function () { A.toast('Copy is blocked here', true); }); };
    if (rs.mode === 'pick' && !rs.days.length) $('.sec', el) && el.insertAdjacentHTML('afterbegin', '<div class="banner info">Add the days you want to check.</div>');
  } });

  // ================================================================ CUSTOMERS (vault)
  function vcfg() { return A.P().review.vault; }
  function vaultTitle() { var s = A.S(); return s.vaultTitle || s.businessName; }
  function recLabel(kind) { return vcfg().records.filter(function (r) { return r.key === kind; })[0] || { label: kind === 'note' ? 'Note' : kind, dueLabel: '' }; }
  var cs = { search: '' };
  A.screen('customers', { title: function () { return vaultTitle() + ' vault'; }, render: function (el) {
    var due = api.vaultDue({ days: 7 }), all = api.vaultSummary();
    el.innerHTML = '<div class="card"><p class="muted small">Every customer of <b>' + esc(vaultTitle()) + '</b> has a vault: their ' + esc(vcfg().records.map(function (x) { return x.label.toLowerCase(); }).join(', ')) + ' and your messages. Reminders come from the dates you save.</p>' +
      '<div class="row"><input id="cu-search" class="grow" placeholder="Search name or phone" value="' + esc(cs.search) + '"><a class="btn primary" href="#customer-new">＋ Customer</a></div></div>' +
      (due.length ? '<div class="card"><div class="card-head"><h2>Contact this week</h2><span class="pill warn">' + due.length + '</span></div><ul class="list">' + due.map(function (d, i) {
        return '<li><button type="button" class="item flag ' + (d.overdue ? 'high' : 'medium') + '" data-due="' + i + '"><div class="t"><b>' + esc(d.customer.name) + '</b><span>' + esc(d.dueLabel + ': ' + (d.record.title || recLabel(d.record.kind).label) + ' · ' + A.niceDate(d.record.dueDate) + (d.remindedOn ? ' · reminded ' + A.niceDate(d.remindedOn) : '')) + '</span></div><span class="pill ' + (d.remindedOn ? 'good' : 'warn') + '">' + (d.remindedOn ? 'Sent' : 'Send') + '</span></button></li>';
      }).join('') + '</ul></div>' : '') +
      '<div id="cu-list"></div>';
    function list() {
      var q = cs.search.toLowerCase();
      var rows = all.filter(function (c) { return !q || (c.name + ' ' + (c.phone || '')).toLowerCase().indexOf(q) >= 0; });
      $('#cu-list', el).innerHTML = rows.length ? '<ul class="list">' + rows.map(function (c) {
        return '<li><button type="button" class="item" data-c="' + c.id + '"><div class="t"><b>' + esc(c.name) + '</b><span>' + esc([c.phone, c.records + ' record(s)', c.lastContact ? 'last message ' + A.niceDate(c.lastContact) : 'no messages yet'].filter(Boolean).join(' · ')) + '</span></div>' + (c.nextDue ? '<span class="pill ink">' + esc(A.niceDate(c.nextDue)) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>' : A.empty(all.length ? 'No match' : 'No customers yet', all.length ? '' : 'Add your regular customers, patients or guests to start their vaults.');
      $$('[data-c]', el).forEach(function (b) { b.onclick = function () { A.go('customer', { id: b.dataset.c }); }; });
    }
    $('#cu-search', el).oninput = function (e) { cs.search = e.target.value; list(); };
    $$('[data-due]', el).forEach(function (b) { b.onclick = function () { var d = due[+b.dataset.due]; A.go('message', { id: d.customer.id, recordId: d.record.id }); }; });
    list();
  } });

  A.screen('customer-new', { title: 'New customer', back: 'customers', tab: 'customers', render: function (el, st) {
    var c = st && st.id ? api.get('customers', st.id) : null;
    el.innerHTML = '<div class="card">' + A.field('Name', A.input('cn-name', 'text', c ? c.name : '', 'autocomplete="name"')) + A.field('WhatsApp number', A.input('cn-phone', 'tel', c ? c.phone : '', 'inputmode="tel"')) +
      A.field('Email (optional)', A.input('cn-email', 'email', c ? c.email : '')) + A.field('Notes', A.input('cn-notes', 'text', c ? c.notes : '')) +
      '<button type="button" class="btn primary block" id="cn-save">' + (c ? 'Save' : 'Create vault') + '</button>' + (c ? '<button type="button" class="btn danger block" id="cn-del">Delete customer and vault</button>' : '') + '</div>';
    $('#cn-save', el).onclick = function () {
      var r = A.act(function () { return api.saveCustomer({ id: c ? c.id : undefined, name: A.val('cn-name', el), phone: A.val('cn-phone', el), email: A.val('cn-email', el), notes: A.val('cn-notes', el) }); }, c ? 'Saved' : 'Vault created');
      if (r) A.go('customer', { id: r.id });
    };
    var del = $('#cn-del', el);
    if (del) del.onclick = function () { A.confirmSheet('Delete ' + c.name + ' and everything in their vault?', 'Delete', true).then(function (ok) { if (ok && A.act(function () { return api.removeCustomer(c.id); }, 'Deleted')) A.go('customers'); }); };
  } });

  A.screen('customer', { title: 'Customer vault', back: 'customers', tab: 'customers', render: function (el, st) {
    if (!st || !st.id || !api.get('customers', st.id)) { A.go('customers'); return; }
    var v = api.vault(st.id), c = v.customer, t = A.today();
    el.innerHTML = '<div class="card"><div class="card-head"><div><h2>' + esc(c.name) + '</h2><p class="muted small">' + esc(c.phone || 'No WhatsApp number') + ' · ' + esc(vaultTitle()) + ' vault</p></div><button type="button" class="btn small" id="cv-edit">Edit</button></div>' +
      '<div class="row"><button type="button" class="btn primary grow" id="cv-msg">Message</button><button type="button" class="btn grow" id="cv-add">Add record</button></div>' +
      '<button type="button" class="btn ghost" id="cv-share">Send ' + esc(c.name.split(' ')[0]) + ' their vault</button></div>' +
      '<div class="card"><h2>Records</h2>' + (v.records.length ? '<ul class="list">' + v.records.map(function (r) {
        var l = recLabel(r.kind);
        return '<li><button type="button" class="item" data-r="' + r.id + '"><div class="t"><b>' + esc(l.label + (r.title ? ': ' + r.title : '')) + '</b><span>' + esc(A.niceDate(r.date, true) + (r.details ? ' · ' + r.details : '')) + '</span></div>' +
          (r.dueDate ? '<span class="pill ' + (r.done ? 'good' : r.dueDate < t ? 'bad' : 'warn') + '">' + esc(r.done ? 'done' : (l.dueLabel || 'Due') + ' ' + A.niceDate(r.dueDate)) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted small">Nothing saved yet. Add their ' + esc(vcfg().records.slice(0, 3).map(function (x) { return x.label.toLowerCase(); }).join(', ')) + '.</p>') + '</div>' +
      '<div class="card"><h2>Messages</h2>' + (v.messages.length ? '<ul class="list">' + v.messages.slice(0, 30).map(function (m) { return '<li class="item"><div class="t"><span>' + esc(A.niceDate(m.date, true)) + '</span><b style="font-weight:500">' + esc(m.text) + '</b></div></li>'; }).join('') + '</ul>' : '<p class="muted small">No messages yet.</p>') + '</div>';
    $('#cv-edit', el).onclick = function () { A.go('customer-new', { id: c.id }); };
    $('#cv-msg', el).onclick = function () { A.go('message', { id: c.id }); };
    $('#cv-add', el).onclick = function () { A.go('record', { id: c.id }); };
    $('#cv-share', el).onclick = function () { A.go('message', { id: c.id, share: true }); };
    $$('[data-r]', el).forEach(function (b) { b.onclick = function () { A.go('record', { id: c.id, recordId: b.dataset.r }); }; });
  } });

  A.screen('record', { title: 'Vault record', back: 'customers', tab: 'customers', render: function (el, st) {
    if (!st || !st.id) { A.go('customers'); return; }
    var c = api.get('customers', st.id), r = st.recordId ? api.get('vaultRecords', st.recordId) : null, kinds = vcfg().records;
    var kind = r ? r.kind : kinds[0].key;
    el.innerHTML = '<div class="card"><p class="muted small">' + esc(c.name) + '\'s vault</p>' +
      A.field('Kind', A.seg('vr-kind', kinds.map(function (k) { return [k.key, k.label]; }).concat([['note', 'Note']]), kind)) +
      A.field('Title', A.input('vr-title', 'text', r ? r.title : '', 'placeholder="e.g. BP tablets, Honda City, Deluxe room stay"')) +
      '<div class="grid2">' + A.field('Date', A.input('vr-date', 'date', r ? r.date : A.today())) + '<label class="f"><span id="vr-due-l">Reminder date</span>' + A.input('vr-due', 'date', r ? r.dueDate : '') + '</label></div>' +
      A.field('Details', '<textarea id="vr-details" placeholder="Medicines and dosage, sizes, vehicle number, warranty card no…">' + esc(r ? r.details : '') + '</textarea>') +
      (r ? '<label class="chk"><input type="checkbox" id="vr-done"' + (r.done ? ' checked' : '') + '> Done (no more reminders)</label>' : '') +
      '<button type="button" class="btn primary block" id="vr-save">Save to vault</button>' + (r ? '<button type="button" class="btn danger block" id="vr-del">Delete record</button>' : '') + '</div>';
    function lab() { var l = recLabel(kind).dueLabel; $('#vr-due-l', el).textContent = l ? l + ' (you will be reminded)' : 'Reminder date (optional)'; }
    A.onSeg($('#vr-kind', el), function (v) { kind = v; lab(); }); lab();
    $('#vr-save', el).onclick = function () {
      if (A.act(function () { return api.saveVaultRecord({ id: r ? r.id : undefined, customerId: c.id, kind: kind, title: A.val('vr-title', el), date: A.val('vr-date', el), dueDate: A.val('vr-due', el), details: A.val('vr-details', el), done: $('#vr-done', el) ? $('#vr-done', el).checked : false }); }, 'Saved to vault')) A.go('customer', { id: c.id });
    };
    var del = $('#vr-del', el);
    if (del) del.onclick = function () { if (A.act(function () { return api.removeVaultRecord(r.id); }, 'Deleted')) A.go('customer', { id: c.id }); };
  } });

  A.screen('message', { title: 'Message', back: 'customers', tab: 'customers', render: function (el, st) {
    if (!st || !st.id) { A.go('customers'); return; }
    var c = api.get('customers', st.id), rec = st.recordId ? api.get('vaultRecords', st.recordId) : null;
    var tpls = vcfg().templates.slice();
    var v = api.vault(c.id);
    if (st.share && A.sync.url) {
      var tok = A.act(function () { return api.ensureVaultToken(c.id); });
      tpls.unshift({ key: 'vault', label: 'Vault link', text: 'Dear {name}, your records and messages from {vault} are saved in your personal vault: ' + A.serverBase() + 'v/' + tok + ' (private link, keep it safe).' });
    } else if (st.share) {
      var lines = v.records.slice(0, 15).map(function (x) { var l = recLabel(x.kind); return '• ' + l.label + (x.title ? ': ' + x.title : '') + (x.dueDate ? ' (' + (l.dueLabel || 'due') + ' ' + A.niceDate(x.dueDate, true) + ')' : ''); });
      tpls.unshift({ key: 'vault', label: 'Their vault', text: 'Dear {name}, here is your {vault} vault:\n' + (lines.join('\n') || '(nothing saved yet)') + '\nWe will remind you before anything is due. Reply here any time.' });
    }
    var key = st.share ? 'vault' : rec && rec.dueDate ? tpls[0].key : (tpls.filter(function (x) { return x.key === 'thanks'; })[0] || tpls[0]).key;
    el.innerHTML = '<div class="card"><p class="muted small">To ' + esc(c.name) + (c.phone ? ' · ' + esc(c.phone) : ' · no number saved (WhatsApp will ask for the contact)') + '</p>' +
      A.field('Message', A.seg('ms-tpl', tpls.map(function (x) { return [x.key, x.label]; }), key)) +
      '<div class="grid2">' + A.field('About', A.input('ms-item', 'text', rec ? (rec.title || recLabel(rec.kind).label) : '')) + A.field('Date', A.input('ms-date', 'text', rec && rec.dueDate ? A.niceDate(rec.dueDate, true) : '')) + '</div>' +
      A.field('Text', '<textarea id="ms-text" style="min-height:150px"></textarea>') +
      '<button type="button" class="btn primary block" id="ms-send">Send on WhatsApp</button><button type="button" class="btn block" id="ms-copy">Copy text</button></div>';
    function fill() {
      var tp = tpls.filter(function (x) { return x.key === key; })[0] || tpls[0];
      var vals = { name: c.name, shop: A.S().businessName, vault: vaultTitle(), item: A.val('ms-item', el) || 'your order', date: A.val('ms-date', el) || 'soon' };
      $('#ms-text', el).value = tp.text.replace(/\{(\w+)\}/g, function (m, k) { return vals[k] !== undefined ? vals[k] : m; });
    }
    A.onSeg($('#ms-tpl', el), function (v2) { key = v2; fill(); });
    $('#ms-item', el).oninput = fill; $('#ms-date', el).oninput = fill;
    fill();
    $('#ms-send', el).onclick = function () {
      var text = A.val('ms-text', el);
      A.act(function () { return api.logMessage({ customerId: c.id, template: key, recordId: rec ? rec.id : '', text: text }); });
      A.openLink(A.waLink(c.phone || '', text));
      A.toast('Saved in ' + c.name + '\'s vault');
      setTimeout(function () { A.go('customer', { id: c.id }); }, 400);
    };
    $('#ms-copy', el).onclick = function () { var tx = A.val('ms-text', el); (navigator.clipboard ? navigator.clipboard.writeText(tx) : Promise.reject()).then(function () { A.toast('Copied'); }).catch(function () { $('#ms-text', el).select(); }); };
  } });

  // ================================================================ MORE
  A.screen('more', { title: 'More', render: function (el) {
    var items = [['stock', 'Stock', 'Purchased vs issued vs in hand, missing stock'], ['departments', 'Departments', 'The parts of your business that report numbers'],
      ['guide', 'Guide for my business', 'What to enter, what to photograph, what you learn'], ['sync', 'Office system', 'Work on this phone only, or send data to your computer'],
      ['settings', 'Settings', 'Business details, vault name, alerts, AI reading'], ['backup', 'Backup & data', 'Save a backup, restore, Excel export, example data']];
    el.innerHTML = '<ul class="list">' + items.map(function (x) { return '<li><a class="item" href="#' + x[0] + '"><div class="t"><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></div><span aria-hidden="true">›</span></a></li>'; }).join('') + '</ul>' +
      '<p class="muted small" style="text-align:center">BizCore Review · ' + esc(A.P().icon + ' ' + A.P().name) + '</p>';
  } });

  A.screen('stock', { title: 'Stock', back: 'more', tab: 'more', render: function (el) {
    var inv = api.inventory({}), t = inv.totals;
    el.innerHTML = '<div class="stats">' + A.stat('Purchased', money(t.purchasedValue), '30 days') + A.stat('Issued', money(t.suppliedValue), 'to departments') +
      A.stat('In hand', money(t.inHandValue), 'at latest rates') + A.stat('Missing', money(t.shortValue), t.counted + ' of ' + t.items + ' items counted', t.shortValue > 0 ? 'bad' : '') + '</div>' +
      '<div class="row"><a class="btn grow" href="#add-issue">Stock issued</a><a class="btn primary grow" href="#add-count">Count stock</a></div>' +
      (inv.flags.length ? '<div class="card"><h2>Things to check</h2>' + A.flagItems(inv.flags) + '</div>' : '') +
      (inv.items.length ? '<ul class="list">' + inv.items.map(function (m) {
        var diff = m.counts ? (m.variance ? '<span class="pill ' + (m.variance < 0 ? 'bad' : 'warn') + '">' + (m.variance > 0 ? '+' : '') + m.variance + ' ' + esc(m.unit) + '</span>' : '<span class="pill good">matches</span>') : '<span class="pill">not counted</span>';
        return '<li class="item"><div class="t"><b>' + esc(m.name) + '</b><span>Bought ' + m.purchased + ' · issued ' + m.supplied + (m.wasted ? ' · wasted ' + m.wasted : '') + ' · should have ' + m.book + ' ' + esc(m.unit) + (m.counts ? ' · counted ' + m.counted : '') + '</span></div>' + diff + '</li>';
      }).join('') + '</ul>' : A.empty('No stock yet', 'Item lines on purchase bills count as stock in. Then record what is issued and count what is left.'));
  } });

  A.screen('departments', { title: 'Departments', back: 'more', tab: 'more', render: function (el) {
    var list = deps();
    el.innerHTML = '<div class="card"><p class="muted small">Each department reports its own sales, walk-ins and spending. Suggested ones for ' + esc(A.P().name) + ' were added; rename or add your own.</p>' +
      '<div class="row">' + A.input('dp-new', 'text', '', 'class="grow" placeholder="New department name"') + '<button type="button" class="btn primary" id="dp-add">Add</button></div></div>' +
      '<ul class="list">' + list.map(function (d) {
        return '<li class="item"><div class="t"><input value="' + esc(d.name) + '" data-name="' + d.id + '" aria-label="Department name"></div><button type="button" class="btn small" data-hide="' + d.id + '">' + (d.active === false ? 'Show' : 'Hide') + '</button></li>';
      }).join('') + '</ul>';
    $('#dp-add', el).onclick = function () { if (A.act(function () { return api.saveDepartment({ name: A.val('dp-new', el) }); }, 'Added')) A.render(); };
    $$('[data-name]', el).forEach(function (i) { i.onchange = function () { A.act(function () { return api.saveDepartment({ id: i.dataset.name, name: i.value }); }, 'Renamed'); }; });
    $$('[data-hide]', el).forEach(function (b) { b.onclick = function () { var d = api.get('departments', b.dataset.hide); if (A.act(function () { return api.saveDepartment({ id: d.id, name: d.name, active: d.active === false }); })) A.render(); }; });
  } });

  var guideKey = '';
  A.screen('guide', { title: 'Guide', back: 'more', tab: 'more', render: function (el) {
    var key = guideKey || A.S().industry, p = A.Industries.get(key), r = p.review, pb = r.playbook;
    function ul(a) { return '<ul class="list">' + a.map(function (x) { return '<li class="small">• ' + esc(x) + '</li>'; }).join('') + '</ul>'; }
    el.innerHTML = '<select id="gd">' + A.opt(A.Industries.list().map(function (i) { return { value: i.key, text: i.icon + ' ' + i.name }; }), key) + '</select>' +
      sec('Departments involved', ul(r.departments), true) + sec('Photograph these', ul(pb.photos), true) + sec('Enter these', ul(pb.inputs)) +
      sec('What you learn as the owner', ul(pb.owner)) + sec('What your customers get', ul(pb.customers)) +
      sec('Customer vault', '<b>Kept for each customer</b>' + ul(r.vault.records.map(function (x) { return x.label + (x.dueLabel ? ' (reminds: ' + x.dueLabel.toLowerCase() + ')' : ''); })) + '<b>Ready messages</b>' + ul(r.vault.templates.map(function (x) { return x.label; }))) +
      sec('Key numbers and healthy ranges', ul(r.kpis.map(function (k) { return k.label + ': ' + k.lo + '–' + k.hi + '%. ' + k.why; })));
    $('#gd', el).onchange = function (e) { guideKey = e.target.value; A.render(); };
  } });

  A.screen('sync', { title: 'Office system', back: 'more', tab: 'more', render: function (el) {
    var sy = A.sync;
    if (!sy.url) {
      el.innerHTML = '<div class="card"><h2>This phone works on its own</h2><p class="muted small">Everything you enter is saved on this phone, with or without internet. If you run BizCore Review on an office computer, connect this phone to it: every entry is then sent there too, other phones see the same numbers, and customers can get a private vault link.</p>' +
        A.field('Office system address', A.input('sy-url', 'url', '', 'placeholder="e.g. 192.168.1.20:8080 or https://mybiz.example.com" autocapitalize="off"')) + A.field('PIN', A.input('sy-pin', 'password', '', 'inputmode="numeric"')) +
        '<button type="button" class="btn primary block" id="sy-go">Connect</button><p class="muted small" id="sy-msg"></p></div>' +
        '<div class="card"><h2>Set up the office system</h2><p class="muted small">On a computer with Node.js: <span style="font-family:var(--mono)">node server/server.js</span> in the review-app folder, with APP_PIN set. See README.</p></div>';
      $('#sy-go', el).onclick = function () {
        var url = A.val('sy-url', el), pin = A.val('sy-pin', el), msg = $('#sy-msg', el);
        if (!url.trim()) { A.toast('Enter the office system address', true); return; }
        msg.textContent = 'Checking…';
        A.connectCheck(url, pin).then(function (h) {
          var mine = api.info().counts.entries;
          if (!h.setupDone) return A.confirmSheet('The office system is empty. Send everything on this phone to it?', 'Send').then(function (ok) { if (ok) return A.useServer(url, pin, 'upload'); });
          return A.confirmSheet('Use the office system\'s data (' + h.business + ') on this phone?' + (mine ? ' The ' + mine + ' entries on this phone will be replaced; save a backup first if you need them.' : ''), 'Use office data').then(function (ok) { if (ok) return A.useServer(url, pin, 'download'); });
        }).then(function () { if (A.sync.url) { A.toast('Connected'); A.render(); } else msg.textContent = ''; }, function (e) { msg.textContent = e.message; });
      };
      return;
    }
    var probs = A.syncProblems();
    var st = { ok: ['good', 'Up to date'], offline: ['warn', 'Offline: changes wait on this phone'], pin: ['bad', 'Wrong PIN'], error: ['bad', 'Problem: ' + (sy.error || '')], idle: ['ink', 'Connecting…'] }[sy.status] || ['ink', sy.status];
    el.innerHTML = '<div class="card"><h2>Connected to the office system</h2><p class="muted small" style="overflow-wrap:anywhere">' + esc(sy.url) + '</p>' +
      '<div class="row"><span class="pill ' + st[0] + '">' + esc(st[1]) + '</span>' + (sy.outbox.length ? '<span class="pill warn">' + sy.outbox.length + ' waiting to send</span>' : '') + (sy.last ? '<span class="muted small">last synced ' + esc(sy.last) + '</span>' : '') + '</div>' +
      '<button type="button" class="btn primary block" id="sy-now">Sync now</button><button type="button" class="btn danger block" id="sy-off">Disconnect this phone</button></div>' +
      (probs.length ? '<div class="card"><h2>Changes the office could not apply</h2><ul class="list">' + probs.slice(0, 10).map(function (p) { return '<li class="small">• ' + esc(p.error) + '</li>'; }).join('') + '</ul></div>' : '');
    $('#sy-now', el).onclick = function () { A.toast('Syncing…'); A.runSync().then(function () { A.render(); }); };
    $('#sy-off', el).onclick = function () {
      A.confirmSheet((sy.outbox.length ? sy.outbox.length + ' change(s) have not reached the office yet and will stay only on this phone. ' : '') + 'Disconnect this phone? It keeps its current data and works on its own.', 'Disconnect', true).then(function (ok) { if (ok) { A.disconnect(); A.render(); } });
    };
  } });

  A.screen('settings', { title: 'Settings', back: 'more', tab: 'more', render: function (el) {
    var s = A.S();
    el.innerHTML = '<div class="card"><h2>Business</h2>' + A.field('Business name', A.input('st-name', 'text', s.businessName)) +
      A.field('Customer vault title', A.input('st-vault', 'text', s.vaultTitle, 'placeholder="' + esc(s.businessName) + '"')) +
      '<p class="muted small">Customers see this name on their vault and messages, e.g. "Sai Ram Hotel", "ABC Furniture Shop".</p>' +
      A.field('Phone', A.input('st-phone', 'tel', s.phone)) + A.field('Address', A.input('st-addr', 'text', s.address)) +
      A.field('Type of business', '<select id="st-ind">' + A.opt(A.Industries.list().map(function (i) { return { value: i.key, text: i.icon + ' ' + i.name }; }), s.industry) + '</select>') + '</div>' +
      '<div class="card"><h2>Alerts</h2><div class="grid2">' + A.field('Morning ends at', A.input('st-split', 'time', s.halfDaySplit)) + A.field('Price rise alert (%)', A.input('st-price', 'number', s.priceAlertPct)) +
      A.field('Wastage alert (% of purchases)', A.input('st-waste', 'number', s.wastageAlertPct)) + A.field('Collection gap alert (%)', A.input('st-gap', 'number', s.collectionGapPct)) +
      A.field('Sales change alert (%)', A.input('st-fl', 'number', s.fluctuationPct)) + A.field('Currency symbol', A.input('st-cur', 'text', s.currency)) + '</div></div>' +
      '<div class="card"><h2>AI reading (optional)</h2><p class="muted small">Without a key, bills are read on this phone. With a Google Gemini key, handwritten and messy bills are read better when online. The key stays on this phone.</p>' +
      A.field('Gemini API key', A.input('st-ai', 'password', A.lsGet(A.AIKEY) || '', 'autocomplete="off"')) + '</div>' +
      '<button type="button" class="btn primary block" id="st-save">Save settings</button>';
    $('#st-save', el).onclick = function () {
      A.lsSet(A.AIKEY, A.val('st-ai', el).trim());
      if (A.act(function () { return api.saveSettings({ businessName: A.val('st-name', el), vaultTitle: A.val('st-vault', el), phone: A.val('st-phone', el), address: A.val('st-addr', el), industry: A.val('st-ind', el),
        halfDaySplit: A.val('st-split', el), priceAlertPct: A.val('st-price', el), wastageAlertPct: A.val('st-waste', el), collectionGapPct: A.val('st-gap', el), fluctuationPct: A.val('st-fl', el), currency: A.val('st-cur', el) }); }, 'Settings saved')) A.go('more');
    };
  } });

  A.screen('backup', { title: 'Backup & data', back: 'more', tab: 'more', render: function (el) {
    var n = api.info().counts;
    el.innerHTML = '<div class="card"><h2>Backup</h2><p class="muted small">Everything is saved on this phone (' + n.entries + ' entries, ' + n.customers + ' customers). Save a backup to Google Drive or WhatsApp now and then.</p>' +
      '<button type="button" class="btn primary block" id="bk-save">Save backup</button><label class="btn block" for="bk-file">Restore from a backup file</label><input type="file" id="bk-file" accept=".json,application/json" hidden></div>' +
      '<div class="card"><h2>Excel (CSV)</h2><div class="row">' + [['entries', 'All entries'], ['customers', 'Customers'], ['vaultRecords', 'Vault records'], ['messages', 'Messages']].map(function (x) { return '<button type="button" class="btn small grow" data-csv="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div><a class="btn ghost" href="#import">Import from Excel or billing software</a></div>' +
      '<div class="card"><h2>Example numbers</h2><p class="muted small">30 days of example numbers with a few planted problems, to see what the review catches.</p><button type="button" class="btn block" id="bk-sample">Add example numbers</button></div>' +
      '<div class="card"><h2>Start over</h2><p class="muted small">Erases all entries, customers and vaults on this phone. Settings stay.</p><button type="button" class="btn danger block" id="bk-erase">Erase everything</button></div>';
    var stamp = A.today();
    $('#bk-save', el).onclick = function () { A.saveFile('bizcore-review-backup-' + stamp + '.json', JSON.stringify(api.exportAll()), 'application/json'); };
    $('#bk-file', el).onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      A.readFile(f).then(function (txt) {
        var data; try { data = JSON.parse(txt); } catch (x) { A.toast('That is not a backup file', true); return; }
        A.confirmSheet('Replace everything on this phone with this backup?', 'Restore', true).then(function (ok) { if (ok && A.act(function () { return api.importAll(data); }, 'Backup restored')) A.go('home'); });
      });
    };
    $$('[data-csv]', el).forEach(function (b) { b.onclick = function () { A.saveFile(b.dataset.csv + '-' + stamp + '.csv', '﻿' + api.exportCSV(b.dataset.csv), 'text/csv'); }; });
    $('#bk-sample', el).onclick = function () { if (A.act(function () { return api.loadReviewSamples(); }, 'Example numbers added')) A.go('home'); };
    $('#bk-erase', el).onclick = function () { A.confirmSheet('Erase all entries, customers and vaults? This cannot be undone.', 'Erase', true).then(function (ok) { if (ok && A.act(function () { return api.resetAll(); }, 'Erased')) A.go('home'); }); };
  } });
})();
