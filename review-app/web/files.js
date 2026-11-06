/* Photos and files: kept in the phone's file store (IndexedDB), shrunk, readable
 * by the phone (offline) or by AI, and attachable on every entry page. */
(function () {
  'use strict';
  var A = window.App, $ = A.$, $$ = A.$$, esc = A.esc;
  var DB = 'bizcore-files', STORE = 'files', UPKEY = 'bizreview-uploaded';

  // ---------------------------------------------------------------- file store
  var dbp = null, memory = {};
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (res) {
      try {
        var r = indexedDB.open(DB, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbp;
  }
  function op(mode, fn) {
    return idb().then(function (db) {
      if (!db) return fn(null);
      return new Promise(function (res, rej) { var t = db.transaction(STORE, mode), st = t.objectStore(STORE), out = fn(st); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; });
    });
  }
  function put(rec) { memory[rec.id] = rec; return op('readwrite', function (st) { return st ? st.put(rec) : null; }).catch(function () { A.toast('Phone storage is full: this photo is kept only until the app closes. Save a backup.', true); }); }
  function get(id) {
    if (memory[id]) return Promise.resolve(memory[id]);
    return op('readonly', function (st) { return st ? st.get(id) : null; }).then(function (r) {
      if (r) return r;
      if (!A.sync.url) return null;
      // not on this phone: fetch from the office system
      return fetch(A.serverBase() + 'api/files/' + encodeURIComponent(id), { headers: { 'x-app-pin': A.lsGet('bizreview-pin') || '' } }).then(function (x) { return x.ok ? x.json() : null; })
        .then(function (j) { if (j && j.ok) { put(j.result); return j.result; } return null; }).catch(function () { return null; });
    });
  }
  function all() { return op('readonly', function (st) { return st ? st.getAll() : []; }).then(function (r) { return r || []; }); }
  function rid() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // ---------------------------------------------------------------- images & reading
  function loadImage(dataUrl) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('That photo could not be opened.')); }; i.src = dataUrl; }); }
  function shrink(img, max, q) {
    var k = Math.min(1, max / Math.max(img.width, img.height));
    var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { canvas: c, url: c.toDataURL('image/jpeg', q) };
  }
  function forOcr(img) {
    var c = shrink(img, 1800, 0.9).canvas, g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    for (var i = 0; i < px.length; i += 4) { var y = .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2]; y = y > 160 ? 255 : y < 90 ? 0 : (y - 90) * 255 / 70; px[i] = px[i + 1] = px[i + 2] = y; }
    g.putImageData(d, 0, 0);
    return c;
  }
  var ocr = { worker: null, loading: null };
  function ocrWorker(progress) {
    if (ocr.worker) return Promise.resolve(ocr.worker);
    if (ocr.loading) return ocr.loading;
    var base = new URL('vendor/ocr/', location.href).href;
    ocr.loading = (window.Tesseract ? Promise.resolve() : new Promise(function (res, rej) { var s = document.createElement('script'); s.src = base + 'tesseract.min.js'; s.onload = res; s.onerror = function () { rej(new Error('missing')); }; document.head.appendChild(s); }))
      .then(function () {
        return window.Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base + 'tesseract-core-lstm.wasm.js', langPath: base + 'lang',
          workerBlobURL: false, cacheMethod: 'none', gzip: false, logger: function (m) { if (progress && m && m.status) progress(m.status, m.progress); } });
      }).then(function (w) { ocr.worker = w; ocr.loading = null; return w; }, function () { ocr.loading = null; throw new Error('Reading photos on this device is not available here. Use the BizCore app, or add an AI key.'); });
    return ocr.loading;
  }
  function aiOpts() {
    var s = A.S(), P = A.P();
    return { provider: s.aiProvider || 'gemini', apiKey: A.lsGet(A.AIKEY) || '', model: s.aiModel || '', presetName: P.name, hints: P.review.receiptHints,
      categories: P.review.costCategories.map(function (c) { return c.name; }) };
  }
  // Visiting card / ID: name, phone, email
  function parseCard(text) {
    var lines = String(text || '').split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var phone = (text.replace(/[\s-]/g, '').match(/(?:\+?91)?([6-9]\d{9})/) || [])[1] || '';
    var email = (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [])[0] || '';
    var name = lines.filter(function (l) { return /^[A-Za-z .]{3,40}$/.test(l) && !/(pvt|ltd|limited|road|street|nagar|www|@)/i.test(l); })[0] || '';
    return { name: name, phone: phone, email: email };
  }
  // kind: 'bill' | 'report' | 'card' | 'text'
  function read(img, kind, status) {
    var o = aiOpts();
    var useAI = !!o.apiKey && navigator.onLine !== false && (kind === 'bill' || kind === 'report');
    function device() {
      status('Reading on this phone… (first time takes a little longer)');
      return ocrWorker(function (s, p) { status('Reading on this phone: ' + s + (p ? ' ' + Math.round(p * 100) + '%' : '')); })
        .then(function (w) { return w.recognize(forOcr(img)); })
        .then(function (r) {
          var text = r.data.text || '';
          var out = kind === 'report' ? A.OCR.parseSalesReport(text) : kind === 'bill' ? A.OCR.parse(text, { mode: 'bill' }) : kind === 'card' ? parseCard(text) : {};
          out.text = text; out.engine = 'phone';
          return out;
        });
    }
    if (!useAI) return device();
    status('Reading with AI…');
    o.base64 = shrink(img, 1600, 0.85).url.split(',')[1]; o.mimeType = 'image/jpeg';
    return (kind === 'report' ? A.AI.readReportAny(window.fetch.bind(window), o) : A.AI.readBillAny(window.fetch.bind(window), o))
      .then(function (out) { out.engine = 'AI'; out.text = ''; return out; }, function (e) { status('AI not available (' + e.message + '). Reading on this phone…'); return device(); });
  }

  // ---------------------------------------------------------------- the attach widget
  // attach(box, { files: [...existing meta], read: 'bill'|'report'|'card'|'text'|false, onRead: fn(result), label })
  function attach(box, opts) {
    opts = opts || {};
    var list = (opts.files || []).slice();
    var uid = 'a' + Math.random().toString(36).slice(2, 7);
    box.classList.add('attach');
    function draw() {
      box.innerHTML = '<div class="row"><label class="btn primary grow" for="' + uid + '-cam">📷 ' + esc(opts.label || 'Photo') + '</label><input type="file" id="' + uid + '-cam" accept="image/*" capture="environment" hidden>' +
        '<label class="btn grow" for="' + uid + '-file">📎 File</label><input type="file" id="' + uid + '-file" accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx" hidden></div>' +
        '<p class="muted small" data-st>' + (opts.read && opts.read !== 'text' ? 'The photo is read for you; check the numbers before saving.' : '') + '</p>' +
        (list.length ? '<div class="thumbs">' + list.map(function (f, i) {
          return '<div class="thumb" data-i="' + i + '"><button type="button" class="tview" data-view="' + i + '" aria-label="Open ' + esc(f.name) + '">' + (/^image\//.test(f.type) ? '<img data-img="' + esc(f.id) + '" alt="">' : '<span class="fic">' + (/pdf/.test(f.type) ? 'PDF' : 'FILE') + '</span>') + '</button>' +
            '<span class="tname">' + esc(f.name) + '</span><button type="button" class="trm" data-rm="' + i + '" aria-label="Remove">✕</button></div>';
        }).join('') + '</div>' : '');
      $$('[data-img]', box).forEach(function (im) { get(im.dataset.img).then(function (r) { if (r) im.src = r.data; }); });
      $$('[data-rm]', box).forEach(function (b) { b.onclick = function () { list.splice(+b.dataset.rm, 1); draw(); }; });
      $$('[data-view]', box).forEach(function (b) { b.onclick = function () { view(list[+b.dataset.view]); }; });
      var st = function (t) { var p = $('[data-st]', box); if (p) p.textContent = t; };
      $('#' + uid + '-cam', box).onchange = $('#' + uid + '-file', box).onchange = function (e) {
        var f = e.target.files[0]; e.target.value = '';
        if (f) add(f, st);
      };
    }
    function add(file, st) {
      var meta = { id: rid(), name: file.name || 'photo.jpg', type: file.type || 'application/octet-stream', size: file.size };
      A.readFile(file, true).then(function (url) {
        if (/^image\//.test(meta.type)) {
          return loadImage(url).then(function (img) {
            var small = shrink(img, 1400, 0.72);
            meta.type = 'image/jpeg'; meta.size = Math.round(small.url.length * 0.75);
            if (!/\.jpe?g$/i.test(meta.name)) meta.name = (meta.name.replace(/\.[^.]+$/, '') || 'photo') + '.jpg';
            return put({ id: meta.id, name: meta.name, type: meta.type, size: meta.size, data: small.url, createdAt: new Date().toISOString() }).then(function () {
              list.push(meta); draw(); st = function (t) { var p = $('[data-st]', box); if (p) p.textContent = t; };
              if (!opts.read) return;
              return read(img, opts.read, st).then(function (out) {
                if (out.text) meta.text = String(out.text).slice(0, 3000);
                st(opts.read === 'text' ? 'Saved. Text read from the photo is searchable.' : 'Read' + (out.engine ? ' by ' + out.engine : '') + '. Check the numbers below.');
                if (opts.onRead) opts.onRead(out);
              }, function (e) { st(e.message); });
            });
          });
        }
        if (file.size > 8 * 1024 * 1024) throw new Error('That file is larger than 8 MB.');
        return put({ id: meta.id, name: meta.name, type: meta.type, size: meta.size, data: url, createdAt: new Date().toISOString() }).then(function () { list.push(meta); draw(); });
      }).catch(function (e) { A.toast(e.message, true); });
    }
    draw();
    return { files: function () { return list.slice(); } };
  }

  function view(meta) {
    get(meta.id).then(function (r) {
      if (!r) { A.toast('This file is not on this phone.', true); return; }
      if (/^image\//.test(r.type)) {
        var back = document.createElement('div'); back.className = 'sheet-back';
        back.innerHTML = '<div class="sheet"><img src="' + r.data + '" alt="' + esc(r.name) + '" style="width:100%;border-radius:10px"><div class="row"><button type="button" class="btn grow" data-share>Share</button><button type="button" class="btn primary grow" data-close>Close</button></div></div>';
        document.body.appendChild(back);
        $('[data-close]', back).onclick = function () { back.remove(); };
        $('[data-share]', back).onclick = function () { shareFile(r); };
        back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
      } else shareFile(r);
    });
  }
  function shareFile(r) {
    var Cap = window.Capacitor;
    if (A.native && Cap) {
      var data = r.data.split(',')[1];
      var call = function (pl, m, o) { return Cap.nativePromise ? Cap.nativePromise(pl, m, o) : Cap.Plugins[pl][m](o); };
      call('Filesystem', 'writeFile', { path: r.name, data: data, directory: 'CACHE' }).then(function (w) { return call('Share', 'share', { title: r.name, url: w.uri }); }).catch(function () { A.toast('Could not open the file', true); });
      return;
    }
    var a = document.createElement('a'); a.href = r.data; a.download = r.name; a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------------------------------------------------------------- sync to the office system
  function uploaded() { try { return JSON.parse(A.lsGet(UPKEY) || '{}'); } catch (e) { return {}; } }
  function uploadPending() {
    if (!A.sync.url) return Promise.resolve(0);
    var done = uploaded(), n = 0;
    return all().then(function (files) {
      var todo = files.filter(function (f) { return !done[f.id]; });
      return todo.reduce(function (p, f) {
        return p.then(function () {
          return fetch(A.serverBase() + 'api/files', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-pin': A.lsGet('bizreview-pin') || '' }, body: JSON.stringify(f) })
            .then(function (r) { if (r.ok) { done[f.id] = 1; n++; A.lsSet(UPKEY, JSON.stringify(done)); } });
        });
      }, Promise.resolve()).then(function () { return n; });
    }).catch(function () { return n; });
  }

  A.files = { attach: attach, get: get, all: all, put: put, view: view, read: read, loadImage: loadImage, uploadPending: uploadPending, parseCard: parseCard };
})();
