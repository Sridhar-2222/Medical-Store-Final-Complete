#!/usr/bin/env node
/*
 * BizCore server — zero npm dependencies (Node 18+).
 *
 *   node server/server.js
 *
 * Environment variables (all optional):
 *   PORT            default 8080
 *   DATA_DIR        where the JSON database + backups live (default ./data)
 *   APP_PIN         if set, the app asks for this PIN before showing data
 *   SUPABASE_URL    + SUPABASE_KEY  -> mirror every change to Supabase
 *   SUPABASE_SECRET  sent as x-bizcore-secret (use with the anon key + supabase-schema.sql policy)
 *   GOOGLE_API_KEY  enables "Scan bill with AI" on purchases
 *   GEMINI_MODEL    default gemini-2.5-flash
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEngine } = require('../core/engine');
const Industries = require('../core/industries');
const AI = require('../core/ai');
const { FileStore, SupabaseMirror } = require('./storage');

loadDotEnv(path.join(__dirname, '..', '.env'));

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const CORE = path.join(ROOT, 'core');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

function log(msg) { console.log(new Date().toISOString() + ' ' + msg); }

function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function htmlEsc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function vaultPage(v) {
  const label = {}; (v.labels || []).forEach((l) => { label[l.key] = l; });
  const t = new Date().toISOString().slice(0, 10);
  const recs = v.records.map((r) => '<li><b>' + htmlEsc((label[r.kind] || {}).label || r.kind) + (r.title ? ': ' + htmlEsc(r.title) : '') + '</b><span>' + htmlEsc(r.date) +
    (r.dueDate ? ' · ' + htmlEsc((label[r.kind] || {}).dueLabel || 'Due') + ' <b class="' + (r.dueDate < t ? 'over' : '') + '">' + htmlEsc(r.dueDate) + '</b>' : '') + '</span>' + (r.details ? '<p>' + htmlEsc(r.details) + '</p>' : '') + '</li>').join('');
  const bills = v.bills.map((b) => '<li><b>' + htmlEsc(b.number) + ' · ' + htmlEsc(b.total.toFixed(2)) + '</b><span>' + htmlEsc(b.date) + (b.due ? ' · due ' + htmlEsc(b.due.toFixed(2)) : '') + '</span><p>' + b.lines.map((l) => htmlEsc(l.name + ' × ' + l.qty)).join(', ') + '</p></li>').join('');
  const msgs = v.messages.slice(0, 30).map((m) => '<li><span>' + htmlEsc(m.date) + '</span><p>' + htmlEsc(m.text) + '</p></li>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
    '<title>' + htmlEsc(v.customer.name) + ' · ' + htmlEsc(v.shop.name) + ' vault</title><style>' +
    ':root{--bg:#f3f5f9;--card:#fff;--fg:#172033;--mut:#5b6579;--ink:#2448c8;--bad:#b3261e;--line:#d8dee9}@media (prefers-color-scheme:dark){:root{--bg:#0f1420;--card:#161d2c;--fg:#e6eaf3;--mut:#9aa5bb;--ink:#7d9bff;--bad:#ff8a80;--line:#2b3549;color-scheme:dark}}' +
    'body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}main{max-width:720px;margin:0 auto;padding:20px 16px 48px}h1{font-size:1.4rem;margin:0}h2{font-size:1rem;margin:24px 0 8px}' +
    '.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px}li span{display:block;color:var(--mut);font-size:13px}li p{margin:4px 0 0}.over{color:var(--bad)}.mut{color:var(--mut)}' +
    '</style></head><body><main><div class="card"><div class="mut">Your vault at</div><h1>' + htmlEsc(v.shop.name) + '</h1><div class="mut">' + htmlEsc([v.shop.address, v.shop.phone].filter(Boolean).join(' · ')) + '</div>' +
    '<p>Hello ' + htmlEsc(v.customer.name) + '. Your records, bills and messages from ' + htmlEsc(v.shop.name) + ' are kept here.' + (v.customer.points ? ' Loyalty points: <b>' + htmlEsc(v.customer.points) + '</b>.' : '') + (v.customer.balance > 0 ? ' Balance due: <b>' + htmlEsc(v.customer.balance.toFixed(2)) + '</b>.' : '') + '</p></div>' +
    '<h2>Records</h2>' + (recs ? '<ul>' + recs + '</ul>' : '<p class="mut">Nothing saved yet.</p>') +
    (bills ? '<h2>Bills</h2><ul>' + bills + '</ul>' : '') +
    '<h2>Messages from ' + htmlEsc(v.shop.name) + '</h2>' + (msgs ? '<ul>' + msgs + '</ul>' : '<p class="mut">No messages yet.</p>') +
    '<p class="mut" style="margin-top:28px">Private link: only people you share it with can open it.</p></main></body></html>';
}

async function createServer(options = {}) {
  const env = Object.assign({}, process.env, options.env || {});
  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));
  let mirror = null;
  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    mirror = new SupabaseMirror({ url: env.SUPABASE_URL, key: env.SUPABASE_KEY, secret: env.SUPABASE_SECRET, log, fetchFn: options.fetch || globalThis.fetch });
  }
  const store = new FileStore(dataDir, { log, mirror });
  if (mirror) {
    mirror.attach(store);
    if (!store.data) {
      try {
        const remote = await mirror.pullAll();
        if (remote) { store.data = remote; log('Restored database from Supabase'); }
      } catch (e) { log('Could not reach Supabase at start-up (' + e.message + '); starting from local data.'); }
    }
  }
  const engine = createEngine(store);
  if (!fs.existsSync(store.file)) store.commit(null);
  if (mirror && store.queue.length) mirror.kick();

  const pin = env.APP_PIN || '';
  const aiKey = env.GOOGLE_API_KEY || env.GEMINI_API_KEY || '';
  const PUBLIC_METHODS = new Set(engine.methods().filter((m) => m !== 'methods'));

  function send(res, status, body, headers) {
    const isBuf = Buffer.isBuffer(body) || typeof body === 'string';
    res.writeHead(status, Object.assign({ 'Content-Type': isBuf ? 'text/plain; charset=utf-8' : 'application/json',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers || {}));
    res.end(isBuf ? body : JSON.stringify(body));
  }

  function readBody(req, limit = 15 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Request too large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function authorised(req, url) {
    if (!pin) return true;
    return safeEqual(req.headers['x-app-pin'] || url.searchParams.get('pin') || '', pin);
  }

  function serveStatic(res, file) {
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'Not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/') || p === '/health') {
      // The Android app runs from its own origin, so the API must allow cross-origin calls.
      // Data stays protected by APP_PIN, which is sent in a header, not a cookie.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-pin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    }
    try {
      if (p === '/api/health' || p === '/health') {
        return send(res, 200, { ok: true, app: 'BizCore', mode: 'server', pinRequired: !!pin, ai: !!aiKey,
          sync: mirror ? mirror.status() : { enabled: false }, time: new Date().toISOString() });
      }
      if (p.startsWith('/api/')) {
        if (!authorised(req, url)) return send(res, 401, { ok: false, error: 'PIN required' });

        if (p === '/api/rpc' && req.method === 'POST') {
          const { method, args } = JSON.parse((await readBody(req)) || '{}');
          if (!PUBLIC_METHODS.has(method)) return send(res, 400, { ok: false, error: 'Unknown action ' + method });
          try {
            const result = engine[method].apply(null, Array.isArray(args) ? args : []);
            return send(res, 200, { ok: true, result });
          } catch (e) {
            if (!e.userError) log('Error in ' + method + ': ' + (e.stack || e.message));
            return send(res, e.userError ? 400 : 500, { ok: false, error: e.message });
          }
        }
        let m = p.match(/^\/api\/export\/([a-zA-Z]+)\.csv$/);
        if (m && req.method === 'GET') {
          return send(res, 200, '﻿' + engine.exportCSV(m[1]), { 'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="' + m[1] + '-' + new Date().toISOString().slice(0, 10) + '.csv"' });
        }
        if (p === '/api/backup' && req.method === 'GET') {
          return send(res, 200, JSON.stringify(engine.exportAll()), { 'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="bizcore-backup-' + new Date().toISOString().slice(0, 10) + '.json"' });
        }
        if (p === '/api/ai/read-bill' && req.method === 'POST') {
          if (!aiKey) return send(res, 400, { ok: false, error: 'AI is not configured on the server (set GOOGLE_API_KEY)' });
          const body = JSON.parse(await readBody(req));
          const info = engine.info();
          try {
            const lines = await AI.readBill(options.fetch || globalThis.fetch, { apiKey: aiKey, model: env.GEMINI_MODEL || info.settings.geminiModel,
              base64: body.base64, mimeType: body.mimeType, presetName: info.preset.name, itemLabel: info.preset.labels.item });
            return send(res, 200, { ok: true, result: lines });
          } catch (e) { return send(res, 502, { ok: false, error: e.message }); }
        }
        // Other software (billing machine, POS, accounting) can push numbers here.
        // Body: JSON array of rows, or {entries:[...]}; see README "Connect your billing software".
        if (p === '/api/entries' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '[]');
          try { return send(res, 200, { ok: true, result: engine.importEntries(Array.isArray(body) ? body : body.entries) }); }
          catch (e) { return send(res, e.userError ? 400 : 500, { ok: false, error: e.message }); }
        }
        if (p === '/api/ai/read-report' && req.method === 'POST') {
          if (!aiKey) return send(res, 400, { ok: false, error: 'AI is not configured on the server (set GOOGLE_API_KEY)' });
          const body = JSON.parse(await readBody(req));
          try { return send(res, 200, { ok: true, result: await AI.readSalesReport(options.fetch || globalThis.fetch, { apiKey: aiKey, model: env.GEMINI_MODEL, base64: body.base64, mimeType: body.mimeType, presetName: engine.info().preset.name }) }); }
          catch (e) { return send(res, 502, { ok: false, error: e.message }); }
        }
        if (p === '/api/ai/read-receipt' && req.method === 'POST') {
          if (!aiKey) return send(res, 400, { ok: false, error: 'AI is not configured on the server (set GOOGLE_API_KEY)' });
          const body = JSON.parse(await readBody(req));
          const info = engine.info();
          const dep = body.departmentId ? (engine.get('departments', body.departmentId) || {}).name : '';
          try {
            const out = await AI.readReceipt(options.fetch || globalThis.fetch, { apiKey: aiKey, model: env.GEMINI_MODEL || info.settings.geminiModel,
              base64: body.base64, mimeType: body.mimeType, presetName: info.preset.name, department: dep,
              hints: info.preset.review.receiptHints, categories: info.preset.review.costCategories.map((c) => c.name), expectType: body.type });
            return send(res, 200, { ok: true, result: out });
          } catch (e) { return send(res, 502, { ok: false, error: e.message }); }
        }
        return send(res, 404, { ok: false, error: 'Not found' });
      }

      // ---- Customer Vault: a private, read-only page for one customer (no PIN; the long link is the key) ----
      const vm = p.match(/^\/v\/([a-z0-9]{16,40})$/);
      if (vm) {
        const v = engine.vaultByToken(vm[1]);
        if (!v) return send(res, 404, 'This vault link is not valid any more. Ask the shop for a new one.');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
        return res.end(vaultPage(v));
      }

      // ---- static files ----
      if (p.startsWith('/core/')) {
        const f = path.join(CORE, path.basename(p));
        return serveStatic(res, f);
      }
      const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
      const file = path.join(PUBLIC, rel);
      if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return serveStatic(res, file);
      return serveStatic(res, path.join(PUBLIC, 'index.html'));
    } catch (e) {
      log('Request failed ' + p + ': ' + e.message);
      return send(res, 500, { ok: false, error: e.message });
    }
  });

  return { server, engine, store, mirror };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  createServer().then(({ server, mirror }) => {
    server.listen(port, () => {
      log('BizCore running on http://localhost:' + port);
      log('Industries available: ' + Industries.list().map((i) => i.key).join(', '));
      log('Supabase mirror: ' + (mirror ? 'ON' : 'off (local file storage only)'));
    });
  }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { createServer };
