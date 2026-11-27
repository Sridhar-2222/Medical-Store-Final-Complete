const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server/server');
const speech = require('../web/speech');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a52f0000000049454e44ae426082', 'hex');

async function start(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));
  const app = createApp({ dataDir: dir, adminPin: '9999', ...opts });
  const server = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, { token, method = 'GET', body, form, admin } = {}) => {
    const headers = {};
    if (token) headers.authorization = 'Bearer ' + token;
    if (admin) headers['x-admin-pin'] = admin;
    if (body) headers['content-type'] = 'application/json';
    const r = await fetch(base + p, { method, headers, body: form || (body && JSON.stringify(body)) });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch (_) { json = text; }
    return { status: r.status, json, type: r.headers.get('content-type') };
  };
  return { base, call, close: () => server.close(), dir };
}

async function setup(t, opts) {
  const s = await start(opts);
  t.after(s.close);
  const emp = (await s.call('/api/auth/join', { method: 'POST', body: { phone: '98480 11111', pin: '1234', role: 'employer' } })).json.token;
  const cand = (await s.call('/api/auth/join', { method: 'POST', body: { phone: '+91 9000022222', pin: '4321', role: 'candidate' } })).json.token;
  const ff = new FormData();
  ff.set('name', 'Sri Vasudeva Medicals'); ff.set('type', 'Pharmacy / medical store'); ff.set('town', 'Karimnagar'); ff.set('about', 'Wholesale and retail');
  assert.equal((await s.call('/api/employer/firm', { token: emp, method: 'PUT', form: ff })).status, 200);
  const job = (await s.call('/api/jobs', { token: emp, method: 'POST', body: { role: 'Pharmacist', town: 'Karimnagar', salary: '18,000' } })).json;
  const rf = new FormData();
  rf.set('name', 'Ravi Kumar'); rf.set('role', 'Pharmacist'); rf.set('years', '3'); rf.set('town', 'Karimnagar');
  rf.set('qualification', 'D.Pharm'); rf.set('languages', 'Telugu, Hindi'); rf.set('words', 'I am honest and on time.');
  rf.set('photo', new Blob([PNG], { type: 'image/png' }), 'me.png');
  rf.set('certificate', new Blob([PNG], { type: 'image/png' }), 'cert.png');
  assert.equal((await s.call('/api/candidate/resume', { token: cand, method: 'PUT', form: rf })).status, 200);
  return { s, emp, cand, job };
}

test('full journey keeps phone numbers hidden until both agree', async (t) => {
  const { s, emp, cand, job } = await setup(t);
  assert.equal(job.job.salary, 18000);
  assert.match(job.link, /\/j\/[0-9a-f]{6}$/);

  // public board shows firm card, never phone
  const board = await s.call('/api/board');
  assert.equal(board.json.jobs.length, 1);
  assert.equal(board.json.jobs[0].firm.name, 'Sri Vasudeva Medicals');
  assert.ok(!JSON.stringify(board.json).includes('9848011111'));

  const ap = await s.call(`/api/jobs/${job.job.id}/apply`, { token: cand, method: 'POST' });
  assert.match(ap.json.application.code, /^HJ-\d{4}$/);
  assert.equal(ap.json.application.phone, null);

  // employer: code + photo + resume, no name, no certificate, no phone
  let list = (await s.call('/api/employer/applications', { token: emp })).json.applications;
  assert.equal(list.length, 1);
  let a = list[0];
  assert.equal(a.code, ap.json.application.code);
  assert.ok(a.photo);
  assert.equal(a.name, null);
  assert.equal(a.certificate, null);
  assert.equal(a.hasCertificate, true);
  assert.equal(a.phone, null);
  assert.equal(a.words, 'I am honest and on time.');
  assert.ok(!JSON.stringify(list).includes('9000022222'));
  assert.ok(!JSON.stringify(list).includes('Ravi'));

  // photo link works, and a tampered link does not
  const img = await s.call(a.photo);
  assert.equal(img.status, 200);
  assert.equal(img.type, 'image/png');
  assert.equal((await s.call(a.photo.replace(/s=[^&]+/, 's=AAAA'))).status, 404);

  // candidate cannot share before shortlisting
  assert.equal((await s.call(`/api/applications/${a.id}/share`, { token: cand, method: 'POST' })).status, 400);
  // employer notified of the application
  const en = (await s.call('/api/notifications', { token: emp })).json.notifications;
  assert.match(en[0].text, /New application HJ-/);
  assert.ok(!en[0].text.includes('Ravi'));

  // shortlist: name and certificate appear, phone still hidden
  a = (await s.call(`/api/applications/${a.id}/shortlist`, { token: emp, method: 'POST' })).json.application;
  assert.equal(a.status, 'shortlisted');
  assert.equal(a.name, 'Ravi Kumar');
  assert.ok(a.certificate);
  assert.equal(a.phone, null);
  const cn = (await s.call('/api/notifications', { token: cand })).json.notifications;
  assert.match(cn[0].text, /shortlisted you for Pharmacist/);
  let mine = (await s.call('/api/candidate/applications', { token: cand })).json.applications[0];
  assert.equal(mine.status, 'shortlisted');
  assert.equal(mine.phone, null);

  // share: both see each other's numbers
  mine = (await s.call(`/api/applications/${a.id}/share`, { token: cand, method: 'POST' })).json.application;
  assert.equal(mine.phone, '9848011111');
  a = (await s.call('/api/employer/applications', { token: emp })).json.applications[0];
  assert.equal(a.status, 'connected');
  assert.equal(a.phone, '9000022222');
});

