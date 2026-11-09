'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server/server');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bizcore-test-'));
async function start(env, fetchFn) {
  const s = await createServer({ env: Object.assign({ SUPABASE_URL: '', SUPABASE_KEY: '', APP_PIN: '', GOOGLE_API_KEY: '' }, env), fetch: fetchFn });
  await new Promise((r) => s.server.listen(0, r));
  s.url = 'http://localhost:' + s.server.address().port;
  s.rpc = (method, args, pin) => fetch(s.url + '/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-pin': pin || '' }, body: JSON.stringify({ method, args }) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  return s;
}

test('RPC, static files, CSV export and persistence across restarts', async () => {
  const dir = tmp();
  let s = await start({ DATA_DIR: dir });
  const health = await (await fetch(s.url + '/api/health')).json();
  assert.equal(health.app, 'BizCore');
  assert.match(await (await fetch(s.url + '/')).text(), /BizCore/);
  assert.match(await (await fetch(s.url + '/core/engine.js')).text(), /createEngine/);
  assert.doesNotMatch(await (await fetch(s.url + '/..%2fserver/server.js')).text(), /createServer/);
  assert.doesNotMatch(await (await fetch(s.url + '/core/..%2f..%2fserver%2fserver.js')).text(), /createServer/);
  await s.rpc('setup', [{ industry: 'grocery', businessName: 'Corner Store' }]);
  const item = (await s.rpc('save', ['items', { name: 'Tea', price: 10, stock: 5 }])).body.result;
  const sale = await s.rpc('createSale', [{ lines: [{ itemId: item.id, qty: 2 }] }]);
  assert.equal(sale.body.ok, true);
  const bad = await s.rpc('createSale', [{ lines: [{ itemId: item.id, qty: 99 }] }]);
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Not enough stock/);
  assert.equal((await s.rpc('nope', [])).status, 400);
  const csv = await (await fetch(s.url + '/api/export/items.csv')).text();
  assert.match(csv, /Tea/);
  s.server.close(); s.server.closeAllConnections();
  s = await start({ DATA_DIR: dir });
  const got = (await s.rpc('get', ['items', item.id])).body.result;
  assert.equal(got.stock, 3);
  assert.ok(fs.readdirSync(path.join(dir, 'backups')).length >= 1);
  s.server.close(); s.server.closeAllConnections();
});

test('PIN protects the API', async () => {
  const s = await start({ DATA_DIR: tmp(), APP_PIN: '4321' });
  assert.equal((await s.rpc('info', [])).status, 401);
  assert.equal((await s.rpc('info', [], '1111')).status, 401);
  assert.equal((await s.rpc('info', [], '4321')).status, 200);
  assert.equal((await (await fetch(s.url + '/api/health')).json()).pinRequired, true);
  s.server.close(); s.server.closeAllConnections();
});

test('Supabase mirror queues while offline, syncs later, and restores a fresh server', async () => {
  const remote = new Map();
  let online = false;
  const fakeFetch = async (url, opts = {}) => {
    if (!String(url).startsWith('https://fake.supabase.co')) return globalThis.fetch(url, opts);
    if (!online) throw new Error('network down');
    const u = new URL(url);
    const ok = (body) => ({ ok: true, status: 200, text: async () => (body === undefined ? '' : JSON.stringify(body)), json: async () => body });
    if (opts.method === 'POST') { JSON.parse(opts.body).forEach((r) => remote.set(r.collection + '/' + r.id, r)); return ok(); }
    if (opts.method === 'DELETE') {
      const c = u.searchParams.get('collection'), id = u.searchParams.get('id');
      if (c === 'neq.__none__') remote.clear(); else remote.delete(c.slice(3) + '/' + id.slice(3));
      return ok();
    }
    const [from] = (opts.headers.Range || '0-999').split('-').map(Number);
    return ok([...remote.values()].slice(from, from + 1000));
  };
  const env = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_KEY: 'k' };
  const s = await start(Object.assign({ DATA_DIR: tmp() }, env), fakeFetch);
  s.mirror.retryMs = 20;
  await s.rpc('setup', [{ industry: 'bakery', businessName: 'Bake House' }]);
  await s.rpc('save', ['items', { name: 'Bun', price: 5, stock: 40 }]);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(s.store.queue.length > 0, 'changes wait in the queue while offline');
  assert.equal(remote.size, 0);
  online = true;
  for (let i = 0; i < 50 && s.store.queue.length; i++) await new Promise((r) => setTimeout(r, 30));
  assert.equal(s.store.queue.length, 0);
  assert.ok(remote.has('_meta/db'));
  assert.ok([...remote.keys()].some((k) => k.startsWith('items/')));
  s.server.close(); s.server.closeAllConnections();

  // brand-new container with an empty disk restores from Supabase
  const s2 = await start(Object.assign({ DATA_DIR: tmp() }, env), fakeFetch);
  const info = (await s2.rpc('info', [])).body.result;
  assert.equal(info.settings.businessName, 'Bake House');
  assert.equal(info.counts.items, 1);
  s2.server.close(); s2.server.closeAllConnections();
});

test('customer vault link opens without the shop PIN, data API stays locked', async () => {
  const s = await start({ DATA_DIR: tmp(), APP_PIN: '1111' });
  const c = (await s.rpc('save', ['customers', { name: 'Ravi <b>', phone: '1' }], '1111')).body.result;
  await s.rpc('saveVaultRecord', [{ customerId: c.id, kind: 'bill', title: 'Visit' }], '1111');
  const tok = (await s.rpc('ensureVaultToken', [c.id], '1111')).body.result;
  const page = await fetch(s.url + '/v/' + tok);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Ravi &lt;b&gt;/); assert.match(html, /Visit/);
  assert.equal((await fetch(s.url + '/v/' + 'x'.repeat(24))).status, 404);
  assert.equal((await s.rpc('vault', [c.id])).status, 401);
  s.server.close(); s.server.closeAllConnections();
});
