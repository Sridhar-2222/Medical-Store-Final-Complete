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

async function createServer(options = {}) {
  const env = Object.assign({}, process.env, options.env || {});
  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));
  let mirror = null;
  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    mirror = new SupabaseMirror({ url: env.SUPABASE_URL, key: env.SUPABASE_KEY, log, fetchFn: options.fetch || globalThis.fetch });
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
        return send(res, 404, { ok: false, error: 'Not found' });
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