test('roles are enforced and a second employer sees nothing', async (t) => {
  const { s, emp, cand, job } = await setup(t);
  await s.call(`/api/jobs/${job.job.id}/apply`, { token: cand, method: 'POST' });
  assert.equal((await s.call('/api/jobs', { token: cand, method: 'POST', body: { role: 'x', town: 'y' } })).status, 403);
  assert.equal((await s.call('/api/employer/applications', { token: cand })).status, 403);
  assert.equal((await s.call('/api/employer/applications')).status, 401);
  const other = (await s.call('/api/auth/join', { method: 'POST', body: { phone: '9111133333', pin: '1111', role: 'employer' } })).json.token;
  assert.deepEqual((await s.call('/api/employer/applications', { token: other })).json.applications, []);
  const id = (await s.call('/api/employer/applications', { token: emp })).json.applications[0].id;
  assert.equal((await s.call(`/api/applications/${id}/shortlist`, { token: other, method: 'POST' })).status, 404);
  // applying twice returns the same code
  const a1 = (await s.call(`/api/jobs/${job.job.id}/apply`, { token: cand, method: 'POST' })).json;
  assert.equal(a1.already, true);
});

test('settings can show name and certificate before shortlisting', async (t) => {
  const { s, emp, cand, job } = await setup(t, { nameBeforeShortlist: true, certBeforeShortlist: true });
  await s.call(`/api/jobs/${job.job.id}/apply`, { token: cand, method: 'POST' });
  const a = (await s.call('/api/employer/applications', { token: emp })).json.applications[0];
  assert.equal(a.name, 'Ravi Kumar');
  assert.ok(a.certificate);
  assert.equal(a.phone, null);
});

test('login, wrong PIN lockout, admin and QR', async (t) => {
  const { s } = await setup(t);
  assert.equal((await s.call('/api/auth/join', { method: 'POST', body: { phone: '9848011111', pin: '1234', role: 'employer' } })).status, 409);
  assert.equal((await s.call('/api/auth/login', { method: 'POST', body: { phone: '9848011111', pin: '1234' } })).status, 200);
  for (let i = 0; i < 5; i++) await s.call('/api/auth/login', { method: 'POST', body: { phone: '9848011111', pin: '0000' } });
  assert.equal((await s.call('/api/auth/login', { method: 'POST', body: { phone: '9848011111', pin: '1234' } })).status, 429);

  assert.equal((await s.call('/api/admin/overview', { admin: '1' })).status, 403);
  const ov = await s.call('/api/admin/overview', { admin: '9999' });
  assert.equal(ov.json.counts.employers, 1);
  const b = await s.call('/api/admin/board', { method: 'PUT', admin: '9999', body: { name: 'Karimnagar Pharmacy Jobs', roles: 'Pharmacist, Nurse' } });
  assert.deepEqual(b.json.board.roles, ['Pharmacist', 'Nurse']);

  const qr = await s.call('/api/qr.svg?u=' + encodeURIComponent(s.base + '/j'));
  assert.equal(qr.status, 200);
  assert.match(qr.type, /svg/);
  assert.equal((await s.call('/j/abc')).status, 200);
});

test('rejects a non-image photo', async (t) => {
  const { s, cand } = await setup(t);
  const f = new FormData();
  f.set('photo', new Blob(['<script>'], { type: 'text/html' }), 'x.html');
  const r = await s.call('/api/candidate/resume', { token: cand, method: 'PUT', form: f });
  assert.equal(r.status, 400);
});

test('voice: one sentence fills the resume', () => {
  const roles = ['Pharmacist', 'Pharmacy assistant', 'Lab technician', 'Nurse'];
  const r = speech.parseResume('My name is Ravi Kumar, pharmacist, 3 years experience, from Karimnagar, D.Pharm, I speak Telugu and Hindi', roles);
  assert.deepEqual(r, { name: 'Ravi Kumar', role: 'Pharmacist', years: 3, town: 'Karimnagar', qualification: 'D.Pharm', languages: 'Telugu, Hindi' });
  const r2 = speech.parseResume('I am Lakshmi, staff nurse with five years in Jagtial, GNM', roles);
  assert.equal(r2.name, 'Lakshmi');
  assert.equal(r2.role, 'Nurse');
  assert.equal(r2.years, 5);
  assert.equal(r2.town, 'Jagtial');
  assert.equal(r2.qualification, 'GNM');
  assert.equal(speech.parseResume('pharmacy assistant 2 years', roles).role, 'Pharmacy assistant');
});

test('voice: one sentence fills a job', () => {
  const roles = ['Pharmacist', 'Lab technician'];
  const j = speech.parseJob('Pharmacist in Karimnagar 18000 salary morning shift', roles);
  assert.equal(j.role, 'Pharmacist');
  assert.equal(j.town, 'Karimnagar');
  assert.equal(j.salary, 18000);
  assert.equal(speech.parseJob('lab technician at Peddapalli 15 thousand', roles).salary, 15000);
});
