'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createServer } = require('../server/server');

test('office server: PIN, actions, import, titled customer vault page, restart keeps data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bzr-'));
  let s = await createServer({ env: { DATA_DIR: dir, APP_PIN: '4321', SUPABASE_URL: '' } });
  await new Promise((r) => s.server.listen(0, r));
  const url = 'http://localhost:' + s.server.address().port;
  const rpc = (method, args, pin = '4321') => fetch(url + '/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-pin': pin }, body: JSON.stringify({ method, args }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  assert.equal((await (await fetch(url + '/api/health')).json()).app, 'BizCore Review');
  assert.equal((await rpc('info', [], 'x')).status, 401);
  await rpc('setup', [{ industry: 'generic', businessName: 'ABC Furniture Shop' }]);
  const imp = await fetch(url + '/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-pin': '4321' }, body: JSON.stringify([{ date: '2026-11-05', type: 'sales', amount: 9000, department: 'Showroom' }]) }).then((r) => r.json());
  assert.equal(imp.result.imported, 1);
  const c = (await rpc('saveCustomer', [{ name: 'Ravi <b>', phone: '9000000002' }])).body.result;
  await rpc('saveVaultRecord', [{ customerId: c.id, kind: 'document', title: 'Sofa quote', details: '3-seater, teak' }]);
  const tok = (await rpc('ensureVaultToken', [c.id])).body.result;
  // a photo saved in the vault is uploaded by the phone, then shown on the customer's page
  const png = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');
  assert.equal((await fetch(url + '/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-pin': '4321' }, body: JSON.stringify({ id: 'f777777', name: 'quote.png', type: 'image/png', data: png }) })).status, 200);
  await rpc('saveCustomer', [Object.assign({}, c, { files: [{ id: 'f777777', name: 'quote.png', type: 'image/png' }] })]);
  assert.equal((await fetch(url + '/v/' + tok + '/f/f777777')).headers.get('content-type'), 'image/png');
  assert.equal((await fetch(url + '/v/' + tok + '/f/f000000')).status, 404, 'only files from this vault');
  const html = await (await fetch(url + '/v/' + tok)).text();
  assert.match(html, /Your documents/);
  assert.match(html, /<h1>ABC Furniture Shop<\/h1>/);
  assert.match(html, /Ravi &lt;b&gt;/); assert.match(html, /Sofa quote/);
  assert.equal((await fetch(url + '/v/' + 'z'.repeat(20))).status, 404);
  assert.equal((await rpc('vaultByToken', [tok])).status, 400, 'vault data not exposed through the action list');
  s.server.close(); s.server.closeAllConnections();
  s = await createServer({ env: { DATA_DIR: dir, APP_PIN: '4321', SUPABASE_URL: '' } });
  assert.equal(s.app.list('entries').total, 1);
});
