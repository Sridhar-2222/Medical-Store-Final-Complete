/* BizCore web app — vanilla JS, no build step.
 * Data source is chosen automatically:
 *   - "Shared" mode: the BizCore server answers /api/health -> all devices share one database.
 *   - "This device" mode: no server (opened as a file, hosted statically, or offline) ->
 *     the same engine runs in the browser and saves to localStorage.
 */
(function () {
  'use strict';
  var Engine = window.BizEngine, Industries = window.BizIndustries, AI = window.BizAI;
  var LS_DB = 'bizcore-db-v1', LS_PIN = 'bizcore-pin', LS_AIKEY = 'bizcore-gemini-key';
  var LS_SERVER = 'bizcore-server-url', LS_KNOWN = 'bizcore-server-known', LS_CACHE = 'bizcore-cache-v1',
    LS_OUTBOX = 'bizcore-outbox-v1', LS_PROBLEMS = 'bizcore-sync-problems';
  var embedded = (function () { try { return window.top !== window.self; } catch (e) { return true; } })();
  var Cap = window.Capacitor;
  var native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());

  // ---------------------------------------------------------------- storage
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function lsJSON(k, d) { var r = lsGet(k); if (!r) return d; try { return JSON.parse(r); } catch (e) { return d; } }

  /*
   * Data layer.
   *  mode 'local'  : no server. The engine runs here and saves to this browser.
   *  mode 'remote' : a BizCore server is the shared source of truth. A full copy of
   *                  its data is cached on the device. While offline (or while
   *                  changes are still waiting), the engine runs on that copy and
   *                  every change goes to an outbox that is uploaded and applied
   *                  exactly once when the connection is back.
   */
  var api = { mode: 'local', online: true, health: null, engine: null, cache: null, storageOk: true, outbox: lsJSON(LS_OUTBOX, []), syncing: false };
  var READS = ['info', 'list', 'get', 'findItemByCode', 'quote', 'ledger', 'dashboard', 'report', 'exportAll', 'exportCSV', 'methods',
    'reviewInsights', 'getDailySheet', 'checkReceipt', 'sampleDays', 'inventory', 'knownItems', 'vault', 'vaultDue', 'vaultSummary'];
  var SYNC_OPS = ['setup', 'saveSettings', 'save', 'remove', 'createSale', 'voidSale', 'createPurchase', 'voidPurchase',
    'adjustStock', 'recordPayment', 'setAppointmentStatus', 'billAppointment', 'importCSV', 'loadSamples',
    'saveDepartment', 'removeDepartment', 'saveEntry', 'removeEntry', 'saveDailySheet', 'saveReceipt', 'loadReviewSamples',
    'saveVaultRecord', 'removeVaultRecord', 'logMessage', 'ensureVaultToken', 'importEntries'];

  function serverBase() {
    var b = (lsGet(LS_SERVER) || '').trim();
    if (!b) return '';
    if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
    return b.replace(/\/+$/, '') + '/';
  }
  function apiUrl(path) { return serverBase() + path; }
  function localId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function startLocal() {
    var store = {
      data: lsJSON(LS_DB, null),
      commit: function () {
        var ok = lsSet(LS_DB, JSON.stringify(store.data));
        if (!ok && api.storageOk) { api.storageOk = false; toast('This device is not saving data (private mode or storage full). Download a backup from Backup & data.', true); }
      }
    };
    api.engine = Engine.createEngine(store);
    api.mode = 'local';
    api.storageOk = lsSet('bizcore-probe', '1');
  }

  // The cached copy of the server's data (used offline).
  function openCache(data) {
    var store = { data: data || lsJSON(LS_CACHE, null), commit: function () { saveCache(); } };
    api.cache = Engine.createEngine(store);
    api.cacheStore = store;
  }
  function saveCache() {
    if (!api.cacheStore) return;
    if (!lsSet(LS_CACHE, JSON.stringify(api.cacheStore.data)) && api.storageOk) {
      api.storageOk = false; toast('Phone storage is full: the offline copy could not be saved.', true);
    }
  }
  function saveOutbox() { lsSet(LS_OUTBOX, JSON.stringify(api.outbox)); }

  function http(path, body, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 15000);
    return fetch(apiUrl(path), { method: body ? 'POST' : 'GET', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined,
      headers: { 'Content-Type': 'application/json', 'x-app-pin': lsGet(LS_PIN) || '' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        clearTimeout(timer);
        if (r.status === 401) { askPin(); var e = new Error('PIN required'); e.auth = true; throw e; }
        return r.json().then(function (j) { if (!j.ok && r.status >= 500) { var se = new Error(j.error || 'Server error'); se.server = true; throw se; } return j; }, function () {
          // Not our server answering (Wi-Fi login page, proxy, wrong address): treat as no connection.
          var ne = new Error('No connection to the shop server'); ne.network = true; throw ne;
        });
      }, function (err) { clearTimeout(timer); var e = new Error('No connection to the shop server'); e.network = true; e.cause = err; throw e; });
  }
  function rpc(method, args) {
    return http('api/rpc', { method: method, args: args }).then(function (j) {
      if (!j.ok) { var e = new Error(j.error || 'Request failed'); e.userError = true; throw e; }
      return j.result;
    });
  }

  function runCache(method, args) {
    if (!api.cache) throw new Error('No offline copy on this device yet. Connect to the internet once to download the data.');
    return api.cache[method].apply(null, args);
  }

  // Give new records their final id on this device, so the same id is used when the change is uploaded.
  function prepareArgs(method, args, replay) {
    args = JSON.parse(JSON.stringify(args));
    if (method === 'save' && args[1] && !args[1].id) args[1].id = localId();
    if ((method === 'saveEntry' || method === 'saveDepartment' || method === 'saveVaultRecord' || method === 'logMessage') && args[0] && !args[0].id) args[0].id = localId();
    if (method === 'ensureVaultToken' && !args[1]) args[1] = (localId() + localId()).replace(/[^a-z0-9]/g, '').slice(0, 24);
    if (method === 'saveReceipt' && args[0]) { if (!args[0].id) args[0].id = localId(); args[0].entry = args[0].entry || {}; if (!args[0].entry.id) args[0].entry.id = localId(); }
    if (method === 'saveDailySheet' && args[0]) (args[0].rows || []).forEach(function (r) { r.ids = r.ids || {}; ['sale', 'cash', 'upi', 'card', 'otherCollection', 'expense', 'purchase', 'received', 'wastage', 'misc'].forEach(function (f) { if (!r.ids[f]) r.ids[f] = localId(); }); });
    if ((method === 'createSale' || method === 'createPurchase') && args[0]) { if (!args[0].id) args[0].id = localId(); if (replay) args[0].replay = true; }
    if (method === 'billAppointment') { args[1] = args[1] || {}; if (!args[1].id) args[1].id = localId(); if (replay) args[1].replay = true; }
    return args;
  }
  function queueOp(method, args, opId) {
    var a = prepareArgs(method, args, true);
    var result = runCache(method, a);            // validates and updates the offline copy
    api.outbox.push({ opId: opId || localId(), method: method, args: a, at: new Date().toISOString() });
    saveOutbox();
    updateSyncBadge();
    return result;
  }

  api.call = function (method) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (api.mode === 'local') return new Promise(function (resolve) { resolve(api.engine[method].apply(null, args)); });
    var isRead = READS.indexOf(method) >= 0;
    var useCache = !api.online || api.outbox.length > 0;
    if (!useCache && SYNC_OPS.indexOf(method) >= 0) {
      // Online change: sent with an operation id so a retry after a dropped connection is never applied twice.
      var op = { opId: localId(), method: method, args: prepareArgs(method, args, false) };
      return rpc('applyOps', [[op]]).then(function (res) {
        var r = res[0];
        if (!r.ok) { var ue = new Error(r.error); ue.userError = true; throw ue; }
        scheduleRefresh(1500);
        return r.result;
      }, function (e) {
        if (!e.network) throw e;
        goOffline();
        var out = queueOp(method, op.args, op.opId);
        return out;
      });
    }
    if (!useCache) {
      return rpc(method, args).then(function (res) {
        if (!isRead) scheduleRefresh(1500);
        return res;
      }, function (e) {
        if (!e.network) throw e;
        goOffline();
        return api.call.apply(null, [method].concat(args));
      });
    }
    return new Promise(function (resolve) {
      if (isRead) return resolve(runCache(method, args));
      if (SYNC_OPS.indexOf(method) < 0) throw new Error('This needs a connection to the shop server.');
      resolve(queueOp(method, args));
      if (api.online) sync();
    });
  };

  // ---- connection state, sync and refresh ----
  var probeTimer = null, refreshTimer = null;
  function goOffline() {
    if (!api.online) return;
    api.online = false;
    updateSyncBadge();
    toast('Offline. Keep working: changes are saved on this device and will sync automatically.');
    if (!probeTimer) probeTimer = setInterval(probe, 15000);
  }
  function goOnline() {
    if (probeTimer) { clearInterval(probeTimer); probeTimer = null; }
    var was = api.online;
    api.online = true;
    updateSyncBadge();
    return sync().then(function () { if (!was) toast('Back online. Everything is synced.'); });
  }
  function probe() {
    return checkHealth().then(function (ok) { if (ok) return goOnline(); });
  }
  function checkHealth() {
    return http('api/health', null, 5000).then(function (j) {
      if (j && j.app === 'BizCore') { api.health = j; return true; }
      return false;
    }).catch(function () { return false; });
  }
  function sync() {
    if (api.mode !== 'remote' || api.syncing) return Promise.resolve();
    if (!api.outbox.length) return refreshCache();
    api.syncing = true;
    updateSyncBadge();
    var batch = api.outbox.slice(0, 100);
    return rpc('applyOps', [batch]).then(function (results) {
      var done = {};
      var problems = lsJSON(LS_PROBLEMS, []);
      results.forEach(function (r) {
        done[r.opId] = true;
        if (!r.ok) {
          var op = batch.filter(function (b) { return b.opId === r.opId; })[0] || {};
          problems.unshift({ at: new Date().toISOString(), method: op.method, error: r.error });
          toast('A change made offline could not be applied: ' + r.error, true);
        }
      });
      lsSet(LS_PROBLEMS, JSON.stringify(problems.slice(0, 50)));
      api.outbox = api.outbox.filter(function (o) { return !done[o.opId]; });
      saveOutbox();
      api.syncing = false;
      if (api.outbox.length) return sync();
      return refreshCache(true);
    }, function (e) {
      api.syncing = false;
      if (e.network) goOffline();
      updateSyncBadge();
    });
  }
  // Download a fresh copy of the shared data for offline use.
  function refreshCache(rerender) {
    if (api.mode !== 'remote' || !api.online || api.outbox.length) return Promise.resolve();
    return rpc('exportAll', []).then(function (db) {
      if (api.outbox.length) return;          // something was queued meanwhile; next sync refreshes
      openCache(db);
      saveCache();
      api.lastRefresh = new Date();
      updateSyncBadge();
      if (rerender && S && S.setupDone && $('#view')) refreshInfo().then(render);
    }).catch(function (e) { if (e.network) goOffline(); });
  }
  function scheduleRefresh(ms) { clearTimeout(refreshTimer); refreshTimer = setTimeout(function () { refreshCache(); }, ms); }

  function syncText() {
    if (api.mode === 'local') return { cls: 'ink', text: native ? 'Saved on this phone' : 'This device only' };
    if (!api.online) return { cls: 'warn', text: 'Offline' + (api.outbox.length ? ' · ' + api.outbox.length + ' to sync' : ' · using saved copy') };
    if (api.outbox.length) return { cls: 'warn', text: 'Syncing ' + api.outbox.length + '…' };
    return { cls: 'good', text: 'Online · synced' };
  }
  function updateSyncBadge() {
    var el = document.getElementById('sync-pill');
    if (!el) return;
    var t = syncText();
    el.className = 'pill ' + t.cls; el.textContent = t.text;
  }

  function detectMode() {
    var known = lsGet(LS_KNOWN) === (serverBase() || location.origin);
    if (!serverBase() && (native || !/^https?:$/.test(location.protocol))) return Promise.resolve('local');
    return checkHealth().then(function (ok) {
      if (ok) { lsSet(LS_KNOWN, serverBase() || location.origin); return 'online'; }
      return known ? 'offline' : 'local';
    });
  }

  // ---------------------------------------------------------------- helpers
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  function esc(v) { return v === undefined || v === null ? '' : String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var S = null, P = null, INFO = null; // settings, preset, info
  function money(n) {
    n = Number(n) || 0;
    var s;
    try { s = n.toLocaleString(S.locale || 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    catch (e) { s = n.toFixed(2); }
    return (S.currency || '') + s;
  }
  function qtyFmt(n) { n = Number(n) || 0; return Number.isInteger(n) ? String(n) : n.toFixed(2); }
  function today() { return Engine.localDate(new Date()); }
  function fmtDate(d) {
    if (!d) return '';
    var p = d.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    try { return dt.toLocaleDateString(S.locale || 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return d; }
  }
  function label(k) { return (P && P.labels && P.labels[k]) || k; }
  function has(mod) { return S && S.modules.indexOf(mod) >= 0; }
  function formData(form) {
    var o = {};
    $$('[name]', form).forEach(function (el) {
      var v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.name.indexOf('custom.') === 0) { o.custom = o.custom || {}; o.custom[el.name.slice(7)] = v; }
      else o[el.name] = v;
    });
    return o;
  }
  function opt(list, sel, blank) {
    return (blank !== undefined ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (x) {
      var v = typeof x === 'object' ? x.value : x, t = typeof x === 'object' ? x.text : x;
      return '<option value="' + esc(v) + '"' + (String(v) === String(sel === undefined ? '' : sel) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  }
  function waLink(phone, text) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.length === 10 && S.countryCode) d = String(S.countryCode).replace(/\D/g, '') + d;
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text);
  }
  function statusPill(s) {
    var cls = { paid: 'good', partial: 'warn', unpaid: 'bad', void: '', booked: 'ink', confirmed: 'ink', done: 'good', cancelled: '', 'no-show': 'bad' }[s] || '';
    return '<span class="pill ' + cls + '">' + esc(s === 'void' ? 'cancelled' : s) + '</span>';
  }
  function emptyState(title, hint, action) {
    return '<div class="empty"><strong>' + esc(title) + '</strong>' + esc(hint || '') + (action ? '<div style="margin-top:10px">' + action + '</div>' : '') + '</div>';
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  function toast(msg, err) {
    var box = $('#toasts'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; t.setAttribute('role', 'status');
    box.appendChild(t); setTimeout(function () { t.remove(); }, err ? 6000 : 3000);
  }
  function fail(e) { toast(e && e.message ? e.message : String(e), true); }

  // ---------------------------------------------------------------- modal
  function modal(opts) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<form class="modal ' + (opts.wide ? 'wide' : '') + '" novalidate>' +
      '<div class="modal-head"><h2>' + esc(opts.title) + '</h2><button type="button" class="btn ghost sm" data-close aria-label="Close">✕</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.noFoot ? '' : '<div class="modal-foot">' + (opts.extraFoot || '') + '<span class="spacer"></span><button type="button" class="btn" data-close>' + esc(opts.cancelText || 'Cancel') + '</button>' +
        (opts.submitText === null ? '' : '<button type="submit" class="btn primary' + (opts.danger ? ' danger' : '') + '">' + esc(opts.submitText || 'Save') + '</button>') + '</div>') +
      '</form>';
    document.body.appendChild(back);
    var form = $('form', back);
    function close() { back.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    $$('[data-close]', back).forEach(function (b) { b.addEventListener('click', close); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!opts.onSubmit) return close();
      var btn = $('button[type=submit]', form); if (btn) btn.disabled = true;
      Promise.resolve().then(function () { return opts.onSubmit(formData(form), form); })
        .then(function (keep) { if (keep !== false) close(); })
        .catch(fail)
        .then(function () { if (btn) btn.disabled = false; });
    });
    if (opts.onOpen) opts.onOpen(form, close);
    var first = $('input:not([type=hidden]):not([type=checkbox]), select, textarea', form);
    if (first && !opts.noFocus) setTimeout(function () { first.focus(); }, 30);
    return { form: form, close: close, el: back };
  }
  function confirmBox(message, okText, danger) {
    return new Promise(function (resolve) {
      var done = false;
      modal({ title: 'Please confirm', body: '<p>' + esc(message) + '</p>', submitText: okText || 'Yes', danger: danger, noFocus: true,
        onSubmit: function () { done = true; resolve(true); }, onClose: function () { if (!done) resolve(false); } });
    });
  }
  function askPin() {
    if ($('#pin-modal')) return;
    var m = modal({ title: 'Enter PIN', body: '<p class="muted">This shop is protected with a PIN.</p><label class="field">PIN<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" id="pin-input"></label>',
      submitText: 'Unlock', onSubmit: function (d) { lsSet(LS_PIN, d.pin); location.reload(); } });
    m.el.id = 'pin-modal';
  }
  function download(name, text, type) {
    if (native && !download.fallback) {
      nativeShareFile(name, text).catch(function () { download.fallback = true; download(name, text, type); download.fallback = false; });
      return;
    }
    if (embedded || native) {
      // Downloads are blocked inside embedded viewers: show the text so it can be copied.
      modal({ title: name, wide: true, submitText: null, cancelText: 'Close',
        body: '<p class="muted">Downloads are blocked here. Copy the text below and save it as <b>' + esc(name) + '</b>.</p><textarea id="dl-text" style="min-height:300px" readonly>' + esc(text) + '</textarea>',
        extraFoot: '<button type="button" class="btn" id="dl-copy">Copy</button>',
        onOpen: function (f) {
          $('#dl-copy', f).onclick = function () {
            var ta = $('#dl-text', f);
            (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Copied'); })
              .catch(function () { ta.select(); toast('Press Ctrl+C / Cmd+C to copy'); });
          };
        } });
      return;
    }
    var blob = new Blob([text], { type: type || 'text/plain' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function readFile(file, asDataUrl) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = function () { reject(new Error('Could not read file')); };
      if (asDataUrl) r.readAsDataURL(file); else r.readAsText(file);
    });
  }

  // ---------------------------------------------------------------- routing / shell
  var NAV = [
    { key: 'dashboard', icon: '◧', text: 'Dashboard' },
    { key: 'pos', icon: '＋', text: function () { return 'New ' + label('sale').toLowerCase(); } },
    { key: 'sales', icon: '≡', text: function () { return label('sale') + 's'; } },
    { key: 'items', icon: '▤', text: function () { return label('items'); } },
    { key: 'purchases', icon: '⇣', text: 'Purchases' },
    { key: 'customers', icon: '☺', text: function () { return label('customers'); } },
    { key: 'suppliers', icon: '⛟', text: 'Suppliers' },
    { key: 'appointments', icon: '◷', text: function () { return (P.appointmentLabel || 'Appointment') + 's'; } },
    { key: 'expenses', icon: '₋', text: 'Expenses' },
    { key: 'staff', icon: '◎', text: 'Staff' },
    { key: 'reports', icon: '▥', text: 'Reports' },
    { key: 'prefs', mod: 'settings', icon: '⚙', text: 'Settings' },
    { key: 'data', icon: '⇅', text: 'Backup & data' }
  ];
  function homePage() { return has('overview') ? 'overview' : 'dashboard'; }
  function route() { var h = (location.hash || '').replace(/^#/, ''); return h || homePage(); }
  function go(name) { if (location.hash !== '#' + name) location.hash = name; else render(); }

  function refreshInfo() {
    return api.call('info').then(function (i) { INFO = i; S = i.settings; P = i.preset; });
  }

  function shell() {
    var nav = NAV.filter(function (n) { return has(n.mod || n.key); }).map(function (n) {
      var t = typeof n.text === 'function' ? n.text() : n.text;
      return '<a href="#' + n.key + '" data-nav="' + n.key + '"><span class="ico" aria-hidden="true">' + n.icon + '</span>' + esc(t) + '</a>';
    }).join('');
    var st = syncText();
    document.getElementById('app').innerHTML =
      '<div class="shell"><aside class="side" id="side"><div class="brand"><div class="brand-mark" aria-hidden="true">' + esc((S.businessName || 'B').trim().charAt(0).toUpperCase()) + '</div>' +
      '<div style="min-width:0"><div class="brand-name">' + esc(S.businessName) + '</div><div class="brand-sub">' + esc(P.icon + ' ' + P.name) + '</div></div></div>' +
      '<nav class="nav">' + nav + '</nav>' +
      '<div class="side-foot"><span><a href="#data" style="text-decoration:none"><span id="sync-pill" class="pill ' + st.cls + '">' + esc(st.text) + '</span></a></span><span>BizCore · ' + esc(today()) + '</span></div></aside>' +
      '<div class="scrim" id="scrim"></div>' +
      '<div class="main"><header class="topbar"><button class="btn ghost menu-btn" id="menu" aria-label="Menu">☰</button><h1 id="page-title"></h1>' +
      '<div class="row" id="top-actions"></div>' + (has('pos') ? '<a class="btn primary" href="#pos">＋ ' + esc(label('sale')) + '</a>' : has('daily') ? '<a class="btn primary" href="#daily">＋ Today</a>' : '') + '</header>' +
      '<main class="content" id="view"></main></div></div><div class="toasts" id="toasts"></div>';
    $('#menu').onclick = function () { document.body.classList.toggle('nav-open'); };
    $('#scrim').onclick = function () { document.body.classList.remove('nav-open'); };
  }

  function setTitle(t) { $('#page-title').textContent = t; document.title = t + ' · ' + S.businessName; }

  var PAGES = {};
  function render() {
    document.body.classList.remove('nav-open');
    if (!S.setupDone) return renderSetup();
    if (!$('#view')) shell();
    var r = route();
    var known = PAGES[r] && (has(r) || (r === 'prefs' && has('settings')));
    if (!known) r = homePage();
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-nav') === r); });
    $('#top-actions').innerHTML = '';
    // A fresh container per page: a slow page that finishes loading after the user has
    // moved on writes into its own detached container and cannot overwrite the new page.
    var old = $('#view');
    var view = document.createElement('main');
    view.className = 'content'; view.id = 'view';
    view.innerHTML = '<div class="muted">Loading…</div>';
    old.replaceWith(view);
    Promise.resolve(PAGES[r](view)).catch(function (e) { view.innerHTML = '<div class="banner">' + esc(e.message) + '</div>'; });
  }

  // ---------------------------------------------------------------- setup wizard
  function renderSetup() {
    var chosen = S.industry || 'generic';
    var list = Industries.list();
    var app = document.getElementById('app');
    app.innerHTML = '<div class="setup"><div class="stack"><span class="pill ink" style="justify-self:start">Step 1 of 1 · takes a minute</span>' +
      '<h1>Set up BizCore for your business</h1><p class="muted" style="max-width:62ch">Pick the type of business. BizCore then reviews your numbers the way that business should be reviewed: its departments, its key ratios and what to photograph. You can change it later in Settings.</p></div>' +
      '<div class="ind-grid">' + list.map(function (i) {
        var p = Industries.get(i.key);
        return '<button type="button" class="ind' + (i.key === chosen ? ' on' : '') + '" data-ind="' + i.key + '"><span class="e" aria-hidden="true">' + i.icon + '</span><span class="t">' + esc(i.name) + '</span>' +
          '<span class="d">' + esc(p.labels.items + ' · ' + p.labels.customers + (p.flags.expiry ? ' · expiry' : '') + (p.flags.batch ? ' · batches' : '') + (p.modules.indexOf('appointments') >= 0 ? ' · bookings' : '')) + '</span></button>';
      }).join('') + '</div>' +
      '<form id="setup-form" class="panel stack"><div class="form-grid">' +
      '<label class="field">Business name<input name="businessName" id="setup-name" required value="' + esc(S.businessName === 'My Business' ? '' : S.businessName) + '" placeholder="e.g. Sri Sai Medicals"></label>' +
      '<label class="field">Phone<input name="phone" id="setup-phone" value="' + esc(S.phone) + '"></label>' +
      '<label class="field">Currency symbol<input name="currency" id="setup-cur" value="' + esc(S.currency) + '"></label>' +
      '<label class="field wide">Address<input name="address" id="setup-addr" value="' + esc(S.address) + '"></label></div>' +
      '<label class="check"><input type="checkbox" name="loadSamples" id="setup-samples" checked> Fill in 30 days of example data so I can try it (delete any time)</label>' +
      '<div class="row"><button class="btn primary big" type="submit" style="width:auto">Start using BizCore</button>' +
      '<span class="muted">' + (api.mode === 'remote' ? 'Data is saved on your server and shared by all devices.' : (native ? 'Data is saved on this phone.' : 'Data is saved in this browser.') + ' Use Backup to move it.') + '</span></div></form>' +
      (api.mode === 'local' ? '<div class="panel row"><div style="flex:1;min-width:220px"><b>Already have a shop server?</b><div class="muted">Connect this ' + (native ? 'phone' : 'device') + ' to it to share bills and stock with your other devices.</div></div><button type="button" class="btn" id="setup-connect">Connect to shop server</button></div>' : '') +
      '</div><div class="toasts" id="toasts"></div>';
    var sc = $('#setup-connect'); if (sc) sc.onclick = connectDialog;
    var chosenMode = 'review';   // billing & stock screens can be switched on later in Settings if a client asks
    var hints = { review: 'Departments report sales, collections, expenses, purchases and wastage; you review them, scan receipts and get insights.',
      pos: 'Bills, stock, customers, dues, bookings and reports for running the counter.', both: 'Review & insights plus billing and stock.' };
    $$('[data-mode]').forEach(function (b) {
      b.onclick = function () { chosenMode = b.getAttribute('data-mode'); };
    });
    $$('[data-ind]').forEach(function (b) {
      b.onclick = function () { chosen = b.getAttribute('data-ind'); $$('[data-ind]').forEach(function (x) { x.classList.toggle('on', x === b); }); };
    });
    $('#setup-form').onsubmit = function (e) {
      e.preventDefault();
      var d = formData(e.target); d.industry = chosen; d.mode = chosenMode;
      if (!d.businessName.trim()) { toast('Please enter the business name', true); return; }
      api.call('setup', d).then(refreshInfo).then(function () { location.hash = homePage(); shell(); render(); toast('All set. Welcome!'); }).catch(fail);
    };
  }

  // ---------------------------------------------------------------- dashboard
  function barChart(days, valueKey) {
    var W = 640, H = 180, padL = 52, padB = 26, padT = 10;
    var max = Math.max.apply(null, days.map(function (d) { return d[valueKey]; }).concat([0]));
    var nice = niceMax(max);
    var bw = (W - padL - 8) / days.length;
    var g = '';
    [0, .5, 1].forEach(function (f) {
      var y = padT + (H - padT - padB) * (1 - f);
      g += '<line class="grid-line" x1="' + padL + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '"></line>' +
        '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + esc(short(nice * f)) + '</text>';
    });
    days.forEach(function (d, i) {
      var v = d[valueKey], h = nice ? (H - padT - padB) * v / nice : 0;
      var x = padL + i * bw + bw * .18, y = H - padB - h;
      g += '<rect class="bar' + (v ? '' : ' zero') + '" x="' + x.toFixed(1) + '" y="' + (v ? y : H - padB - 1).toFixed(1) + '" width="' + (bw * .64).toFixed(1) + '" height="' + (v ? Math.max(h, 1) : 1).toFixed(1) + '" rx="2"><title>' + esc(d.key || d.date) + ': ' + esc(money(v)) + '</title></rect>';
      if (days.length <= 16 || i % Math.ceil(days.length / 12) === 0) {
        g += '<text x="' + (x + bw * .32).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc((d.key || d.date).slice(8, 10)) + '</text>';
      }
    });
    return '<div class="bars"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sales by day">' + g + '</svg></div>';
  }
  function niceMax(v) { if (v <= 0) return 0; var p = Math.pow(10, Math.floor(Math.log10(v))); var n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function short(v) { return v >= 1e7 ? (v / 1e7).toFixed(1) + 'Cr' : v >= 1e5 ? (v / 1e5).toFixed(1) + 'L' : v >= 1000 ? (v / 1000).toFixed(v >= 1e4 ? 0 : 1) + 'k' : String(Math.round(v)); }

  PAGES.dashboard = function (view) {
    setTitle('Dashboard');
    return api.call('dashboard').then(function (d) {
      var tiles = [
        { l: "Today's " + label('sale').toLowerCase() + 's', v: money(d.todaySales), h: d.todayCount + (d.todayCount === 1 ? ' bill' : ' bills') + ' · profit ' + money(d.todayProfit), href: '#sales' },
        { l: 'Collected today', v: money(d.todayCollected), h: 'cash, UPI, card and dues' },
        { l: 'This month', v: money(d.monthSales), h: 'net profit ' + money(d.monthNet), href: '#reports' },
        { l: 'To collect', v: money(d.receivables), h: 'from ' + label('customers').toLowerCase(), href: '#customers', cls: d.receivables > 0 ? 'danger' : '' },
        has('suppliers') ? { l: 'To pay suppliers', v: money(d.payables), h: 'outstanding', href: '#suppliers' } : null,
        { l: 'Stock value', v: money(d.stockValue), h: d.itemCount + ' ' + label('items').toLowerCase(), href: '#items' },
        { l: 'Low stock', v: String(d.lowStockCount), h: 'at or below reorder level', href: '#items', cls: d.lowStockCount ? 'alert' : '' }
      ].filter(Boolean);
      var html = '<div class="tiles">' + tiles.map(function (t) {
        return '<a class="tile ' + (t.cls || '') + '" ' + (t.href ? 'href="' + t.href + '"' : '') + '><span class="label">' + esc(t.l) + '</span><span class="value">' + esc(t.v) + '</span><span class="hint">' + esc(t.h) + '</span></a>';
      }).join('') + '</div>';
      html += '<div class="panel"><div class="panel-head"><h2>Last 14 days</h2><span class="muted">' + esc(money(d.last14.reduce(function (a, x) { return a + x.total; }, 0))) + ' total</span></div>' + barChart(d.last14, 'total') + '</div>';
      html += '<div class="grid grid-2">';
      html += '<div class="panel"><div class="panel-head"><h2>Needs restocking</h2><a href="#items" class="btn sm">All ' + esc(label('items').toLowerCase()) + '</a></div>' +
        (d.lowStock.length ? '<div class="table-wrap"><table><thead><tr><th>' + esc(label('item')) + '</th><th class="num">In stock</th><th class="num">Reorder at</th></tr></thead><tbody>' +
          d.lowStock.map(function (i) { return '<tr><td>' + esc(i.name) + (i.batch ? ' <span class="muted mono">' + esc(i.batch) + '</span>' : '') + '</td><td class="num">' + (i.stock <= 0 ? '<span class="pill bad">' + qtyFmt(i.stock) + '</span>' : '<span class="pill warn">' + qtyFmt(i.stock) + '</span>') + '</td><td class="num">' + qtyFmt(i.reorderLevel) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : emptyState('Stock levels look fine', 'Nothing is below its reorder level.')) + '</div>';
      if (P.flags.expiry || d.expiring.length) {
        html += '<div class="panel"><div class="panel-head"><h2>Expiring soon</h2><span class="muted">next ' + S.expiryWarnDays + ' days</span></div>' +
          (d.expiring.length ? '<div class="table-wrap"><table><thead><tr><th>' + esc(label('item')) + '</th><th>Expiry</th><th class="num">Qty</th></tr></thead><tbody>' +
            d.expiring.map(function (i) { var exp = i.expiry < d.today; return '<tr><td>' + esc(i.name) + '</td><td>' + (exp ? '<span class="pill bad">Expired ' : '<span class="pill warn">') + esc(fmtDate(i.expiry)) + '</span></td><td class="num">' + qtyFmt(i.stock) + '</td></tr>'; }).join('') +
            '</tbody></table></div>' : emptyState('Nothing expiring', 'Items with an expiry date inside the warning window show here.')) + '</div>';
      }
      if (has('appointments')) {
        html += '<div class="panel"><div class="panel-head"><h2>Upcoming ' + esc((P.appointmentLabel || 'appointment').toLowerCase()) + 's</h2><a class="btn sm" href="#appointments">Open</a></div>' +
          (d.appointments.length ? '<div class="table-wrap"><table><tbody>' + d.appointments.map(function (a) {
            return '<tr><td class="mono">' + esc(a.date === d.today ? 'Today' : fmtDate(a.date)) + ' ' + esc(a.time) + '</td><td>' + esc(a.customerName) + '</td><td class="muted">' + esc(a.itemName) + '</td></tr>';
          }).join('') + '</tbody></table></div>' : emptyState('No upcoming bookings', '', '<a class="btn sm" href="#appointments">Book one</a>')) + '</div>';
      }
      html += '<div class="panel"><div class="panel-head"><h2>Recent ' + esc(label('sale').toLowerCase()) + 's</h2><a class="btn sm" href="#sales">All</a></div>' +
        (d.recentSales.length ? '<div class="table-wrap"><table><tbody>' + d.recentSales.map(function (s) {
          return '<tr class="clickable" data-sale="' + s.id + '"><td class="mono">' + esc(s.number) + '</td><td>' + esc(s.customerName) + '</td><td class="num">' + esc(money(s.total)) + '</td><td>' + statusPill(s.status) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : emptyState('No sales yet', 'Your first sale will show up here.', '<a class="btn primary sm" href="#pos">Make a sale</a>')) + '</div>';
      html += '</div>';
      if (api.mode === 'local' && !api.storageOk) html = '<div class="banner">This browser is not keeping data between visits. Download a backup from Backup & data before closing.</div>' + html;
      view.innerHTML = html;
      $$('[data-sale]', view).forEach(function (r) { r.onclick = function () { showSale(r.getAttribute('data-sale')); }; });
    });
  };

  // ---------------------------------------------------------------- POS
  var cart = { lines: [], customerId: '', staffId: '', discount: 0, method: 'Cash', paid: '', notes: '', appointmentId: '' };
  PAGES.pos = function (view) {
    setTitle('New ' + label('sale').toLowerCase());
    return Promise.all([api.call('list', 'items', { sort: 'name' }), api.call('list', 'customers', {}), api.call('list', 'staff', {})]).then(function (res) {
      var items = res[0].rows.filter(function (i) { return i.active !== false; });
      var customers = res[1].rows, staff = res[2].rows.filter(function (s) { return s.active !== false; });
      var cats = Array.from(new Set(items.map(function (i) { return i.category; }).filter(Boolean)));
      var filter = { q: '', cat: '' };
      view.innerHTML = '<div class="pos"><div class="panel stack"><div class="row"><input id="pos-search" class="search" style="max-width:none;flex:1" placeholder="Search ' + esc(label('items').toLowerCase()) + ' or scan barcode, then Enter" autocomplete="off"></div>' +
        '<div class="chips" id="pos-cats"><button type="button" class="chip on" data-cat="">All</button>' + cats.map(function (c) { return '<button type="button" class="chip" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
        '<div class="catalog" id="pos-catalog"></div></div>' +
        '<div class="panel cart" id="pos-cart"></div></div>';
      function drawCatalog() {
        var q = filter.q.toLowerCase();
        var list = items.filter(function (i) {
          return (!filter.cat || i.category === filter.cat) && (!q || [i.name, i.sku, i.barcode, i.batch].concat(Object.values(i.custom || {})).join(' ').toLowerCase().indexOf(q) >= 0);
        }).slice(0, 120);
        $('#pos-catalog').innerHTML = list.length ? list.map(function (i) {
          var out = i.trackStock && i.stock <= 0;
          return '<button type="button" class="prod' + (out ? ' out' : '') + '" data-add="' + i.id + '"><span class="n">' + esc(i.name) + '</span><span class="p">' + esc(money(i.price)) + '</span>' +
            '<span class="s">' + (i.isService ? 'service' : (out ? 'out of stock' : qtyFmt(i.stock) + ' ' + esc(i.unit))) + (i.batch ? ' · ' + esc(i.batch) : '') + (i.expiry ? ' · exp ' + esc(i.expiry.slice(0, 7)) : '') + '</span></button>';
        }).join('') : emptyState('Nothing found', items.length ? 'Try another search.' : 'Add your ' + label('items').toLowerCase() + ' first.', '<a class="btn sm" href="#items">Go to ' + esc(label('items')) + '</a>');
        $$('[data-add]', view).forEach(function (b) { b.onclick = function () { add(b.getAttribute('data-add')); }; });
      }
      function add(id) {
        var it = items.filter(function (i) { return i.id === id; })[0]; if (!it) return;
        var ex = cart.lines.filter(function (l) { return l.itemId === id; })[0];
        if (ex) ex.qty = Number(ex.qty) + 1; else cart.lines.push({ itemId: id, name: it.name, qty: 1, price: it.price, discount: 0, stock: it.stock, trackStock: it.trackStock, unit: it.unit });
        drawCart();
      }
      function drawCart() {
        var custOpts = customers.map(function (c) { return { value: c.id, text: c.name + (c.phone ? ' · ' + c.phone : '') + (c.balance > 0 ? ' (due ' + money(c.balance) + ')' : '') }; });
        var el = $('#pos-cart');
        el.innerHTML = '<div class="panel-head"><h2>' + esc(label('sale')) + '</h2>' + (cart.lines.length ? '<button type="button" class="btn sm ghost" id="cart-clear">Clear</button>' : '') + '</div>' +
          (cart.lines.length ? '<div>' + cart.lines.map(function (l, idx) {
            var warn = l.trackStock && Number(l.qty) > l.stock;
            return '<div class="cart-line"><div class="nm">' + esc(l.name) + '<div class="sub">' + esc(money(l.price)) + ' / ' + esc(l.unit) + (warn ? ' · <span style="color:var(--bad)">only ' + qtyFmt(l.stock) + ' left</span>' : '') + '</div></div>' +
              '<input type="number" step="any" min="0" value="' + esc(l.qty) + '" data-qty="' + idx + '" aria-label="Quantity">' +
              '<input type="number" step="any" min="0" value="' + esc(l.price) + '" data-price="' + idx + '" aria-label="Price">' +
              '<button type="button" class="btn ghost sm" data-del="' + idx + '" aria-label="Remove">✕</button></div>';
          }).join('') + '</div>' : emptyState('No items yet', 'Tap a ' + label('item').toLowerCase() + ' or scan a barcode.')) +
          '<div class="form-grid" style="margin-top:12px">' +
          '<label class="field">' + esc(label('customer')) + '<select id="cart-cust"><option value="">Walk-in</option>' + opt(custOpts, cart.customerId) + '</select></label>' +
          (has('staff') && staff.length ? '<label class="field">Served by<select id="cart-staff">' + opt(staff.map(function (s) { return { value: s.id, text: s.name }; }), cart.staffId, '—') + '</select></label>' : '') +
          '<label class="field">Bill discount<input type="number" step="any" min="0" id="cart-disc" value="' + esc(cart.discount || '') + '" placeholder="0"></label>' +
          '<label class="field">Payment<select id="cart-method">' + opt(INFO.paymentMethods, cart.method) + '</select></label>' +
          '<label class="field">Amount received<input type="number" step="any" min="0" id="cart-paid" value="' + esc(cart.paid) + '" placeholder="Full amount"></label>' +
          '</div><div class="row" style="margin-top:6px"><button type="button" class="btn sm ghost" id="cart-newcust">＋ New ' + esc(label('customer').toLowerCase()) + '</button></div>' +
          '<div class="totals" id="cart-totals"></div>' +
          '<button type="button" class="btn primary big" id="cart-go" style="margin-top:12px"' + (cart.lines.length ? '' : ' disabled') + '>Complete ' + esc(label('sale').toLowerCase()) + '</button>';
        $$('[data-qty]', el).forEach(function (i) { i.oninput = function () { cart.lines[+i.dataset.qty].qty = i.value; updateTotals(); }; i.onchange = drawCart; });
        $$('[data-price]', el).forEach(function (i) { i.oninput = function () { cart.lines[+i.dataset.price].price = i.value; updateTotals(); }; });
        $$('[data-del]', el).forEach(function (b) { b.onclick = function () { cart.lines.splice(+b.dataset.del, 1); drawCart(); }; });
        var cc = $('#cart-clear', el); if (cc) cc.onclick = function () { resetCart(); drawCart(); };
        $('#cart-cust', el).onchange = function (e) { cart.customerId = e.target.value; };
        var st = $('#cart-staff', el); if (st) st.onchange = function (e) { cart.staffId = e.target.value; };
        $('#cart-disc', el).oninput = function (e) { cart.discount = e.target.value; updateTotals(); };
        $('#cart-method', el).onchange = function (e) { cart.method = e.target.value; if (cart.method === 'Credit') { cart.paid = '0'; $('#cart-paid', el).value = '0'; updateTotals(); } };
        $('#cart-paid', el).oninput = function (e) { cart.paid = e.target.value; updateTotals(); };
        $('#cart-newcust', el).onclick = function () { editParty('customers', null, function (c) { customers.push(c); cart.customerId = c.id; drawCart(); }); };
        $('#cart-go', el).onclick = checkout;
        updateTotals();
      }
      var updateTotals = debounce(function () {
        var box = $('#cart-totals'); if (!box) return;
        if (!cart.lines.length) { box.innerHTML = ''; return; }
        api.call('quote', { lines: cart.lines, discount: cart.discount }).then(function (q) {
          if (!document.body.contains(box)) return;
          var paid = cart.paid === '' ? q.total : Number(cart.paid);
          var rows = '<div><span>Subtotal</span><span>' + esc(money(q.subtotal)) + '</span></div>' +
            (q.billDiscount ? '<div><span>Discount</span><span>−' + esc(money(q.billDiscount)) + '</span></div>' : '') +
            '<div><span>' + esc(S.taxLabel || 'Tax') + (S.taxInclusive ? ' (included)' : '') + '</span><span>' + esc(money(q.tax)) + '</span></div>' +
            '<div class="grand"><span>Total</span><span>' + esc(money(q.total)) + '</span></div>';
          if (paid > q.total) rows += '<div><span>Change to return</span><b>' + esc(money(paid - q.total)) + '</b></div>';
          else if (paid < q.total) rows += '<div style="color:var(--bad)"><span>Due (credit)</span><b>' + esc(money(q.total - paid)) + '</b></div>';
          box.innerHTML = rows;
        }).catch(function () { });
      }, 120);
      function resetCart() { cart = { lines: [], customerId: '', staffId: '', discount: 0, method: 'Cash', paid: '', notes: '', appointmentId: '' }; }
      function checkout() {
        var payload = { lines: cart.lines.map(function (l) { return { itemId: l.itemId, qty: l.qty, price: l.price, discount: l.discount }; }),
          customerId: cart.customerId, staffId: cart.staffId, discount: cart.discount, method: cart.method, paid: cart.paid };
        api.call('createSale', payload).then(function (sale) {
          resetCart();
          toast(label('sale') + ' ' + sale.number + ' saved');
          showSale(sale.id, true);
          PAGES.pos(view);
        }).catch(fail);
      }
      var search = $('#pos-search');
      search.oninput = debounce(function () { filter.q = search.value; drawCatalog(); }, 100);
      search.onkeydown = function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var code = search.value.trim(); if (!code) return;
        var exact = items.filter(function (i) { return (i.barcode && i.barcode === code) || (i.sku && i.sku.toLowerCase() === code.toLowerCase()); })[0];
        var hits = exact ? [exact] : items.filter(function (i) { return i.name.toLowerCase().indexOf(code.toLowerCase()) >= 0; });
        if (hits.length === 1 || exact) { add(hits[0].id); search.value = ''; filter.q = ''; drawCatalog(); }
        else if (!hits.length) toast('No ' + label('item').toLowerCase() + ' matches "' + code + '"', true);
      };
      $$('[data-cat]', view).forEach(function (b) { b.onclick = function () { filter.cat = b.dataset.cat; $$('[data-cat]', view).forEach(function (x) { x.classList.toggle('on', x === b); }); drawCatalog(); }; });
      drawCatalog(); drawCart();
      setTimeout(function () { search.focus(); }, 50);
    });
  };

  // ---------------------------------------------------------------- receipt / sale view
  function receiptHTML(s) {
    return '<div class="receipt" id="print-area"><h3>' + esc(S.businessName) + '</h3>' +
      '<div class="c">' + esc([S.address, S.phone].filter(Boolean).join(' · ')) + (S.taxId ? '<br>' + esc(S.taxLabel || 'Tax') + ' No: ' + esc(S.taxId) : '') + '</div><hr>' +
      '<div>' + esc(label('sale')) + ': <b>' + esc(s.number) + '</b><span style="float:right">' + esc(fmtDate(s.date)) + '</span></div>' +
      '<div>' + esc(label('customer')) + ': ' + esc(s.customerName) + (s.customerPhone ? ' · ' + esc(s.customerPhone) : '') + '</div><hr>' +
      '<table><thead><tr><th style="text-align:left">Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amt</th></tr></thead><tbody>' +
      s.lines.map(function (l) { return '<tr><td>' + esc(l.name) + (l.batch ? ' <small>(' + esc(l.batch) + ')</small>' : '') + '</td><td class="r">' + qtyFmt(l.qty) + '</td><td class="r">' + esc(l.price.toFixed(2)) + '</td><td class="r">' + esc(l.total.toFixed(2)) + '</td></tr>'; }).join('') +
      '</tbody></table><hr><table><tbody>' +
      '<tr><td>Subtotal</td><td class="r">' + esc(money(s.subtotal)) + '</td></tr>' +
      (s.lineDiscount + s.billDiscount ? '<tr><td>Discount</td><td class="r">−' + esc(money(s.lineDiscount + s.billDiscount)) + '</td></tr>' : '') +
      '<tr><td>' + esc(S.taxLabel || 'Tax') + '</td><td class="r">' + esc(money(s.tax)) + '</td></tr>' +
      '<tr><td><b>Total</b></td><td class="r"><b>' + esc(money(s.total)) + '</b></td></tr>' +
      '<tr><td>Paid (' + esc(s.method) + ')</td><td class="r">' + esc(money(s.paid)) + '</td></tr>' +
      (s.due ? '<tr><td>Balance due</td><td class="r">' + esc(money(s.due)) + '</td></tr>' : '') +
      (s.change ? '<tr><td>Change</td><td class="r">' + esc(money(s.change)) + '</td></tr>' : '') +
      '</tbody></table>' + (s.status === 'void' ? '<hr><div class="c"><b>CANCELLED</b></div>' : '') +
      '<hr><div class="c">' + esc(S.receiptFooter || '') + '</div></div>';
  }
  function saleText(s) {
    var t = '*' + S.businessName + '*\n' + label('sale') + ' ' + s.number + ' · ' + fmtDate(s.date) + '\n\n';
    s.lines.forEach(function (l) { t += '• ' + l.name + ' × ' + qtyFmt(l.qty) + ' = ' + money(l.total) + '\n'; });
    t += '\nTotal: *' + money(s.total) + '*';
    if (s.due) t += '\nBalance due: ' + money(s.due);
    if (S.receiptFooter) t += '\n\n' + S.receiptFooter;
    return t;
  }
  function showSale(id, fresh) {
    api.call('get', 'sales', id).then(function (s) {
      if (!s) return toast('Not found', true);
      var foot = '';
      if (!embedded && !native) foot += '<button type="button" class="btn" id="rc-print">Print</button>';
      foot += '<a class="btn" target="_blank" rel="noopener" href="' + esc(waLink(s.customerPhone, saleText(s))) + '">WhatsApp</a>';
      foot += '<button type="button" class="btn" id="rc-copy">Copy text</button>';
      if (s.status !== 'void') foot += '<button type="button" class="btn danger" id="rc-void">Cancel ' + esc(label('sale').toLowerCase()) + '</button>';
      modal({ title: (fresh ? 'Saved · ' : '') + label('sale') + ' ' + s.number, body: receiptHTML(s), submitText: fresh ? 'New ' + label('sale').toLowerCase() : null, cancelText: 'Close', extraFoot: foot,
        onSubmit: function () { $('#pos-search') && $('#pos-search').focus(); },
        onOpen: function (f, close) {
          var pr = $('#rc-print', f); if (pr) pr.onclick = function () { window.print(); };
          $('#rc-copy', f).onclick = function () {
            (navigator.clipboard ? navigator.clipboard.writeText(saleText(s)) : Promise.reject()).then(function () { toast('Copied'); }).catch(function () { toast('Copy is blocked here', true); });
          };
          var v = $('#rc-void', f);
          if (v) v.onclick = function () {
            close();
            confirmBox('Cancel ' + s.number + '? Stock goes back and any payment is recorded as refunded.', 'Cancel it', true).then(function (ok) {
              if (!ok) return;
              api.call('voidSale', s.id, 'Cancelled by user').then(function () { toast(s.number + ' cancelled'); render(); }).catch(fail);
            });
          };
        } });
    }).catch(fail);
  }

  // ---------------------------------------------------------------- generic list page helper
  function listPage(view, cfg) {
    var state = { search: '', filter: cfg.defaultFilter || '', from: cfg.dates ? cfg.from || '' : '', to: '' };
    view.innerHTML = '<div class="panel"><div class="panel-head"><input class="search" id="lp-search" placeholder="Search…" autocomplete="off">' +
      (cfg.filters ? '<div class="chips" id="lp-filters">' + cfg.filters.map(function (f) { return '<button type="button" class="chip' + (f.key === state.filter ? ' on' : '') + '" data-f="' + f.key + '">' + esc(f.text) + '</button>'; }).join('') + '</div>' : '') +
      (cfg.dates ? '<div class="row"><input type="date" id="lp-from" style="width:auto" aria-label="From"><input type="date" id="lp-to" style="width:auto" aria-label="To"></div>' : '') +
      '<span class="spacer"></span>' + (cfg.actions || '') + '</div><div id="lp-summary"></div><div class="table-wrap" id="lp-table"></div></div>';
    function load() {
      var q = { search: state.search, filter: state.filter, from: state.from, to: state.to, sort: cfg.sort };
      if (cfg.statusFilter && state.filter) { q.status = state.filter; delete q.filter; }
      return api.call('list', cfg.col, q).then(function (res) {
        var rows = res.rows;
        if (!$('#lp-table', view)) return; // user moved to another page meanwhile
        if (cfg.summary) $('#lp-summary', view).innerHTML = cfg.summary(rows);
        $('#lp-table', view).innerHTML = rows.length ? '<table><thead><tr>' + cfg.columns.map(function (c) { return '<th class="' + (c.num ? 'num' : '') + '">' + esc(c.title) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
          rows.slice(0, 500).map(function (r) {
            return '<tr class="' + (cfg.onRow ? 'clickable' : '') + '" data-id="' + r.id + '">' + cfg.columns.map(function (c) { return '<td class="' + (c.num ? 'num' : '') + '">' + c.cell(r) + '</td>'; }).join('') +
              '<td class="actions">' + (cfg.rowActions ? cfg.rowActions(r) : '') + '</td></tr>';
          }).join('') + '</tbody></table>' + (rows.length > 500 ? '<p class="muted">Showing first 500 of ' + rows.length + '. Use search to narrow.</p>' : '')
          : emptyState(cfg.emptyTitle || 'Nothing here yet', state.search || state.filter ? 'Try clearing the search or filter.' : (cfg.emptyHint || ''), cfg.emptyAction || '');
        $$('[data-proxy]', view).forEach(function (b) { b.onclick = function () { var t = document.getElementById(b.dataset.proxy); if (t) t.click(); }; });
        $$('tr[data-id]', view).forEach(function (tr) {
          if (cfg.onRow) tr.onclick = function (e) { if (e.target.closest('button,a')) return; cfg.onRow(rows.filter(function (r) { return r.id === tr.dataset.id; })[0]); };
        });
        $$('[data-act]', view).forEach(function (b) {
          b.onclick = function (e) { e.stopPropagation(); var r = rows.filter(function (x) { return x.id === b.closest('tr').dataset.id; })[0]; cfg.onAction(b.dataset.act, r, load); };
        });
        if (cfg.afterLoad) cfg.afterLoad(rows, load);
      });
    }
    $('#lp-search', view).oninput = debounce(function (e) { state.search = e.target.value; load(); }, 200);
    $$('[data-f]', view).forEach(function (b) { b.onclick = function () { state.filter = b.dataset.f; $$('[data-f]', view).forEach(function (x) { x.classList.toggle('on', x === b); }); load(); }; });
    if (cfg.dates) {
      $('#lp-from', view).value = state.from;
      $('#lp-from', view).onchange = function (e) { state.from = e.target.value; load(); };
      $('#lp-to', view).onchange = function (e) { state.to = e.target.value; load(); };
    }
    if (cfg.bind) cfg.bind(view, load);
    return load();
  }

  // ---------------------------------------------------------------- sales list
  PAGES.sales = function (view) {
    setTitle(label('sale') + 's');
    return listPage(view, {
      col: 'sales', dates: true, statusFilter: true,
      filters: [{ key: '', text: 'All' }, { key: 'paid', text: 'Paid' }, { key: 'partial', text: 'Part paid' }, { key: 'unpaid', text: 'Unpaid' }, { key: 'void', text: 'Cancelled' }],
      actions: '<button type="button" class="btn" id="sales-csv">Export CSV</button>',
      bind: function (v) { $('#sales-csv', v).onclick = function () { exportCSV('sales'); }; },
      summary: function (rows) {
        var live = rows.filter(function (r) { return r.status !== 'void'; });
        var t = live.reduce(function (a, r) { return a + r.total; }, 0), d = live.reduce(function (a, r) { return a + r.due; }, 0);
        return '<p class="muted">' + live.length + (live.length === 1 ? ' bill' : ' bills') + ' · ' + esc(money(t)) + (d ? ' · ' + esc(money(d)) + ' due' : '') + '</p>';
      },
      columns: [
        { title: 'No.', cell: function (r) { return '<span class="mono">' + esc(r.number) + '</span>'; } },
        { title: 'Date', cell: function (r) { return esc(fmtDate(r.date)); } },
        { title: label('customer'), cell: function (r) { return esc(r.customerName); } },
        { title: 'Items', num: true, cell: function (r) { return r.lines.length; } },
        { title: 'Total', num: true, cell: function (r) { return esc(money(r.total)); } },
        { title: 'Due', num: true, cell: function (r) { return r.due ? '<span style="color:var(--bad)">' + esc(money(r.due)) + '</span>' : '—'; } },
        { title: 'Status', cell: function (r) { return statusPill(r.status); } }
      ],
      onRow: function (r) { showSale(r.id); },
      emptyTitle: 'No ' + label('sale').toLowerCase() + 's in this period', emptyAction: '<a class="btn primary sm" href="#pos">New ' + esc(label('sale').toLowerCase()) + '</a>'
    });
  };

  // ---------------------------------------------------------------- items
  function itemForm(it) {
    it = it || { isService: false, custom: {} };
    var f = P.flags;
    var cats = Array.from(new Set(P.categories.concat(it.category ? [it.category] : [])));
    var html = '<div class="form-grid">' +
      '<label class="field wide">Name<input name="name" id="it-name" required value="' + esc(it.name) + '"></label>' +
      (f.services ? '<label class="field">Type<select name="isService" id="it-type"><option value="">Product (has stock)</option><option value="1"' + (it.isService ? ' selected' : '') + '>Service (no stock)</option></select></label>' : '') +
      '<label class="field">Category<input name="category" id="it-cat" list="cat-list" value="' + esc(it.category) + '"><datalist id="cat-list">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></label>' +
      '<label class="field">Selling price<input name="price" id="it-price" type="number" step="any" min="0" value="' + esc(it.price) + '"></label>' +
      '<label class="field">Cost price<input name="cost" id="it-cost" type="number" step="any" min="0" value="' + esc(it.cost) + '"></label>' +
      '<label class="field">' + esc(S.taxLabel || 'Tax') + ' %<input name="taxRate" id="it-tax" type="number" step="any" min="0" placeholder="Default ' + esc(S.taxRate) + '" value="' + esc(it.taxRate === null || it.taxRate === undefined ? '' : it.taxRate) + '"></label>' +
      '<label class="field" data-stockonly>Unit<input name="unit" id="it-unit" list="unit-list" value="' + esc(it.unit || P.units[0]) + '"><datalist id="unit-list">' + P.units.map(function (u) { return '<option value="' + esc(u) + '">'; }).join('') + '</datalist></label>' +
      '<label class="field" data-stockonly>' + (it.id ? 'Stock now' : 'Opening stock') + '<input name="stock" id="it-stock" type="number" step="any" value="' + esc(it.id ? it.stock : '') + '"></label>' +
      '<label class="field" data-stockonly>Reorder level<input name="reorderLevel" id="it-reorder" type="number" step="any" min="0" value="' + esc(it.reorderLevel === undefined ? S.lowStockDefault : it.reorderLevel) + '"></label>' +
      (f.batch ? '<label class="field" data-stockonly>Batch<input name="batch" id="it-batch" value="' + esc(it.batch) + '"></label>' : '') +
      (f.expiry ? '<label class="field" data-stockonly>Expiry date<input name="expiry" id="it-expiry" type="date" value="' + esc(it.expiry) + '"></label>' : '') +
      (f.services ? '<label class="field" data-serviceonly>Duration (minutes)<input name="durationMin" id="it-dur" type="number" min="0" value="' + esc(it.durationMin || '') + '"></label>' : '') +
      '<label class="field">Barcode<input name="barcode" id="it-barcode" value="' + esc(it.barcode) + '"></label>' +
      '<label class="field">SKU / code<input name="sku" id="it-sku" value="' + esc(it.sku) + '"></label>' +
      P.itemFields.map(function (fd) {
        var v = (it.custom || {})[fd.key];
        var id = 'it-c-' + fd.key;
        if (fd.type === 'checkbox') return '<label class="check"><input type="checkbox" name="custom.' + fd.key + '" id="' + id + '"' + (v ? ' checked' : '') + '> ' + esc(fd.label) + '</label>';
        if (fd.type === 'select') return '<label class="field">' + esc(fd.label) + '<select name="custom.' + fd.key + '" id="' + id + '">' + opt(fd.options, v, '—') + '</select></label>';
        return '<label class="field">' + esc(fd.label) + '<input name="custom.' + fd.key + '" id="' + id + '" type="' + (fd.type === 'number' ? 'number' : fd.type === 'date' ? 'date' : 'text') + '" step="any" value="' + esc(v) + '"></label>';
      }).join('') + '</div>';
    return html;
  }
  function editItem(it, after) {
    modal({ title: it ? 'Edit ' + label('item').toLowerCase() : 'New ' + label('item').toLowerCase(), body: itemForm(it), wide: true,
      onOpen: function (f) {
        var type = $('#it-type', f);
        function sync() { var svc = type && type.value === '1'; $$('[data-stockonly]', f).forEach(function (e) { e.hidden = svc && !e.querySelector('#it-unit'); }); $$('[data-serviceonly]', f).forEach(function (e) { e.hidden = !svc; }); }
        if (type) type.onchange = sync; sync();
      },
      onSubmit: function (d) {
        d.isService = d.isService === '1';
        if (it) d.id = it.id;
        if (it && String(d.stock) === String(it.stock)) delete d.stock;
        return api.call('save', 'items', d).then(function (saved) { toast('Saved ' + saved.name); if (after) after(saved); });
      } });
  }
  function adjustItem(it, after) {
    modal({ title: 'Adjust stock · ' + it.name, body: '<p class="muted">Now in stock: <b>' + qtyFmt(it.stock) + ' ' + esc(it.unit) + '</b></p><div class="form-grid">' +
      '<label class="field">Change<select name="mode" id="adj-mode"><option value="add">Add (+) / remove (−)</option><option value="set">Set exact count</option></select></label>' +
      '<label class="field">Quantity<input name="qty" id="adj-qty" type="number" step="any" required placeholder="e.g. -2 for damaged"></label>' +
      '<label class="field">Reason<select name="reason" id="adj-reason">' + opt(['adjust', 'damaged', 'expired', 'returned', 'stock count', 'own use', 'opening']) + '</select></label>' +
      '<label class="field wide">Note<input name="note" id="adj-note"></label></div>',
      onSubmit: function (d) { d.itemId = it.id; return api.call('adjustStock', d).then(function (r) { toast('Stock now ' + qtyFmt(r.stock)); if (after) after(); }); } });
  }
  function itemHistory(it) {
    api.call('list', 'stockMoves', { itemId: it.id }).then(function (res) {
      modal({ title: 'Stock history · ' + it.name, wide: true, submitText: null, cancelText: 'Close',
        body: res.rows.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Reason</th><th>Ref</th><th class="num">Change</th><th class="num">Balance</th></tr></thead><tbody>' +
          res.rows.map(function (m) { return '<tr><td>' + esc(fmtDate(m.date)) + '</td><td>' + esc(m.reason) + '</td><td class="muted">' + esc(m.note) + '</td><td class="num" style="color:' + (m.qty < 0 ? 'var(--bad)' : 'var(--good)') + '">' + (m.qty > 0 ? '+' : '') + qtyFmt(m.qty) + '</td><td class="num">' + qtyFmt(m.balance) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : emptyState('No stock movement yet') });
    }).catch(fail);
  }
  PAGES.items = function (view) {
    setTitle(label('items'));
    var filters = [{ key: '', text: 'All' }, { key: 'low', text: 'Low stock' }, { key: 'out', text: 'Out of stock' }];
    if (P.flags.expiry) filters.push({ key: 'expiring', text: 'Expiring' }, { key: 'expired', text: 'Expired' });
    if (P.flags.services) filters.push({ key: 'products', text: 'Products' }, { key: 'services', text: 'Services' });
    var cols = [
      { title: label('item'), cell: function (r) { return '<b>' + esc(r.name) + '</b>' + (r.active === false ? ' <span class="pill">inactive</span>' : '') + (r.isService ? ' <span class="pill ink">service</span>' : '') + '<div class="muted" style="font-size:12px">' + esc([r.category, r.sku, r.barcode].filter(Boolean).join(' · ')) + '</div>'; } }
    ];
    if (P.flags.batch) cols.push({ title: 'Batch', cell: function (r) { return '<span class="mono">' + esc(r.batch) + '</span>'; } });
    if (P.flags.expiry) cols.push({ title: 'Expiry', cell: function (r) {
      if (!r.expiry) return ''; var t = today(); var warn = Engine.addDays(t, S.expiryWarnDays);
      return '<span class="pill ' + (r.expiry < t ? 'bad' : r.expiry <= warn ? 'warn' : '') + '">' + esc(r.expiry.slice(0, 7)) + '</span>';
    } });
    cols.push(
      { title: 'Stock', num: true, cell: function (r) { return r.trackStock ? '<span class="pill ' + (r.stock <= 0 ? 'bad' : r.stock <= r.reorderLevel ? 'warn' : 'good') + '">' + qtyFmt(r.stock) + ' ' + esc(r.unit) + '</span>' : '—'; } },
      { title: 'Price', num: true, cell: function (r) { return esc(money(r.price)); } },
      { title: 'Cost', num: true, cell: function (r) { return '<span class="muted">' + esc(money(r.cost)) + '</span>'; } }
    );
    return listPage(view, {
      col: 'items', filters: filters, columns: cols,
      actions: '<button type="button" class="btn" id="it-import">Import CSV</button><button type="button" class="btn primary" id="it-new">＋ Add ' + esc(label('item').toLowerCase()) + '</button>',
      bind: function (v, load) { $('#it-new', v).onclick = function () { editItem(null, load); }; $('#it-import', v).onclick = function () { importCSVDialog('items', load); }; },
      rowActions: function (r) { return (r.trackStock ? '<button type="button" class="btn sm" data-act="adjust">Stock</button> <button type="button" class="btn sm ghost" data-act="history">History</button> ' : '') + '<button type="button" class="btn sm ghost" data-act="delete" aria-label="Delete">✕</button>'; },
      onRow: function (r) { editItem(r, function () { render(); }); },
      onAction: function (act, r, load) {
        if (act === 'adjust') adjustItem(r, load);
        if (act === 'history') itemHistory(r);
        if (act === 'delete') confirmBox('Delete ' + r.name + '? Items with past bills are only hidden so your history stays correct.', 'Delete', true).then(function (ok) {
          if (ok) api.call('remove', 'items', r.id).then(function (x) { toast(x.deactivated ? 'Marked inactive' : 'Deleted'); load(); }).catch(fail);
        });
      },
      emptyTitle: 'No ' + label('items').toLowerCase() + ' yet', emptyHint: 'Add them one by one, import a CSV, or record a purchase.',
      emptyAction: '<button type="button" class="btn primary sm" data-proxy="it-new">Add ' + esc(label('item').toLowerCase()) + '</button>'
    });
  };

  // ---------------------------------------------------------------- customers & suppliers
  function editParty(col, p, after) {
    var single = col === 'customers' ? label('customer') : 'Supplier';
    modal({ title: (p ? 'Edit ' : 'New ') + single.toLowerCase(), body: '<div class="form-grid">' +
      '<label class="field">Name<input name="name" id="pt-name" required value="' + esc(p && p.name) + '"></label>' +
      '<label class="field">Phone<input name="phone" id="pt-phone" type="tel" value="' + esc(p && p.phone) + '"></label>' +
      '<label class="field">Email<input name="email" id="pt-email" type="email" value="' + esc(p && p.email) + '"></label>' +
      '<label class="field">' + esc(S.taxLabel || 'Tax') + ' number<input name="taxId" id="pt-tax" value="' + esc(p && p.taxId) + '"></label>' +
      '<label class="field wide">Address<input name="address" id="pt-addr" value="' + esc(p && p.address) + '"></label>' +
      (p ? '' : '<label class="field">Opening balance ' + (col === 'customers' ? '(they owe you)' : '(you owe them)') + '<input name="openingBalance" id="pt-open" type="number" step="any" placeholder="0"></label>') +
      '<label class="field wide">Notes<input name="notes" id="pt-notes" value="' + esc(p && p.notes) + '"></label></div>',
      onSubmit: function (d) { if (p) d.id = p.id; return api.call('save', col, d).then(function (s) { toast('Saved ' + s.name); if (after) after(s); }); } });
  }
  function payDialog(col, p, after) {
    var isCust = col === 'customers';
    modal({ title: (isCust ? 'Receive payment from ' : 'Pay ') + p.name, body: '<p>Outstanding: <b>' + esc(money(p.balance)) + '</b></p><div class="form-grid">' +
      '<label class="field">Amount<input name="amount" id="pay-amt" type="number" step="any" min="0" value="' + esc(Math.max(0, p.balance)) + '"></label>' +
      '<label class="field">Method<select name="method" id="pay-method">' + opt(INFO.paymentMethods.filter(function (m) { return m !== 'Credit'; })) + '</select></label>' +
      '<label class="field">Date<input name="date" id="pay-date" type="date" value="' + today() + '"></label>' +
      '<label class="field wide">Note<input name="note" id="pay-note"></label></div>', submitText: isCust ? 'Record receipt' : 'Record payment',
      onSubmit: function (d) { d.partyType = isCust ? 'customer' : 'supplier'; d.partyId = p.id; return api.call('recordPayment', d).then(function () { toast('Payment recorded'); if (after) after(); }); } });
  }
  function ledgerDialog(col, p) {
    var type = col === 'customers' ? 'customer' : 'supplier';
    api.call('ledger', type, p.id).then(function (l) {
      var entries = l.docs.map(function (d) { return { date: d.date, at: d.at, what: (type === 'customer' ? label('sale') : 'Purchase') + ' ' + d.number + (d.status === 'void' ? ' (cancelled)' : ''), amt: d.status === 'void' ? 0 : d.total, paid: 0, id: d.id }; })
        .concat(l.payments.map(function (x) { return { date: x.date, at: x.at, what: x.method + ' · ' + x.note, amt: 0, paid: x.direction === (type === 'customer' ? 'in' : 'out') ? x.amount : -x.amount }; }))
        .sort(function (a, b) { return b.at.localeCompare(a.at); });
      var remind = type === 'customer' && p.phone && p.balance > 0 ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(waLink(p.phone, 'Dear ' + p.name + ', a balance of ' + money(p.balance) + ' is pending at ' + S.businessName + '. Kindly pay at your convenience. Thank you.')) + '">Send WhatsApp reminder</a>' : '';
      modal({ title: p.name, wide: true, submitText: null, cancelText: 'Close', extraFoot: remind,
        body: '<div class="tiles"><div class="tile"><span class="label">Balance</span><span class="value">' + esc(money(l.party.balance)) + '</span></div>' +
          (type === 'customer' ? '<div class="tile"><span class="label">Total spent</span><span class="value">' + esc(money(l.party.totalSpent || 0)) + '</span></div><div class="tile"><span class="label">Points</span><span class="value">' + (l.party.points || 0) + '</span></div>' : '') +
          '</div><div class="muted">' + esc([p.phone, p.email, p.address].filter(Boolean).join(' · ')) + '</div>' +
          (entries.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Entry</th><th class="num">Billed</th><th class="num">Paid</th></tr></thead><tbody>' +
            entries.map(function (e) { return '<tr><td>' + esc(fmtDate(e.date)) + '</td><td>' + esc(e.what) + '</td><td class="num">' + (e.amt ? esc(money(e.amt)) : '') + '</td><td class="num">' + (e.paid ? esc(money(e.paid)) : '') + '</td></tr>'; }).join('') +
            '</tbody></table></div>' : emptyState('No transactions yet')) });
    }).catch(fail);
  }
  function partyPage(view, col) {
    var isCust = col === 'customers';
    setTitle(isCust ? label('customers') : 'Suppliers');
    return listPage(view, {
      col: col, filters: [{ key: '', text: 'All' }, { key: 'due', text: isCust ? 'Owe you' : 'You owe' }],
      actions: '<button type="button" class="btn" id="pt-import">Import CSV</button><button type="button" class="btn primary" id="pt-new">＋ Add</button>',
      bind: function (v, load) { $('#pt-new', v).onclick = function () { editParty(col, null, load); }; $('#pt-import', v).onclick = function () { importCSVDialog(col, load); }; },
      summary: function (rows) { var t = rows.reduce(function (a, r) { return a + Math.max(0, r.balance); }, 0); return t ? '<p class="muted">Outstanding: <b>' + esc(money(t)) + '</b></p>' : ''; },
      columns: [
        { title: 'Name', cell: function (r) { return '<b>' + esc(r.name) + '</b>'; } },
        { title: 'Phone', cell: function (r) { return esc(r.phone); } },
        isCust ? { title: 'Last visit', cell: function (r) { return esc(fmtDate(r.lastVisit)); } } : { title: 'Address', cell: function (r) { return esc(r.address); } },
        { title: 'Balance', num: true, cell: function (r) { return r.balance > 0 ? '<span class="pill bad">' + esc(money(r.balance)) + '</span>' : r.balance < 0 ? '<span class="pill good">' + esc(money(-r.balance)) + ' adv</span>' : '—'; } }
      ],
      rowActions: function (r) { return (r.balance > 0 ? '<button type="button" class="btn sm" data-act="pay">' + (isCust ? 'Receive' : 'Pay') + '</button> ' : '') + '<button type="button" class="btn sm ghost" data-act="edit">Edit</button><button type="button" class="btn sm ghost" data-act="delete" aria-label="Delete">✕</button>'; },
      onRow: function (r) { ledgerDialog(col, r); },
      onAction: function (act, r, load) {
        if (act === 'pay') payDialog(col, r, load);
        if (act === 'edit') editParty(col, r, load);
        if (act === 'delete') confirmBox('Delete ' + r.name + '?', 'Delete', true).then(function (ok) { if (ok) api.call('remove', col, r.id).then(function () { toast('Deleted'); load(); }).catch(fail); });
      },
      emptyTitle: isCust ? 'No ' + label('customers').toLowerCase() + ' yet' : 'No suppliers yet', emptyHint: 'Add them to track dues and history.'
    });
  }
  PAGES.customers = function (v) { return partyPage(v, 'customers'); };
  PAGES.suppliers = function (v) { return partyPage(v, 'suppliers'); };

  // ---------------------------------------------------------------- purchases
  function purchaseDialog(after) {
    Promise.all([api.call('list', 'suppliers', {}), api.call('list', 'items', { filter: 'products' })]).then(function (res) {
      var sups = res[0].rows, items = res[1].rows.filter(function (i) { return i.active !== false; });
      var f = P.flags;
      var lines = [];
      var hdr = '<th>' + esc(label('item')) + '</th><th>Qty</th><th>Free</th><th>Cost</th><th>Sell price</th>' + (f.batch ? '<th>Batch</th>' : '') + (f.expiry ? '<th>Expiry</th>' : '') + '<th>Tax %</th><th></th>';
      var m = modal({ title: 'Record purchase (stock in)', wide: true, submitText: 'Save purchase',
        body: '<div class="form-grid"><label class="field">Supplier<select name="supplierId" id="pu-sup">' + opt(sups.map(function (s) { return { value: s.id, text: s.name }; }), '', '— cash purchase —') + '</select></label>' +
          '<label class="field">Supplier bill no.<input name="billNo" id="pu-bill"></label><label class="field">Date<input type="date" name="date" id="pu-date" value="' + today() + '"></label>' +
          '<label class="field">Amount paid now<input type="number" step="any" min="0" name="paid" id="pu-paid" placeholder="Full amount"></label>' +
          '<label class="field">Paid by<select name="method" id="pu-method">' + opt(INFO.paymentMethods.filter(function (x) { return x !== 'Credit'; })) + '</select></label></div>' +
          '<div class="row"><label class="btn" for="pu-ai-file">📷 Read bill photo with AI</label><input type="file" id="pu-ai-file" accept="image/*,application/pdf" hidden><span class="muted" id="pu-ai-status">Fills the lines below for you to check.</span></div>' +
          '<datalist id="pu-items">' + items.map(function (i) { return '<option value="' + esc(i.name) + '">' + esc((i.batch ? i.batch + ' · ' : '') + 'stock ' + qtyFmt(i.stock)) + '</option>'; }).join('') + '</datalist>' +
          '<div class="table-wrap"><table><thead><tr>' + hdr + '</tr></thead><tbody id="pu-lines"></tbody></table></div>' +
          '<div class="row"><button type="button" class="btn sm" id="pu-add">＋ Add line</button><span class="spacer"></span><b id="pu-total"></b></div>',
        onSubmit: function (d) {
          var payload = { supplierId: d.supplierId, billNo: d.billNo, date: d.date, paid: d.paid, method: d.method, lines: lines.filter(function (l) { return l.name && Number(l.qty) > 0; }) };
          payload.lines.forEach(function (l) { var it = items.filter(function (i) { return i.name.toLowerCase() === l.name.toLowerCase() && (!f.batch || !l.batch || i.batch === l.batch); })[0]; if (it && (!f.batch || it.batch === l.batch || !l.batch)) l.itemId = it.id; else delete l.itemId; });
          return api.call('createPurchase', payload).then(function (p) { toast('Purchase ' + p.number + ' saved · stock updated'); if (after) after(); });
        } });
      var tb = $('#pu-lines', m.form);
      function inp(i, k, type, w) { return '<td><input data-l="' + i + '" data-k="' + k + '" type="' + type + '" step="any" value="' + esc(lines[i][k]) + '" style="min-width:' + w + 'px"' + (k === 'name' ? ' list="pu-items"' : '') + '></td>'; }
      function draw() {
        tb.innerHTML = lines.map(function (l, i) {
          return '<tr>' + inp(i, 'name', 'text', 180) + inp(i, 'qty', 'number', 64) + inp(i, 'free', 'number', 56) + inp(i, 'cost', 'number', 80) + inp(i, 'price', 'number', 80) +
            (f.batch ? inp(i, 'batch', 'text', 90) : '') + (f.expiry ? inp(i, 'expiry', 'date', 130) : '') + inp(i, 'taxRate', 'number', 56) +
            '<td><button type="button" class="btn ghost sm" data-rm="' + i + '" aria-label="Remove line">✕</button></td></tr>';
        }).join('');
        $$('input[data-l]', tb).forEach(function (el) {
          el.oninput = function () {
            var l = lines[+el.dataset.l]; l[el.dataset.k] = el.value;
            if (el.dataset.k === 'name') {
              var it = items.filter(function (x) { return x.name.toLowerCase() === el.value.toLowerCase(); })[0];
              if (it && !l.cost) { l.cost = it.cost; l.price = it.price; l.batch = l.batch || ''; draw(); var again = $('input[data-l="' + el.dataset.l + '"][data-k="qty"]', tb); if (again) again.focus(); return; }
            }
            total();
          };
        });
        $$('[data-rm]', tb).forEach(function (b) { b.onclick = function () { lines.splice(+b.dataset.rm, 1); if (!lines.length) lines.push(blank()); draw(); }; });
        total();
      }
      function blank() { return { name: '', qty: '', free: '', cost: '', price: '', batch: '', expiry: '', taxRate: '' }; }
      function total() {
        var t = lines.reduce(function (a, l) { return a + (Number(l.qty) || 0) * (Number(l.cost) || 0) * (1 + (Number(l.taxRate) || 0) / 100); }, 0);
        $('#pu-total', m.form).textContent = 'Total ' + money(t);
      }
      $('#pu-add', m.form).onclick = function () { lines.push(blank()); draw(); };
      $('#pu-ai-file', m.form).onchange = function (e) {
        var file = e.target.files[0]; if (!file) return;
        var st = $('#pu-ai-status', m.form); st.textContent = 'Reading bill… this takes 5–20 seconds';
        readFile(file, true).then(function (dataUrl) {
          var base64 = String(dataUrl).split(',')[1];
          return readBillAI(base64, file.type || 'image/jpeg');
        }).then(function (got) {
          if (!got.length) { st.textContent = 'Could not find any lines. Try a clearer photo, or type them in.'; return; }
          lines = lines.filter(function (l) { return l.name; }).concat(got.map(function (g) { return { name: g.name, qty: g.qty, free: g.free || '', cost: g.cost, price: g.price || '', batch: g.batch, expiry: g.expiry, taxRate: g.taxRate || '' }; }));
          draw(); st.textContent = 'Read ' + got.length + ' lines. Check them before saving.';
        }).catch(function (err) { st.textContent = err.message; });
      };
      lines.push(blank()); draw();
    }).catch(fail);
  }
  function readBillAI(base64, mimeType) {
    if (api.mode === 'remote') {
      if (!api.online) return Promise.reject(new Error('Reading bills with AI needs an internet connection.'));
      return http('api/ai/read-bill', { base64: base64, mimeType: mimeType }, 60000).then(function (j) { if (!j.ok) throw new Error(j.error); return j.result; });
    }
    var key = lsGet(LS_AIKEY);
    if (!key) return Promise.reject(new Error('Add a Google Gemini API key in Settings → AI bill reading to use this.'));
    return AI.readBill(window.fetch.bind(window), { apiKey: key, model: S.geminiModel, base64: base64, mimeType: mimeType, presetName: P.name, itemLabel: P.labels.item });
  }
  function showPurchase(p) {
    modal({ title: 'Purchase ' + p.number, wide: true, cancelText: 'Close', submitText: null,
      extraFoot: p.status !== 'void' ? '<button type="button" class="btn danger" id="pu-void">Cancel purchase</button>' : '',
      body: '<p>' + esc(p.supplierName) + ' · ' + esc(fmtDate(p.date)) + (p.billNo ? ' · bill ' + esc(p.billNo) : '') + ' · ' + statusPill(p.status) + '</p>' +
        '<div class="table-wrap"><table><thead><tr><th>' + esc(label('item')) + '</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Tax</th><th class="num">Total</th></tr></thead><tbody>' +
        p.lines.map(function (l) { return '<tr><td>' + esc(l.name) + (l.batch ? ' <span class="mono muted">' + esc(l.batch) + '</span>' : '') + '</td><td class="num">' + qtyFmt(l.qty) + (l.free ? ' +' + qtyFmt(l.free) : '') + '</td><td class="num">' + esc(money(l.cost)) + '</td><td class="num">' + esc(money(l.tax)) + '</td><td class="num">' + esc(money(l.total)) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p>Total <b>' + esc(money(p.total)) + '</b> · paid ' + esc(money(p.paid)) + (p.due ? ' · due ' + esc(money(p.due)) : '') + '</p>',
      onOpen: function (f, close) {
        var v = $('#pu-void', f);
        if (v) v.onclick = function () { close(); confirmBox('Cancel ' + p.number + '? Its stock will be removed again.', 'Cancel purchase', true).then(function (ok) { if (ok) api.call('voidPurchase', p.id).then(function () { toast('Cancelled'); render(); }).catch(fail); }); };
      } });
  }
  PAGES.purchases = function (view) {
    setTitle('Purchases');
    return listPage(view, {
      col: 'purchases', dates: true, statusFilter: true,
      filters: [{ key: '', text: 'All' }, { key: 'unpaid', text: 'Unpaid' }, { key: 'partial', text: 'Part paid' }],
      actions: '<button type="button" class="btn primary" id="pu-new">＋ Record purchase</button>',
      bind: function (v, load) { $('#pu-new', v).onclick = function () { purchaseDialog(load); }; },
      columns: [
        { title: 'No.', cell: function (r) { return '<span class="mono">' + esc(r.number) + '</span>'; } },
        { title: 'Date', cell: function (r) { return esc(fmtDate(r.date)); } },
        { title: 'Supplier', cell: function (r) { return esc(r.supplierName) + (r.billNo ? ' <span class="muted">#' + esc(r.billNo) + '</span>' : ''); } },
        { title: 'Lines', num: true, cell: function (r) { return r.lines.length; } },
        { title: 'Total', num: true, cell: function (r) { return esc(money(r.total)); } },
        { title: 'Status', cell: function (r) { return statusPill(r.status); } }
      ],
      onRow: showPurchase,
      emptyTitle: 'No purchases recorded', emptyHint: 'Record supplier bills here to add stock automatically.'
    });
  };

  // ---------------------------------------------------------------- expenses
  PAGES.expenses = function (view) {
    setTitle('Expenses');
    var month = today().slice(0, 8) + '01';
    function edit(e, load) {
      modal({ title: e ? 'Edit expense' : 'New expense', body: '<div class="form-grid">' +
        '<label class="field">Date<input type="date" name="date" id="ex-date" value="' + esc(e ? e.date : today()) + '"></label>' +
        '<label class="field">Category<input name="category" id="ex-cat" list="ex-cats" value="' + esc(e ? e.category : '') + '"><datalist id="ex-cats">' + P.expenseCategories.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></label>' +
        '<label class="field">Amount<input type="number" step="any" min="0" name="amount" id="ex-amt" value="' + esc(e ? e.amount : '') + '"></label>' +
        '<label class="field">Paid by<select name="method" id="ex-method">' + opt(INFO.paymentMethods.filter(function (x) { return x !== 'Credit'; }), e && e.method) + '</select></label>' +
        '<label class="field wide">Note<input name="note" id="ex-note" value="' + esc(e ? e.note : '') + '"></label></div>',
        onSubmit: function (d) { if (e) d.id = e.id; return api.call('save', 'expenses', d).then(function () { toast('Saved'); load(); }); } });
    }
    return listPage(view, {
      col: 'expenses', dates: true, from: month,
      actions: '<button type="button" class="btn primary" id="ex-new">＋ Add expense</button>',
      bind: function (v, load) { $('#ex-new', v).onclick = function () { edit(null, load); }; },
      summary: function (rows) { return '<p class="muted">Total in view: <b>' + esc(money(rows.reduce(function (a, r) { return a + r.amount; }, 0))) + '</b></p>'; },
      columns: [
        { title: 'Date', cell: function (r) { return esc(fmtDate(r.date)); } },
        { title: 'Category', cell: function (r) { return '<span class="pill">' + esc(r.category) + '</span>'; } },
        { title: 'Note', cell: function (r) { return esc(r.note); } },
        { title: 'Method', cell: function (r) { return esc(r.method); } },
        { title: 'Amount', num: true, cell: function (r) { return esc(money(r.amount)); } }
      ],
      rowActions: function () { return '<button type="button" class="btn sm ghost" data-act="delete" aria-label="Delete">✕</button>'; },
      onRow: function (r) { edit(r, function () { render(); }); },
      onAction: function (act, r, load) { if (act === 'delete') confirmBox('Delete this expense of ' + money(r.amount) + '?', 'Delete', true).then(function (ok) { if (ok) api.call('remove', 'expenses', r.id).then(load).catch(fail); }); },
      emptyTitle: 'No expenses in this period', emptyHint: 'Track rent, salaries, bills and more to see real profit.'
    });
  };

  // ---------------------------------------------------------------- appointments
  PAGES.appointments = function (view) {
    var lbl = P.appointmentLabel || 'Appointment';
    setTitle(lbl + 's');
    return Promise.all([api.call('list', 'items', { filter: 'services' }), api.call('list', 'customers', {}), api.call('list', 'staff', {})]).then(function (res) {
      var services = res[0].rows.filter(function (i) { return i.active !== false; }), customers = res[1].rows, staff = res[2].rows;
      var day = today();
      function edit(a, load) {
        modal({ title: a ? 'Edit ' + lbl.toLowerCase() : 'New ' + lbl.toLowerCase(), body: '<div class="form-grid">' +
          '<label class="field">Date<input type="date" name="date" id="ap-date" value="' + esc(a ? a.date : day) + '"></label>' +
          '<label class="field">Time<input type="time" name="time" id="ap-time" value="' + esc(a ? a.time : '10:00') + '"></label>' +
          '<label class="field">Existing ' + esc(label('customer').toLowerCase()) + '<select name="customerId" id="ap-cust">' + opt(customers.map(function (c) { return { value: c.id, text: c.name + (c.phone ? ' · ' + c.phone : '') }; }), a && a.customerId, '— new / walk-in —') + '</select></label>' +
          '<label class="field">or name<input name="customerName" id="ap-name" value="' + esc(a && !a.customerId ? a.customerName : '') + '"></label>' +
          '<label class="field">Phone<input name="phone" id="ap-phone" type="tel" value="' + esc(a && !a.customerId ? a.phone : '') + '"></label>' +
          '<label class="field">Service<select name="itemId" id="ap-svc">' + opt(services.map(function (s) { return { value: s.id, text: s.name + ' · ' + money(s.price) }; }), a && a.itemId, '—') + '</select></label>' +
          (staff.length ? '<label class="field">With<select name="staffId" id="ap-staff">' + opt(staff.map(function (s) { return { value: s.id, text: s.name }; }), a && a.staffId, 'Anyone') + '</select></label>' : '') +
          '<label class="field">Duration (min)<input type="number" name="durationMin" id="ap-dur" value="' + esc(a ? a.durationMin : '') + '" placeholder="from service"></label>' +
          '<label class="field wide">Notes<input name="notes" id="ap-notes" value="' + esc(a ? a.notes : '') + '"></label></div>',
          onSubmit: function (d) { if (a) d.id = a.id; return api.call('save', 'appointments', d).then(function () { toast('Saved'); load(); }); } });
      }
      function bill(a, load) {
        modal({ title: 'Bill ' + a.customerName, body: '<p>' + esc(a.itemName || 'Service') + '</p><div class="form-grid">' +
          '<label class="field">Payment<select name="method" id="ab-method">' + opt(INFO.paymentMethods) + '</select></label>' +
          '<label class="field">Amount received<input type="number" step="any" name="paid" id="ab-paid" placeholder="Full amount"></label></div>' +
          (a.itemId ? '' : '<p class="banner">No service is linked. Edit the booking and pick one, or use New sale.</p>'),
          submitText: 'Create bill',
          onSubmit: function (d) { return api.call('billAppointment', a.id, d).then(function (s) { load(); showSale(s.id, false); }); } });
      }
      return listPage(view, {
        col: 'appointments', dates: true, from: day, sort: 'at', statusFilter: true,
        filters: [{ key: '', text: 'All' }, { key: 'booked', text: 'Booked' }, { key: 'done', text: 'Done' }, { key: 'cancelled', text: 'Cancelled' }],
        actions: '<button type="button" class="btn primary" id="ap-new">＋ Book</button>',
        bind: function (v, load) { $('#ap-new', v).onclick = function () { edit(null, load); }; },
        columns: [
          { title: 'When', cell: function (r) { return '<span class="mono">' + esc(r.date === today() ? 'Today' : fmtDate(r.date)) + ' ' + esc(r.time) + '</span>'; } },
          { title: label('customer'), cell: function (r) { return esc(r.customerName) + (r.phone ? '<div class="muted" style="font-size:12px">' + esc(r.phone) + '</div>' : ''); } },
          { title: 'Service', cell: function (r) { return esc(r.itemName) + ' <span class="muted">' + esc(r.durationMin) + 'm</span>'; } },
          { title: 'With', cell: function (r) { var s = staff.filter(function (x) { return x.id === r.staffId; })[0]; return esc(s ? s.name : ''); } },
          { title: 'Status', cell: function (r) { return statusPill(r.status); } }
        ],
        rowActions: function (r) {
          if (r.status === 'done' || r.status === 'cancelled') return r.saleId ? '<button type="button" class="btn sm ghost" data-act="receipt">Bill</button>' : '';
          return '<button type="button" class="btn sm primary" data-act="bill">Done & bill</button> ' +
            (r.phone ? '<a class="btn sm ghost" target="_blank" rel="noopener" href="' + esc(waLink(r.phone, 'Hi ' + r.customerName + ', reminder of your ' + lbl.toLowerCase() + ' at ' + S.businessName + ' on ' + fmtDate(r.date) + ' at ' + r.time + '.')) + '">Remind</a> ' : '') +
            '<button type="button" class="btn sm ghost" data-act="cancel">Cancel</button>';
        },
        onRow: function (r) { edit(r, function () { render(); }); },
        onAction: function (act, r, load) {
          if (act === 'bill') bill(r, load);
          if (act === 'receipt') showSale(r.saleId);
          if (act === 'cancel') api.call('setAppointmentStatus', r.id, 'cancelled').then(load).catch(fail);
        },
        emptyTitle: 'No ' + lbl.toLowerCase() + 's from this date', emptyHint: 'Clear the date filter to see older ones.'
      });
    });
  };

  // ---------------------------------------------------------------- staff
  PAGES.staff = function (view) {
    setTitle('Staff');
    function edit(s, load) {
      modal({ title: s ? 'Edit staff' : 'New staff member', body: '<div class="form-grid">' +
        '<label class="field">Name<input name="name" id="st-name" value="' + esc(s && s.name) + '"></label>' +
        '<label class="field">Role<input name="role" id="st-role" value="' + esc(s && s.role) + '" placeholder="e.g. Pharmacist, Stylist, Cashier"></label>' +
        '<label class="field">Phone<input name="phone" id="st-phone" type="tel" value="' + esc(s && s.phone) + '"></label>' +
        '<label class="field">Monthly salary<input type="number" step="any" name="salary" id="st-sal" value="' + esc(s && s.salary) + '"></label>' +
        '<label class="field">Commission % on sales<input type="number" step="any" name="commissionRate" id="st-com" value="' + esc(s && s.commissionRate) + '"></label>' +
        '<label class="check"><input type="checkbox" name="active" id="st-active"' + (!s || s.active !== false ? ' checked' : '') + '> Active</label></div>',
        onSubmit: function (d) { if (s) d.id = s.id; return api.call('save', 'staff', d).then(function () { toast('Saved'); load(); }); } });
    }
    return listPage(view, {
      col: 'staff', actions: '<button type="button" class="btn primary" id="st-new">＋ Add staff</button>',
      bind: function (v, load) { $('#st-new', v).onclick = function () { edit(null, load); }; },
      columns: [
        { title: 'Name', cell: function (r) { return '<b>' + esc(r.name) + '</b>' + (r.active === false ? ' <span class="pill">inactive</span>' : ''); } },
        { title: 'Role', cell: function (r) { return esc(r.role); } },
        { title: 'Phone', cell: function (r) { return esc(r.phone); } },
        { title: 'Commission', num: true, cell: function (r) { return r.commissionRate ? r.commissionRate + '%' : '—'; } }
      ],
      rowActions: function () { return '<button type="button" class="btn sm ghost" data-act="delete" aria-label="Delete">✕</button>'; },
      onRow: function (r) { edit(r, function () { render(); }); },
      onAction: function (act, r, load) { if (act === 'delete') confirmBox('Remove ' + r.name + '?', 'Remove', true).then(function (ok) { if (ok) api.call('remove', 'staff', r.id).then(load).catch(fail); }); },
      emptyTitle: 'No staff added', emptyHint: 'Add staff to track who served each bill and their commission.'
    });
  };

  // ---------------------------------------------------------------- reports
  PAGES.reports = function (view) {
    setTitle('Reports');
    var t = today();
    var ranges = {
      today: [t, t], week: [Engine.addDays(t, -6), t], month: [t.slice(0, 8) + '01', t],
      lastmonth: (function () { var d = new Date(); var f = new Date(d.getFullYear(), d.getMonth() - 1, 1), l = new Date(d.getFullYear(), d.getMonth(), 0); return [Engine.localDate(f), Engine.localDate(l)]; })(),
      year: [t.slice(0, 4) + '-01-01', t]
    };
    var cur = ranges.month;
    view.innerHTML = '<div class="panel"><div class="panel-head"><div class="chips" id="rp-ranges">' +
      [['today', 'Today'], ['week', 'Last 7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year']].map(function (r) { return '<button type="button" class="chip' + (r[0] === 'month' ? ' on' : '') + '" data-r="' + r[0] + '">' + r[1] + '</button>'; }).join('') +
      '</div><div class="row"><input type="date" id="rp-from" style="width:auto" aria-label="From"><input type="date" id="rp-to" style="width:auto" aria-label="To"></div></div></div><div id="rp-body" class="grid"></div>';
    function table(title, rows, cols) {
      return '<div class="panel"><div class="panel-head"><h2>' + esc(title) + '</h2></div>' + (rows.length ? '<div class="table-wrap"><table><thead><tr>' + cols.map(function (c) { return '<th class="' + (c[2] ? 'num' : '') + '">' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + cols.map(function (c) { var v = r[c[1]]; return '<td class="' + (c[2] ? 'num' : '') + '">' + esc(c[2] === 'm' ? money(v) : c[2] === 'q' ? qtyFmt(v) : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : emptyState('No data for this period')) + '</div>';
    }
    function load() {
      $('#rp-from').value = cur[0]; $('#rp-to').value = cur[1];
      return api.call('report', { from: cur[0], to: cur[1] }).then(function (r) {
        if (!$('#rp-body')) return;
        var tiles = [['Sales', r.salesTotal, r.salesCount + (r.salesCount === 1 ? ' bill' : ' bills')], ['Gross profit', r.grossProfit, 'sales minus cost, excl. tax'], ['Expenses', r.expenses, ''], ['Net profit', r.netProfit, 'gross profit − expenses'],
          [S.taxLabel + ' collected', r.tax, ''], ['Discounts given', r.discount, ''], ['Money in', r.collected, 'all receipts'], ['Money out', r.paidOut, 'suppliers, refunds, expenses']];
        if (has('purchases')) tiles.push(['Purchases', r.purchases, '']);
        tiles.push(['Credit given', r.creditGiven, 'still unpaid on these bills']);
        var days = [], d = r.from, map = {};
        r.byDay.forEach(function (x) { map[x.key] = x; });
        if (Engine.daysBetween(r.from, r.to) <= 62) { while (d <= r.to) { days.push({ key: d, total: map[d] ? map[d].total : 0 }); d = Engine.addDays(d, 1); } }
        var html = '<div class="tiles">' + tiles.map(function (x) { return '<div class="tile' + (x[0] === 'Net profit' && x[1] < 0 ? ' danger' : '') + '"><span class="label">' + esc(x[0]) + '</span><span class="value">' + esc(money(x[1])) + '</span><span class="hint">' + esc(x[2]) + '</span></div>'; }).join('') + '</div>';
        if (days.length > 1) html += '<div class="panel"><div class="panel-head"><h2>Sales by day</h2></div>' + barChart(days, 'total') + '</div>';
        html += '<div class="grid grid-2">' +
          table('Top ' + label('items').toLowerCase(), r.byItem.slice(0, 25), [['Name', 'key'], ['Qty', 'qty', 'q'], ['Sales', 'total', 'm'], ['Profit', 'profit', 'm']]) +
          table('By category', r.byCategory, [['Category', 'key'], ['Qty', 'qty', 'q'], ['Sales', 'total', 'm']]) +
          table('Money received by method', r.byMethod, [['Method', 'key'], ['Count', 'count', 'q'], ['Amount', 'total', 'm']]) +
          table(S.taxLabel + ' summary', r.byTaxRate, [['Rate', 'key'], ['Taxable', 'taxable', 'm'], [S.taxLabel, 'tax', 'm']]) +
          (r.byStaff.length ? table('Staff performance', r.byStaff, [['Staff', 'name'], ['Bills', 'count', 'q'], ['Sales', 'total', 'm'], ['Commission', 'commission', 'm']]) : '') +
          table('Expenses by category', r.expensesByCategory, [['Category', 'key'], ['Amount', 'total', 'm']]) + '</div>';
        $('#rp-body').innerHTML = html;
      });
    }
    $$('[data-r]', view).forEach(function (b) { b.onclick = function () { cur = ranges[b.dataset.r]; $$('[data-r]', view).forEach(function (x) { x.classList.toggle('on', x === b); }); load().catch(fail); }; });
    $('#rp-from').onchange = function (e) { cur = [e.target.value, cur[1]]; $$('[data-r]', view).forEach(function (x) { x.classList.remove('on'); }); load().catch(fail); };
    $('#rp-to').onchange = function (e) { cur = [cur[0], e.target.value]; $$('[data-r]', view).forEach(function (x) { x.classList.remove('on'); }); load().catch(fail); };
    return load();
  };

  // ---------------------------------------------------------------- settings
  PAGES.prefs = function (view) {
    setTitle('Settings');
    var modNames = { overview: 'Overview', daily: 'Daily numbers', scan: 'Scan receipts', entries: 'All entries', review: 'Spot check & insights', departments: 'Departments', stock: 'Stock (purchased vs supplied vs in hand)', vault: 'Customer vault', guide: 'Guide for my business',
      dashboard: 'Billing dashboard (full billing software, only if a client asks)', pos: 'New sale (billing)', sales: 'Sales list', items: label('items'), purchases: 'Purchases', customers: label('customers'), suppliers: 'Suppliers',
      expenses: 'Expenses', appointments: (P.appointmentLabel || 'Appointment') + 's', staff: 'Staff', reports: 'Reports', settings: 'Settings', data: 'Backup & data' };
    view.innerHTML = '<form class="panel stack" id="pf"><div class="panel-head"><h2>Business details</h2></div><div class="form-grid">' +
      '<label class="field">Business name<input name="businessName" id="pf-name" value="' + esc(S.businessName) + '"></label>' +
      '<label class="field">Phone<input name="phone" id="pf-phone" value="' + esc(S.phone) + '"></label>' +
      '<label class="field">Email<input name="email" id="pf-email" value="' + esc(S.email) + '"></label>' +
      '<label class="field wide">Address<input name="address" id="pf-addr" value="' + esc(S.address) + '"></label>' +
      '<label class="field">Type of business<select name="industry" id="pf-ind">' + opt(INFO.industries.map(function (i) { return { value: i.key, text: i.icon + ' ' + i.name }; }), S.industry) + '</select></label>' +
      '</div><div class="panel-head" style="margin-top:8px"><h2>Money & tax</h2></div><div class="form-grid">' +
      '<label class="field">Currency symbol<input name="currency" id="pf-cur" value="' + esc(S.currency) + '"></label>' +
      '<label class="field">Number format (locale)<input name="locale" id="pf-loc" value="' + esc(S.locale) + '" placeholder="en-IN, en-US, en-GB…"></label>' +
      '<label class="field">Phone country code<input name="countryCode" id="pf-cc" value="' + esc(S.countryCode || '91') + '"></label>' +
      '<label class="field">Tax name<input name="taxLabel" id="pf-taxl" value="' + esc(S.taxLabel) + '" placeholder="GST, VAT, Sales tax"></label>' +
      '<label class="field">Default tax %<input type="number" step="any" name="taxRate" id="pf-tax" value="' + esc(S.taxRate) + '"></label>' +
      '<label class="field">Your tax number<input name="taxId" id="pf-taxid" value="' + esc(S.taxId) + '"></label>' +
      '<label class="check"><input type="checkbox" name="taxInclusive" id="pf-incl"' + (S.taxInclusive ? ' checked' : '') + '> Prices already include tax</label>' +
      '</div>' + (has('overview') || has('review') ? '<div class="panel-head" style="margin-top:8px"><h2>Review checks</h2><span class="muted">When the app should raise a flag</span></div><div class="form-grid">' +
        '<label class="field">Day splits into halves at<input type="time" name="halfDaySplit" id="pf-split" value="' + esc(S.halfDaySplit || '15:00') + '"></label>' +
        '<label class="field">Flag a price rise above (%)<input type="number" step="any" name="priceAlertPct" id="pf-price" value="' + esc(S.priceAlertPct) + '"></label>' +
        '<label class="field">Flag wastage above (% of purchases)<input type="number" step="any" name="wastageAlertPct" id="pf-waste" value="' + esc(S.wastageAlertPct) + '"></label>' +
        '<label class="field">Flag collection short by more than (%)<input type="number" step="any" name="collectionGapPct" id="pf-gap" value="' + esc(S.collectionGapPct) + '"></label></div>' : '') +
      '<div' + (has('pos') ? '' : ' hidden') + '><div class="panel-head" style="margin-top:8px"><h2>Billing & stock</h2></div><div class="form-grid">' +
      '<label class="field">Bill number prefix<input name="invoicePrefix" id="pf-ip" value="' + esc(S.invoicePrefix) + '"></label>' +
      '<label class="field">Purchase number prefix<input name="purchasePrefix" id="pf-pp" value="' + esc(S.purchasePrefix) + '"></label>' +
      '<label class="field">Default reorder level<input type="number" name="lowStockDefault" id="pf-low" value="' + esc(S.lowStockDefault) + '"></label>' +
      '<label class="field">Warn before expiry (days)<input type="number" name="expiryWarnDays" id="pf-exp" value="' + esc(S.expiryWarnDays) + '"></label>' +
      '<label class="field">Loyalty points (% of bill)<input type="number" step="any" name="loyaltyPercent" id="pf-loy" value="' + esc(S.loyaltyPercent) + '"></label>' +
      '<label class="field wide">Receipt footer<input name="receiptFooter" id="pf-foot" value="' + esc(S.receiptFooter) + '"></label>' +
      '<label class="check"><input type="checkbox" name="allowNegativeStock" id="pf-neg"' + (S.allowNegativeStock ? ' checked' : '') + '> Allow selling more than the stock shown</label>' +
      '</div></div><div class="panel-head" style="margin-top:8px"><h2>Screens</h2><span class="muted">Turn off what you do not need</span></div><div class="form-grid">' +
      INFO.allModules.filter(function (m) { return m !== 'settings'; }).map(function (m) { return '<label class="check"><input type="checkbox" data-mod="' + m + '" id="pf-m-' + m + '"' + (has(m) ? ' checked' : '') + '> ' + esc(modNames[m] || m) + '</label>'; }).join('') +
      '</div><div class="panel-head" style="margin-top:8px"><h2>AI receipt reading</h2><span class="muted">Optional. Without it, receipts are read on the phone.</span></div>' +
      (api.mode === 'remote' ? '<p class="muted">' + (api.health && api.health.ai ? 'Enabled on the server.' : 'Set GOOGLE_API_KEY on the server to turn this on.') + '</p>'
        : '<div class="form-grid"><label class="field">Google Gemini API key (kept on this device only)<input type="password" id="pf-aikey" autocomplete="off" value="' + esc(lsGet(LS_AIKEY) || '') + '"></label>' +
          '<label class="field">Model<input name="geminiModel" id="pf-model" value="' + esc(S.geminiModel) + '"></label></div>') +
      '<div class="row"><button class="btn primary" type="submit">Save settings</button><span class="muted" id="pf-msg"></span></div></form>';
    $('#pf').onsubmit = function (e) {
      e.preventDefault();
      var d = formData(e.target);
      d.modules = $$('[data-mod]', view).filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.mod; }).concat(['settings']);
      var indChanged = d.industry !== S.industry;
      var key = $('#pf-aikey'); if (key) { if (key.value) lsSet(LS_AIKEY, key.value.trim()); else lsDel(LS_AIKEY); }
      var go2 = indChanged ? confirmBox('Switch to ' + Industries.get(d.industry).name + '? Your data stays. Screens, words and fields change, and the screens list resets to that type’s default.', 'Switch') : Promise.resolve(true);
      go2.then(function (ok) {
        if (!ok) return;
        if (indChanged) {
          var np = Industries.get(d.industry), hasPos = d.modules.indexOf('pos') >= 0, hasRev = d.modules.indexOf('overview') >= 0;
          d.modules = (hasRev ? Industries.REVIEW_MODULES : []).concat(hasPos || !hasRev ? np.modules : ['settings', 'data']);
          d.taxRate = np.taxRate;
        }
        return api.call('saveSettings', d).then(refreshInfo).then(function () { shell(); render(); toast('Settings saved'); });
      }).catch(fail);
    };
  };

  // ---------------------------------------------------------------- data
  function exportCSV(col) {
    api.call('exportCSV', col).then(function (csv) { download(col + '-' + today() + '.csv', '﻿' + csv, 'text/csv'); }).catch(fail);
  }
  function importCSVDialog(col, after) {
    var cols = { items: 'name, price, cost, stock, category, unit, barcode, sku, taxRate, reorderLevel, batch, expiry, isService' + (P.itemFields.length ? ', ' + P.itemFields.map(function (f) { return f.label; }).join(', ') : ''), customers: 'name, phone, email, address, balance', suppliers: 'name, phone, email, address, balance' }[col];
    modal({ title: 'Import ' + col + ' from CSV', wide: true, submitText: 'Import',
      body: '<p class="muted">First row must be column names. Recognised columns: ' + esc(cols) + '. Rows with the same name' + (col === 'items' ? ' (and batch)' : ' and phone') + ' are updated, others are added. Export from Excel or Google Sheets as CSV.</p>' +
        '<input type="file" accept=".csv,text/csv" id="csv-file"><label class="field">…or paste CSV text<textarea name="text" id="csv-text" placeholder="name,price,stock&#10;Example item,100,10"></textarea></label>',
      onOpen: function (f) { $('#csv-file', f).onchange = function (e) { var file = e.target.files[0]; if (file) readFile(file).then(function (t) { $('#csv-text', f).value = t; }); }; },
      onSubmit: function (d) { return api.call('importCSV', col, d.text).then(function (r) { toast('Added ' + r.created + ', updated ' + r.updated + (r.skipped ? ', skipped ' + r.skipped : '')); if (after) after(); }); } });
  }
  PAGES.data = function (view) {
    setTitle('Backup & data');
    var exportables = (has('overview') ? ['entries', 'departments', 'receipts'] : []).concat(has('pos') || has('items') ? ['items', 'customers', 'suppliers', 'sales', 'purchases', 'payments', 'expenses', 'appointments', 'staff', 'stockMoves'] : []);
    var names = { items: label('items'), customers: label('customers'), sales: label('sale') + 's', stockMoves: 'Stock movements' };
    view.innerHTML = '<div class="grid grid-2">' +
      '<div class="panel stack"><h2>Where your data lives</h2>' +
      (api.mode === 'remote' ? '<p>Shared mode: data is saved on your BizCore server' + (api.health && api.health.sync && api.health.sync.enabled ? ' and copied to Supabase (' + (api.health.sync.pending ? api.health.sync.pending + ' changes waiting to sync' : 'up to date') + ')' : '') + '. Every phone or computer that opens this address sees the same data. The server also keeps a daily backup copy for 14 days.</p>'
        : '<p>This-device mode: data is saved in this browser only. Download a backup regularly, or run the BizCore server to share data across devices.</p>' + (api.storageOk ? '' : '<p class="banner">This browser is not saving data right now (private window or storage blocked).</p>')) +
      '<div class="row"><button type="button" class="btn primary" id="dt-backup">' + (native ? 'Save / share full backup' : 'Download full backup') + '</button><button type="button" class="btn" id="dt-restore">Restore from backup</button></div></div>' +
      connectionPanel() +
      '<div class="panel stack"><h2>Spreadsheets (CSV)</h2><p class="muted">Open these in Excel or Google Sheets.</p><div class="chips">' +
      exportables.map(function (c) { return '<button type="button" class="chip" data-csv="' + c + '">' + esc(names[c] || (c.charAt(0).toUpperCase() + c.slice(1))) + '</button>'; }).join('') + '</div>' +
      '<div class="row"><button type="button" class="btn" data-imp="items">Import ' + esc(label('items').toLowerCase()) + '</button><button type="button" class="btn" data-imp="customers">Import ' + esc(label('customers').toLowerCase()) + '</button><button type="button" class="btn" data-imp="suppliers">Import suppliers</button></div></div>' +
      '<div class="panel stack"><h2>Example data</h2><p class="muted">' + (has('overview') && !has('pos') ? 'Adds 30 days of example department numbers, purchase bills and expenses, with a few problems planted for the review to find.' : 'Adds a few sample ' + esc(label('items').toLowerCase()) + ', a customer, a supplier and a staff member for this business type.') + '</p><div><button type="button" class="btn" id="dt-samples">Add example data</button></div></div>' +
      '<div class="panel stack"><h2>Start over</h2><p class="muted">Deletes every record. Download a backup first.</p><div class="row"><button type="button" class="btn danger" id="dt-reset">Erase all data</button></div></div></div>';
    bindConnectionPanel(view);
    $('#dt-backup').onclick = function () { api.call('exportAll').then(function (db) { download('bizcore-backup-' + today() + '.json', JSON.stringify(db), 'application/json'); }).catch(fail); };
    $('#dt-restore').onclick = function () {
      modal({ title: 'Restore from backup', wide: true, submitText: 'Restore', danger: true,
        body: '<p class="banner">This replaces everything currently saved with the backup.</p><input type="file" accept=".json,application/json" id="rs-file"><label class="field">…or paste backup text<textarea name="text" id="rs-text"></textarea></label>',
        onOpen: function (f) { $('#rs-file', f).onchange = function (e) { var file = e.target.files[0]; if (file) readFile(file).then(function (t) { $('#rs-text', f).value = t; }); }; },
        onSubmit: function (d) {
          var data; try { data = JSON.parse(d.text); } catch (e) { throw new Error('That is not a valid backup file'); }
          return api.call('importAll', data).then(refreshInfo).then(function () { toast('Backup restored'); shell(); render(); });
        } });
    };
    $$('[data-csv]', view).forEach(function (b) { b.onclick = function () { exportCSV(b.dataset.csv); }; });
    $$('[data-imp]', view).forEach(function (b) { b.onclick = function () { importCSVDialog(b.dataset.imp); }; });
    $('#dt-samples').onclick = function () { api.call(has('overview') && !has('pos') ? 'loadReviewSamples' : 'loadSamples').then(function () { toast('Example data added'); }).catch(fail); };
    $('#dt-reset').onclick = function () {
      modal({ title: 'Erase all data', body: '<p>Type <b>ERASE</b> to delete every record. Your settings are kept.</p><label class="field">Confirm<input name="word" id="rs-word" autocomplete="off"></label>', submitText: 'Erase everything', danger: true,
        onSubmit: function (d) { if (d.word !== 'ERASE') throw new Error('Type ERASE in capitals to confirm'); return api.call('resetAll', true).then(refreshInfo).then(function () { toast('All records erased'); render(); }); } });
    };
  };

  // ---------------------------------------------------------------- boot
  // ---------------------------------------------------------------- server connection UI
  function connectDialog() {
    modal({ title: 'Connect to shop server', body: '<p class="muted">Enter the address of your BizCore server (for example https://bizcore-xxxx.onrender.com) and its PIN if it has one. Data already saved on this ' + (native ? 'phone' : 'device') + ' is not copied to the server; to move it, use Backup here and Restore on the server.</p>' +
      '<div class="form-grid"><label class="field wide">Server address<input name="url" id="cn-url" type="url" inputmode="url" autocapitalize="off" placeholder="https://" value="' + esc(lsGet(LS_SERVER) || '') + '"></label>' +
      '<label class="field">PIN (if set)<input name="pin" id="cn-pin" type="password" inputmode="numeric" value="' + esc(lsGet(LS_PIN) || '') + '"></label></div>',
      submitText: 'Connect',
      onSubmit: function (d) {
        var url = d.url.trim(); if (!url) throw new Error('Enter the server address');
        var prev = lsGet(LS_SERVER), prevPin = lsGet(LS_PIN);
        lsSet(LS_SERVER, url); lsSet(LS_PIN, d.pin || '');
        return checkHealth().then(function (ok) {
          if (!ok) { if (prev) lsSet(LS_SERVER, prev); else lsDel(LS_SERVER); if (prevPin !== null) lsSet(LS_PIN, prevPin); throw new Error('Could not reach a BizCore server at that address. Check the address and the internet connection.'); }
          return rpc('info', []).then(function () {
            lsSet(LS_KNOWN, serverBase()); lsDel(LS_CACHE); lsDel(LS_OUTBOX);
            toast('Connected'); setTimeout(function () { location.hash = 'dashboard'; location.reload(); }, 300);
          });
        });
      } });
  }
  function connectionPanel() {
    var problems = lsJSON(LS_PROBLEMS, []);
    var h = '<div class="panel stack"><h2>Shop server & sync</h2>';
    if (api.mode === 'remote') {
      var t = syncText();
      h += '<p>Server: <b class="mono">' + esc(serverBase() || location.origin) + '</b> <span class="pill ' + t.cls + '">' + esc(t.text) + '</span></p>' +
        '<p class="muted">A copy of the shop data is kept on this device, so billing keeps working without internet. Changes made offline upload automatically when the connection returns.' +
        (api.lastRefresh ? ' Copy last updated ' + esc(api.lastRefresh.toLocaleTimeString()) + '.' : '') + '</p>' +
        (problems.length ? '<details><summary>' + problems.length + ' offline change(s) could not be applied</summary><ul>' + problems.slice(0, 10).map(function (p) { return '<li>' + esc(p.at.slice(0, 16).replace('T', ' ') + ' · ' + p.method + ': ' + p.error) + '</li>'; }).join('') + '</ul><button type="button" class="btn sm" id="cn-clearp">Clear list</button></details>' : '') +
        '<div class="row"><button type="button" class="btn" id="cn-sync">Sync now</button>' + (serverBase() ? '<button type="button" class="btn danger" id="cn-off">Disconnect</button>' : '') + '</div>';
    } else {
      h += '<p class="muted">Not connected. Connect to a BizCore server to share data between phones and computers.</p><div><button type="button" class="btn" id="cn-on">Connect to shop server</button></div>';
    }
    return h + '</div>';
  }
  function bindConnectionPanel(view) {
    var b;
    if ((b = $('#cn-on', view))) b.onclick = connectDialog;
    if ((b = $('#cn-sync', view))) b.onclick = function () {
      probe().then(function () { return api.online ? sync() : null; }).then(function () { toast(api.online ? (api.outbox.length ? 'Still syncing…' : 'Synced') : 'Still offline', !api.online); render(); });
    };
    if ((b = $('#cn-clearp', view))) b.onclick = function () { lsDel(LS_PROBLEMS); render(); };
    if ((b = $('#cn-off', view))) b.onclick = function () {
      var warn = api.outbox.length ? ' ' + api.outbox.length + ' change(s) have not been uploaded yet and will be lost.' : '';
      confirmBox('Disconnect this device from the server? It goes back to its own separate data.' + warn, 'Disconnect', true).then(function (ok) {
        if (!ok) return;
        [LS_SERVER, LS_KNOWN, LS_CACHE, LS_OUTBOX, LS_PROBLEMS].forEach(lsDel);
        location.hash = 'dashboard'; location.reload();
      });
    };
  }

  // ---------------------------------------------------------------- platform glue
  function registerServiceWorker() {
    if (native || embedded || !('serviceWorker' in navigator) || !/^https:$|^http:$/.test(location.protocol)) return;
    if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // Ask the worker to keep a copy of everything this page loaded, so it opens offline next time.
      var urls = [location.href.split('#')[0]];
      $$('script[src], link[rel=stylesheet][href], link[rel=manifest][href]').forEach(function (el) { urls.push(el.src || el.href); });
      var send = function (w) { if (w) w.postMessage({ type: 'cache', urls: urls }); };
      send(reg.active || reg.waiting || reg.installing);
      navigator.serviceWorker.ready.then(function (r) { send(r.active); });
    }).catch(function () { /* offline support is a bonus; the app works without it */ });
  }
  function nativeCall(plugin, method, opts) {
    if (Cap && Cap.nativePromise) return Cap.nativePromise(plugin, method, opts);
    var p = Cap && Cap.Plugins && Cap.Plugins[plugin];
    if (p && p[method]) return p[method](opts);
    return Promise.reject(new Error(plugin + ' is not available'));
  }
  function nativeShareFile(name, text) {
    return nativeCall('Filesystem', 'writeFile', { path: name, data: text, directory: 'CACHE', encoding: 'utf8' })
      .then(function (r) { return nativeCall('Share', 'share', { title: name, url: r.uri, dialogTitle: 'Save or send ' + name }); });
  }

  // Building blocks for the review screens (public/review-ui.js).
  window.BizApp = {
    PAGES: PAGES, NAV: NAV, api: api,
    get S() { return S; }, get P() { return P; }, get INFO() { return INFO; },
    $: $, $$: $$, esc: esc, money: money, qtyFmt: qtyFmt, today: today, fmtDate: fmtDate, label: label, has: has, opt: opt, formData: formData,
    debounce: debounce, toast: toast, fail: fail, modal: modal, confirmBox: confirmBox, emptyState: emptyState, download: download, readFile: readFile,
    setTitle: setTitle, render: render, refreshInfo: refreshInfo, go: go, niceMax: niceMax, short: short, waLink: waLink,
    lsGet: lsGet, lsSet: lsSet, LS_AIKEY: LS_AIKEY, http: http, serverBase: serverBase, native: native, embedded: embedded, AI: AI, Engine: Engine, Industries: Industries
  };

  function boot() {
    if (native) {
      document.documentElement.classList.add('native');
      // Open WhatsApp and other web links outside the app.
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[target=_blank]');
        if (a && /^https?:/i.test(a.href)) { e.preventDefault(); location.href = a.href; }
      });
    }
    registerServiceWorker();
    detectMode().then(function (m) {
      if (m === 'local') { startLocal(); return refreshInfo(); }
      api.mode = 'remote';
      openCache();
      if (m === 'offline') {
        api.online = false;
        if (!api.cacheStore.data || !api.cacheStore.data.settings || !api.cacheStore.data.settings.setupDone) {
          throw new Error('No internet, and this device has no saved copy of the shop data yet. Connect once to download it.');
        }
        probeTimer = setInterval(probe, 15000);
        return refreshInfo();
      }
      return refreshInfo().then(function () { sync(); });
    }).then(function () {
      if (S.setupDone) shell();
      render();
      window.addEventListener('hashchange', render);
      window.addEventListener('online', function () { if (api.mode === 'remote') probe(); });
      window.addEventListener('offline', function () { if (api.mode === 'remote') goOffline(); });
      setInterval(function () { if (api.mode === 'remote' && api.online && !document.hidden) sync(); }, 120000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden && api.mode === 'remote') (api.online ? sync() : probe()); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'F2' && has('pos')) { e.preventDefault(); go('pos'); }
      });
    }).catch(function (e) {
      document.getElementById('app').innerHTML = '<div class="setup"><div class="banner">' + esc(e.message) + '</div><div class="row"><button class="btn" type="button" onclick="location.reload()">Try again</button></div><div class="toasts" id="toasts"></div></div>';
      if (/PIN/.test(e.message)) askPin();
    });
  }
  boot();
})();
