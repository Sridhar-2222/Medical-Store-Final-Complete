/* BizCore service worker: keeps the app itself on the device so it opens with no internet.
 * Pages and files: try the network first (so updates arrive), fall back to the saved copy.
 * API calls are never cached here; the app keeps its own offline copy of the data. */
'use strict';
var CACHE = 'bizcore-app-v3';
var CORE = ['./', 'index.html', 'app.css', 'app.js', 'core/industries.js', 'core/engine.js', 'core/ai.js', 'core/review.js', 'core/ocr-parse.js', 'review-ui.js', 'manifest.webmanifest', 'icon.svg',
  'vendor/ocr/tesseract.min.js', 'vendor/ocr/worker.min.js', 'vendor/ocr/tesseract-core-lstm.wasm.js', 'vendor/ocr/lang/eng.traineddata.gz'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // Each file separately: on a static host some of these do not exist, and that is fine.
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('bizcore-app-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type !== 'cache' || !Array.isArray(d.urls)) return;
  caches.open(CACHE).then(function (c) {
    d.urls.forEach(function (u) {
      try { if (new URL(u).origin !== self.location.origin) return; } catch (err) { return; }
      c.match(u).then(function (hit) { if (!hit) c.add(u).catch(function () {}); });
    });
  });
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf('/api/') >= 0) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./').then(function (r) { return r || caches.match('index.html'); });
      return Response.error();
    });
  }));
});
