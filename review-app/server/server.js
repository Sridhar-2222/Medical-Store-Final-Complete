#!/usr/bin/env node
/*
 * BizCore Review office server (optional). Phones keep working on their own;
 * when connected to this server they send every entry here, so the office
 * computer and every phone see the same numbers. Also serves each customer's
 * private vault page. No npm packages needed (Node 18+).
 *
 *   node server/server.js            then open http://<this computer>:8080
 *
 * Settings (environment variables or a .env file next to package.json):
 *   PORT (8080) · DATA_DIR (./data) · APP_PIN (recommended)
 *   SUPABASE_URL + SUPABASE_KEY (+ SUPABASE_SECRET) to keep an off-site copy
 *   GOOGLE_API_KEY for AI bill reading done by the server (optional)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createApp } = require('../core/base');
const { FileStore, SupabaseMirror } = require('./storage');

const ROOT = path.join(__dirname, '..');
(function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((l) => { const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
})(path.join(ROOT, '.env'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
const log = (m) => console.log(new Date().toISOString() + ' ' + m);
const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function same(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

// The page a customer opens from the link the business sends: titled with the business's own name.
function vaultPage(v) {
  const label = {}; (v.labels || []).forEach((l) => { label[l.key] = l; });
  const t = new Date().toISOString().slice(0, 10);
  const recs = v.records.map((r) => '<li><b>' + esc((label[r.kind] || {}).label || r.kind) + (r.title ? ': ' + esc(r.title) : '') + '</b><span>' + esc(r.date) +
    (r.dueDate ? ' · ' + esc((label[r.kind] || {}).dueLabel || 'Due') + ' <b class="' + (r.dueDate < t ? 'over' : '') + '">' + esc(r.dueDate) + '</b>' : '') + '</span>' + (r.details ? '<p>' + esc(r.details) + '</p>' : '') + '</li>').join('');
  const msgs = v.messages.slice(0, 40).map((m) => '<li><span>' + esc(m.date) + '</span><p>' + esc(m.text) + '</p></li>').join('');
  const title = v.shop.title || v.shop.name;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
    '<title>' + esc(title) + ' · ' + esc(v.customer.name) + '</title><style>:root{--bg:#f2f4f8;--card:#fff;--fg:#141b2d;--mut:#5d6679;--ink:#1f4fd8;--bad:#b42318;--line:#d9dfea}' +
    '@media (prefers-color-scheme:dark){:root{--bg:#0e131d;--card:#161d2b;--fg:#e7ebf3;--mut:#9ba6bc;--ink:#7f9dff;--bad:#ff8b80;--line:#2a3448;color-scheme:dark}}' +
    'body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}main{max-width:640px;margin:0 auto;padding:20px 16px 48px}header{background:var(--ink);color:#fff;border-radius:16px;padding:18px}' +
    'header h1{margin:0;font-size:1.5rem}header p{margin:4px 0 0;opacity:.9}h2{font-size:1rem;margin:22px 0 8px}ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}' +
    'li{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px}li span{display:block;color:var(--mut);font-size:13px}li p{margin:4px 0 0}.over{color:var(--bad)}.mut{color:var(--mut)}</style></head><body><main>' +
    '<header><p>Your vault at</p><h1>' + esc(title) + '</h1><p>' + esc([v.shop.address, v.shop.phone].filter(Boolean).join(' · ')) + '</p></header>' +
    '<p style="margin-top:14px">Hello ' + esc(v.customer.name) + '. ' + esc(title) + ' keeps your records and messages here.</p>' +
    '<h2>Your records</h2>' + (recs ? '<ul>' + recs + '</ul>' : '<p class="mut">Nothing saved yet.</p>') +
    '<h2>Messages from ' + esc(title) + '</h2>' + (msgs ? '<ul>' + msgs + '</ul>' : '<p class="mut">No messages yet.</p>') +
    (v.shop.phone ? '<p style="margin-top:22px"><a style="color:var(--ink)" href="https://wa.me/' + esc(String(v.shop.phone).replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')) + '">Message ' + esc(title) + ' on WhatsApp</a></p>' : '') +
    '<p class="mut" style="margin-top:22px;font-size:13px">Private link. Only people you share it with can open it.</p></main></body></html>';
}

async function createServer(options = {}) {
  const env = Object.assign({}, process.env, options.env || {});
  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));
  const www = path.resolve(env.WWW_DIR || path.join(ROOT, 'build', 'www'));
  let mirror = null;
  if (env.SUPABASE_URL && env.SUPABASE_KEY) mirror = new SupabaseMirror({ url: env.SUPABASE_URL, key: env.SUPABASE_KEY, secret: env.SUPABASE_SECRET, log, fetchFn: options.fetch || globalThis.fetch });
  const store = new FileStore(dataDir, { log, mirror });
  if (mirror) {
    mirror.attach(store);
    if (!store.data) { try { const r = await mirror.pullAll(); if (r) { store.data = r; log('Restored data from Supabase'); } } catch (e) { log('Supabase not reachable at start (' + e.message + '); using local data'); } }
  }
  const app = createApp(store);
  if (!fs.existsSync(store.file)) store.commit(null);
  if (mirror && store.queue.length) mirror.kick();
  const pin = env.APP_PIN || '';
  const ALLOWED = new Set(app.methods().filter((m) => m !== 'methods' && m !== 'vaultByToken'));

  function send(res, code, body, headers) {
    const raw = typeof body === 'string' || Buffer.isBuffer(body);
    res.writeHead(code, Object.assign({ 'Content-Type': raw ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers || {}));
    res.end(raw ? body : JSON.stringify(body));
  }
  function body(req, limit = 20 * 1024 * 1024) {
    return new Promise((resolve, reject) => { let n = 0; const c = []; req.on('data', (d) => { n += d.length; if (n > limit) { reject(new Error('Too large')); req.destroy(); } else c.push(d); }); req.on('end', () => resolve(Buffer.concat(c).toString('utf8'))); req.on('error', reject); });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-pin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    }
    try {
      if (p === '/api/health') return send(res, 200, { ok: true, app: 'BizCore Review', pinRequired: !!pin, business: app.info().settings.businessName, setupDone: app.info().settings.setupDone, sync: mirror ? mirror.status() : { enabled: false } });
      if (p.startsWith('/api/')) {
        if (pin && !same(req.headers['x-app-pin'] || '', pin)) return send(res, 401, { ok: false, error: 'Wrong or missing PIN' });
        if (p === '/api/rpc' && req.method === 'POST') {
          const { method, args } = JSON.parse((await body(req)) || '{}');
          if (!ALLOWED.has(method)) return send(res, 400, { ok: false, error: 'Unknown action' });
          try { return send(res, 200, { ok: true, result: app[method].apply(null, Array.isArray(args) ? args : []) }); }
          catch (e) { if (!e.userError) log('Error in ' + method + ': ' + e.stack); return send(res, e.userError ? 400 : 500, { ok: false, error: e.message }); }
        }
        if (p === '/api/entries' && req.method === 'POST') {
          const b = JSON.parse((await body(req)) || '[]');
          try { return send(res, 200, { ok: true, result: app.importEntries(Array.isArray(b) ? b : b.entries) }); }
          catch (e) { return send(res, e.userError ? 400 : 500, { ok: false, error: e.message }); }
        }
        return send(res, 404, { ok: false, error: 'Not found' });
      }
      const vm = p.match(/^\/v\/([a-z0-9]{16,40})$/);
      if (vm) {
        const v = app.vaultByToken(vm[1]);
        if (!v) return send(res, 404, 'This vault link is not valid any more. Ask the business for a new one.');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
        return res.end(vaultPage(v));
      }
      const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
      const file = path.join(www, rel);
      if (!file.startsWith(www + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    } catch (e) { log('Request failed ' + p + ': ' + e.message); send(res, 500, { ok: false, error: e.message }); }
  });
  return { server, app, store, mirror };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  createServer().then(({ server }) => server.listen(port, () => log('BizCore Review office server on http://localhost:' + port + (process.env.APP_PIN ? ' (PIN on)' : ' (no PIN: set APP_PIN)'))));
}
module.exports = { createServer, vaultPage };
