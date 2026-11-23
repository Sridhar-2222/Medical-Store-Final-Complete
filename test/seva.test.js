const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { normalisePhone, validateWorker, indiaDate } = require('../seva/workers');
const { fileStore } = require('../seva/store');
const { sevaRouter } = require('../seva/routes');

const good = {
  name: 'Ramulu', phone: '+91 98480 12345', area: 'Kothirampur', work: 'Mason',
  registered_by: 'Sai Medicals', consent: true,
};

test('normalisePhone accepts Indian mobile formats', () => {
  assert.equal(normalisePhone('98480 12345'), '9848012345');
  assert.equal(normalisePhone('+91-98480-12345'), '9848012345');
  assert.equal(normalisePhone('09848012345'), '9848012345');
  assert.equal(normalisePhone('12345'), null);
  assert.equal(normalisePhone('5848012345'), null);
});

test('validateWorker needs consent and the basic fields', () => {
  const v = validateWorker(good);
  assert.ok(v.ok);
  assert.equal(v.value.work, 'mason');
  assert.equal(v.value.phone, '9848012345');

  const bad = validateWorker({ ...good, consent: 'yes', phone: '1', work: 'astronaut' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['consent', 'phone', 'work']);
  assert.ok(validateWorker({ ...good, work: 'other' }).errors.work_detail);
});

test('indiaDate rolls over at Indian midnight', () => {
  assert.equal(indiaDate(new Date('2026-11-23T18:29:00Z')), '2026-11-23');
  assert.equal(indiaDate(new Date('2026-11-23T18:31:00Z')), '2026-11-24');
});

async function server(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seva-'));
  const app = express();
  app.use('/api/seva', sevaRouter({ store: fileStore(path.join(dir, 'w.json')), helperPin: undefined, ...opts }));
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/seva`;
  const req = (p, o = {}) => fetch(base + p, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) } });
  return { req, close: () => srv.close() };
}

test('register, search, free today, duplicate and remove', async () => {
  const { req, close } = await server();
  try {
    let r = await req('/workers', { method: 'POST', body: JSON.stringify(good) });
    assert.equal(r.status, 201);
    const w = await r.json();
    assert.equal(w.phone, '9848012345');
    assert.equal(w.registered_by, undefined, 'helper details are not public');

    r = await req('/workers', { method: 'POST', body: JSON.stringify({ ...good, name: 'Other' }) });
    assert.equal(r.status, 409);

    r = await req('/workers', { method: 'POST', body: JSON.stringify({ ...good, consent: false, phone: '9000000001' }) });
    assert.equal(r.status, 400);
    assert.ok((await r.json()).errors.consent);

    r = await req('/workers?area=kothi&work=mason');
    assert.equal((await r.json()).length, 1);
    r = await req('/workers?work=plumber');
    assert.equal((await r.json()).length, 0);

    r = await req(`/workers/${w.id}/free-today`, { method: 'POST', body: '{}' });
    assert.equal((await r.json()).free_today, true);
    r = await req(`/workers/${w.id}/free-today`, { method: 'POST', body: JSON.stringify({ free: false }) });
    assert.equal((await r.json()).free_today, false);

    r = await req(`/workers/${w.id}`, { method: 'DELETE' });
    assert.equal(r.status, 204);
    r = await req('/workers');
    assert.equal((await r.json()).length, 0);

    // Same number can be listed again after removal.
    r = await req('/workers', { method: 'POST', body: JSON.stringify(good) });
    assert.equal(r.status, 201);
  } finally { close(); }
});

test('helper PIN guards writes but not search', async () => {
  const { req, close } = await server({ helperPin: '4321' });
  try {
    let r = await req('/workers', { method: 'POST', body: JSON.stringify(good) });
    assert.equal(r.status, 401);
    r = await req('/workers', { method: 'POST', body: JSON.stringify(good), headers: { 'x-helper-pin': '1234' } });
    assert.equal(r.status, 401);
    r = await req('/workers', { method: 'POST', body: JSON.stringify(good), headers: { 'x-helper-pin': '4321' } });
    assert.equal(r.status, 201);
    r = await req('/workers');
    assert.equal(r.status, 200);
  } finally { close(); }
});
