/* STAFF ADVANCES, ATTENDANCE (from manual bills + owner's marks), DAILY SUMMARY and BULK REMINDER. */
(function () {
  'use strict';
  var A = window.App, api = A.api, $ = A.$, $$ = A.$$, esc = A.esc, money = A.money;
  var feat = A.feat, stat = A.stat;
  function staffRows() { return api.list('staff', { sort: 'name' }).rows.filter(function (x) { return x.active !== false; }); }
  function noStaff() { return A.empty('No staff yet', 'Add the people who work here first.', '<a class="btn primary" href="#staff-edit">Add staff</a>'); }

  // ================================================================ STAFF ADVANCES
  A.screen('advances', { title: 'Staff advances', crumb: 'Staff', back: 'staff', render: function (el) {
    var b = api.advanceBalances(), hist = api.list('advances', { sort: '-at', limit: 60 }).rows;
    el.innerHTML = '<div class="row"><button type="button" class="btn primary upload grow" id="av-give">📷 Give advance</button><button type="button" class="btn grow" id="av-back">Record recovery</button></div>' + A.eg('advances') +
      '<div class="today-strip">' + stat('Still to recover', money(b.outstanding)) + stat('People with advance', String(b.rows.filter(function (r) { return r.balance > 0; }).length)) + '</div>' +
      '<p class="muted small">An advance is money the staff member owes, not an expense, so it does not change profit. Recover it from salary or in cash.</p>' +
      (b.rows.length ? '<div class="section-title">Balance per person</div><ul class="list">' + b.rows.map(function (r) {
        return '<li><button type="button" class="item" data-st="' + r.staffId + '"><div class="t"><b>' + esc(r.name) + '</b><span>Given ' + money(r.given) + ' · recovered ' + money(r.recovered) + (r.last ? ' · last ' + esc(A.niceDate(r.last)) : '') + '</span></div><div class="end"><b>' + money(r.balance) + '</b></div></button></li>';
      }).join('') + '</ul>' : noStaff()) +
      (hist.length ? '<div class="section-title">Recent</div><ul class="list">' + hist.map(function (a) {
        return '<li><button type="button" class="item" data-av="' + a.id + '"><div class="t"><b>' + esc(a.staffName) + ' · ' + (a.kind === 'given' ? 'given' : 'recovered (' + (a.how === 'salary' ? 'from salary' : 'cash') + ')') + '</b><span>' + esc(A.niceDate(a.date) + (a.note ? ' · ' + a.note : '') + (a.givenBy ? ' · by ' + a.givenBy : '') + (a.files && a.files.length ? ' · 📷 ' + a.files.length : '')) + '</span></div><div class="end">' + (a.kind === 'given' ? '' : '−') + money(a.amount) + '</div></button></li>';
      }).join('') + '</ul>' : '');
    $('#av-give', el).onclick = function () { A.go('advance-add', { kind: 'given' }); };
    $('#av-back', el).onclick = function () { A.go('advance-add', { kind: 'recovered' }); };
    $$('[data-st]', el).forEach(function (x) { x.onclick = function () { A.go('advance-add', { kind: 'given', staffId: x.dataset.st }); }; });
    $$('[data-av]', el).forEach(function (x) { x.onclick = function () { A.go('advance-add', { id: x.dataset.av }); }; });
  } });
  A.screen('advance-add', { title: 'Staff advance', crumb: 'Staff › Advances', back: 'advances', render: function (el, st) {
    var a = st && st.id ? api.get('advances', st.id) : null, kind = a ? a.kind : (st && st.kind) || 'given', rows = staffRows();
    if (!rows.length && !a) { el.innerHTML = noStaff(); return; }
    var opts = rows.map(function (x) { return { value: x.id, text: x.name }; });
    if (a && !rows.some(function (x) { return x.id === a.staffId; })) opts.push({ value: a.staffId, text: a.staffName });
    el.innerHTML = '<div class="card">' + A.seg('ad-kind', [['given', 'Advance given'], ['recovered', 'Advance recovered']], kind) +
      '<div class="grid2">' + A.field('Staff member', '<select id="ad-st">' + A.opt(opts, a ? a.staffId : (st && st.staffId) || '') + '</select>') +
      A.field('Amount ₹', A.input('ad-amt', 'number', a ? a.amount : '', 'min="0"')) + A.field('Date', A.input('ad-date', 'date', a ? a.date : A.today())) +
      '<label class="f" id="ad-how-l">How<select id="ad-how"></select></label>' + A.field('Given / received by', A.input('ad-by', 'text', a ? a.givenBy : '')) +
      '<label class="f">Reason / note' + A.input('ad-note', 'text', a ? a.note : '') + '</label></div>' +
      '<div class="section-title">Signed slip / voucher</div><div id="ad-att"></div>' +
      '<div class="row"><button type="button" class="btn primary grow" id="ad-save">Save</button>' + (a ? '<button type="button" class="btn danger" id="ad-del">Delete</button>' : '') + '</div></div>';
    function how() {
      var list = kind === 'given' ? ['Cash', 'UPI', 'Bank transfer'] : [{ value: 'salary', text: 'Cut from salary' }, { value: 'cash', text: 'Paid back in cash' }];
      $('#ad-how', el).innerHTML = A.opt(list, a && a.kind === kind ? a.how : (kind === 'given' ? 'Cash' : 'salary'));
    }
    how();
    A.onSeg($('#ad-kind', el), function (v) { kind = v; how(); });
    var att = A.files.attach($('#ad-att', el), { files: a ? a.files : [], read: 'text', label: 'Photo of slip' });
    $('#ad-save', el).onclick = function () {
      if (A.act(function () { return api.saveAdvance({ id: a ? a.id : undefined, staffId: A.val('ad-st', el), kind: kind, amount: A.val('ad-amt', el), date: A.val('ad-date', el), how: A.val('ad-how', el), givenBy: A.val('ad-by', el), note: A.val('ad-note', el), files: att.files() }); }, 'Saved')) A.go('advances');
    };
    var del = $('#ad-del', el); if (del) del.onclick = function () { A.confirmSheet('Delete this advance entry?', 'Delete', true).then(function (ok) { if (ok && A.act(function () { return api.removeAdvance(a.id); }, 'Deleted')) A.go('advances'); }); };
  } });

  // ================================================================ ATTENDANCE
  var attState = { date: '', month: '' };
  var LBL = { present: 'Present', half: 'Half day', absent: 'Absent', leave: 'Leave' };
  A.screen('attendance', { title: 'Attendance', crumb: 'Staff', back: 'staff', render: function (el) {
    if (!attState.date) attState.date = A.today();
    var d = attState.date, rows = api.attendanceDay(d);
    var ym = d.slice(0, 7), mon = api.attendanceMonth(ym);
    if (!rows.length) { el.innerHTML = noStaff(); return; }
    el.innerHTML = '<div class="card"><div class="grid2">' + A.field('Day', A.input('at-date', 'date', d, 'max="' + A.today() + '"')) + '<div></div></div>' +
      '<p class="muted small">Anyone who wrote a bill that day (sales, purchase or expense, with "Bill written by") is marked present automatically. Mark the others yourself; your mark always wins.</p></div>' +
      '<ul class="list">' + rows.map(function (r) {
        var info = r.source === 'bills' ? 'Present from ' + r.bills + ' bill(s)' + (r.first ? ' · ' + r.first + (r.last && r.last !== r.first ? '–' + r.last : '') : '') : r.source === 'marked' ? 'Marked ' + LBL[r.status] + (r.bills ? ' · ' + r.bills + ' bill(s)' : '') : 'Not marked';
        return '<li class="item att"><div class="t"><b>' + esc(r.name) + '</b><span>' + esc(info) + '</span></div>' +
          A.seg('as-' + r.staffId, [['present', 'P'], ['half', '½'], ['absent', 'A'], ['leave', 'L'], ['', 'Auto']], r.source === 'marked' ? r.status : '') + '</li>';
      }).join('') + '</ul><p class="muted small">P present · ½ half day · A absent · L leave · Auto = from bills</p>' +
      '<div class="section-title">' + esc(A.monthName(ym)) + '</div><div class="card"><div class="tw"><table><thead><tr><th>Staff</th><th class="n">P</th><th class="n">½</th><th class="n">A</th><th class="n">L</th><th class="n">–</th></tr></thead><tbody>' +
      mon.rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="n">' + r.present + '</td><td class="n">' + r.half + '</td><td class="n">' + r.absent + '</td><td class="n">' + r.leave + '</td><td class="n">' + r.unmarked + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="muted small">' + mon.days.length + ' day(s) so far this month · – = not marked and no bills.</p></div>';
    $('#at-date', el).onchange = function (e) { attState.date = e.target.value || A.today(); A.render(); };
    rows.forEach(function (r) {
      A.onSeg($('#as-' + r.staffId, el), function (v) { if (A.act(function () { return api.markAttendance({ staffId: r.staffId, date: d, status: v }); }, v ? r.name + ': ' + LBL[v] : r.name + ': from bills')) A.render(); });
    });
  } });

  // ================================================================ DAILY SUMMARY
  var dsState = { date: '' };
  A.screen('daily', { title: 'Daily summary', crumb: 'Reports', back: 'reports', render: function (el) {
    if (!dsState.date) dsState.date = A.today();
    var x = api.dailySummary(dsState.date);
    el.innerHTML = '<div class="card"><div class="grid2">' + A.field('Day', A.input('ds-date', 'date', x.date, 'max="' + A.today() + '"')) + '<div></div></div></div>' +
      '<div class="today-strip">' + stat('Sales', money(x.sales), x.walkins ? x.walkins + ' customers' : '') + stat('Net profit', money(x.net), 'after the day\'s fixed share', x.net < 0 ? 'warn' : 'good') + '</div>' +
      '<div class="today-strip">' + stat('Purchases', money(x.purchases), x.purchaseBills + ' bill(s), ' + x.billsWithPhoto + ' with photo') + stat('Expenses', money(x.variable + x.maintenance + x.sudden)) + '</div>' +
      '<div class="today-strip">' + stat('Staff present', String(x.present.length), x.absent.length ? x.absent.length + ' absent / leave' : '') + stat('Cash counted', x.cashCounted === null ? 'not counted' : money(x.cashCounted)) + '</div>' +
      '<div class="section-title">Summary to share</div><div class="answer" id="ds-text">' + esc(x.text) + '</div>' +
      '<div class="row"><button type="button" class="btn primary grow" id="ds-wa">Share on WhatsApp</button><button type="button" class="btn grow" id="ds-copy">Copy</button></div>' +
      (x.purchaseBills > x.billsWithPhoto ? '<button type="button" class="btn upload block" id="ds-up">📷 Upload missing bill photo</button>' : '');
    $('#ds-date', el).onchange = function (e) { dsState.date = e.target.value || A.today(); A.render(); };
    $('#ds-wa', el).onclick = function () { A.openLink('https://wa.me/?text=' + encodeURIComponent(x.text)); };
    $('#ds-copy', el).onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(x.text) : Promise.reject()).then(function () { A.toast('Copied'); }, function () { A.saveFile('daily-summary-' + x.date + '.txt', x.text); }); };
    var up = $('#ds-up', el); if (up) up.onclick = function () { A.go('purchases'); };
  } });

  // ================================================================ BULK REMINDER (discount or video to many customers)
  var bulk = { kind: 'offer', offerId: '', video: '', text: '', who: 'all', picked: null, queue: null, i: 0, skipped: [] };
  A.screen('bulk', { title: 'Bulk reminder', crumb: 'Customers', back: 'customers', render: function (el) {
    var cust = api.list('customers', { sort: 'name' }).rows, t = A.today();
    var offers = api.list('offers', { sort: '-createdAt' }).rows.filter(function (o) { return !o.validTill || o.validTill >= t; });
    if (!bulk.video) bulk.video = A.S().customerVideo || '';
    if (!bulk.offerId && offers[0]) bulk.offerId = offers[0].id;
    var due = {}; api.vaultDue({ days: 7 }).forEach(function (d) { due[d.customer.id] = 1; });
    function group(w) { return cust.filter(function (c) { return w === 'all' || (w === 'due' && due[c.id]) || (w === 'disc' && c.discountPct > 0); }).map(function (c) { return c.id; }); }
    if (!bulk.picked) bulk.picked = group(bulk.who);
    if (!cust.length) { el.innerHTML = A.empty('No customers yet', 'Add customers first.', '<a class="btn primary" href="#cust-add">Add customer</a>'); return; }
    el.innerHTML = '<p class="muted small">Send one message to many customers. WhatsApp opens for each person in turn; you tap Send there. Every message is kept in Messages.</p>' +
      '<div class="card"><div class="section-title">1. What to send</div>' + A.seg('bk-kind', [['offer', '% Discount offer'], ['video', '▶ Video'], ['note', '✉ Own message']], bulk.kind) +
      '<div id="bk-what"></div></div>' +
      '<div class="card"><div class="section-title">2. To whom</div>' + A.seg('bk-who', [['all', 'All'], ['due', 'Reminder due'], ['disc', 'With discount'], ['none', 'None']], bulk.who) +
      '<ul class="list" id="bk-list">' + cust.map(function (c) {
        return '<li><label class="item chk"><input type="checkbox" data-c="' + c.id + '"' + (bulk.picked.indexOf(c.id) >= 0 ? ' checked' : '') + '><div class="t"><b>' + esc(c.name) + '</b><span>' + esc(c.phone || 'no phone') + (c.discountPct ? ' · ' + c.discountPct + '% discount' : '') + (due[c.id] ? ' · reminder due' : '') + '</span></div></label></li>';
      }).join('') + '</ul></div>' +
      '<div class="card"><div class="section-title">3. Check and send</div><div class="answer" id="bk-prev"></div><p class="muted small" id="bk-count"></p>' +
      '<button type="button" class="btn primary block" id="bk-go">Start sending</button></div>';
    function what() {
      var w = $('#bk-what', el);
      if (bulk.kind === 'offer') w.innerHTML = offers.length ? A.field('Offer', '<select id="bk-offer">' + A.opt(offers.map(function (o) { return { value: o.id, text: o.title + (o.validTill ? ' (till ' + A.niceDate(o.validTill) + ')' : '') }; }), bulk.offerId) + '</select>') + '<a class="btn ghost" href="#offer-add">＋ New offer</a>' : A.empty('No active offers', 'Create an offer first', '<a class="btn primary" href="#offer-add">＋ New offer</a>');
      else if (bulk.kind === 'video') w.innerHTML = A.field('YouTube link', A.input('bk-video', 'url', bulk.video, 'placeholder="https://youtu.be/…"')) + A.videoCard(bulk.video, 'Video', 'Customers will get this link');
      else w.innerHTML = A.field('Message ({name} = customer\'s name)', '<textarea id="bk-text">' + esc(bulk.text) + '</textarea>');
      var o = $('#bk-offer', el); if (o) o.onchange = function () { bulk.offerId = o.value; preview(); };
      var v = $('#bk-video', el); if (v) v.oninput = function () { bulk.video = v.value; preview(); };
      var tx = $('#bk-text', el); if (tx) tx.oninput = function () { bulk.text = tx.value; preview(); };
      preview();
    }
    function build() { return api.bulkMessages({ kind: bulk.kind, offerId: bulk.offerId, video: bulk.video, text: bulk.text, customerIds: bulk.picked }); }
    function preview() {
      var r; try { r = build(); } catch (e) { $('#bk-prev', el).textContent = e.message; $('#bk-count', el).textContent = ''; return null; }
      $('#bk-prev', el).textContent = r.messages.length ? r.messages[0].text : 'Nobody with a phone number is chosen.';
      $('#bk-count', el).textContent = r.messages.length + ' message(s) to send' + (r.skipped.length ? ' · skipped: ' + r.skipped.map(function (x) { return x.name + ' (' + x.reason.toLowerCase() + ')'; }).join(', ') : '');
      return r;
    }
    A.onSeg($('#bk-kind', el), function (v) { bulk.kind = v; what(); });
    A.onSeg($('#bk-who', el), function (v) {
      bulk.who = v; bulk.picked = v === 'none' ? [] : group(v);
      $$('[data-c]', el).forEach(function (c) { c.checked = bulk.picked.indexOf(c.dataset.c) >= 0; }); preview();
    });
    $$('[data-c]', el).forEach(function (c) { c.onchange = function () { bulk.picked = $$('[data-c]', el).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.c; }); preview(); }; });
    $('#bk-go', el).onclick = function () {
      var r = preview(); if (!r) { A.toast($('#bk-prev', el).textContent, true); return; }
      if (!r.messages.length) { A.toast('Choose customers with a phone number', true); return; }
      bulk.queue = r.messages; bulk.template = r.template; bulk.skipped = r.skipped; bulk.i = 0; A.go('bulk-send');
    };
    what();
  } });
  A.screen('bulk-send', { title: 'Sending', crumb: 'Customers › Bulk reminder', back: 'bulk', render: function (el) {
    var q = bulk.queue;
    if (!q || !q.length) { A.go('bulk'); return; }
    if (bulk.i >= q.length) {
      el.innerHTML = '<div class="card"><h2>Done</h2><p>' + q.length + ' message(s) handled.' + (bulk.skipped.length ? ' Skipped (no phone): ' + esc(bulk.skipped.map(function (x) { return x.name; }).join(', ')) : '') + '</p><a class="btn primary block" href="#messages">See messages</a><a class="btn block" href="#customers">Back to Customers</a></div>';
      bulk.queue = null; bulk.picked = null; return;
    }
    var m = q[bulk.i];
    el.innerHTML = '<div class="card"><div class="section-title">' + (bulk.i + 1) + ' of ' + q.length + '</div><h2>' + esc(m.name) + '</h2><p class="muted">' + esc(m.phone) + '</p>' +
      '<div class="answer">' + esc(m.text) + '</div>' +
      '<button type="button" class="btn primary block" id="bs-send">Open WhatsApp and send</button>' +
      '<div class="row"><button type="button" class="btn grow" id="bs-skip">Skip</button><button type="button" class="btn grow" id="bs-stop">Stop</button></div></div>';
    $('#bs-send', el).onclick = function () {
      A.act(function () { return api.logMessage({ customerId: m.customerId, template: bulk.template, text: m.text }); });
      A.openLink(A.waLink(m.phone, m.text));
      bulk.i++; setTimeout(A.render, 400);
    };
    $('#bs-skip', el).onclick = function () { bulk.i++; A.render(); };
    $('#bs-stop', el).onclick = function () { bulk.queue = null; bulk.picked = null; A.go('customers'); };
  } });
})();
