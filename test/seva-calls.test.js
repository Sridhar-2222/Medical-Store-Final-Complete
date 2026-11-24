const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { callerPhone, validateCaller, indiaDayStart, buildList, fileCallsStore } = require('../seva/calls');
const { callsRouter } = require('../seva/calls-routes');

const elder = {
  name: 'Lakshmamma', phone: '9848012345', area: 'Kothirampur', needs: 'fruits',
  registered_by: 'Son – Ravi', consent: true,
};

test('callerPhone handles provider formats', () => {
  assert.equal(callerPhone('09848012345'), '9848012345');
  assert.equal(callerPhone('+919848012345'), '9848012345');
  assert.equal(callerPhone('040-2345678'), '0402345678');
  assert.equal(callerPhone(''), null);
});

test('validateCaller needs consent; family phone optional but valid', () => {
  assert.ok(validateCaller(elder).ok);
  assert.ok(validateCaller({ ...elder, consent: false }).errors.consent);
  assert.ok(validateCaller({ ...elder, family_phone: '123' }).errors.family_phone);
  assert.equal(validateCaller({ ...elder, family_phone: '+91 90000 00001' }).value.family_phone, '9000000001');
});

test('indiaDayStart is midnight IST', () => {
  assert.equal(indiaDayStart(new Date('2026-11-23T10:00:00Z')), '2026-11-22T18:30:00.000Z');
  assert.equal(indiaDayStart(new Date('2026-11-23T19:00:00Z')), '2026-11-23T18:30:00.000Z');
});

test('buildList: waiting oldest first, then done newest first, area filter', () => {
  const calls = [
    { id: 'a', phone: '1', status: 'waiting', first_at: '2026-11-23T05:00:00Z' },
    { id: 'b', phone: '2', status: 'done', first_at: '2026-11-23T03:00:00Z', handled_at: '2026-11-23T04:00:00Z' },
    { id: 'c', phone: '3', status: 'waiting', first_at: '2026-11-23T04:00:00Z' },
    { id: 'd', phone: '4', status: 'done', first_at: '2026-11-23T03:00:00Z', handled_at: '2026-11-23T06:00:00Z' },
  ];
  const callers = [{ phone: '1', name: 'A', area: 'Kothirampur' }, { phone: '3', name: 'C', area: 'Rampur' }];
  assert.deepEqual(buildList(calls, callers).map((m) => m.id), ['c', 'a', 'd', 'b']);
  assert.deepEqual(buildList(calls, callers, { area: 'kothi' }).map((m) => m.id), ['a']);
  assert.equal(buildList(calls, callers)[2].caller, null);
});

async function server(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seva-calls-'));
  let clock = new Date('2026-11-23T04:00:00Z');
  const app = express();
  app.use('/api/seva', callsRouter({ store: fileCallsStore(dir), helperPin: '4321', hookToken: 'secret', now: () => clock, ...opts }));
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/seva`;
  const req = (p, o = {}) => fetch(base + p, {
    ...o, headers: { 'Content-Type': 'application/json', 'x-helper-pin': '4321', ...(o.headers || {}) },
  });
  return { req, base, close: () => srv.close(), tick: (min) => { clock = new Date(clock.getTime() + min * 60000); } };
}

test('missed call flow: webhook, repeat ring, no answer, done, list', async () => {
  const s = await server();
  try {
    let r = await s.req('/callers', { method: 'POST', body: JSON.stringify(elder) });
    assert.equal(r.status, 201);
    r = await s.req('/callers', { method: 'POST', body: JSON.stringify(elder) });
    assert.equal(r.status, 409);

    // Exotel-style GET with CallFrom, no PIN needed but token required.
    r = await fetch(`${s.base}/missed-calls/hook?token=wrong&CallFrom=09848012345`);
    assert.equal(r.status, 401);
    r = await fetch(`${s.base}/missed-calls/hook?token=secret&CallFrom=09848012345`);
    assert.equal(r.status, 200);
    s.tick(5);
    // Form-encoded POST from another provider, same number: bumps the ring count.
    r = await fetch(`${s.base}/missed-calls/hook?token=secret`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'From=%2B919848012345',
    });
    assert.equal(r.status, 200);
    // Helper adds an unknown number by hand.
    s.tick(1);
    r = await s.req('/missed-calls', { method: 'POST', body: JSON.stringify({ phone: '90000 00001' }) });
    assert.equal(r.status, 201);

    r = await s.req('/missed-calls');
    let list = await r.json();
    assert.equal(list.length, 2);
    assert.equal(list[0].caller.name, 'Lakshmamma');
    assert.equal(list[0].rings, 2);
    assert.equal(list[1].caller, null);

    const id = list[0].id;
    r = await s.req(`/missed-calls/${id}/result`, { method: 'POST', body: JSON.stringify({ result: 'no_answer', handled_by: 'Sai' }) });
    assert.equal((await r.json()).attempts, 1);
    r = await s.req(`/missed-calls/${id}/result`, { method: 'POST', body: JSON.stringify({ result: 'done', handled_by: 'Sai', note: 'needs bananas' }) });
    const done = await r.json();
    assert.equal(done.status, 'done');
    assert.equal(done.attempts, 2);
    r = await s.req(`/missed-calls/${id}/result`, { method: 'POST', body: JSON.stringify({ result: 'done' }) });
    assert.equal(r.status, 409, 'second helper is told someone already called back');

    r = await s.req('/missed-calls');
    list = await r.json();
    assert.deepEqual(list.map((m) => m.status), ['waiting', 'done']);

    // A new ring after being handled starts a fresh waiting entry.
    r = await fetch(`${s.base}/missed-calls/hook?token=secret&CallFrom=9848012345`);
    r = await s.req('/missed-calls');
    assert.equal((await r.json()).filter((m) => m.status === 'waiting').length, 2);

    // Next India day: done calls from yesterday drop off.
    s.tick(24 * 60);
    r = await s.req('/missed-calls');
    assert.ok((await r.json()).every((m) => m.status === 'waiting'));
  } finally { s.close(); }
});

test('PIN required to see numbers; webhook off without token', async () => {
  const s = await server({ hookToken: undefined });
  try {
    let r = await s.req('/missed-calls', { headers: { 'x-helper-pin': '' } });
    assert.equal(r.status, 401);
    r = await s.req('/callers', { headers: { 'x-helper-pin': '1111' } });
    assert.equal(r.status, 401);
    r = await fetch(`${s.base}/missed-calls/hook?CallFrom=9848012345`);
    assert.equal(r.status, 503);
  } finally { s.close(); }
});
