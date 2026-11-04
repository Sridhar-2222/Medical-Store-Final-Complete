process.env.SUPABASE_URL ||= 'http://127.0.0.1:9';
process.env.SUPABASE_KEY ||= 'test';
process.env.GOOGLE_API_KEY ||= 'test';

const test = require('node:test');
const assert = require('node:assert');
const { app, parseModelJson, normaliseMedicine } = require('../whatsapp-bot');

function listen() {
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test('parseModelJson tolerates code fences and prose', () => {
  assert.deepEqual(parseModelJson('```json\n[{"name":"A","qty":1}]\n```'), [{ name: 'A', qty: 1 }]);
  assert.deepEqual(parseModelJson('Here you go: [] thanks'), []);
  assert.deepEqual(parseModelJson('no json'), []);
});

test('normaliseMedicine cleans model output', () => {
  assert.equal(normaliseMedicine({ name: '  ' }), null);
  assert.deepEqual(normaliseMedicine({ name: 'Dolo 650', qty: '15', mrp: 'x', expiry: '12/2026' }),
    { name: 'Dolo 650', batch: '', qty: 15, mrp: null, expiry: null });
});

test('routes: / serves UI, /health ok, upload validates, DB errors return 502 not hang', async () => {
  const srv = await listen();
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Medical Store/);

    const health = await fetch(`${base}/health`);
    assert.equal((await health.json()).status, 'ok');

    const up = await fetch(`${base}/api/upload-bill`, { method: 'POST' });
    assert.equal(up.status, 400);

    const meds = await fetch(`${base}/api/medicines`, { signal: AbortSignal.timeout(15000) });
    assert.equal(meds.status, 502);

    const ready = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(15000) });
    assert.equal(ready.status, 503);
  } finally {
    srv.close();
  }
});
