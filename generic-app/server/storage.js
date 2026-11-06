/*
 * Server-side persistence with layered fallbacks, so the app keeps working
 * when an external service is down:
 *
 *   1. Local JSON file (always on, atomic writes + rolling daily backups)
 *   2. Supabase mirror (optional; SUPABASE_URL + SUPABASE_KEY). Every change is
 *      queued and pushed in the background with retries. If Supabase is
 *      unreachable the queue is kept on disk and retried later — sales never
 *      wait for the network.
 *
 * On start-up, if the local file is missing (e.g. a fresh container on a free
 * host) and Supabase is configured, the database is restored from Supabase.
 * Uses only Node built-ins (fetch is built into Node 18+).
 */
'use strict';
const fs = require('fs');
const path = require('path');

function atomicWrite(file, text) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

class FileStore {
  constructor(dir, opts = {}) {
    this.dir = dir;
    this.file = path.join(dir, 'bizcore-db.json');
    this.queueFile = path.join(dir, 'sync-queue.json');
    this.backupDir = path.join(dir, 'backups');
    this.keepBackups = opts.keepBackups || 14;
    this.log = opts.log || (() => {});
    this.mirror = opts.mirror || null;
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.data = null;
    if (fs.existsSync(this.file)) {
      try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
      catch (e) {
        // Corrupt file: keep it for inspection and fall back to newest backup.
        fs.renameSync(this.file, this.file + '.corrupt-' + Date.now());
        this.data = this.latestBackup();
        this.log('Database file was corrupt; restored from backup: ' + (this.data ? 'yes' : 'no'));
      }
    }
    this.queue = [];
    if (fs.existsSync(this.queueFile)) {
      try { this.queue = JSON.parse(fs.readFileSync(this.queueFile, 'utf8')) || []; } catch (e) { this.queue = []; }
    }
  }

  latestBackup() {
    const files = fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.json')).sort();
    for (let i = files.length - 1; i >= 0; i--) {
      try { return JSON.parse(fs.readFileSync(path.join(this.backupDir, files[i]), 'utf8')); } catch (e) { /* try older */ }
    }
    return null;
  }

  commit(changes) {
    atomicWrite(this.file, JSON.stringify(this.data));
    this.dailyBackup();
    if (this.mirror && changes) {
      if (changes.full) this.queue = [{ full: true }];
      else {
        changes.upserts.forEach((u) => this.queue.push({ op: 'upsert', col: u.col, id: u.doc.id }));
        changes.deletes.forEach((d) => this.queue.push({ op: 'delete', col: d.col, id: d.id }));
        if (changes.settings || changes.upserts.length) this.queue.push({ op: 'meta' });
      }
      this.saveQueue();
      this.mirror.kick();
    }
  }

  saveQueue() { try { atomicWrite(this.queueFile, JSON.stringify(this.queue)); } catch (e) { this.log('queue save failed ' + e.message); } }

  dailyBackup() {
    const name = new Date().toISOString().slice(0, 10) + '.json';
    const target = path.join(this.backupDir, name);
    try {
      atomicWrite(target, JSON.stringify(this.data));
      const files = fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.json')).sort();
      files.slice(0, Math.max(0, files.length - this.keepBackups)).forEach((f) => fs.unlinkSync(path.join(this.backupDir, f)));
    } catch (e) { this.log('backup failed ' + e.message); }
  }
}

/*
 * Supabase mirror via the PostgREST HTTP API (no SDK).
 * Table (see supabase-schema.sql):
 *   bizcore_records(collection text, id text, data jsonb, updated_at timestamptz, primary key(collection,id))
 * Settings + counters are stored as collection '_meta', id 'db'.
 */
class SupabaseMirror {
  constructor({ url, key, table = 'bizcore_records', log = () => {}, fetchFn = globalThis.fetch }) {
    this.base = url.replace(/\/+$/, '') + '/rest/v1/' + table;
    this.headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
    this.log = log;
    this.fetch = fetchFn;
    this.store = null;
    this.running = false;
    this.lastError = null;
    this.lastSync = null;
    this.retryMs = 5000;
  }

  attach(store) { this.store = store; }

  status() {
    return { enabled: true, pending: this.store ? this.store.queue.length : 0, lastSync: this.lastSync, lastError: this.lastError };
  }

  async request(method, query, body, extraHeaders) {
    const res = await this.fetch(this.base + (query || ''), {
      method, headers: Object.assign({}, this.headers, extraHeaders || {}), body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async pullAll() {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const page = await this.request('GET', '?select=collection,id,data&order=collection,id', null, { Range: from + '-' + (from + 999) });
      rows.push(...page);
      if (page.length < 1000) break;
    }
    if (!rows.length) return null;
    const db = {};
    rows.forEach((r) => {
      if (r.collection === '_meta') { db.meta = r.data.meta; db.settings = r.data.settings; return; }
      (db[r.collection] = db[r.collection] || []).push(r.data);
    });
    return db;
  }

  kick() {
    if (this.running || !this.store) return;
    this.running = true;
    this.flush().catch((e) => {
      this.lastError = e.message;
      this.log('Supabase sync paused (' + e.message + '); retrying in ' + Math.round(this.retryMs / 1000) + 's. Data is safe locally.');
      setTimeout(() => this.kick(), this.retryMs).unref();
      this.retryMs = Math.min(this.retryMs * 2, 5 * 60 * 1000);
    }).finally(() => { this.running = false; });
  }

  async flush() {
    const st = this.store;
    while (st.queue.length) {
      const batch = st.queue.slice(0, 200);
      const db = st.data;
      if (batch.some((q) => q.full)) {
        await this.request('DELETE', '?collection=neq.__none__', null, { Prefer: 'return=minimal' });
        const rows = [{ collection: '_meta', id: 'db', data: { meta: db.meta, settings: db.settings } }];
        Object.keys(db).forEach((col) => { if (Array.isArray(db[col])) db[col].forEach((d) => rows.push({ collection: col, id: d.id, data: d })); });
        for (let i = 0; i < rows.length; i += 500) await this.upsert(rows.slice(i, i + 500));
        st.queue = st.queue.slice(st.queue.findIndex((q) => q.full) + 1);
        st.saveQueue();
        continue;
      }
      const ups = new Map();
      const dels = [];
      batch.forEach((q) => {
        if (q.op === 'meta') ups.set('_meta/db', { collection: '_meta', id: 'db', data: { meta: db.meta, settings: db.settings } });
        else if (q.op === 'upsert') {
          const doc = (db[q.col] || []).find((d) => d.id === q.id);
          if (doc) ups.set(q.col + '/' + q.id, { collection: q.col, id: q.id, data: doc });
        } else if (q.op === 'delete') { ups.delete(q.col + '/' + q.id); dels.push(q); }
      });
      if (ups.size) await this.upsert([...ups.values()]);
      for (const d of dels) await this.request('DELETE', '?collection=eq.' + encodeURIComponent(d.col) + '&id=eq.' + encodeURIComponent(d.id), null, { Prefer: 'return=minimal' });
      st.queue = st.queue.slice(batch.length);
      st.saveQueue();
    }
    this.lastSync = new Date().toISOString();
    this.lastError = null;
    this.retryMs = 5000;
  }

  upsert(rows) {
    const now = new Date().toISOString();
    return this.request('POST', '?on_conflict=collection,id', rows.map((r) => Object.assign({ updated_at: now }, r)),
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
  }
}

module.exports = { FileStore, SupabaseMirror, atomicWrite };
