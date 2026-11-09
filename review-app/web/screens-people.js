/* CUSTOMERS (vault, discounts, offers), REPORTS and BUSINESS SETUP. */
(function () {
  'use strict';
  var A = window.App, api = A.api, $ = A.$, $$ = A.$$, esc = A.esc, money = A.money, R = A.R;
  var feat = A.feat, stat = A.stat;
  function vcfg() { return A.P().review.vault; }
  function vaultTitle() { var s = A.S(); return s.vaultTitle || s.businessName; }
  function recLabel(kind) { return vcfg().records.filter(function (r) { return r.key === kind; })[0] || { label: kind === 'note' ? 'Note' : kind === 'document' ? 'Document' : kind, dueLabel: '' }; }
  function deps() { return api.list('departments', { sort: 'order' }).rows; }

  // ================================================================ CUSTOMERS (level 2)
  A.screen('customers', { title: function () { return api.masterState().names.customers || api.workConfig().customers; }, crumb: 'Header', back: 'home', render: function (el) {
    var n = api.info().counts.customers, due = api.vaultDue({ days: 7 }), offers = api.list('offers').rows.filter(function (o) { return !o.validTill || o.validTill >= A.today(); });
    var withDisc = api.list('customers').rows.filter(function (c) { return c.discountPct > 0; }).length;
    el.innerHTML = '<p class="muted small">Every customer has a vault titled <b>' + esc(vaultTitle()) + '</b>: records, photos, files, discounts and your messages.</p><ul class="feats">' +
      feat('cust-list', '☺', 'Customer list', 'Open a customer\'s vault · add a customer', String(n)) +
      feat('bulk', '📣', 'Bulk reminder', 'Discount offer or video to many customers at once') +
      feat('reminders', '⏰', 'Reminders due', 'Refills, service dates', due.length ? due.length + ' this week' : 'none') +
      feat('discounts', '%', 'Customer discount', 'Standing discount for regular customers', withDisc + ' customers') +
      feat('offers', '★', 'Special discount', 'One-off offers with a validity date', offers.length + ' active') +
      feat('messages', '✉', 'Messages', 'Everything sent to customers') +
      feat('setup-video', '▶', 'Customer video', A.ytId(A.S().customerVideo) ? 'Shown in every vault' : 'Add a YouTube link for customers') +
      '</ul>';
  } });

  var cs = { q: '' };
  A.screen('cust-list', { title: 'Customer list', crumb: 'Customers', back: 'customers', render: function (el) {
    var all = api.vaultSummary(), map = {}; api.list('customers').rows.forEach(function (c) { map[c.id] = c; });
    el.innerHTML = '<div class="row"><input id="cl-q" class="grow" placeholder="Search name or phone" value="' + esc(cs.q) + '"><a class="btn primary" href="#cust-add">＋ Add</a></div><div id="cl-l"></div>';
    function draw() {
      var q = cs.q.toLowerCase(), rows = all.filter(function (c) { return !q || (c.name + ' ' + (c.phone || '')).toLowerCase().indexOf(q) >= 0; });
      $('#cl-l', el).innerHTML = rows.length ? '<ul class="list">' + rows.map(function (c) {
        var d = (map[c.id] || {}).discountPct;
        return '<li><button type="button" class="item" data-c="' + c.id + '"><div class="t"><b>' + esc(c.name) + '</b><span>' + esc([c.phone, c.records + ' record(s)', c.lastContact ? 'last message ' + A.niceDate(c.lastContact) : ''].filter(Boolean).join(' · ')) + '</span></div>' + (d ? '<span class="pill good">' + d + '% off</span>' : '') + (c.nextDue ? '<span class="pill ink">' + esc(A.niceDate(c.nextDue)) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>' : A.empty(all.length ? 'No match' : 'No customers yet', all.length ? '' : 'Add customers, patients or guests to start their vaults.');
      $$('[data-c]', el).forEach(function (b) { b.onclick = function () { A.go('vault', { id: b.dataset.c }); }; });
    }
    $('#cl-q', el).oninput = function (e) { cs.q = e.target.value; draw(); }; draw();
  } });

  A.screen('cust-add', { title: 'Customer', crumb: 'Customers', back: 'cust-list', render: function (el, st) {
    var c = st && st.id ? api.get('customers', st.id) : null;
    el.innerHTML = '<div class="card"><div class="section-title">Visiting card or ID (optional)</div><div id="ca-att"></div><div class="grid2">' +
      A.field('Name', A.input('ca-name', 'text', c ? c.name : '', 'autocomplete="name"')) + A.field('WhatsApp number', A.input('ca-phone', 'tel', c ? c.phone : '', 'inputmode="tel"')) +
      A.field('Email', A.input('ca-email', 'email', c ? c.email : '')) + A.field('Standing discount %', A.input('ca-disc', 'number', c ? c.discountPct || '' : '', 'min="0" max="100"')) +
      '<label class="f full">Notes' + A.input('ca-notes', 'text', c ? c.notes : '') + '</label></div>' +
      '<div class="row"><button type="button" class="btn primary grow" id="ca-save">' + (c ? 'Save' : 'Create vault') + '</button>' + (c ? '<button type="button" class="btn danger" id="ca-del">Delete</button>' : '') + '</div></div>';
    var att = A.files.attach($('#ca-att', el), { files: c ? c.files : [], read: 'card', label: 'Photo of card', onRead: function (o) {
      if (o.name && !A.val('ca-name', el)) $('#ca-name', el).value = o.name; if (o.phone && !A.val('ca-phone', el)) $('#ca-phone', el).value = o.phone; if (o.email && !A.val('ca-email', el)) $('#ca-email', el).value = o.email;
    } });
    $('#ca-save', el).onclick = function () {
      var r = A.act(function () { return api.saveCustomer({ id: c ? c.id : undefined, name: A.val('ca-name', el), phone: A.val('ca-phone', el), email: A.val('ca-email', el), discountPct: A.val('ca-disc', el), notes: A.val('ca-notes', el), files: att.files() }); }, c ? 'Saved' : 'Vault created');
      if (r) A.go('vault', { id: r.id });
    };
    var del = $('#ca-del', el); if (del) del.onclick = function () { A.confirmSheet('Delete ' + c.name + ' and their vault?', 'Delete', true).then(function (ok) { if (ok && A.act(function () { return api.removeCustomer(c.id); }, 'Deleted')) A.go('cust-list'); }); };
  } });

  A.screen('vault', { title: function () { return vaultTitle(); }, crumb: 'Customer vault', back: 'cust-list', render: function (el, st) {
    if (!st || !st.id || !api.get('customers', st.id)) { A.go('cust-list'); return; }
    var v = api.vault(st.id), c = v.customer, t = A.today(), offers = api.offersFor(c.id);
    el.innerHTML = '<div class="card"><div class="card-head"><div><h2>' + esc(c.name) + '</h2><p class="muted small">' + esc(c.phone || 'No WhatsApp number') + '</p></div><button type="button" class="btn small" id="v-edit">Edit</button></div>' +
      '<div class="row">' + (c.discountPct ? '<span class="pill good">Customer discount ' + c.discountPct + '%</span>' : '') + offers.map(function (o) { return '<span class="pill ink">' + esc(o.title) + (o.validTill ? ' · till ' + A.niceDate(o.validTill) : '') + '</span>'; }).join('') + '</div>' +
      '<div class="row"><button type="button" class="btn primary grow" id="v-msg">Message</button><button type="button" class="btn grow" id="v-add">Add record</button></div><button type="button" class="btn ghost" id="v-share">Send ' + esc(c.name.split(' ')[0]) + ' their vault</button></div>' +
      A.videoCard(A.S().customerVideo, 'Video for customers', 'Shown in every customer\'s vault') +
      '<div class="card"><h2>Photos and files</h2><p class="muted small">Prescriptions, reports, invoices, warranty cards, ID… text in photos is read and kept searchable.</p><div id="v-att"></div><button type="button" class="btn small" id="v-files">Save photos and files</button></div>' +
      '<div class="card"><h2>Records</h2>' + (v.records.length ? '<ul class="list">' + v.records.map(function (r) {
        var l = recLabel(r.kind);
        return '<li><button type="button" class="item" data-r="' + r.id + '"><div class="t"><b>' + esc(l.label + (r.title ? ': ' + r.title : '')) + '</b><span>' + esc(A.niceDate(r.date, true) + (r.details ? ' · ' + r.details : '') + (r.files && r.files.length ? ' · 📷 ' + r.files.length : '')) + '</span></div>' +
          (r.dueDate ? '<span class="pill ' + (r.done ? 'good' : 'ink') + '">' + esc(r.done ? 'done' : (l.dueLabel || 'Due') + ' ' + A.niceDate(r.dueDate)) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted small">Nothing yet. Add their ' + esc(vcfg().records.slice(0, 3).map(function (x) { return x.label.toLowerCase(); }).join(', ')) + '.</p>') + '</div>' +
      '<div class="card"><h2>Messages</h2>' + (v.messages.length ? '<ul class="list">' + v.messages.slice(0, 30).map(function (m) { return '<li class="item"><div class="t"><span>' + esc(A.niceDate(m.date, true)) + '</span><b style="font-weight:500">' + esc(m.text) + '</b></div></li>'; }).join('') + '</ul>' : '<p class="muted small">No messages yet.</p>') + '</div>';
    var att = A.files.attach($('#v-att', el), { files: c.files || [], read: 'text', label: 'Photo' });
    $('#v-files', el).onclick = function () { A.act(function () { return api.saveCustomer(Object.assign({}, c, { files: att.files() })); }, 'Saved in ' + c.name + '\'s vault'); };
    $('#v-edit', el).onclick = function () { A.go('cust-add', { id: c.id }); };
    $('#v-msg', el).onclick = function () { A.go('message', { id: c.id }); };
    $('#v-add', el).onclick = function () { A.go('record', { id: c.id }); };
    $('#v-share', el).onclick = function () { A.go('message', { id: c.id, share: true }); };
    $$('[data-r]', el).forEach(function (b) { b.onclick = function () { A.go('record', { id: c.id, recordId: b.dataset.r }); }; });
  } });

  A.screen('record', { title: 'Vault record', crumb: 'Customer vault', back: 'cust-list', render: function (el, st) {
    if (!st || !st.id) { A.go('cust-list'); return; }
    var c = api.get('customers', st.id), r = st.recordId ? api.get('vaultRecords', st.recordId) : null, kinds = vcfg().records;
    if (!c) { A.go('cust-list'); return; }
    var kind = r ? r.kind : kinds[0].key;
    el.innerHTML = '<div class="card"><p class="muted small">' + esc(c.name) + ' · ' + esc(vaultTitle()) + ' vault</p>' +
      A.field('Kind', A.seg('vr-kind', kinds.map(function (k) { return [k.key, k.label]; }).concat([['document', 'Document'], ['note', 'Note']]), kind)) +
      '<div class="section-title">Photo or file</div><div id="vr-att"></div>' +
      A.field('Title', A.input('vr-title', 'text', r ? r.title : '')) +
      '<div class="grid2">' + A.field('Date', A.input('vr-date', 'date', r ? r.date : A.today())) + '<label class="f"><span id="vr-due-l">Reminder date</span>' + A.input('vr-due', 'date', r ? r.dueDate : '') + '</label></div>' +
      A.field('Details', '<textarea id="vr-details">' + esc(r ? r.details : '') + '</textarea>') +
      (r ? '<label class="chk"><input type="checkbox" id="vr-done"' + (r.done ? ' checked' : '') + '> Done (no more reminders)</label>' : '') +
      '<div class="row"><button type="button" class="btn primary grow" id="vr-save">Save to vault</button>' + (r ? '<button type="button" class="btn danger" id="vr-del">Delete</button>' : '') + '</div></div>';
    var att = A.files.attach($('#vr-att', el), { files: r ? r.files : [], read: 'text', label: 'Photo', onRead: function (o) { if (o.text && !A.val('vr-details', el)) $('#vr-details', el).value = String(o.text).trim().slice(0, 500); } });
    function lab() { var l = recLabel(kind).dueLabel; $('#vr-due-l', el).textContent = l ? l + ' (reminder)' : 'Reminder date (optional)'; }
    A.onSeg($('#vr-kind', el), function (v2) { kind = v2; lab(); }); lab();
    $('#vr-save', el).onclick = function () {
      if (A.act(function () { return api.saveVaultRecord({ id: r ? r.id : undefined, customerId: c.id, kind: kind, title: A.val('vr-title', el), date: A.val('vr-date', el), dueDate: A.val('vr-due', el), details: A.val('vr-details', el), done: $('#vr-done', el) ? $('#vr-done', el).checked : false, files: att.files() }); }, 'Saved to vault')) A.go('vault', { id: c.id });
    };
    var del = $('#vr-del', el); if (del) del.onclick = function () { if (A.act(function () { return api.removeVaultRecord(r.id); }, 'Deleted')) A.go('vault', { id: c.id }); };
  } });

  A.screen('discounts', { title: 'Customer discount', crumb: 'Customers', back: 'customers', render: function (el) {
    var rows = api.list('customers', { sort: 'name' }).rows;
    el.innerHTML = '<p class="muted small">A standing discount for regular customers. It shows in their vault and you can mention it in messages. (The app records it; billing stays in your billing system.)</p>' +
      (rows.length ? '<ul class="list">' + rows.map(function (c) { return '<li class="item"><div class="t"><b>' + esc(c.name) + '</b><span>' + esc(c.phone || '') + '</span></div><input type="number" min="0" max="100" style="max-width:90px" data-d="' + c.id + '" value="' + esc(c.discountPct || '') + '" placeholder="0" aria-label="Discount % for ' + esc(c.name) + '"><span class="muted">%</span></li>'; }).join('') + '</ul>' : A.empty('No customers yet', '', '<a class="btn primary" href="#cust-add">Add customer</a>'));
    $$('[data-d]', el).forEach(function (i) { i.onchange = function () { var c = api.get('customers', i.dataset.d); A.act(function () { return api.saveCustomer(Object.assign({}, c, { discountPct: i.value })); }, 'Saved'); }; });
  } });

  A.screen('offers', { title: 'Special discount', crumb: 'Customers', back: 'customers', render: function (el) {
    var t = A.today(), rows = api.list('offers', { sort: '-createdAt' }).rows;
    el.innerHTML = '<a class="btn primary block" href="#offer-add">＋ New special discount</a>' + (rows.length ? '<ul class="list">' + rows.map(function (o) {
      var live = !o.validTill || o.validTill >= t;
      return '<li><button type="button" class="item" data-o="' + o.id + '"><div class="t"><b>' + esc(o.title) + '</b><span>' + esc((o.pct ? o.pct + '% off' : money(o.amount) + ' off') + ' · ' + (o.allCustomers ? 'all customers' : o.customerIds.length + ' customer(s)') + (o.validTill ? ' · till ' + A.niceDate(o.validTill, true) : '')) + '</span></div><span class="pill ' + (live ? 'good' : '') + '">' + (live ? 'active' : 'ended') + '</span></button></li>';
    }).join('') + '</ul>' : A.empty('No special discounts yet', 'Birthday, festival or loyalty offers. Send them to customers on WhatsApp.'));
    $$('[data-o]', el).forEach(function (b) { b.onclick = function () { A.go('offer-add', { id: b.dataset.o }); }; });
  } });
  A.screen('offer-add', { title: 'Special discount', crumb: 'Customers', back: 'offers', render: function (el, st) {
    var o = st && st.id ? api.get('offers', st.id) : null, cust = api.list('customers', { sort: 'name' }).rows;
    var picked = o ? o.customerIds.slice() : [];
    el.innerHTML = '<div class="card"><div class="grid2">' + A.field('Name of the offer', A.input('of-title', 'text', o ? o.title : '', 'placeholder="Diwali 10% off"')) + A.field('Discount %', A.input('of-pct', 'number', o ? o.pct || '' : '', 'min="0" max="100"')) +
      A.field('or amount off ₹', A.input('of-amt', 'number', o ? o.amount || '' : '', 'min="0"')) + A.field('Valid till', A.input('of-till', 'date', o ? o.validTill : A.addDays(A.today(), 7))) +
      '<label class="f full">Reason' + A.input('of-why', 'text', o ? o.reason : '', 'placeholder="Birthday, festival, loyal customer…"') + '</label></div>' +
      '<div class="section-title">For</div><div class="seg" id="of-c"><button type="button" data-v=""' + (!picked.length ? ' class="on"' : '') + '>All customers</button>' + cust.map(function (c) { return '<button type="button" data-v="' + c.id + '"' + (picked.indexOf(c.id) >= 0 ? ' class="on"' : '') + '>' + esc(c.name) + '</button>'; }).join('') + '</div>' +
      '<div class="row"><button type="button" class="btn primary grow" id="of-save">Save</button>' + (o ? '<button type="button" class="btn danger" id="of-del">Delete</button>' : '') + '</div></div>' +
      (o ? '<div class="card"><h2>Send it</h2><ul class="list">' + (o.allCustomers ? cust : cust.filter(function (c) { return o.customerIds.indexOf(c.id) >= 0; })).map(function (c) { return '<li><button type="button" class="item" data-send="' + c.id + '"><div class="t"><b>' + esc(c.name) + '</b><span>' + esc(c.phone || 'no number') + '</span></div><span class="pill warn">Send</span></button></li>'; }).join('') + '</ul></div>' : '');
    $$('#of-c button', el).forEach(function (b) {
      b.onclick = function () { var id = b.dataset.v; if (!id) picked = []; else if (picked.indexOf(id) >= 0) picked = picked.filter(function (x) { return x !== id; }); else picked.push(id);
        $$('#of-c button', el).forEach(function (x) { x.classList.toggle('on', x.dataset.v ? picked.indexOf(x.dataset.v) >= 0 : !picked.length); }); };
    });
    $('#of-save', el).onclick = function () {
      var r = A.act(function () { return api.saveOffer({ id: o ? o.id : undefined, title: A.val('of-title', el), pct: A.val('of-pct', el), amount: A.val('of-amt', el), validTill: A.val('of-till', el), reason: A.val('of-why', el), customerIds: picked }); }, 'Saved');
      if (r) A.go('offer-add', { id: r.id });
    };
    var del = $('#of-del', el); if (del) del.onclick = function () { if (A.act(function () { return api.removeOffer(o.id); }, 'Deleted')) A.go('offers'); };
    $$('[data-send]', el).forEach(function (b) { b.onclick = function () { A.go('message', { id: b.dataset.send, offerId: o.id }); }; });
  } });

  A.screen('reminders', { title: 'Reminders due', crumb: 'Customers', back: 'customers', render: function (el) {
    var due = api.vaultDue({ days: 30 });
    el.innerHTML = '<a class="btn primary block" href="#bulk">📣 Send to many at once (bulk reminder)</a>' + (due.length ? '<ul class="list">' + due.map(function (d, i) {
      return '<li><button type="button" class="item flag info" data-i="' + i + '"><div class="t"><b>' + esc(d.customer.name) + '</b><span>' + esc(d.dueLabel + ': ' + (d.record.title || recLabel(d.record.kind).label) + ' · ' + A.niceDate(d.record.dueDate) + (d.remindedOn ? ' · reminded ' + A.niceDate(d.remindedOn) : '')) + '</span></div><span class="pill ' + (d.remindedOn ? 'good' : 'ink') + '">' + (d.remindedOn ? 'Sent' : 'Send') + '</span></button></li>';
    }).join('') + '</ul>' : A.empty('Nothing due in the next 30 days', 'Add reminder dates to vault records.'));
    $$('[data-i]', el).forEach(function (b) { b.onclick = function () { var d = due[+b.dataset.i]; A.go('message', { id: d.customer.id, recordId: d.record.id }); }; });
  } });
  A.screen('messages', { title: 'Messages', crumb: 'Customers', back: 'customers', render: function (el) {
    var rows = api.list('messages', { sort: '-at', limit: 200 }).rows;
    el.innerHTML = rows.length ? '<ul class="list">' + rows.map(function (m) { return '<li><button type="button" class="item" data-c="' + m.customerId + '"><div class="t"><b>' + esc(m.customerName) + '</b><span>' + esc(A.niceDate(m.date) + ' · ' + m.text.slice(0, 120)) + '</span></div></button></li>'; }).join('') + '</ul>' : A.empty('No messages yet', '');
    $$('[data-c]', el).forEach(function (b) { b.onclick = function () { A.go('vault', { id: b.dataset.c }); }; });
  } });

  A.screen('message', { title: 'Message', crumb: 'Customer vault', back: 'cust-list', render: function (el, st) {
    if (!st || !st.id) { A.go('customers'); return; }
    var c = api.get('customers', st.id), rec = st.recordId ? api.get('vaultRecords', st.recordId) : null, offer = st.offerId ? api.get('offers', st.offerId) : null;
    var tpls = vcfg().templates.slice(), key;
    var vid = A.ytId(A.S().customerVideo);
    if (vid) tpls.push({ key: 'video', label: 'Our video', text: 'Dear {name}, here is a short video from {vault}: https://youtu.be/' + vid });
    if (offer) tpls.unshift({ key: 'offer', label: 'Special discount', text: 'Dear {name}, a special offer for you from {vault}: ' + offer.title + ' (' + (offer.pct ? offer.pct + '% off' : money(offer.amount) + ' off') + ')' + (offer.validTill ? ', valid till ' + A.niceDate(offer.validTill, true) : '') + '. See you soon!' });
    if (st.share && A.sync.url) {
      var tok = A.act(function () { return api.ensureVaultToken(c.id); });
      tpls.unshift({ key: 'vault', label: 'Vault link', text: 'Dear {name}, your records and messages from {vault} are saved in your personal vault: ' + A.serverBase() + 'v/' + tok + ' (private link, keep it safe).' });
    } else if (st.share) {
      var v = api.vault(c.id);
      var lines = v.records.slice(0, 15).map(function (x) { var l = recLabel(x.kind); return '• ' + l.label + (x.title ? ': ' + x.title : '') + (x.dueDate ? ' (' + (l.dueLabel || 'due') + ' ' + A.niceDate(x.dueDate, true) + ')' : ''); });
      tpls.unshift({ key: 'vault', label: 'Their vault', text: 'Dear {name}, here is your {vault} vault:\n' + (lines.join('\n') || '(nothing saved yet)') + (c.discountPct ? '\nYour customer discount: ' + c.discountPct + '%.' : '') + '\nWe will remind you before anything is due.' });
    }
    key = offer ? 'offer' : st.share ? 'vault' : rec && rec.dueDate ? tpls[0].key : (tpls.filter(function (x) { return x.key === 'thanks'; })[0] || tpls[0]).key;
    el.innerHTML = '<div class="card"><p class="muted small">To ' + esc(c.name) + (c.phone ? ' · ' + esc(c.phone) : ' · no number saved') + '</p>' +
      A.field('Message', A.seg('ms-t', tpls.map(function (x) { return [x.key, x.label]; }), key)) +
      '<div class="grid2">' + A.field('About', A.input('ms-item', 'text', rec ? (rec.title || recLabel(rec.kind).label) : '')) + A.field('Date', A.input('ms-date', 'text', rec && rec.dueDate ? A.niceDate(rec.dueDate, true) : '')) + '</div>' +
      A.field('Text', '<textarea id="ms-text" style="min-height:150px"></textarea>') +
      '<button type="button" class="btn primary block" id="ms-send">Send on WhatsApp</button><button type="button" class="btn block" id="ms-copy">Copy text</button></div>';
    function fill() {
      var tp = tpls.filter(function (x) { return x.key === key; })[0] || tpls[0];
      var vals = { name: c.name, shop: A.S().businessName, vault: vaultTitle(), item: A.val('ms-item', el) || 'your order', date: A.val('ms-date', el) || 'soon' };
      $('#ms-text', el).value = tp.text.replace(/\{(\w+)\}/g, function (m, k) { return vals[k] !== undefined ? vals[k] : m; });
    }
    A.onSeg($('#ms-t', el), function (v2) { key = v2; fill(); }); $('#ms-item', el).oninput = fill; $('#ms-date', el).oninput = fill; fill();
    $('#ms-send', el).onclick = function () {
      var text = A.val('ms-text', el);
      A.act(function () { return api.logMessage({ customerId: c.id, template: key, recordId: rec ? rec.id : '', text: text }); });
      A.openLink(A.waLink(c.phone || '', text)); A.toast('Saved in ' + c.name + '\'s vault');
      setTimeout(function () { A.go('vault', { id: c.id }); }, 400);
    };
    $('#ms-copy', el).onclick = function () { var tx = A.val('ms-text', el); (navigator.clipboard ? navigator.clipboard.writeText(tx) : Promise.reject()).then(function () { A.toast('Copied'); }).catch(function () { $('#ms-text', el).select(); }); };
  } });

  // ================================================================ REPORTS (level 2)
  A.screen('reports', { title: 'Reports', crumb: 'Header', back: 'home', render: function (el) {
    var al = api.alerts({}), pl = al.pl;
    el.innerHTML = '<div class="today-strip">' + stat('Last 30 days: sales', money(pl.sales)) + stat('Net profit', money(pl.net), '', pl.net < 0 ? 'bad' : 'good') + '</div><ul class="feats">' +
      feat('daily', '☰', 'Daily summary', 'One day on one page · share on WhatsApp') +
      feat('pl', '∑', 'Profit & Loss', 'Any period, fixed costs spread per day', money(pl.net), pl.net < 0 ? 'down' : '') +
      feat('alerts', '⚠', 'Alerts', 'What needs checking', String(al.flags.length), al.flags.some(function (f) { return f.severity === 'high'; }) ? 'down' : '') +
      feat('rep-sales', '₹', 'Sales report', 'By department, day-on-day change, morning vs evening, walk-ins') +
      feat('rep-spend', '↓', 'Spending report', 'Purchases and the four kinds of expenses, against the previous period') +
      feat('spot', '⌕', 'Spot check', 'Random days, chosen days, morning or evening') +
      feat('ask-ai', '✦', 'Ask AI about my business', 'OpenAI or Gemini explains your numbers') +
      '</ul>';
  } });
  A.screen('alerts', { title: 'Alerts', crumb: 'Reports', back: 'reports', render: function (el) {
    var al = api.alerts({});
    el.innerHTML = '<p class="muted small">Last 30 days.</p>' + A.flagItems(al.flags) + '<button type="button" class="btn block" id="al-share">Share on WhatsApp</button>';
    $('#al-share', el).onclick = function () { A.openLink(A.waLink(A.S().phone || '', '*' + A.S().businessName + ': things to check*\n' + al.flags.slice(0, 12).map(function (f) { return '• ' + f.title; }).join('\n'))); };
  } });
  function periodPicker(id, st) {
    return A.seg(id, [['7', '7 days'], ['30', '30 days'], ['month', 'This month'], ['lastmonth', 'Last month']], st.p);
  }
  function rangeOf(p) {
    var t = A.today(), d = new Date();
    if (p === '7') return [R.addDays(t, -6), t];
    if (p === 'month') return [t.slice(0, 8) + '01', t];
    if (p === 'lastmonth') { var f = new Date(d.getFullYear(), d.getMonth() - 1, 1), l = new Date(d.getFullYear(), d.getMonth(), 0); return [A.Base.localDate(f), A.Base.localDate(l)]; }
    return [R.addDays(t, -29), t];
  }
  function prevRange(r) { var n = R.daysIn(r[0], r[1]).length; return [R.addDays(r[0], -n), R.addDays(r[0], -1)]; }
  function chg(a, b, upGood) { if (!b) return '<span class="muted">–</span>'; var c = Math.round((a - b) / b * 100); var good = upGood ? c >= 0 : c <= 0; return '<span class="' + (good ? 'up' : 'down') + '">' + (c >= 0 ? '▲' : '▼') + Math.abs(c) + '%</span>'; }
  var rsS = { p: '30' }, rsP = { p: '30' };
  A.screen('rep-sales', { title: 'Sales report', crumb: 'Reports', back: 'reports', render: function (el) {
    var r = rangeOf(rsS.p), ins = api.reviewInsights({ from: r[0], to: r[1] }), prev = api.reviewInsights({ from: prevRange(r)[0], to: prevRange(r)[1] });
    var t = ins.totals;
    el.innerHTML = periodPicker('rs-p', rsS) + '<div class="stats">' + stat('Sales', money(t.sale)) + stat('vs previous period', '', '') + stat('Walk-ins', String(t.walkin || 0), ins.ratios.avgSpend ? money(ins.ratios.avgSpend) + ' each' : '') + '</div>' +
      '<div class="card"><h2>By department</h2><div class="tw"><table><thead><tr><th>Department</th><th class="n">Sales</th><th class="n">Change</th><th class="n">Walk-ins</th></tr></thead><tbody>' +
      ins.byDepartment.map(function (d) { var p = prev.byDepartment.filter(function (x) { return x.name === d.name; })[0]; return '<tr><td>' + esc(d.name) + '</td><td class="n">' + money(d.totals.sale) + '</td><td class="n">' + chg(d.totals.sale, p && p.totals.sale, true) + '</td><td class="n">' + (d.totals.walkin || '–') + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="card"><h2>Morning vs evening</h2><div class="tw"><table><tbody><tr><td>Morning</td><td class="n">' + money(ins.halves.first.sale) + '</td></tr><tr><td>Evening</td><td class="n">' + money(ins.halves.second.sale) + '</td></tr>' + (ins.halves.unsplit.sale ? '<tr><td>Whole day (not split)</td><td class="n">' + money(ins.halves.unsplit.sale) + '</td></tr>' : '') + '</tbody></table></div></div>' +
      '<div class="card"><h2>Day by day</h2>' + A.barChart(ins.byDay.map(function (d) { return { a: d.totals.sale, label: d.date, tick: d.date.slice(8) }; }), { aria: 'Sales by day' }) +
      '<div class="tw"><table><thead><tr><th>Day</th><th class="n">Sales</th><th class="n">Change</th><th class="n">Walk-ins</th></tr></thead><tbody>' + ins.byDay.filter(function (d) { return d.count; }).slice().reverse().map(function (d) { return '<tr><td>' + esc(A.niceDate(d.date)) + '</td><td class="n">' + money(d.totals.sale) + '</td><td class="n">' + (d.change === null ? '–' : '<span class="' + (d.change >= 0 ? 'up' : 'down') + '">' + (d.change >= 0 ? '▲' : '▼') + Math.abs(Math.round(d.change)) + '%</span>') + '</td><td class="n">' + (d.totals.walkin || '–') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    $$('.stat', el)[1].innerHTML = '<span class="l">vs previous period</span><span class="v">' + chg(t.sale, prev.totals.sale, true) + '</span>';
    A.onSeg($('#rs-p', el), function (v) { rsS.p = v; A.render(); });
  } });
  A.screen('rep-spend', { title: 'Spending report', crumb: 'Reports', back: 'reports', render: function (el) {
    var r = rangeOf(rsP.p), pr = prevRange(r), a = api.profitLoss({ from: r[0], to: r[1] }), b = api.profitLoss({ from: pr[0], to: pr[1] });
    var rows = [['Purchases', 'purchases'], ['Fixed (share for the period)', 'fixed'], ['Variable', 'variable'], ['Maintenance', 'maintenance'], ['Sudden / miscellaneous', 'sudden']];
    var tot = function (x) { return x.purchases + x.fixed + x.variable + x.maintenance + x.sudden; };
    el.innerHTML = periodPicker('rp-p', rsP) + '<div class="card"><div class="tw"><table class="stmt"><thead><tr><th></th><th class="n">This period</th><th class="n">Before</th><th class="n">Change</th></tr></thead><tbody>' +
      rows.map(function (x) { return '<tr><td>' + x[0] + '</td><td class="n">' + money(a[x[1]]) + '</td><td class="n">' + money(b[x[1]]) + '</td><td class="n">' + chg(a[x[1]], b[x[1]], false) + '</td></tr>'; }).join('') +
      '<tr class="tot"><td>Total spending</td><td class="n">' + money(tot(a)) + '</td><td class="n">' + money(tot(b)) + '</td><td class="n">' + chg(tot(a), tot(b), false) + '</td></tr>' +
      '<tr><td>Sales</td><td class="n">' + money(a.sales) + '</td><td class="n">' + money(b.sales) + '</td><td class="n">' + chg(a.sales, b.sales, true) + '</td></tr>' +
      '<tr><td>Spending as % of sales</td><td class="n">' + (a.sales ? A.pct(tot(a) / a.sales * 100) : '–') + '</td><td class="n">' + (b.sales ? A.pct(tot(b) / b.sales * 100) : '–') + '</td><td></td></tr></tbody></table></div></div>' +
      '<div class="card"><h2>Purchases by store category</h2>' + (a.purchasesByCategory.map(function (x) { return '<div class="row"><span class="grow">' + esc(x.name) + '</span><b>' + money(x.amount) + '</b></div>'; }).join('') || '<p class="muted small">None.</p>') +
      '<h2>Expenses</h2>' + (a.expensesByCategory.map(function (x) { return '<div class="row"><span class="grow">' + esc(x.name) + '</span><b>' + money(x.amount) + '</b></div>'; }).join('') || '<p class="muted small">None.</p>') + '</div>';
    A.onSeg($('#rp-p', el), function (v) { rsP.p = v; A.render(); });
  } });
  var spot = { count: 3, half: '', seed: String(Date.now()), days: [] };
  A.screen('spot', { title: 'Spot check', crumb: 'Reports', back: 'reports', render: function (el) {
    var t = A.today(), from = R.addDays(t, -29);
    if (!spot.days.length) spot.days = api.sampleDays({ from: from, to: t, count: spot.count, seed: spot.seed });
    var res = api.reviewInsights({ from: from, to: t, days: spot.days, half: spot.half });
    el.innerHTML = '<div class="card"><div class="row">' + A.input('sp-n', 'number', spot.count, 'min="1" max="31" style="max-width:90px" aria-label="Number of days"') + '<button type="button" class="btn" id="sp-again">Pick random days</button></div>' +
      A.seg('sp-h', [['', 'Whole day'], ['first', 'Morning'], ['second', 'Evening']], spot.half) + '<p class="muted small">Checking ' + esc(spot.days.map(function (d) { return A.niceDate(d); }).join(', ')) + ' against the last 30 days.</p></div>' +
      '<div class="card"><ul class="list">' + res.summary.map(function (x) { return '<li class="small">• ' + esc(x) + '</li>'; }).join('') + '</ul></div>' + A.flagItems(res.flags);
    $('#sp-again', el).onclick = function () { spot.count = Math.max(1, +A.val('sp-n', el) || 3); spot.seed = String(Date.now()); spot.days = []; A.render(); };
    A.onSeg($('#sp-h', el), function (v) { spot.half = v; A.render(); });
  } });
  A.screen('ask-ai', { title: 'Ask AI', crumb: 'Reports', back: 'reports', render: function (el) {
    var key = A.lsGet(A.AIKEY), s = A.S();
    el.innerHTML = '<div class="card"><p class="muted small">Your last 30 days of numbers are summarised and sent to ' + (s.aiProvider === 'openai' ? 'OpenAI' : 'Google Gemini') + ' with your question. Needs internet and an AI key.</p>' +
      (key ? '' : '<div class="banner">Add an AI key first: Master → AI.</div><a class="btn" href="#setup-ai">Add AI key</a>') +
      A.seg('ai-q', [['Why did my profit change this month?', 'Profit change'], ['Where can I cut spending?', 'Cut spending'], ['How can I increase sales?', 'More sales'], ['Explain my alerts in simple words', 'Explain alerts']], '') +
      A.field('Your question', '<textarea id="ai-text" placeholder="Ask anything about your numbers"></textarea>') + '<button type="button" class="btn primary block" id="ai-go"' + (key ? '' : ' disabled') + '>Ask</button><div id="ai-out"></div></div>';
    A.onSeg($('#ai-q', el), function (v) { $('#ai-text', el).value = v; });
    $('#ai-go', el).onclick = function () {
      var q = A.val('ai-text', el).trim(); if (!q) { A.toast('Type a question', true); return; }
      var al = api.alerts({}), pl = al.pl;
      var facts = 'Business: ' + s.businessName + ' (' + A.P().name + '). Period ' + pl.from + ' to ' + pl.to + '.\nSales ' + Math.round(pl.sales) + ', purchases ' + Math.round(pl.purchases) + ', gross ' + Math.round(pl.gross) +
        ', variable ' + Math.round(pl.variable) + ', maintenance ' + Math.round(pl.maintenance) + ', sudden ' + Math.round(pl.sudden) + ', fixed share ' + Math.round(pl.fixed) + ', net ' + Math.round(pl.net) + '.\n' +
        'Sales by department: ' + pl.salesByDept.map(function (x) { return x.name + ' ' + Math.round(x.amount); }).join(', ') + '.\nPurchases by category: ' + pl.purchasesByCategory.map(function (x) { return x.name + ' ' + Math.round(x.amount); }).join(', ') +
        '.\nSummary: ' + al.insights.summary.join(' ') + '\nAlerts: ' + al.flags.slice(0, 12).map(function (f) { return f.title; }).join('; ');
      $('#ai-out', el).innerHTML = '<p class="muted small">Asking…</p>';
      A.AI.askBusiness(window.fetch.bind(window), { provider: s.aiProvider || 'gemini', apiKey: key, model: s.aiModel, presetName: A.P().name }, facts, q)
        .then(function (ans) { $('#ai-out', el).innerHTML = '<div class="answer">' + esc(ans) + '</div>'; }, function (e) { $('#ai-out', el).innerHTML = '<div class="banner">' + esc(e.message) + '</div>'; });
    };
  } });

  // ================================================================ BUSINESS SETUP (level 2)
  A.screen('setup', { title: 'Master', crumb: 'Header · no login needed', back: 'home', render: function (el) {
    var s = A.S(), wc = api.workConfig(), ms = api.masterState(), off = Object.keys(ms.hidden).filter(function (k) { return ms.hidden[k]; }).length;
    el.innerHTML = '<p class="muted small">Change the app for your business here. Changes apply at once on this phone (and on every phone connected to the office system).</p><ul class="feats">' +
      A.feat('master-features', '☰', 'Features: show, hide, rename', off ? off + ' switched off' : 'All switched on') +
      A.feat('master-work', '✎', 'Work areas for ' + A.P().name, wc.title + ': ' + wc.counters.map(function (x) { return x.label; }).slice(0, 3).join(', ') + (wc.counters.length > 3 ? '…' : '')) +
      '</ul><div class="section-title">Business setup</div><ul class="feats">' +
      A.featRaw('setup-biz', '⌂', 'Business details', s.businessName + ' · vault title "' + vaultTitle() + '"') +
      A.featRaw('setup-depts', 'A', 'Sales departments', deps().filter(function (d) { return d.active !== false; }).map(function (d) { return d.name; }).join(', ')) +
      A.featRaw('setup-store', '▦', 'Store categories', api.storeCategories().join(', ')) +
      A.featRaw('setup-fixed', '▣', 'Usual fixed costs', 'Monthly amounts used until bills are entered') +
      A.featRaw('setup-video', '▶', 'Videos', 'YouTube clips for the owner and for customers') +
      A.featRaw('setup-ai', '✦', 'AI', (s.aiProvider === 'openai' ? 'OpenAI' : 'Google Gemini') + (A.lsGet(A.AIKEY) ? ' · key added' : ' · no key (optional)')) +
      A.featRaw('sync', '⇄', 'Office system', A.sync.url ? 'Connected' : 'This phone only') +
      A.featRaw('backup', '⇩', 'Backup & data', 'Save, restore, Excel') +
      A.featRaw('guide', '?', 'Guide for my business', A.P().name) + '</ul><p class="app-version">Fingertrip.biz AI version ' + esc(A.VERSION) + '</p>';
  } });
  A.screen('setup-biz', { title: 'Business details', crumb: 'Master', back: 'setup', render: function (el) {
    var s = A.S();
    el.innerHTML = '<div class="card">' + A.field('Business name', A.input('sb-name', 'text', s.businessName)) +
      A.field('Customer vault title', A.input('sb-vault', 'text', s.vaultTitle, 'placeholder="' + esc(s.businessName) + '"')) + '<p class="muted small">Customers see this name on their vault and messages.</p>' +
      A.field('Phone', A.input('sb-phone', 'tel', s.phone)) + A.field('Address', A.input('sb-addr', 'text', s.address)) +
      A.field('Type of business', '<select id="sb-ind">' + A.opt(A.Industries.list().map(function (i) { return { value: i.key, text: i.icon + ' ' + i.name }; }), s.industry) + '</select>') +
      '<div class="grid2">' + A.field('Morning ends at', A.input('sb-split', 'time', s.halfDaySplit)) + A.field('Currency', A.input('sb-cur', 'text', s.currency)) +
      A.field('Sales change alert %', A.input('sb-fl', 'number', s.fluctuationPct)) + A.field('Collection gap alert %', A.input('sb-gap', 'number', s.collectionGapPct)) + '</div>' +
      '<button type="button" class="btn primary block" id="sb-save">Save</button></div>';
    $('#sb-save', el).onclick = function () {
      if (A.act(function () { return api.saveSettings({ businessName: A.val('sb-name', el), vaultTitle: A.val('sb-vault', el), phone: A.val('sb-phone', el), address: A.val('sb-addr', el), industry: A.val('sb-ind', el),
        halfDaySplit: A.val('sb-split', el), currency: A.val('sb-cur', el), fluctuationPct: A.val('sb-fl', el), collectionGapPct: A.val('sb-gap', el) }); }, 'Saved')) A.go('setup');
    };
  } });
  A.screen('setup-depts', { title: 'Sales departments', crumb: 'Master', back: 'setup', render: function (el) {
    var list = deps();
    el.innerHTML = '<p class="muted small">Sales are entered per department (A, B, C…). Rename them to fit your business.</p>' +
      '<div class="row">' + A.input('dp-new', 'text', '', 'class="grow" placeholder="New department"') + '<button type="button" class="btn primary" id="dp-add">Add</button></div>' +
      '<ul class="list">' + list.map(function (d, i) { return '<li class="item"><span class="pill ink">' + String.fromCharCode(65 + i) + '</span><div class="t"><input value="' + esc(d.name) + '" data-n="' + d.id + '" aria-label="Department name"></div><button type="button" class="btn small" data-h="' + d.id + '">' + (d.active === false ? 'Show' : 'Hide') + '</button></li>'; }).join('') + '</ul>';
    $('#dp-add', el).onclick = function () { if (A.act(function () { return api.saveDepartment({ name: A.val('dp-new', el) }); }, 'Added')) A.render(); };
    $$('[data-n]', el).forEach(function (i) { i.onchange = function () { A.act(function () { return api.saveDepartment({ id: i.dataset.n, name: i.value }); }, 'Renamed'); }; });
    $$('[data-h]', el).forEach(function (b) { b.onclick = function () { var d = api.get('departments', b.dataset.h); if (A.act(function () { return api.saveDepartment({ id: d.id, name: d.name, active: d.active === false }); })) A.render(); }; });
  } });
  A.screen('setup-store', { title: 'Store categories', crumb: 'Master', back: 'setup', render: function (el) {
    var cats = api.storeCategories();
    el.innerHTML = '<p class="muted small">Purchase bills are filed under these categories (no item-by-item stock).</p><div class="row">' + A.input('sc-new', 'text', '', 'class="grow" placeholder="New category"') + '<button type="button" class="btn primary" id="sc-add">Add</button></div>' +
      '<ul class="list">' + cats.map(function (c, i) { return '<li class="item"><div class="t"><input value="' + esc(c) + '" data-i="' + i + '" aria-label="Category"></div><button type="button" class="btn small danger" data-rm="' + i + '">Remove</button></li>'; }).join('') + '</ul>';
    function save(list) { if (A.act(function () { return api.saveSettings({ storeCategories: list.filter(function (x) { return x && x.trim(); }) }); }, 'Saved')) A.render(); }
    $('#sc-add', el).onclick = function () { var v = A.val('sc-new', el).trim(); if (v) save(cats.concat([v])); };
    $$('[data-i]', el).forEach(function (i) { i.onchange = function () { var l = cats.slice(); l[+i.dataset.i] = i.value; save(l); }; });
    $$('[data-rm]', el).forEach(function (b) { b.onclick = function () { var l = cats.slice(); l.splice(+b.dataset.rm, 1); save(l); }; });
  } });
  A.screen('setup-fixed', { title: 'Usual fixed costs', crumb: 'Master', back: 'setup', render: function (el) {
    var list = (A.S().fixedCosts || []).slice();
    el.innerHTML = '<p class="muted small">Monthly amounts that do not change day to day. Used for each day\'s profit until that month\'s actual bill is entered under Accounts → Fixed costs. Salaries come from the Staff list.</p>' +
      '<ul class="list">' + list.map(function (f, i) { return '<li class="item"><div class="t"><input value="' + esc(f.name) + '" data-n="' + i + '" aria-label="Name"></div><input type="number" min="0" style="max-width:120px" data-a="' + i + '" value="' + esc(f.amount || '') + '" aria-label="Monthly amount"><button type="button" class="btn small ghost" data-rm="' + i + '">✕</button></li>'; }).join('') + '</ul>' +
      '<button type="button" class="btn" id="fx-add">＋ Add a fixed cost</button><button type="button" class="btn primary block" id="fx-save">Save</button>';
    function read() { return list.map(function (f, i) { return { name: $('[data-n="' + i + '"]', el).value.trim(), amount: +$('[data-a="' + i + '"]', el).value || 0 }; }).filter(function (f) { return f.name; }); }
    $('#fx-add', el).onclick = function () { list = read().concat([{ name: 'New cost', amount: 0 }]); api.saveSettings({ fixedCosts: list }); A.render(); };
    $$('[data-rm]', el).forEach(function (b) { b.onclick = function () { var l = read(); l.splice(+b.dataset.rm, 1); api.saveSettings({ fixedCosts: l }); A.render(); }; });
    $('#fx-save', el).onclick = function () { if (A.act(function () { return api.saveSettings({ fixedCosts: read() }); }, 'Saved')) A.go('setup'); };
  } });
  A.screen('setup-video', { title: 'Videos', crumb: 'Master', back: 'setup', render: function (el) {
    var s = A.S();
    el.innerHTML = '<div class="card">' + A.field('Owner / staff video (YouTube link)', A.input('vd-own', 'url', s.ownerVideo, 'placeholder="https://youtu.be/…"')) + '<p class="muted small">Shown on the main page: training, how to enter bills, your own notes.</p>' +
      A.videoCard(s.ownerVideo, 'Owner video', 'Preview') +
      A.field('Customer video (YouTube link)', A.input('vd-cus', 'url', s.customerVideo, 'placeholder="https://youtu.be/…"')) + '<p class="muted small">Shown in every customer\'s vault and can be sent on WhatsApp: a welcome, your menu, a product demo.</p>' +
      A.videoCard(s.customerVideo, 'Customer video', 'Preview') + '<button type="button" class="btn primary block" id="vd-save">Save</button></div>';
    $('#vd-save', el).onclick = function () {
      var o = A.val('vd-own', el).trim(), c = A.val('vd-cus', el).trim();
      if ((o && !A.ytId(o)) || (c && !A.ytId(c))) { A.toast('That is not a YouTube link. Copy it from YouTube → Share.', true); return; }
      if (A.act(function () { return api.saveSettings({ ownerVideo: o, customerVideo: c }); }, 'Saved')) A.render();
    };
  } });
  A.screen('setup-ai', { title: 'AI', crumb: 'Master', back: 'setup', render: function (el) {
    var s = A.S();
    el.innerHTML = '<div class="card"><p class="muted small">Optional. Without a key, photos are read on this phone (offline). With a key, handwritten and messy bills are read better when online, and you can use Ask AI. The key stays on this phone.</p>' +
      A.field('AI provider', A.seg('ai-p', [['openai', 'OpenAI'], ['gemini', 'Google Gemini']], s.aiProvider || 'gemini')) +
      A.field('API key', A.input('ai-key', 'password', A.lsGet(A.AIKEY) || '', 'autocomplete="off"')) +
      A.field('Model (optional)', A.input('ai-model', 'text', s.aiModel || '', 'placeholder="default: gpt-4o-mini / gemini-2.5-flash"')) +
      '<button type="button" class="btn primary block" id="ai-save">Save</button></div>';
    var prov = s.aiProvider || 'gemini';
    A.onSeg($('#ai-p', el), function (v) { prov = v; });
    $('#ai-save', el).onclick = function () { A.lsSet(A.AIKEY, A.val('ai-key', el).trim()); if (A.act(function () { return api.saveSettings({ aiProvider: prov, aiModel: A.val('ai-model', el).trim() }); }, 'Saved')) A.go('setup'); };
  } });

  A.screen('sync', { title: 'Office system', crumb: 'Master', back: 'setup', render: function (el) {
    var sy = A.sync;
    if (!sy.url) {
      el.innerHTML = '<div class="card"><h2>This phone works on its own</h2><p class="muted small">Everything is saved on this phone. Connect it to Fingertrip.biz AI on your office computer to share numbers between phones and give customers a private vault link.</p>' +
        A.field('Office system address', A.input('sy-url', 'url', '', 'placeholder="192.168.1.20:8080" autocapitalize="off"')) + A.field('PIN', A.input('sy-pin', 'password', '', 'inputmode="numeric"')) +
        '<button type="button" class="btn primary block" id="sy-go">Connect</button><p class="muted small" id="sy-msg"></p></div>';
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
    var st = { ok: ['good', 'Up to date'], offline: ['warn', 'Offline: changes wait on this phone'], pin: ['bad', 'Wrong PIN'], error: ['bad', 'Problem: ' + (sy.error || '')], idle: ['ink', 'Connecting…'] }[sy.status] || ['ink', sy.status];
    el.innerHTML = '<div class="card"><h2>Connected</h2><p class="muted small" style="overflow-wrap:anywhere">' + esc(sy.url) + '</p><div class="row"><span class="pill ' + st[0] + '">' + esc(st[1]) + '</span>' + (sy.outbox.length ? '<span class="pill warn">' + sy.outbox.length + ' waiting</span>' : '') + '</div>' +
      '<button type="button" class="btn primary block" id="sy-now">Sync now</button><button type="button" class="btn danger block" id="sy-off">Disconnect this phone</button></div>';
    $('#sy-now', el).onclick = function () { A.toast('Syncing…'); A.runSync().then(function () { A.render(); }); };
    $('#sy-off', el).onclick = function () { A.confirmSheet('Disconnect this phone? It keeps its data and works on its own.', 'Disconnect', true).then(function (ok) { if (ok) { A.disconnect(); A.render(); } }); };
  } });

  A.screen('backup', { title: 'Backup & data', crumb: 'Master', back: 'setup', render: function (el) {
    var n = api.info().counts;
    el.innerHTML = '<div class="card"><h2>Backup</h2><p class="muted small">' + n.entries + ' entries, ' + n.customers + ' customers. Save a backup to Google Drive or WhatsApp now and then.</p>' +
      '<label class="chk"><input type="checkbox" id="bk-ph" checked> Include photos and files</label><button type="button" class="btn primary block" id="bk-save">Save backup</button>' +
      '<label class="btn block" for="bk-file">Restore from a backup file</label><input type="file" id="bk-file" accept=".json,application/json" hidden></div>' +
      '<div class="card"><h2>Excel (CSV)</h2><div class="row">' + [['entries', 'Accounts'], ['customers', 'Customers'], ['staff', 'Staff'], ['vaultRecords', 'Vault records'], ['messages', 'Messages']].map(function (x) { return '<button type="button" class="btn small grow" data-csv="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<label class="btn block" for="bk-imp">Import from Excel / billing software (CSV)</label><input type="file" id="bk-imp" accept=".csv,text/csv" hidden><p class="muted small">Columns: date, department, type (sales, collection, walk-ins, expense, purchase), amount, method, half.</p></div>' +
      '<div class="card"><h2>Start over</h2><button type="button" class="btn danger block" id="bk-erase">Erase everything on this phone</button></div>';
    var stamp = A.today();
    $('#bk-save', el).onclick = function () {
      var data = { app: 'Fingertrip.biz AI', version: 3, db: api.exportAll(), files: [] };
      ($('#bk-ph', el).checked ? A.files.all() : Promise.resolve([])).then(function (f) { data.files = f; A.saveFile('fingertrip-backup-' + stamp + '.json', JSON.stringify(data), 'application/json'); });
    };
    $('#bk-file', el).onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      A.readFile(f).then(function (txt) {
        var data; try { data = JSON.parse(txt); } catch (x) { A.toast('That is not a backup file', true); return; }
        var db = data.db || data;
        A.confirmSheet('Replace everything on this phone with this backup?', 'Restore', true).then(function (ok) {
          if (!ok) return;
          if (A.act(function () { return api.importAll(db); }, 'Backup restored')) Promise.all((data.files || []).map(A.files.put)).then(function () { A.go('home'); });
        });
      });
    };
    $$('[data-csv]', el).forEach(function (b) { b.onclick = function () { A.saveFile(b.dataset.csv + '-' + stamp + '.csv', '﻿' + api.exportCSV(b.dataset.csv), 'text/csv'); }; });
    $('#bk-imp', el).onchange = function (e) { var f = e.target.files[0]; if (!f) return; A.readFile(f).then(function (t) { var rows = A.Base.parseCSV(t); var r = A.act(function () { return api.importEntries(rows); }); if (r) A.toast('Imported ' + r.imported + (r.skippedCount ? ', skipped ' + r.skippedCount : '')); }); };
    $('#bk-erase', el).onclick = function () { A.confirmSheet('Erase all accounts, customers, staff and vaults on this phone? This cannot be undone.', 'Erase', true).then(function (ok) { if (ok && A.act(function () { return api.resetAll(); }, 'Erased')) A.go('home'); }); };
  } });

  var guideKey = '';
  A.screen('guide', { title: 'Guide', crumb: 'Master', back: 'setup', render: function (el) {
    var key = guideKey || A.S().industry, p = A.Industries.get(key), r = p.review, pb = r.playbook, acc = window.BizAccounts;
    function ul(a) { return '<ul class="list">' + a.map(function (x) { return '<li class="small">• ' + esc(x) + '</li>'; }).join('') + '</ul>'; }
    el.innerHTML = '<select id="gd">' + A.opt(A.Industries.list().map(function (i) { return { value: i.key, text: i.icon + ' ' + i.name }; }), key) + '</select>' +
      '<div class="card"><h2>Sales departments</h2>' + ul(acc.SALES_DEPTS[key] || acc.SALES_DEPTS.generic) + '<h2>Store categories</h2>' + ul(acc.STORE_CATS[key] || acc.STORE_CATS.generic) +
      '<h2>Expenses</h2>' + ul(['Fixed: rent, electricity, salaries, EMI (monthly, spread per day)', 'Variable: changes with business (packing, fuel, commission)', 'Maintenance: repairs, AMC, servicing', 'Sudden / miscellaneous: emergencies, breakage, one-off cash']) +
      '<h2>Profit</h2>' + ul(['Sales − Purchases = Gross profit', 'Gross − variable − maintenance − sudden − fixed share = Net profit', 'Fixed share = monthly fixed ÷ days in the month × days']) +
      '<h2>What your customers get</h2>' + ul(pb.customers) + '<h2>Key numbers</h2>' + ul(r.kpis.map(function (k) { return k.label + ': ' + k.lo + '–' + k.hi + '%'; })) + '</div>';
    $('#gd', el).onchange = function (e) { guideKey = e.target.value; A.render(); };
  } });
})();
