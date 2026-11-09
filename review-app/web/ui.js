/* Fingertrip.biz AI: app shell. Storage, navigation (main headers + full-screen pages),
 * shared helpers and first-time setup. Screens register with App.screen(). */
(function () {
  'use strict';
  var Base = window.BizBase, Industries = window.BizIndustries, R = window.BizReview, Work = window.BizWorkAreas;
  var KEY = 'bizreview-v2', AIKEY = 'bizreview-gemini-key';
  var APP_VERSION = '3.3.0';   // keep in step with android/app/build.gradle versionName
  var Cap = window.Capacitor;
  var native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  var embedded = (function () { try { return window.top !== window.self; } catch (e) { return true; } })();

  // ---------------------------------------------------------------- storage
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  var saveWarned = false;
  var store = { data: (function () { try { return JSON.parse(lsGet(KEY) || 'null'); } catch (e) { return null; } })(),
    commit: function () { if (!lsSet(KEY, JSON.stringify(store.data)) && !saveWarned) { saveWarned = true; toast('Phone storage is full or blocked. Save a backup from More → Backup.', true); } } };
  var local = Base.createApp(store);

  // ---------------------------------------------------------------- office sync (optional)
  // The phone always works on its own copy. When connected to the office system, every
  // change is also queued and sent there (each exactly once), then the office copy is
  // pulled back so all phones match. Offline, changes simply wait in the queue.
  var SKEY = 'bizreview-server', PKEY = 'bizreview-pin', OKEY = 'bizreview-outbox', XKEY = 'bizreview-sync-problems';
  var WRITES = ['setup', 'saveSettings', 'saveCustomer', 'removeCustomer', 'saveDepartment', 'removeDepartment', 'saveEntry', 'removeEntry', 'saveDailySheet',
    'saveReceipt', 'loadReviewSamples', 'saveVaultRecord', 'removeVaultRecord', 'logMessage', 'ensureVaultToken', 'importEntries',
    'saveStaff', 'removeStaff', 'saveSalaries', 'saveOffer', 'removeOffer', 'saveAdvance', 'removeAdvance', 'markAttendance', 'saveWorkDay', 'saveWorkConfig', 'saveMaster'];
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  var sync = { url: lsGet(SKEY) || '', outbox: (function () { try { return JSON.parse(lsGet(OKEY) || '[]'); } catch (e) { return []; } })(), status: 'idle', last: '', running: false, timer: null };
  function base() { var u = sync.url.trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'http://' + u; return u.replace(/\/+$/, '') + '/'; }
  function prepare(method, args) {
    args = JSON.parse(JSON.stringify(args));
    var a0 = args[0];
    if (['saveEntry', 'saveDepartment', 'saveVaultRecord', 'logMessage', 'saveCustomer', 'saveStaff', 'saveOffer', 'saveAdvance', 'markAttendance'].indexOf(method) >= 0 && a0 && !a0.id) a0.id = rid();
    if (method === 'saveSalaries' && a0) (a0.rows || []).forEach(function (r) { if (!r.id) r.id = rid(); });
    if (method === 'saveReceipt' && a0) { if (!a0.id) a0.id = rid(); a0.entry = a0.entry || {}; if (!a0.entry.id) a0.entry.id = rid(); }
    if (method === 'saveDailySheet' && a0) (a0.rows || []).forEach(function (r) { r.ids = r.ids || {}; ['walkin', 'cashInHand', 'deposit', 'sale', 'cash', 'upi', 'card', 'otherCollection', 'expense', 'purchase', 'received', 'wastage', 'misc'].forEach(function (f) { if (!r.ids[f]) r.ids[f] = rid(); }); });
    if (method === 'ensureVaultToken' && !args[1]) args[1] = (rid() + rid()).replace(/[^a-z0-9]/g, '').slice(0, 24);
    if (method === 'importEntries' && Array.isArray(a0)) a0.forEach(function (r) { if (!r.id) r.id = rid(); });
    return args;
  }
  var api = {};
  Object.keys(local).forEach(function (m) {
    if (WRITES.indexOf(m) < 0) { api[m] = local[m]; return; }
    api[m] = function () {
      var args = prepare(m, Array.prototype.slice.call(arguments));
      var r = local[m].apply(null, args);
      if (sync.url) { sync.outbox.push({ opId: rid(), method: m, args: args }); lsSet(OKEY, JSON.stringify(sync.outbox)); clearTimeout(sync.timer); sync.timer = setTimeout(runSync, 1200); }
      return r;
    };
  });
  ['resetAll', 'importAll'].forEach(function (m) {
    api[m] = function () { if (sync.url) throw Object.assign(new Error('This phone is connected to the office system. Disconnect it first (More → Office system).'), { userError: true }); return local[m].apply(null, arguments); };
  });
  function rpc(method, args, url, pin) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch((url || base()) + 'api/rpc', { method: 'POST', signal: ctrl ? ctrl.signal : undefined, headers: { 'Content-Type': 'application/json', 'x-app-pin': pin === undefined ? (lsGet(PKEY) || '') : pin }, body: JSON.stringify({ method: method, args: args || [] }) })
      .then(function (r) {
        clearTimeout(t);
        if (r.status === 401) throw Object.assign(new Error('Wrong PIN for the office system'), { auth: true });
        return r.json().catch(function () { throw Object.assign(new Error('No connection to the office system'), { net: true }); });
      }, function () { clearTimeout(t); throw Object.assign(new Error('No connection to the office system'), { net: true }); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Office system error'); return j.result; });
  }
  function pull() {
    return rpc('exportAll').then(function (data) {
      if (sync.outbox.length) return;           // new changes came in meanwhile; next run pulls
      local.importAll(data);
      cache = {};
      var r = (location.hash || '').replace('#', '') || 'home';
      if (['home', 'reports', 'customers', 'more', 'stock', 'entries', 'sync'].indexOf(r) >= 0 && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') render();
    });
  }
  function runSync() {
    if (!sync.url || sync.running) return Promise.resolve();
    sync.running = true;
    var batch = sync.outbox.slice(0, 100);
    var step = batch.length ? rpc('applyOps', [batch]).then(function (results) {
      var done = {}, probs = (function () { try { return JSON.parse(lsGet(XKEY) || '[]'); } catch (e) { return []; } })();
      results.forEach(function (r) { done[r.opId] = 1; if (!r.ok) probs.unshift({ at: new Date().toISOString(), error: r.error }); });
      lsSet(XKEY, JSON.stringify(probs.slice(0, 30)));
      sync.outbox = sync.outbox.filter(function (o) { return !done[o.opId]; });
      lsSet(OKEY, JSON.stringify(sync.outbox));
    }) : Promise.resolve();
    return step.then(function () { return sync.outbox.length ? null : pull(); })
      .then(function () { return window.App && App.files ? App.files.uploadPending() : 0; })
      .then(function () { sync.status = 'ok'; sync.last = new Date().toLocaleTimeString(); },
        function (e) { sync.status = e.auth ? 'pin' : e.net ? 'offline' : 'error'; sync.error = e.message; })
      .then(function () { sync.running = false; if (sync.outbox.length && sync.status === 'ok') runSync(); });
  }
  setInterval(function () { if (sync.url && !document.hidden) runSync(); }, 60000);
  window.addEventListener('online', function () { if (sync.url) runSync(); });
  // Connect this phone to an office system. mode: 'upload' (office is empty) or 'download' (use office data)
  function connect(url, pin) {
    var u = url.trim(); if (!/^https?:\/\//i.test(u)) u = 'http://' + u; u = u.replace(/\/+$/, '') + '/';
    return fetch(u + 'api/health', { cache: 'no-store' }).then(function (r) { return r.json(); }, function () { throw new Error('Could not reach the office system at that address.'); })
      .then(function (h) {
        if (!h || h.app !== 'BizCore Review') throw new Error('That address is not a Fingertrip.biz AI office system.');
        return rpc('info', [], u, pin).then(function () { return h; });
      });
  }
  function useServer(url, pin, mode) {
    var u = url.trim(); if (!/^https?:\/\//i.test(u)) u = 'http://' + u; u = u.replace(/\/+$/, '') + '/';
    var first = mode === 'upload' ? rpc('importAll', [local.exportAll()], u, pin) : Promise.resolve();
    return first.then(function () { lsSet(SKEY, u); lsSet(PKEY, pin || ''); sync.url = u; sync.outbox = []; lsSet(OKEY, '[]'); return mode === 'upload' ? null : pull(); })
      .then(function () { sync.status = 'ok'; sync.last = new Date().toLocaleTimeString(); cache = {}; });
  }
  function disconnect() { sync.url = ''; sync.outbox = []; lsSet(SKEY, ''); lsSet(OKEY, '[]'); }

  // ---------------------------------------------------------------- helpers
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function esc(v) { return v === undefined || v === null ? '' : String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function S() { return api.info().settings; }
  var cache = {};
  function info() { return cache.info || (cache.info = api.info()); }
  function P() { return info().preset; }
  function money(n, dec) {
    n = Number(n) || 0;
    var s; try { s = n.toLocaleString(info().settings.locale || 'en-IN', { maximumFractionDigits: dec === undefined ? 0 : dec, minimumFractionDigits: 0 }); } catch (e) { s = String(Math.round(n)); }
    return (info().settings.currency || '') + s;
  }
  function pct(v) { return v === null || v === undefined ? '–' : (Math.round(v * 10) / 10) + '%'; }
  function today() { return Base.localDate(new Date()); }
  function addDays(d, n) { return R.addDays(d, n); }
  function niceDate(d, withYear) {
    if (!d) return '';
    var p = d.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
    if (d === today()) return 'Today';
    if (d === addDays(today(), -1)) return 'Yesterday';
    try { return dt.toLocaleDateString(info().settings.locale || 'en-IN', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return d; }
  }
  function opt(list, sel, blank) {
    return (blank !== undefined ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (x) {
      var v = typeof x === 'object' ? x.value : x, t = typeof x === 'object' ? x.text : x;
      return '<option value="' + esc(v) + '"' + (String(v) === String(sel === undefined ? '' : sel) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  }
  function seg(id, items, value) {
    return '<div class="seg" id="' + id + '">' + items.map(function (x) { return '<button type="button" data-v="' + esc(x[0]) + '"' + (String(x[0]) === String(value) ? ' class="on"' : '') + '>' + esc(x[1]) + '</button>'; }).join('') + '</div>';
  }
  function onSeg(el, fn) { $$('button', el).forEach(function (b) { b.onclick = function () { $$('button', el).forEach(function (x) { x.classList.toggle('on', x === b); }); fn(b.dataset.v); }; }); }
  function field(label, html) { return '<label class="f">' + esc(label) + html + '</label>'; }
  function input(id, type, value, extra) { return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value === undefined || value === null ? '' : value) + '"' + (type === 'number' ? ' inputmode="decimal" step="any"' : '') + ' ' + (extra || '') + '>'; }
  function val(id, el) { var x = $('#' + id, el); return x ? x.value : ''; }
  function empty(title, hint, action) { return '<div class="empty"><b>' + esc(title) + '</b>' + (hint ? '<span>' + esc(hint) + '</span>' : '') + (action || '') + '</div>'; }
  function waLink(phone, text) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.length === 10) d = String(info().settings.countryCode || '91').replace(/\D/g, '') + d;
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text);
  }
  function sevPill(s) { return '<span class="pill ' + (s === 'high' ? 'bad' : s === 'medium' ? 'warn' : 'ink') + '">' + (s === 'high' ? 'Check now' : s === 'medium' ? 'Look into' : 'Note') + '</span>'; }
  function flagItems(flags, limit) {
    if (!flags.length) return empty('Nothing unusual', 'Collections, prices, deliveries, stock and wastage look normal.');
    return '<ul class="list">' + flags.slice(0, limit || 999).map(function (f) {
      return '<li class="item flag ' + f.severity + '"><div class="t"><b>' + esc(f.title) + '</b><span>' + esc(f.detail) + '</span></div>' + sevPill(f.severity) + '</li>';
    }).join('') + '</ul>';
  }

  function toast(msg, err) {
    var box = $('#toasts'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; t.setAttribute('role', 'status');
    box.appendChild(t); setTimeout(function () { t.remove(); }, err ? 5000 : 2600);
  }
  // Runs an action; shows the reason if it fails. Returns the result or undefined.
  function act(fn, okMsg) {
    try { var r = fn(); cache = {}; if (okMsg) toast(okMsg); return r === undefined ? true : r; }
    catch (e) { toast(e.message || String(e), true); return undefined; }
  }
  function confirmSheet(text, okText, danger) {
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'sheet-back';
      back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><p>' + esc(text) + '</p><div class="row"><button type="button" class="btn grow" id="cf-no">Cancel</button><button type="button" class="btn grow ' + (danger ? 'danger' : 'primary') + '" id="cf-yes">' + esc(okText || 'Yes') + '</button></div></div>';
      document.body.appendChild(back);
      function done(v) { back.remove(); resolve(v); }
      $('#cf-no', back).onclick = function () { done(false); };
      $('#cf-yes', back).onclick = function () { done(true); };
      back.addEventListener('click', function (e) { if (e.target === back) done(false); });
    });
  }
  function readFile(file, asUrl) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(new Error('Could not read the file')); }; if (asUrl) r.readAsDataURL(file); else r.readAsText(file); });
  }
  function nativeCall(plugin, method, opts) {
    if (Cap && Cap.nativePromise) return Cap.nativePromise(plugin, method, opts);
    var p = Cap && Cap.Plugins && Cap.Plugins[plugin];
    return p && p[method] ? p[method](opts) : Promise.reject(new Error('not available'));
  }
  // Save a file: Android share sheet in the app, a download in browsers, copyable text where both are blocked.
  function saveFile(name, text, type) {
    if (native) {
      return nativeCall('Filesystem', 'writeFile', { path: name, data: text, directory: 'CACHE', encoding: 'utf8' })
        .then(function (r) { return nativeCall('Share', 'share', { title: name, url: r.uri, dialogTitle: 'Save or send ' + name }); })
        .catch(function () { showText(name, text); });
    }
    if (embedded) { showText(name, text); return Promise.resolve(); }
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    return Promise.resolve();
  }
  function showText(name, text) {
    var back = document.createElement('div'); back.className = 'sheet-back';
    back.innerHTML = '<div class="sheet"><b>' + esc(name) + '</b><p class="muted small">Copy this text and keep it safe.</p><textarea style="min-height:220px" readonly>' + esc(text) + '</textarea><div class="row"><button type="button" class="btn grow" id="st-copy">Copy</button><button type="button" class="btn primary grow" id="st-close">Done</button></div></div>';
    document.body.appendChild(back);
    $('#st-close', back).onclick = function () { back.remove(); };
    $('#st-copy', back).onclick = function () { var ta = $('textarea', back); (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Copied'); }).catch(function () { ta.select(); }); };
  }
  function openLink(url) { if (native) location.href = url; else window.open(url, '_blank', 'noopener'); }

  // ---------------------------------------------------------------- navigation
  var screens = {};
  var state = {};          // values passed between pages (e.g. which customer is open)
  function screen(name, def) { screens[name] = def; }
  var goPending = false;   // set while go() changes the address, so its values survive the hashchange
  function go(name, params) { state = params || {}; if (location.hash === '#' + name) render(); else { goPending = true; location.hash = name; } }
  function route() { return (location.hash || '').replace(/^#/, '') || 'home'; }

  function render() {
    cache = {};
    var s = info().settings;
    if (!s.setupDone) return renderSetup();
    var name = route(), def = screens[name] || screens.home;
    if (!screens[name]) name = 'home';
    document.title = (typeof def.title === 'function' ? def.title() : def.title) + ' · ' + s.businessName;
    $('#app').innerHTML =
      '<header class="top" id="top">' + (def.back ? '<button class="back" id="back" aria-label="Back">‹</button>' : '<span class="logo" aria-hidden="true"><svg viewBox="0 0 64 64" width="30" height="30"><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"><path d="M12 31a20 20 0 0 1 40 0"/><path d="M16 44V34a16 16 0 0 1 32 0v10"/><path d="M22 48V34a10 10 0 0 1 20 0v8"/><path d="M28 51V35a4 4 0 0 1 8 0v14"/></g></svg></span>') +
      '<div class="titles"><h1>' + esc(typeof def.title === 'function' ? def.title() : def.title) + '</h1><div class="sub">' + esc(def.crumb ? (typeof def.crumb === 'function' ? def.crumb() : def.crumb) : s.businessName + ' · ' + niceDate(today(), true)) + '</div></div>' +
      (name !== 'home' ? '<a class="back" href="#home" aria-label="Main page">⌂</a>' : '<a class="back" href="#setup" aria-label="Master">⚙</a>') + '</header>' +
      '<main id="view"></main>';
    if (def.back) $('#back').onclick = function () { if (history.length > 1 && state.fromNav) history.back(); else go(def.back); };
    // section colour: walk up the back links to the main-page header this page belongs to
    var sec = name, guard = 0;
    while (screens[sec] && screens[sec].back && screens[sec].back !== 'home' && guard++ < 8) sec = screens[sec].back;
    document.body.dataset.sec = name === 'home' ? 'home' : sec;
    window.scrollTo(0, 0);
    try { def.render($('#view'), state); }
    catch (e) { $('#view').innerHTML = '<div class="banner">' + esc(e.message) + '</div>'; }
  }
  window.addEventListener('scroll', function () { var t = $('#top'); if (t) t.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });

  // ---------------------------------------------------------------- first-time setup
  function renderSetup() {
    var chosen = info().settings.industry || 'restaurant';
    $('#app').innerHTML = '<main style="padding-top:calc(24px + env(safe-area-inset-top,0px))"><div class="stack"><h1>Welcome to Fingertrip.biz AI</h1>' +
      '<p class="muted">Enter your sales, walk-ins, expenses and purchase bills; it shows you where your business stands and what needs checking. Pick your business type.</p></div>' +
      '<div class="types" id="types">' + Industries.list().map(function (i) {
        return '<button type="button" data-k="' + i.key + '"' + (i.key === chosen ? ' class="on"' : '') + '><span class="e" aria-hidden="true">' + i.icon + '</span><b>' + esc(i.name) + '</b></button>';
      }).join('') + '</div>' +
      '<div class="card">' + field('Business name', input('su-name', 'text', '', 'autocomplete="organization"')) +
      field('Phone (for messages to customers)', input('su-phone', 'tel', '', 'inputmode="tel"')) +
      '<button type="button" class="btn primary block" id="su-go">Start</button></div></main>';
    $$('#types button').forEach(function (b) { b.onclick = function () { chosen = b.dataset.k; $$('#types button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    $('#su-go').onclick = function () {
      var name = val('su-name').trim();
      if (!name) { toast('Enter your business name', true); $('#su-name').focus(); return; }
      if (act(function () { return api.setup({ industry: chosen, businessName: name, phone: val('su-phone'), loadSamples: false }); })) { location.hash = 'home'; render(); toast('Ready'); }
    };
  }

  // ---------------------------------------------------------------- shared charts
  function barChart(days, opts) {
    opts = opts || {};
    var W = 640, H = 170, L = 44, B = 22, T = 8;
    var vals = days.map(function (d) { return { a: d.a, b: d.b || 0 }; });
    var max = Math.max.apply(null, vals.map(function (v) { return Math.max(v.a, v.b); }).concat([0]));
    var p = max > 0 ? Math.pow(10, Math.floor(Math.log10(max))) : 1, n = max / p, nice = max > 0 ? (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p : 0;
    var bw = (W - L - 6) / Math.max(1, days.length), g = '';
    function sh(v) { return v >= 1e5 ? (v / 1e5).toFixed(1) + 'L' : v >= 1000 ? Math.round(v / 1000) + 'k' : String(Math.round(v)); }
    [0, .5, 1].forEach(function (f) { var y = T + (H - T - B) * (1 - f); g += '<line x1="' + L + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '"></line><text x="' + (L - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + sh(nice * f) + '</text>'; });
    days.forEach(function (d, i) {
      var x = L + i * bw, two = opts.two;
      [['a', 'b1'], two ? ['b', 'b2'] : null].filter(Boolean).forEach(function (k, j) {
        var v = vals[i][k[0]], h = nice ? (H - T - B) * v / nice : 0, w = two ? bw * .36 : bw * .62, off = two ? bw * (.12 + j * .38) : bw * .19;
        g += '<rect class="' + (v ? k[1] : 'b0') + '" x="' + (x + off).toFixed(1) + '" y="' + (H - B - Math.max(h, 1)).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(h, 1).toFixed(1) + '" rx="2"><title>' + esc(d.label + ': ' + money(v)) + '</title></rect>';
      });
      if (days.length <= 10 || i % Math.ceil(days.length / 10) === 0) g += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(d.tick) + '</text>';
    });
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Chart') + '">' + g + '</svg>' +
      (opts.two ? '<div class="legend"><span><i style="background:var(--ink)"></i>' + esc(opts.la || 'Sales') + '</span><span><i style="background:var(--warn)"></i>' + esc(opts.lb || 'Costs') + '</span></div>' : '') + '</div>';
  }

  // ---------------------------------------------------------------- boot
  function start() {
    // messages live outside the page area, so they stay visible when the screen changes
    var tb = document.createElement('div'); tb.className = 'toasts'; tb.id = 'toasts'; document.body.appendChild(tb);
    if (native) document.documentElement.classList.add('native');
    window.addEventListener('hashchange', function () { if (!goPending) state = {}; goPending = false; state.fromNav = true; render(); });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[target=_blank]');
      if (a && native && /^https?:/i.test(a.href)) { e.preventDefault(); location.href = a.href; }
    });
    render();
    if (sync.url) runSync();
  }

  window.App = {
    api: api, Base: Base, Industries: Industries, R: R, AI: window.BizAI, OCR: window.BizOCRParse,
    S: S, P: P, info: info, $: $, $$: $$, esc: esc, money: money, pct: pct, today: today, addDays: addDays, niceDate: niceDate,
    opt: opt, seg: seg, onSeg: onSeg, field: field, input: input, val: val, empty: empty, waLink: waLink, sevPill: sevPill, flagItems: flagItems,
    toast: toast, act: act, confirmSheet: confirmSheet, readFile: readFile, saveFile: saveFile, openLink: openLink, barChart: barChart,
    VERSION: APP_VERSION, screen: screen, go: go, render: render, start: start, native: native, embedded: embedded, lsGet: lsGet, lsSet: lsSet, AIKEY: AIKEY,
    clearCache: function () { cache = {}; },
    sync: sync, runSync: runSync, connectCheck: connect, useServer: useServer, disconnect: disconnect, serverBase: base, local: local,
    syncProblems: function () { try { return JSON.parse(lsGet(XKEY) || '[]'); } catch (e) { return []; } }
  };
})();
