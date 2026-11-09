/* Fingertip Hotel: header → sub-header → Upload / Download / Combine / Understand.
   Phone first, offline. Records live on this phone (localStorage); photos and files in IndexedDB. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var P = window.PLAN, KEY = 'fth-db-v1', AIKEY = 'fth-ai-key';
  var Cap = window.Capacitor, native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());

  // ------------------------------------------------------------ helpers
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function addDays(s, n) { var d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : 0; }
  function money(n) { n = Math.round(num(n)); return (n < 0 ? '-₹' : '₹') + Math.abs(n).toLocaleString('en-IN'); }
  function nice(s) { if (!s) return ''; var d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function short(s) { var d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  function monthName(ym) { var d = new Date(ym + '-01T00:00:00'); return isNaN(d) ? ym : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
  function toast(msg, bad) { var t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = 'toast'; }, 2200); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  // ------------------------------------------------------------ data
  var db = load();
  function blank() { return { settings: { name: '', vaultTitle: '', phone: '', address: '', rooms: [] }, records: [], guests: [], messages: [], reminders: [] }; }
  function load() { try { var d = JSON.parse(lsGet(KEY)); if (d && d.records) return Object.assign(blank(), d); } catch (e) {} return blank(); }
  function save() { if (!lsSet(KEY, JSON.stringify(db))) toast('Phone storage is full. Save a backup and remove old photos.', true); }
  function S() { return db.settings; }
  function vaultTitle() { return S().vaultTitle || S().name; }

  var SUBS = {}, HEAD_OF = {};
  P.headers.forEach(function (h) { h.subs.forEach(function (s) { SUBS[s.key] = s; HEAD_OF[s.key] = h; }); });
  var DATA_SUBS = Object.keys(SUBS).filter(function (k) { return !SUBS[k].special; });
  function recs(sub, from, to) {
    return db.records.filter(function (r) { return r.sub === sub && (!from || r.date >= from) && (!to || r.date <= to); })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.at || 0) - (a.at || 0); });
  }

  // photos and files: IndexedDB
  var idb = new Promise(function (res) {
    try { var o = indexedDB.open('fth-files', 1); o.onupgradeneeded = function () { o.result.createObjectStore('f', { keyPath: 'id' }); }; o.onsuccess = function () { res(o.result); }; o.onerror = function () { res(null); }; }
    catch (e) { res(null); }
  });
  function fileTx(mode, fn) { return idb.then(function (d) { if (!d) throw new Error('Files cannot be saved on this phone'); return new Promise(function (res, rej) { var t = d.transaction('f', mode), r = fn(t.objectStore('f')); t.oncomplete = function () { res(r && r.result); }; t.onerror = function () { rej(t.error); }; }); }); }
  function putFile(file) { var id = uid(); return fileTx('readwrite', function (s) { return s.put({ id: id, name: file.name || 'photo.jpg', type: file.type || '', blob: file }); }).then(function () { return id; }); }
  function getFile(id) { return fileTx('readonly', function (s) { return s.get(id); }); }
  function delFile(id) { return fileTx('readwrite', function (s) { return s.delete(id); }).catch(function () {}); }
  function allFiles() { return fileTx('readonly', function (s) { return s.getAll(); }); }
  function shrink(file) { // big camera photos → about 1600 px JPEG
    if (!/^image\//.test(file.type) || file.size < 600000) return Promise.resolve(file);
    return new Promise(function (res) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(function (b) { res(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.82); };
      img.onerror = function () { res(file); }; img.src = url;
    });
  }
  function showFile(id) {
    getFile(id).then(function (f) {
      if (!f) return toast('File not found', true);
      var url = URL.createObjectURL(f.blob), isImg = /^image\//.test(f.type);
      sheet('<b>' + esc(f.name) + '</b>' + (isImg ? '<img src="' + url + '" alt="" class="preview">' : '<p class="muted">' + esc(f.type || 'File') + '</p>') + '<div class="row"><a class="btn grow" href="' + url + '" download="' + esc(f.name) + '">Open / save</a><button class="btn grow" data-close>Close</button></div>');
    });
  }

  // saving and sharing files
  function nativeCall(plugin, method, opts) { var p = Cap && Cap.Plugins && Cap.Plugins[plugin]; return p && p[method] ? p[method](opts) : Promise.reject(new Error('not available')); }
  function saveFile(name, text, type) {
    if (native) return nativeCall('Filesystem', 'writeFile', { path: name, data: text, directory: 'CACHE', encoding: 'utf8' })
      .then(function (r) { return nativeCall('Share', 'share', { title: name, url: r.uri, dialogTitle: 'Save or send ' + name }); }).catch(function () { toast('Could not save the file', true); });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    return Promise.resolve();
  }
  function openLink(url) { if (native) location.href = url; else window.open(url, '_blank', 'noopener'); }
  function wa(phone, text) { var p = String(phone || '').replace(/\D/g, ''); if (p.length === 10) p = '91' + p; return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text); }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCsv(rows) { return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n'); }

  // ------------------------------------------------------------ small UI parts
  function sheet(html) {
    var b = document.createElement('div'); b.className = 'sheet-back'; b.innerHTML = '<div class="sheet">' + html + '</div>';
    b.addEventListener('click', function (e) { if (e.target === b || e.target.hasAttribute('data-close')) b.remove(); });
    document.body.appendChild(b); return b;
  }
  function confirmIt(text, yes) { return new Promise(function (res) { var b = sheet('<p>' + esc(text) + '</p><div class="row"><button class="btn danger grow" id="cf-y">' + esc(yes) + '</button><button class="btn grow" data-close>Cancel</button></div>'); $('#cf-y', b).onclick = function () { b.remove(); res(true); }; b.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) res(false); }); }); }
  function tile(href, ic, name, cls) { return '<li><a class="feat' + (cls ? ' ' + cls : '') + '" href="#' + href + '"><span class="ic" aria-hidden="true">' + ic + '</span><b>' + esc(name) + '</b></a></li>'; }
  function seg(id, opts, val) { return '<div class="seg" id="' + id + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '"' + (o[0] === val ? ' class="on"' : '') + '>' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function onSeg(el, fn) { $$('button', el).forEach(function (b) { b.onclick = function () { fn(b.dataset.v); }; }); }
  function field(label, html) { return '<label class="f">' + esc(label) + html + '</label>'; }
  function input(id, type, v, extra) { return '<input id="' + id + '" type="' + type + '" value="' + esc(v == null ? '' : v) + '" ' + (extra || '') + '>'; }
  function val(id, el) { var x = $('#' + id, el); return x ? x.value.trim() : ''; }
  function periodRange(p) { var t = today(); if (p === '7') return [addDays(t, -6), t]; if (p === 'month') return [t.slice(0, 8) + '01', t]; if (p === '30') return [addDays(t, -29), t]; return ['', '']; }
  var periods = [['7', '7 days'], ['month', 'This month'], ['all', 'All']];

  // ------------------------------------------------------------ routing
  var screens = {}, params = {};
  function screen(name, def) { screens[name] = def; }
  var goPending = false; // values passed by go() survive the hashchange; plain links start clean
  function go(hash, p) { params = p || {}; if (location.hash === '#' + hash) render(); else { goPending = true; location.hash = hash; } }
  function render() {
    var parts = (location.hash || '#').slice(1).split('/'), name = parts[0] || 'home';
    if (!S().name) name = 'setup';
    var def = screens[name] || screens.home, arg = parts.slice(1);
    var t = def.title ? def.title(arg) : '', sec = def.sec ? def.sec(arg) : '';
    document.body.dataset.sec = sec || 'home';
    document.title = (t || S().name || 'Fingertip Hotel');
    $('#app').innerHTML = '<header class="top">' + (name === 'home' || name === 'setup' ? '<span class="logo" aria-hidden="true">' + LOGO + '</span>' : '<button class="back" id="back" aria-label="Back">‹</button>') +
      '<div class="titles"><h1>' + esc(name === 'home' ? S().name : t || 'Fingertip Hotel') + '</h1>' + (def.crumb ? '<div class="sub">' + esc(def.crumb(arg)) + '</div>' : '') + '</div>' +
      (name !== 'home' && name !== 'setup' ? '<a class="back" href="#" aria-label="Main page">⌂</a>' : '') + '</header><main id="view"></main>';
    var bk = $('#back'); if (bk) bk.onclick = function () { var up = def.up ? def.up(arg) : ''; location.hash = up; };
    window.scrollTo(0, 0);
    try { def.render($('#view'), arg); } catch (e) { $('#view').innerHTML = '<div class="card bad">' + esc(e.message) + '</div>'; }
  }
  window.addEventListener('hashchange', function () { if (!goPending) params = {}; goPending = false; render(); });
  var LOGO = '<svg viewBox="0 0 64 64" width="30" height="30"><g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M20 46c-3-5-4-10-4-15 0-9 7-16 16-16s16 7 16 16"/><path d="M26 49c-2-5-3-11-3-17 0-5 4-9 9-9s9 4 9 9c0 4 0 8-1 12"/><path d="M32 50c-1-6-2-12-2-18"/></g></svg>';

  // ------------------------------------------------------------ first start
  screen('setup', { render: function (el) {
    el.innerHTML = '<div class="card"><h2>Fingertip Hotel</h2>' + field('Business name', input('su-name', 'text', '', 'autocomplete="organization"')) +
      '<button class="btn primary block" id="su-go">Start</button></div>';
    $('#su-go', el).onclick = function () { var n = val('su-name', el); if (!n) { toast('Enter the business name', true); return; } S().name = n; save(); location.hash = ''; render(); };
  } });

  // ------------------------------------------------------------ main page and headers
  screen('home', { render: function (el) {
    el.innerHTML = '<div class="hdr-grid">' + P.headers.map(function (h) {
      return '<a class="hdr hdr-' + h.key + '" href="#h/' + h.key + '"><span class="ic" aria-hidden="true">' + h.ic + '</span><b>' + esc(h.name) + '</b></a>';
    }).join('') + '</div>';
  } });
  screen('h', { title: function (a) { var h = P.headers.filter(function (x) { return x.key === a[0]; })[0]; return h ? h.name : ''; }, crumb: function () { return S().name; },
    sec: function (a) { return a[0]; }, up: function () { return ''; },
    render: function (el, a) {
      var h = P.headers.filter(function (x) { return x.key === a[0]; })[0]; if (!h) { location.hash = ''; return; }
      el.innerHTML = '<ul class="feats">' + h.subs.map(function (s) { return tile('s/' + s.key, s.ic, s.name); }).join('') + '</ul>';
    } });

  // ------------------------------------------------------------ sub-header: the four actions
  function subTitle(a) { var s = SUBS[a[0]]; return s ? s.name : ''; }
  function subCrumb(a) { var h = HEAD_OF[a[0]]; return h ? h.name : ''; }
  function subSec(a) { var h = HEAD_OF[a[0]]; return h ? h.key : ''; }
  screen('s', { title: subTitle, crumb: subCrumb, sec: subSec, up: function (a) { return 'h/' + subSec(a); },
    render: function (el, a) {
      var s = SUBS[a[0]]; if (!s) { location.hash = ''; return; }
      if (s.special) return SPECIAL[s.special](el, s);
      el.innerHTML = '<ul class="feats acts">' + tile('up/' + s.key, '⬆', 'Upload') + tile('down/' + s.key, '⬇', 'Download') + tile('comb/' + s.key, '⇄', 'Combine') + tile('und/' + s.key, '💡', 'Understand') + '</ul>';
    } });
  function actScreen(name, label, fn) {
    screen(name, { title: function (a) { return label; }, crumb: function (a) { return subTitle(a); }, sec: subSec, up: function (a) { return 's/' + a[0]; },
      render: function (el, a) { var s = SUBS[a[0]]; if (!s || s.special) { location.hash = ''; return; } fn(el, s, a); } });
  }

  // Upload: photo, file, Excel/CSV, type it
  actScreen('up', 'Upload', function (el, s) {
    el.innerHTML = '<ul class="feats">' +
      '<li><label class="feat"><span class="ic">📷</span><b>Photo</b><input type="file" accept="image/*" capture="environment" id="u-photo" hidden></label></li>' +
      '<li><label class="feat"><span class="ic">📎</span><b>File</b><input type="file" id="u-file" hidden></label></li>' +
      '<li><label class="feat"><span class="ic">📊</span><b>Excel / CSV</b><input type="file" accept=".csv,text/csv,text/plain" id="u-csv" hidden></label></li>' +
      tile('entry/' + s.key, '✎', 'Type it') + '</ul>' + savedList(s);
    function withFile(e) { var f = e.target.files[0]; if (!f) return; shrink(f).then(putFile).then(function (id) { go('entry/' + s.key, { fileId: id, fileName: f.name }); }).catch(function (x) { toast(x.message, true); }); }
    $('#u-photo', el).onchange = withFile; $('#u-file', el).onchange = withFile;
    $('#u-csv', el).onchange = function (e) { var f = e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { importCsv(s, String(r.result)); }; r.readAsText(f); };
    bindSaved(el, s);
  });
  function savedList(s) {
    var rows = recs(s.key).slice(0, 40);
    if (!rows.length) return '';
    return '<div class="section-title">Saved</div><ul class="list">' + rows.map(function (r) {
      var bits = [r.guest, r.person, r.room ? 'Room ' + r.room : '', r.qty ? r.qty + ' ' + (s.qty || '').toLowerCase() : '', r.note].filter(Boolean).join(' · ');
      return '<li><button class="item" data-r="' + r.id + '"><span class="t"><b>' + esc(nice(r.date)) + (r.file ? ' 📎' : '') + '</b><span>' + esc(bits) + '</span></span>' + (r.amount ? '<span class="amt">' + money(r.amount) + '</span>' : '') + '</button></li>';
    }).join('') + '</ul>';
  }
  function bindSaved(el, s) { $$('[data-r]', el).forEach(function (b) { b.onclick = function () { go('entry/' + s.key, { id: b.dataset.r }); }; }); }

  // one record (typed, or after a photo / file)
  screen('entry', { title: function (a) { return subTitle(a); }, crumb: function (a) { return subCrumb(a); }, sec: subSec, up: function (a) { return 'up/' + a[0]; },
    render: function (el, a) {
      var s = SUBS[a[0]]; if (!s || s.special) { location.hash = ''; return; }
      var r = params.id ? db.records.filter(function (x) { return x.id === params.id; })[0] : null;
      var fileId = r ? r.file : params.fileId, fileName = r ? r.fileName : params.fileName;
      var L = P.labels, f = s.fields;
      function lab(k) { return k === 'qty' ? (s.qty || L.qty) : k === 'person' ? (s.personLabel || L.person) : L[k]; }
      var html = '<div class="card">' + (fileId ? '<button class="btn block" id="e-file">📎 ' + esc(fileName || 'Saved file') + '</button>' : '') + '<div class="grid2">';
      f.forEach(function (k) {
        var v = r ? r[k] : (k === 'date' ? today() : '');
        if (k === 'note') return;
        if (k === 'mode') html += field(lab(k), '<select id="e-mode">' + ['', 'Cash', 'UPI', 'Card', 'Bank', 'Credit'].map(function (m) { return '<option' + (m === v ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>');
        else if (k === 'guest') html += field(lab(k), input('e-guest', 'text', v, 'list="guest-names"'));
        else if (k === 'room') html += field(lab(k), input('e-room', 'text', v, 'list="room-names"'));
        else html += field(lab(k), input('e-' + k, k === 'date' ? 'date' : (k === 'amount' || k === 'qty') ? 'number' : 'text', v, (k === 'amount' || k === 'qty') ? 'inputmode="decimal" min="0" step="any"' : ''));
      });
      html += '</div>' + (f.indexOf('note') >= 0 ? field(L.note, input('e-note', 'text', r ? r.note : '')) : '') +
        '<datalist id="guest-names">' + db.guests.map(function (g) { return '<option value="' + esc(g.name) + '">'; }).join('') + '</datalist>' +
        '<datalist id="room-names">' + S().rooms.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
        '<div class="row"><button class="btn primary grow" id="e-save">Save</button>' + (r ? '<button class="btn danger" id="e-del">Delete</button>' : '') + '</div></div>';
      el.innerHTML = html;
      var fb = $('#e-file', el); if (fb) fb.onclick = function () { showFile(fileId); };
      $('#e-save', el).onclick = function () {
        var o = r || { id: uid(), sub: s.key, at: Date.now() };
        f.forEach(function (k) { var v = val('e-' + k, el); o[k] = (k === 'amount' || k === 'qty') ? (v === '' ? '' : num(v)) : v; });
        if (!o.date) o.date = today();
        if (fileId) { o.file = fileId; o.fileName = fileName; }
        if (!r) db.records.push(o);
        save(); toast('Saved'); go('up/' + s.key);
      };
      var del = $('#e-del', el); if (del) del.onclick = function () { confirmIt('Delete this entry?', 'Delete').then(function (ok) { if (!ok) return; db.records = db.records.filter(function (x) { return x.id !== r.id; }); if (r.file) delFile(r.file); save(); toast('Deleted'); go('up/' + s.key); }); };
    } });

  // Excel / CSV import: columns are matched by their names
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false, sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
  }
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function parseDate(v) {
    v = String(v || '').trim(); var m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(v))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/.exec(v))) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    if ((m = /^(\d{1,2})[-\s\/]([A-Za-z]{3})[A-Za-z]*[-\s\/,]*(\d{2,4})/.exec(v)) && MON[m[2].toLowerCase()]) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(MON[m[2].toLowerCase()]) + '-' + pad(+m[1]);
    return '';
  }
  var COLS = { date: /date|day|dt\b/i, credit: /credit|deposit|cr\b|received/i, debit: /debit|withdraw|dr\b|paid out/i, amount: /amount|total|value|amt|net|price|rate/i,
    qty: /qty|quantity|count|nights|covers|orders|plates|rooms/i, room: /room/i, guest: /guest|customer|party|client|name/i, person: /staff|employee|supplier|vendor|person/i,
    mode: /mode|method|payment type|paid by/i, note: /note|description|narration|details|particulars|remarks|item/i };
  function importCsv(s, text) {
    var rows = parseCsv(text); if (rows.length < 2) { toast('No rows found in the file', true); return; }
    var head = rows[0].map(function (h) { return String(h).trim(); }), map = {};
    Object.keys(COLS).forEach(function (k) { for (var i = 0; i < head.length; i++) if (COLS[k].test(head[i]) && Object.keys(map).map(function (x) { return map[x]; }).indexOf(i) < 0) { map[k] = i; break; } });
    var out = rows.slice(1).map(function (r) {
      var o = { id: uid(), sub: s.key, at: Date.now(), src: 'csv' };
      o.date = map.date !== undefined ? parseDate(r[map.date]) : '';
      var amt = map.amount !== undefined ? num(r[map.amount]) : 0;
      if (map.credit !== undefined || map.debit !== undefined) { var cr = map.credit !== undefined ? num(r[map.credit]) : 0, dr = map.debit !== undefined ? num(r[map.debit]) : 0; amt = cr || (dr ? -dr : amt); }
      o.amount = amt || '';
      ['qty', 'room', 'guest', 'person', 'mode', 'note'].forEach(function (k) { if (map[k] !== undefined) o[k] = k === 'qty' ? num(r[map[k]]) || '' : String(r[map[k]] || '').trim(); });
      return o;
    }).filter(function (o) { return o.date; });
    if (!out.length) { toast('No dates found. The file needs a Date column.', true); return; }
    var found = Object.keys(map).map(function (k) { return k; }).join(', ');
    var b = sheet('<b>' + out.length + ' rows</b><p class="muted small">Columns read: ' + esc(found) + '</p><div class="tw"><table><tbody>' + out.slice(0, 5).map(function (o) { return '<tr><td>' + esc(nice(o.date)) + '</td><td>' + esc(o.guest || o.person || o.note || '') + '</td><td class="n">' + (o.amount !== '' ? money(o.amount) : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="row"><button class="btn primary grow" id="ci-ok">Save ' + out.length + ' rows</button><button class="btn grow" data-close>Cancel</button></div>');
    $('#ci-ok', b).onclick = function () { db.records = db.records.concat(out); save(); b.remove(); toast(out.length + ' rows saved'); render(); };
  }

  // Download: Excel (CSV), WhatsApp summary, saved photos and files
  var dState = { p: 'month' };
  actScreen('down', 'Download', function (el, s) {
    var r = periodRange(dState.p), rows = recs(s.key, r[0], r[1]), files = rows.filter(function (x) { return x.file; });
    el.innerHTML = seg('d-p', periods, dState.p) + '<ul class="feats">' +
      '<li><button class="feat" id="d-csv"><span class="ic">📊</span><b>Excel (CSV)</b></button></li>' +
      '<li><button class="feat" id="d-wa"><span class="ic">💬</span><b>WhatsApp</b></button></li></ul>' +
      (files.length ? '<div class="section-title">Photos and files</div><ul class="list">' + files.map(function (x) { return '<li><button class="item" data-f="' + x.file + '"><span class="t"><b>' + esc(nice(x.date)) + '</b><span>' + esc(x.fileName || '') + '</span></span></button></li>'; }).join('') + '</ul>' : '');
    onSeg($('#d-p', el), function (v) { dState.p = v; render(); });
    $('#d-csv', el).onclick = function () {
      if (!rows.length) { toast('Nothing saved for this period', true); return; }
      var cols = s.fields; saveFile(s.key + '-' + today() + '.csv', toCsv([cols.map(function (k) { return k === 'qty' ? (s.qty || 'Count') : P.labels[k]; })].concat(rows.map(function (x) { return cols.map(function (k) { return x[k]; }); }))), 'text/csv');
    };
    $('#d-wa', el).onclick = function () {
      var tot = rows.reduce(function (a, x) { return a + num(x.amount); }, 0);
      var text = '*' + S().name + ': ' + s.name + '*\n' + (r[0] ? nice(r[0]) + ' to ' + nice(r[1]) : 'All') + '\nEntries: ' + rows.length + (tot ? '\nTotal: ' + money(tot) : '');
      openLink(wa('', text));
    };
    $$('[data-f]', el).forEach(function (b) { b.onclick = function () { showFile(b.dataset.f); }; });
  });

  // Combine: this sub-header next to another, day by day
  var cState = { other: '', p: 'month' };
  actScreen('comb', 'Combine', function (el, s) {
    var others = DATA_SUBS.filter(function (k) { return k !== s.key; });
    if (others.indexOf(cState.other) < 0) cState.other = '';
    var r = periodRange(cState.p);
    var html = field('Combine with', '<select id="c-o"><option value="">Choose</option>' + P.headers.map(function (h) { var o = h.subs.filter(function (x) { return others.indexOf(x.key) >= 0; }); return o.length ? '<optgroup label="' + esc(h.name) + '">' + o.map(function (x) { return '<option value="' + x.key + '"' + (x.key === cState.other ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</optgroup>' : ''; }).join('') + '</select>') + seg('c-p', periods, cState.p);
    var table = [];
    if (cState.other) {
      var o = SUBS[cState.other], days = {};
      recs(s.key, r[0], r[1]).forEach(function (x) { (days[x.date] = days[x.date] || [0, 0])[0] += num(x.amount); });
      recs(o.key, r[0], r[1]).forEach(function (x) { (days[x.date] = days[x.date] || [0, 0])[1] += num(x.amount); });
      table = Object.keys(days).sort().reverse().map(function (d) { return [d, days[d][0], days[d][1], days[d][0] - days[d][1]]; });
      var tA = table.reduce(function (a, x) { return a + x[1]; }, 0), tB = table.reduce(function (a, x) { return a + x[2]; }, 0);
      html += table.length ? '<div class="card"><div class="tw"><table><thead><tr><th>Date</th><th class="n">' + esc(s.name) + '</th><th class="n">' + esc(o.name) + '</th><th class="n">Difference</th></tr></thead><tbody>' +
        table.map(function (x) { return '<tr><td>' + esc(short(x[0])) + '</td><td class="n">' + money(x[1]) + '</td><td class="n">' + money(x[2]) + '</td><td class="n' + (x[3] < 0 ? ' neg' : '') + '">' + money(x[3]) + '</td></tr>'; }).join('') +
        '<tr class="tot"><td>Total</td><td class="n">' + money(tA) + '</td><td class="n">' + money(tB) + '</td><td class="n">' + money(tA - tB) + '</td></tr></tbody></table></div></div><button class="btn block" id="c-csv">⬇ Download</button>' : '<div class="card muted">Nothing saved in this period.</div>';
    }
    el.innerHTML = html;
    $('#c-o', el).onchange = function (e) { cState.other = e.target.value; render(); };
    onSeg($('#c-p', el), function (v) { cState.p = v; render(); });
    var cb = $('#c-csv', el); if (cb) cb.onclick = function () { saveFile(s.key + '-' + cState.other + '-' + today() + '.csv', toCsv([['Date', s.name, SUBS[cState.other].name, 'Difference']].concat(table)), 'text/csv'); };
  });

  // Understand: what the saved data says, plus optional AI explanation
  var uState = { p: 'month' };
  function facts(rows) {
    var days = {}; rows.forEach(function (x) { var d = days[x.date] = days[x.date] || { amt: 0, qty: 0, n: 0 }; d.amt += num(x.amount); d.qty += num(x.qty); d.n++; });
    var list = Object.keys(days).sort().map(function (d) { return { date: d, amt: days[d].amt, qty: days[d].qty, n: days[d].n }; });
    var tot = list.reduce(function (a, x) { return a + x.amt; }, 0), qty = list.reduce(function (a, x) { return a + x.qty; }, 0);
    var hi = list.slice().sort(function (a, b) { return b.amt - a.amt; })[0], lo = list.slice().sort(function (a, b) { return a.amt - b.amt; })[0];
    return { n: rows.length, days: list, total: tot, qty: qty, avg: list.length ? tot / list.length : 0, hi: hi, lo: lo };
  }
  actScreen('und', 'Understand', function (el, s) {
    var r = periodRange(uState.p), F = facts(recs(s.key, r[0], r[1]));
    var max = Math.max.apply(null, F.days.map(function (x) { return Math.abs(x.amt); }).concat([1]));
    el.innerHTML = seg('u-p', periods, uState.p) + (F.n ? '<div class="stats">' +
      stat('Entries', F.n) + stat('Total', money(F.total)) + (s.qty ? stat(s.qty, Math.round(F.qty * 100) / 100) : '') + stat('Days', F.days.length) + stat('Average a day', money(F.avg)) +
      (F.hi ? stat('Highest day', money(F.hi.amt), nice(F.hi.date)) : '') + (F.lo && F.days.length > 1 ? stat('Lowest day', money(F.lo.amt), nice(F.lo.date)) : '') + '</div>' +
      '<div class="card"><ul class="bars">' + F.days.slice(-31).reverse().map(function (x) { return '<li><span>' + esc(nice(x.date)) + '</span><i style="width:' + Math.max(2, Math.round(Math.abs(x.amt) / max * 100)) + '%"></i><b>' + money(x.amt) + '</b></li>'; }).join('') + '</ul></div>' +
      '<button class="btn primary block" id="u-ai">✦ Explain with AI</button><div id="u-ans"></div>' : '<div class="card muted">Nothing saved in this period.</div>');
    onSeg($('#u-p', el), function (v) { uState.p = v; render(); });
    var ab = $('#u-ai', el); if (ab) ab.onclick = function () {
      var summary = s.name + ' at ' + S().name + ' (hotel). Period: ' + (r[0] ? r[0] + ' to ' + r[1] : 'all') + '. Entries ' + F.n + ', total ' + Math.round(F.total) + ' rupees' + (s.qty ? ', ' + s.qty + ' ' + F.qty : '') + ', days ' + F.days.length + '. Day totals: ' + F.days.slice(-31).map(function (x) { return x.date + ' ' + Math.round(x.amt); }).join('; ') + '.';
      askAI('You help a small hotel owner in India. In 5 short plain sentences, explain what these numbers show and what to check. No headings.\n' + summary, $('#u-ans', el));
    };
  });
  function stat(label, v, sub) { return '<div class="stat"><span>' + esc(label) + '</span><b>' + esc(v) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; }
  function askAI(prompt, out) {
    var key = lsGet(AIKEY);
    if (!key) { out.innerHTML = '<div class="card"><p>Add a Google Gemini key first.</p><a class="btn block" href="#s/s-ai">Settings → AI</a></div>'; return; }
    out.innerHTML = '<div class="card muted">Thinking…</div>';
    fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        var t = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts.map(function (p) { return p.text; }).join('');
        out.innerHTML = '<div class="card">' + (t ? esc(t).replace(/\n/g, '<br>') : esc((j.error && j.error.message) || 'No answer')) + '</div>';
      }).catch(function () { out.innerHTML = '<div class="card bad">No internet, or the key is wrong.</div>'; });
  }

  // ------------------------------------------------------------ special sub-headers
  var SPECIAL = {};
  var INCOME = DATA_SUBS.filter(function (k) { return SUBS[k].income; }), COST = DATA_SUBS.filter(function (k) { return SUBS[k].cost; });
  function sumOf(keys, from, to) { var t = 0; db.records.forEach(function (r) { if (keys.indexOf(r.sub) >= 0 && r.date >= from && r.date <= to) t += num(r.amount); }); return t; }

  SPECIAL.report = function (el, s) {
    var rows = [], t = today();
    if (s.period === 'day') for (var i = 0; i < 31; i++) { var d = addDays(t, -i); rows.push([d, nice(d), sumOf(INCOME, d, d), sumOf(COST, d, d)]); }
    else for (var m = 0; m < 12; m++) { var dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - m); var ym = dt.getFullYear() + '-' + pad(dt.getMonth() + 1); rows.push([ym, monthName(ym), sumOf(INCOME, ym + '-01', ym + '-31'), sumOf(COST, ym + '-01', ym + '-31')]); }
    rows = rows.filter(function (x) { return x[2] || x[3]; });
    el.innerHTML = rows.length ? '<div class="card"><div class="tw"><table><thead><tr><th>' + (s.period === 'day' ? 'Day' : 'Month') + '</th><th class="n">Income</th><th class="n">Costs</th><th class="n">Net</th></tr></thead><tbody>' +
      rows.map(function (x) { return '<tr><td>' + esc(x[1]) + '</td><td class="n">' + money(x[2]) + '</td><td class="n">' + money(x[3]) + '</td><td class="n' + (x[2] - x[3] < 0 ? ' neg' : '') + '">' + money(x[2] - x[3]) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div><button class="btn block" id="r-csv">⬇ Download</button>' : '<div class="card muted">Nothing saved yet.</div>';
    var b = $('#r-csv', el); if (b) b.onclick = function () { saveFile(s.key + '-' + today() + '.csv', toCsv([[s.period === 'day' ? 'Date' : 'Month', 'Income', 'Costs', 'Net']].concat(rows.map(function (x) { return [x[0], x[2], x[3], x[2] - x[3]]; }))), 'text/csv'); };
  };
  SPECIAL.occupancy = function (el) {
    var n = S().rooms.length;
    if (!n) { el.innerHTML = '<ul class="feats">' + tile('s/s-rooms', '🛏', 'Rooms list') + '</ul>'; return; }
    var rows = [], t = today();
    for (var i = 0; i < 31; i++) { var d = addDays(t, -i), sold = 0, amt = 0; db.records.forEach(function (r) { if (r.sub === 'roomsales' && r.date === d) { sold += num(r.qty); amt += num(r.amount); } }); if (sold || amt) rows.push([d, sold, Math.round(sold / n * 100), sold ? amt / sold : 0]); }
    el.innerHTML = rows.length ? '<div class="card"><div class="tw"><table><thead><tr><th>Day</th><th class="n">Rooms sold</th><th class="n">Occupancy</th><th class="n">Average rate</th></tr></thead><tbody>' +
      rows.map(function (x) { return '<tr><td>' + esc(nice(x[0])) + '</td><td class="n">' + x[1] + ' / ' + n + '</td><td class="n">' + x[2] + '%</td><td class="n">' + money(x[3]) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' :
      '<ul class="feats">' + tile('s/roomsales', '₹', 'Room sales') + '</ul>';
  };
  var pState = { p: 'month' };
  SPECIAL.profit = function (el) {
    var r = periodRange(pState.p), from = r[0] || '0000', to = r[1] || '9999';
    var inc = INCOME.map(function (k) { return [SUBS[k].name, sumOf([k], from, to)]; }), cost = COST.map(function (k) { return [SUBS[k].name, sumOf([k], from, to)]; });
    var ti = inc.reduce(function (a, x) { return a + x[1]; }, 0), tc = cost.reduce(function (a, x) { return a + x[1]; }, 0);
    el.innerHTML = seg('p-p', periods, pState.p) + '<div class="card"><div class="tw"><table><tbody>' +
      '<tr class="tot"><td>Income</td><td class="n">' + money(ti) + '</td></tr>' + inc.map(function (x) { return '<tr><td class="ind">' + esc(x[0]) + '</td><td class="n">' + money(x[1]) + '</td></tr>'; }).join('') +
      '<tr class="tot"><td>Costs</td><td class="n">' + money(tc) + '</td></tr>' + cost.map(function (x) { return '<tr><td class="ind">' + esc(x[0]) + '</td><td class="n">' + money(x[1]) + '</td></tr>'; }).join('') +
      '<tr class="tot"><td>Profit</td><td class="n' + (ti - tc < 0 ? ' neg' : '') + '">' + money(ti - tc) + '</td></tr></tbody></table></div></div>';
    onSeg($('#p-p', el), function (v) { pState.p = v; render(); });
  };

  // Guests: vaults, messages, reminders
  var gq = { q: '' };
  SPECIAL.vaults = function (el) {
    el.innerHTML = '<ul class="feats">' + tile('guest', '＋', 'New guest vault') + '</ul>' +
      (db.guests.length ? '<input id="g-q" class="search" placeholder="Search" value="' + esc(gq.q) + '"><ul class="list" id="g-l"></ul>' : '');
    function draw() { var q = gq.q.toLowerCase(); $('#g-l', el).innerHTML = db.guests.filter(function (g) { return !q || (g.name + ' ' + g.phone).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (g) { return '<li><a class="item" href="#vault/' + g.id + '"><span class="t"><b>' + esc(g.name) + '</b><span>' + esc(g.phone || '') + '</span></span></a></li>'; }).join(''); }
    if (db.guests.length) { draw(); $('#g-q', el).oninput = function (e) { gq.q = e.target.value; draw(); }; }
  };
  screen('guest', { title: function () { return 'Guest'; }, crumb: function () { return 'Guest vaults'; }, sec: function () { return 'guests'; }, up: function () { return params.id ? 'vault/' + params.id : 's/vaults'; },
    render: function (el) {
      var g = params.id ? db.guests.filter(function (x) { return x.id === params.id; })[0] : null;
      el.innerHTML = '<div class="card">' + field('Name', input('g-name', 'text', g ? g.name : '')) + field('WhatsApp number', input('g-phone', 'tel', g ? g.phone : '', 'inputmode="tel"')) +
        field('Preferences', '<textarea id="g-pref">' + esc(g ? g.pref : '') + '</textarea>') + field('Birthday / anniversary', input('g-occ', 'text', g ? g.occ : '')) +
        '<div class="row"><button class="btn primary grow" id="g-save">Save</button>' + (g ? '<button class="btn danger" id="g-del">Delete</button>' : '') + '</div></div>';
      $('#g-save', el).onclick = function () {
        var name = val('g-name', el); if (!name) { toast('Enter the name', true); return; }
        var o = g || { id: uid(), files: [], at: Date.now() }; o.name = name; o.phone = val('g-phone', el); o.pref = val('g-pref', el); o.occ = val('g-occ', el);
        if (!g) db.guests.push(o); save(); toast(g ? 'Saved' : 'Vault created'); go('vault/' + o.id);
      };
      var d = $('#g-del', el); if (d) d.onclick = function () { confirmIt('Delete ' + g.name + ' and their vault?', 'Delete').then(function (ok) { if (!ok) return; (g.files || []).forEach(function (f) { delFile(f.id); }); db.guests = db.guests.filter(function (x) { return x.id !== g.id; }); save(); go('s/vaults'); }); };
    } });
  function guestStays(g) { var n = g.name.toLowerCase(); return db.records.filter(function (r) { return r.guest && r.guest.toLowerCase() === n; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }); }
  screen('vault', { title: function () { return vaultTitle(); }, crumb: function () { return 'Guest vault'; }, sec: function () { return 'guests'; }, up: function () { return 's/vaults'; },
    render: function (el, a) {
      var g = db.guests.filter(function (x) { return x.id === a[0]; })[0]; if (!g) { location.hash = 's/vaults'; return; }
      var stays = guestStays(g), msgs = db.messages.filter(function (m) { return m.guestId === g.id; });
      el.innerHTML = '<div class="vault-banner"><span>Guest vault</span><b>' + esc(vaultTitle()) + '</b></div>' +
        '<div class="card"><div class="card-head"><div><h2>' + esc(g.name) + '</h2><p class="muted small">' + esc(g.phone || '') + '</p></div><button class="btn small" id="v-edit">Edit</button></div>' +
        '<div class="row"><button class="btn primary grow" id="v-send">Send vault</button><button class="btn grow" id="v-msg">Message</button></div>' +
        '<label class="btn block">📷 Add photo / file<input type="file" id="v-file" hidden></label></div>' +
        (g.pref || g.occ ? '<div class="card"><h3>Preferences</h3><p>' + esc(g.pref || '') + '</p>' + (g.occ ? '<p class="muted">' + esc(g.occ) + '</p>' : '') + '</div>' : '') +
        (stays.length ? '<div class="card"><h3>Stays and bills</h3><ul class="list">' + stays.slice(0, 30).map(function (r) { return '<li class="item"><span class="t"><b>' + esc(nice(r.date)) + '</b><span>' + esc([SUBS[r.sub] ? SUBS[r.sub].name : '', r.room ? 'Room ' + r.room : '', r.note].filter(Boolean).join(' · ')) + '</span></span>' + (r.amount ? '<span class="amt">' + money(r.amount) + '</span>' : '') + '</li>'; }).join('') + '</ul></div>' : '') +
        ((g.files || []).length ? '<div class="card"><h3>Photos and files</h3><ul class="list">' + g.files.map(function (f) { return '<li><button class="item" data-f="' + f.id + '"><span class="t"><b>' + esc(f.name) + '</b><span>' + esc(nice(f.date)) + '</span></span></button></li>'; }).join('') + '</ul></div>' : '') +
        (msgs.length ? '<div class="card"><h3>Messages</h3><ul class="list">' + msgs.slice(-20).reverse().map(function (m) { return '<li class="item"><span class="t"><span>' + esc(nice(m.date)) + '</span><b class="normal">' + esc(m.text) + '</b></span></li>'; }).join('') + '</ul></div>' : '');
      $('#v-edit', el).onclick = function () { go('guest', { id: g.id }); };
      $('#v-msg', el).onclick = function () { go('msg/' + g.id); };
      $('#v-send', el).onclick = function () {
        var lines = stays.slice(0, 12).map(function (r) { return '• ' + nice(r.date) + ' ' + (SUBS[r.sub] ? SUBS[r.sub].name : '') + (r.room ? ', room ' + r.room : '') + (r.amount ? ', ' + money(r.amount) : ''); });
        go('msg/' + g.id, { text: 'Dear ' + g.name + ', here is your ' + vaultTitle() + ' vault:\n' + (lines.join('\n') || '(nothing saved yet)') + '\nThank you for staying with us.' });
      };
      $('#v-file', el).onchange = function (e) { var f = e.target.files[0]; if (!f) return; shrink(f).then(putFile).then(function (id) { g.files = g.files || []; g.files.push({ id: id, name: f.name, date: today() }); save(); toast('Saved in ' + g.name + '\'s vault'); render(); }); };
      $$('[data-f]', el).forEach(function (b) { b.onclick = function () { showFile(b.dataset.f); }; });
    } });
  screen('msg', { title: function () { return 'Message'; }, crumb: function () { return 'Guest vault'; }, sec: function () { return 'guests'; }, up: function (a) { return 'vault/' + a[0]; },
    render: function (el, a) {
      var g = db.guests.filter(function (x) { return x.id === a[0]; })[0]; if (!g) { location.hash = 's/vaults'; return; }
      el.innerHTML = '<div class="card"><p class="muted small">To ' + esc(g.name) + (g.phone ? ' · ' + esc(g.phone) : '') + '</p>' + field('Text', '<textarea id="m-text" rows="7">' + esc(params.text || 'Dear ' + g.name + ', ') + '</textarea>') +
        '<button class="btn primary block" id="m-send">Send on WhatsApp</button></div>';
      $('#m-send', el).onclick = function () { var t = val('m-text', el); if (!t) return; db.messages.push({ id: uid(), guestId: g.id, date: today(), text: t }); save(); openLink(wa(g.phone, t)); go('vault/' + g.id); };
    } });
  SPECIAL.messages = function (el) {
    var gn = {}; db.guests.forEach(function (g) { gn[g.id] = g.name; });
    el.innerHTML = db.messages.length ? '<ul class="list">' + db.messages.slice().reverse().slice(0, 100).map(function (m) { return '<li><a class="item" href="#vault/' + m.guestId + '"><span class="t"><b>' + esc((gn[m.guestId] || '') + ' · ' + nice(m.date)) + '</b><span>' + esc(m.text) + '</span></span></a></li>'; }).join('') + '</ul>' : '<ul class="feats">' + tile('s/vaults', '🗂', 'Guest vaults') + '</ul>';
  };
  SPECIAL.reminders = function (el) {
    var t = today(), list = db.reminders.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    el.innerHTML = '<div class="card"><div class="grid2">' + field('Guest', '<select id="rm-g"><option value="">Choose</option>' + db.guests.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + '</option>'; }).join('') + '</select>') + field('Date', input('rm-d', 'date', t)) + '</div>' +
      field('Text', input('rm-t', 'text', '')) + '<button class="btn primary block" id="rm-add">Add reminder</button></div>' +
      (list.length ? '<ul class="list">' + list.map(function (r) { var g = db.guests.filter(function (x) { return x.id === r.guestId; })[0]; return '<li class="item' + (r.date <= t && !r.done ? ' due' : '') + '"><span class="t"><b>' + esc(nice(r.date) + ' · ' + (g ? g.name : '')) + '</b><span>' + esc(r.text) + '</span></span><span class="row tight">' + (g && !r.done ? '<button class="btn small" data-send="' + r.id + '">Send</button>' : '') + '<button class="btn small" data-del="' + r.id + '">✕</button></span></li>'; }).join('') + '</ul>' : '');
    $('#rm-add', el).onclick = function () { var gid = val('rm-g', el), txt = val('rm-t', el); if (!gid || !txt) { toast('Choose a guest and write the text', true); return; } db.reminders.push({ id: uid(), guestId: gid, date: val('rm-d', el) || t, text: txt }); save(); render(); };
    $$('[data-send]', el).forEach(function (b) { b.onclick = function () { var r = db.reminders.filter(function (x) { return x.id === b.dataset.send; })[0]; r.done = true; save(); go('msg/' + r.guestId, { text: r.text }); }; });
    $$('[data-del]', el).forEach(function (b) { b.onclick = function () { db.reminders = db.reminders.filter(function (x) { return x.id !== b.dataset.del; }); save(); render(); }; });
  };

  // Settings
  SPECIAL.business = function (el) {
    var s = S();
    el.innerHTML = '<div class="card">' + field('Business name', input('b-name', 'text', s.name)) + field('Name on guest vaults', input('b-vault', 'text', s.vaultTitle, 'placeholder="' + esc(s.name) + '"')) +
      field('Phone', input('b-phone', 'tel', s.phone)) + field('Address', input('b-addr', 'text', s.address)) + '<button class="btn primary block" id="b-save">Save</button></div><p class="app-version">Fingertip Hotel ' + VERSION + '</p>';
    $('#b-save', el).onclick = function () { var n = val('b-name', el); if (!n) { toast('Enter the business name', true); return; } s.name = n; s.vaultTitle = val('b-vault', el); s.phone = val('b-phone', el); s.address = val('b-addr', el); save(); toast('Saved'); location.hash = 'h/settings'; };
  };
  SPECIAL.roomslist = function (el) {
    el.innerHTML = '<div class="card">' + field('Rooms (one per line)', '<textarea id="rl" rows="10">' + esc(S().rooms.join('\n')) + '</textarea>') + '<button class="btn primary block" id="rl-save">Save</button></div>';
    $('#rl-save', el).onclick = function () { S().rooms = val('rl', el).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); save(); toast(S().rooms.length + ' rooms saved'); location.hash = 'h/settings'; };
  };
  SPECIAL.ai = function (el) {
    el.innerHTML = '<div class="card">' + field('Google Gemini key', input('ai-k', 'password', lsGet(AIKEY) || '', 'autocomplete="off"')) + '<p class="muted small">Kept on this phone only. Used by "Explain with AI".</p><div class="row"><button class="btn primary grow" id="ai-s">Save</button><button class="btn grow" id="ai-c">Remove</button></div></div>';
    $('#ai-s', el).onclick = function () { lsSet(AIKEY, val('ai-k', el)); toast('Saved'); };
    $('#ai-c', el).onclick = function () { try { localStorage.removeItem(AIKEY); } catch (e) {} toast('Removed'); render(); };
  };
  function blobToData(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(b); }); }
  function dataToBlob(u) { var p = u.split(','), m = /:(.*?);/.exec(p[0]), bin = atob(p[1]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: m ? m[1] : '' }); }
  SPECIAL.backup = function (el) {
    el.innerHTML = '<ul class="feats"><li><button class="feat" id="bk-save"><span class="ic">⬇</span><b>Save backup</b></button></li><li><label class="feat"><span class="ic">⬆</span><b>Restore backup</b><input type="file" id="bk-file" accept=".json,application/json" hidden></label></li>' +
      '<li><button class="feat danger" id="bk-erase"><span class="ic">✕</span><b>Erase this phone</b></button></li></ul><label class="chk"><input type="checkbox" id="bk-ph" checked> Include photos and files</label>';
    $('#bk-save', el).onclick = function () {
      ($('#bk-ph', el).checked ? allFiles().then(function (fs) { return Promise.all((fs || []).map(function (f) { return blobToData(f.blob).then(function (d) { return { id: f.id, name: f.name, type: f.type, data: d }; }); })); }) : Promise.resolve([]))
        .then(function (files) { saveFile('hotel-backup-' + today() + '.json', JSON.stringify({ app: 'Fingertip Hotel', version: 1, db: db, files: files }), 'application/json'); });
    };
    $('#bk-file', el).onchange = function (e) {
      var f = e.target.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { var d; try { d = JSON.parse(r.result); } catch (x) { toast('That is not a backup file', true); return; } if (!d.db || !d.db.records) { toast('That is not a backup file', true); return; }
        confirmIt('Replace everything on this phone with this backup?', 'Restore').then(function (ok) { if (!ok) return; db = Object.assign(blank(), d.db); save(); Promise.all((d.files || []).map(function (x) { return fileTx('readwrite', function (s) { return s.put({ id: x.id, name: x.name, type: x.type, blob: dataToBlob(x.data) }); }); })).then(function () { toast('Backup restored'); location.hash = ''; render(); }); }); };
      r.readAsText(f);
    };
    $('#bk-erase', el).onclick = function () { confirmIt('Erase everything on this phone? Save a backup first.', 'Erase').then(function (ok) { if (!ok) return; db = blank(); save(); fileTx('readwrite', function (s) { return s.clear(); }).catch(function () {}); location.hash = ''; render(); }); };
  };

  window.Hotel = { db: function () { return db; }, go: go, render: render, importCsv: function (sub, text) { importCsv(SUBS[sub], text); }, version: VERSION };
  render();
})();
