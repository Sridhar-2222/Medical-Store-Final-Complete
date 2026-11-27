// Fingertip Jobs: a jobs page for pharmacy and health workers.
//
// Privacy rules are enforced here, on the server, never only in the browser:
//  - A phone number is never sent to the other side until the candidate,
//    after being shortlisted, taps "Share my number".
//  - Before shortlisting the employer sees the application code (HJ-4821),
//    the photo and the resume details, but not the name (setting below).
//  - The experience certificate is shown to the employer only after
//    shortlisting (setting below).
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { createStore } = require('./store');

let webpush = null;
try { webpush = require('web-push'); } catch (_) { /* push is optional */ }

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const CERT_TYPES = [...IMAGE_TYPES, 'application/pdf'];
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

function createApp(opts = {}) {
  const store = createStore(opts.dataDir || process.env.JOBS_DATA_DIR || path.join(__dirname, '..', 'data'));
  const settings = {
    adminPin: String(opts.adminPin || process.env.JOBS_ADMIN_PIN || ''),
    // Choice 1: show the candidate's name to the employer before shortlisting?
    nameBeforeShortlist: opts.nameBeforeShortlist ?? process.env.JOBS_NAME_BEFORE_SHORTLIST === 'yes',
    // Choice 2: show the experience certificate to the employer before shortlisting?
    certBeforeShortlist: opts.certBeforeShortlist ?? process.env.JOBS_CERT_BEFORE_SHORTLIST === 'yes',
    publicUrl: (opts.publicUrl || process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  };
  const db = () => store.db;
  const save = () => store.save();
  // Signs short-lived file links. Kept in the data file so links survive a restart.
  if (!db().secret) { db().secret = crypto.randomBytes(32).toString('hex'); save(); }
  const secret = opts.secret || process.env.JOBS_SECRET || db().secret;

  // ---------- push notifications (optional) ----------
  if (webpush) {
    if (!db().vapid) { db().vapid = webpush.generateVAPIDKeys(); save(); }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@example.com', db().vapid.publicKey, db().vapid.privateKey);
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 3 } });

  // ---------- helpers ----------
  const id = () => crypto.randomBytes(9).toString('base64url');
  const now = () => new Date().toISOString();
  const normPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : null; };
  const hashPin = (pin, salt = crypto.randomBytes(16).toString('hex')) =>
    salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
  const checkPin = (pin, stored) => {
    const [salt, h] = stored.split(':');
    const a = Buffer.from(hashPin(pin, salt).split(':')[1], 'hex');
    return crypto.timingSafeEqual(a, Buffer.from(h, 'hex'));
  };
  const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
  const baseUrl = (req) => settings.publicUrl || `${req.protocol}://${req.get('host')}`;

  function fileUrl(fileId) {
    if (!fileId || !db().files[fileId]) return null;
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const sig = crypto.createHmac('sha256', secret).update(fileId + '.' + exp).digest('base64url');
    return `/api/file/${fileId}?e=${exp}&s=${sig}`;
  }

  function saveFile(f, owner, kind, allowed) {
    if (!f) return null;
    if (!allowed.includes(f.mimetype)) throw new Error('This file type is not allowed. Use a photo (JPG/PNG) or PDF.');
    const fid = id();
    fs.writeFileSync(path.join(store.uploadsDir, fid + EXT[f.mimetype]), f.buffer);
    db().files[fid] = { owner, kind, mime: f.mimetype };
    return fid;
  }
  function removeFile(fid) {
    const f = fid && db().files[fid];
    if (!f) return;
    try { fs.unlinkSync(path.join(store.uploadsDir, fid + EXT[f.mime])); } catch (_) {}
    delete db().files[fid];
  }

  const failed = new Map(); // phone -> { n, until }
  function auth(req, res, next) {
    const tok = (req.get('authorization') || '').replace(/^Bearer /, '');
    const uid = tok && db().sessions[tok];
    const user = uid && db().users.find((u) => u.id === uid);
    if (!user) return bad(res, 'Please log in again.', 401);
    req.user = user;
    next();
  }
  const only = (role) => (req, res, next) => (req.user.role === role ? next() : bad(res, `Only for ${role}s.`, 403));
  function adminOnly(req, res, next) {
    const pin = String(req.get('x-admin-pin') || '');
    if (!settings.adminPin) return bad(res, 'Admin PIN is not set on the server (JOBS_ADMIN_PIN).', 403);
    const a = crypto.createHash('sha256').update(pin).digest();
    const b = crypto.createHash('sha256').update(settings.adminPin).digest();
    if (!crypto.timingSafeEqual(a, b)) return bad(res, 'Wrong admin PIN.', 403);
    next();
  }

  function newCode() {
    const used = new Set(db().applications.map((a) => a.code));
    for (;;) {
      const c = 'HJ-' + String(crypto.randomInt(1000, 10000));
      if (!used.has(c)) return c;
      if (used.size > 8000) return 'HJ-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    }
  }
  function newShort() {
    const used = new Set(db().jobs.map((j) => j.short));
    for (;;) { const s = crypto.randomBytes(3).toString('hex'); if (!used.has(s)) return s; }
  }

  async function notify(userId, text, link = '/#/my') {
    db().notifications.push({ id: id(), userId, text, link, read: false, createdAt: now() });
    save();
    const subs = db().push[userId] || [];
    if (!webpush || !subs.length) return;
    // The push body carries no personal details: only a nudge to open the app.
    const body = JSON.stringify({ title: db().board.name, body: text, link });
    const keep = [];
    for (const s of subs) {
      try { await webpush.sendNotification(s, body); keep.push(s); }
      catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) keep.push(s); }
    }
    db().push[userId] = keep;
    save();
  }

  // ---------- public views ----------
  function firmCard(employerId) {
    const f = db().firms[employerId];
    if (!f) return null;
    return { name: f.name, type: f.type, town: f.town, about: f.about, logo: fileUrl(f.logo) };
  }
  function publicJob(j) {
    return { id: j.id, short: j.short, role: j.role, town: j.town, salary: j.salary, details: j.details,
      open: j.open, createdAt: j.createdAt, firm: firmCard(j.employerId) };
  }
  const phoneOf = (uid) => (db().users.find((u) => u.id === uid) || {}).phone;

  // What the employer sees about one application.
  function forEmployer(a) {
    const r = db().resumes[a.candidateId] || {};
    const after = a.status === 'shortlisted' || a.status === 'connected';
    return {
      id: a.id, code: a.code, status: a.status, createdAt: a.createdAt,
      job: publicJob(db().jobs.find((j) => j.id === a.jobId)),
      photo: fileUrl(r.photo),
      name: settings.nameBeforeShortlist || after ? r.name || null : null,
      role: r.role, years: r.years, town: r.town, qualification: r.qualification, languages: r.languages, words: r.words,
      hasCertificate: !!r.certificate,
      certificate: settings.certBeforeShortlist || after ? fileUrl(r.certificate) : null,
      phone: a.status === 'connected' ? phoneOf(a.candidateId) : null,
    };
  }
  // What the candidate sees about one application.
  function forCandidate(a) {
    const j = db().jobs.find((x) => x.id === a.jobId);
    return {
      id: a.id, code: a.code, status: a.status, createdAt: a.createdAt, job: publicJob(j),
      phone: a.status === 'connected' ? phoneOf(a.employerId) : null,
    };
  }

  // ---------- routes: board ----------
  app.get('/api/board', (req, res) => {
    res.json({
      board: db().board,
      jobs: db().jobs.filter((j) => j.open).map(publicJob).reverse(),
      link: baseUrl(req) + '/j',
      pushKey: webpush ? db().vapid.publicKey : null,
    });
  });
  app.get('/api/jobs/:id', (req, res) => {
    const j = db().jobs.find((x) => x.id === req.params.id || x.short === req.params.id);
    if (!j) return bad(res, 'Job not found.', 404);
    res.json({ job: publicJob(j), link: baseUrl(req) + '/j/' + j.short });
  });

  app.get('/api/qr.svg', async (req, res) => {
    const u = String(req.query.u || '');
    if (!u || u.length > 300) return bad(res, 'Bad link.');
    const svg = await QRCode.toString(u, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
  });

  // ---------- routes: admin ----------
  app.get('/api/admin/overview', adminOnly, (req, res) => {
    const d = db();
    res.json({
      board: d.board,
      counts: {
        candidates: d.users.filter((u) => u.role === 'candidate').length,
        employers: d.users.filter((u) => u.role === 'employer').length,
        openJobs: d.jobs.filter((j) => j.open).length,
        applications: d.applications.length,
        shortlisted: d.applications.filter((a) => a.status !== 'applied').length,
        connected: d.applications.filter((a) => a.status === 'connected').length,
      },
      settings: { nameBeforeShortlist: settings.nameBeforeShortlist, certBeforeShortlist: settings.certBeforeShortlist },
    });
  });
  app.put('/api/admin/board', adminOnly, (req, res) => {
    const b = req.body || {};
    const roles = (Array.isArray(b.roles) ? b.roles : String(b.roles || '').split(','))
      .map((r) => clean(r, 40)).filter(Boolean).slice(0, 20);
    if (!clean(b.name)) return bad(res, 'Page name is needed.');
    if (!roles.length) return bad(res, 'Add at least one role.');
    db().board = { name: clean(b.name, 60), town: clean(b.town, 60), about: clean(b.about, 200), roles };
    save();
    res.json({ board: db().board });
  });

  // ---------- routes: joining ----------
  app.post('/api/auth/join', (req, res) => {
    const phone = normPhone(req.body.phone);
    const pin = String(req.body.pin || '');
    const role = req.body.role;
    if (!phone) return bad(res, 'Enter a 10-digit phone number.');
    if (!/^\d{4,6}$/.test(pin)) return bad(res, 'PIN must be 4 to 6 digits.');
    if (!['candidate', 'employer'].includes(role)) return bad(res, 'Choose: I want a job, or I give jobs.');
    if (db().users.some((u) => u.phone === phone)) return bad(res, 'This number has already joined. Log in instead.', 409);
    const user = { id: id(), phone, pinHash: hashPin(pin), role, createdAt: now() };
    db().users.push(user);
    const tok = crypto.randomBytes(24).toString('base64url');
    db().sessions[tok] = user.id;
    save();
    res.json({ token: tok, role });
  });
  app.post('/api/auth/login', (req, res) => {
    const phone = normPhone(req.body.phone);
    const f = failed.get(phone);
    if (f && f.n >= 5 && f.until > Date.now()) return bad(res, 'Too many tries. Wait 10 minutes.', 429);
    const user = phone && db().users.find((u) => u.phone === phone);
    if (!user || !checkPin(req.body.pin || '', user.pinHash)) {
      const n = (f && f.until > Date.now() ? f.n : 0) + 1;
      failed.set(phone, { n, until: Date.now() + 10 * 60 * 1000 });
      return bad(res, 'Phone or PIN is wrong.', 401);
    }
    failed.delete(phone);
    const tok = crypto.randomBytes(24).toString('base64url');
    db().sessions[tok] = user.id;
    save();
    res.json({ token: tok, role: user.role });
  });
  app.post('/api/auth/logout', auth, (req, res) => {
    const tok = (req.get('authorization') || '').replace(/^Bearer /, '');
    delete db().sessions[tok];
    save();
    res.json({ ok: true });
  });

  app.get('/api/me', auth, (req, res) => {
    const u = req.user;
    const out = { role: u.role, phone: u.phone, unread: db().notifications.filter((n) => n.userId === u.id && !n.read).length };
    if (u.role === 'candidate') {
      const r = db().resumes[u.id];
      out.resume = r ? { ...r, photo: fileUrl(r.photo), certificate: fileUrl(r.certificate), hasCertificate: !!r.certificate } : null;
    } else {
      const f = db().firms[u.id];
      out.firm = f ? { ...f, logo: fileUrl(f.logo) } : null;
    }
    res.json(out);
  });

  // ---------- routes: candidate ----------
  app.put('/api/candidate/resume', auth, only('candidate'),
    upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'certificate', maxCount: 1 }]),
    (req, res) => {
      const b = req.body || {};
      const old = db().resumes[req.user.id] || {};
      const r = {
        name: clean(b.name ?? old.name, 60),
        role: clean(b.role ?? old.role, 40),
        years: Math.max(0, Math.min(60, parseInt(b.years ?? old.years, 10) || 0)),
        town: clean(b.town ?? old.town, 60),
        qualification: clean(b.qualification ?? old.qualification, 100),
        languages: clean(b.languages ?? old.languages, 80),
        words: clean(b.words ?? old.words, 600),
        photo: old.photo || null,
        certificate: old.certificate || null,
        updatedAt: now(),
      };
      if (!r.name || !r.role) return bad(res, 'Name and role are needed.');
      try {
        const photo = req.files?.photo?.[0];
        const cert = req.files?.certificate?.[0];
        if (photo) { const fid = saveFile(photo, req.user.id, 'photo', IMAGE_TYPES); removeFile(old.photo); r.photo = fid; }
        if (cert) { const fid = saveFile(cert, req.user.id, 'certificate', CERT_TYPES); removeFile(old.certificate); r.certificate = fid; }
      } catch (e) { return bad(res, e.message); }
      if (b.removeCertificate === 'yes' && !req.files?.certificate) { removeFile(r.certificate); r.certificate = null; }
      db().resumes[req.user.id] = r;
      save();
      res.json({ ok: true });
    });

  app.post('/api/jobs/:id/apply', auth, only('candidate'), async (req, res) => {
    const j = db().jobs.find((x) => x.id === req.params.id);
    if (!j || !j.open) return bad(res, 'This job is closed.', 404);
    if (!db().resumes[req.user.id]) return bad(res, 'Make your resume first.');
    const existing = db().applications.find((a) => a.jobId === j.id && a.candidateId === req.user.id);
    if (existing) return res.json({ application: forCandidate(existing), already: true });
    const a = { id: id(), code: newCode(), jobId: j.id, candidateId: req.user.id, employerId: j.employerId,
      status: 'applied', createdAt: now() };
    db().applications.push(a);
    save();
    await notify(j.employerId, `New application ${a.code} for ${j.role}. Open the app to see it.`, '/#/firm');
    res.json({ application: forCandidate(a) });
  });

  app.get('/api/candidate/applications', auth, only('candidate'), (req, res) => {
    res.json({ applications: db().applications.filter((a) => a.candidateId === req.user.id).map(forCandidate).reverse() });
  });

  app.post('/api/applications/:id/share', auth, only('candidate'), async (req, res) => {
    const a = db().applications.find((x) => x.id === req.params.id && x.candidateId === req.user.id);
    if (!a) return bad(res, 'Not found.', 404);
    if (a.status === 'applied') return bad(res, 'You can share your number once the employer shortlists you.');
    if (a.status !== 'connected') {
      a.status = 'connected'; a.sharedAt = now(); save();
      await notify(a.employerId, `Candidate ${a.code} shared their number. Open the app to call.`, '/#/firm');
    }
    res.json({ application: forCandidate(a) });
  });

  // ---------- routes: employer ----------
  app.put('/api/employer/firm', auth, only('employer'), upload.single('logo'), (req, res) => {
    const b = req.body || {};
    const old = db().firms[req.user.id] || {};
    const f = {
      name: clean(b.name ?? old.name, 80),
      type: clean(b.type ?? old.type, 40),
      town: clean(b.town ?? old.town, 60),
      about: clean(b.about ?? old.about, 160),
      logo: old.logo || null,
      updatedAt: now(),
    };
    if (!f.name || !f.town) return bad(res, 'Firm name and town are needed.');
    try {
      if (req.file) { const fid = saveFile(req.file, req.user.id, 'logo', IMAGE_TYPES); removeFile(old.logo); f.logo = fid; }
    } catch (e) { return bad(res, e.message); }
    db().firms[req.user.id] = f;
    save();
    res.json({ ok: true });
  });

  app.post('/api/jobs', auth, only('employer'), (req, res) => {
    if (!db().firms[req.user.id]) return bad(res, 'Make your firm card first.');
    const b = req.body || {};
    const j = { id: id(), short: newShort(), employerId: req.user.id, role: clean(b.role, 40), town: clean(b.town, 60),
      salary: Math.max(0, parseInt(String(b.salary || '').replace(/\D/g, ''), 10) || 0),
      details: clean(b.details, 300), open: true, createdAt: now() };
    if (!j.role || !j.town) return bad(res, 'Role and town are needed.');
    db().jobs.push(j);
    save();
    res.json({ job: publicJob(j), link: baseUrl(req) + '/j/' + j.short });
  });
  app.post('/api/jobs/:id/close', auth, only('employer'), (req, res) => {
    const j = db().jobs.find((x) => x.id === req.params.id && x.employerId === req.user.id);
    if (!j) return bad(res, 'Not found.', 404);
    j.open = req.body.open === true;
    save();
    res.json({ job: publicJob(j) });
  });
  app.get('/api/employer/jobs', auth, only('employer'), (req, res) => {
    const jobs = db().jobs.filter((j) => j.employerId === req.user.id).reverse().map((j) => ({
      ...publicJob(j), applications: db().applications.filter((a) => a.jobId === j.id).length,
    }));
    res.json({ jobs });
  });
  app.get('/api/employer/applications', auth, only('employer'), (req, res) => {
    res.json({ applications: db().applications.filter((a) => a.employerId === req.user.id).map(forEmployer).reverse() });
  });
  app.post('/api/applications/:id/shortlist', auth, only('employer'), async (req, res) => {
    const a = db().applications.find((x) => x.id === req.params.id && x.employerId === req.user.id);
    if (!a) return bad(res, 'Not found.', 404);
    if (a.status === 'applied') {
      a.status = 'shortlisted'; a.shortlistedAt = now(); save();
      const j = db().jobs.find((x) => x.id === a.jobId);
      const firm = db().firms[a.employerId];
      await notify(a.candidateId, `Good news: ${firm ? firm.name : 'an employer'} shortlisted you for ${j.role}. Open the app to share your number.`, '/#/my');
    }
    res.json({ application: forEmployer(a) });
  });

  // ---------- routes: notifications ----------
  app.get('/api/notifications', auth, (req, res) => {
    res.json({ notifications: db().notifications.filter((n) => n.userId === req.user.id).slice(-50).reverse() });
  });
  app.post('/api/notifications/read', auth, (req, res) => {
    db().notifications.forEach((n) => { if (n.userId === req.user.id) n.read = true; });
    save();
    res.json({ ok: true });
  });
  app.post('/api/push/subscribe', auth, (req, res) => {
    const s = req.body && req.body.subscription;
    if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint)) return bad(res, 'Bad subscription.');
    const list = (db().push[req.user.id] || []).filter((x) => x.endpoint !== s.endpoint);
    list.push({ endpoint: s.endpoint, keys: s.keys });
    db().push[req.user.id] = list.slice(-5);
    save();
    res.json({ ok: true });
  });

  // ---------- files: only through short-lived signed links ----------
  app.get('/api/file/:id', (req, res) => {
    const f = db().files[req.params.id];
    const exp = parseInt(req.query.e, 10);
    if (!f || !exp || exp < Date.now() / 1000) return res.status(404).end();
    const want = crypto.createHmac('sha256', secret).update(req.params.id + '.' + exp).digest();
    const got = Buffer.from(String(req.query.s || ''), 'base64url');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return res.status(404).end();
    res.type(f.mime).set('Cache-Control', 'private, max-age=3600');
    res.sendFile(path.join(store.uploadsDir, req.params.id + EXT[f.mime]));
  });

  // ---------- web app ----------
  const web = path.join(__dirname, '..', 'web');
  app.use(express.static(web, { index: 'index.html' }));
  app.get(['/j', '/j/:short', '/admin'], (req, res) => res.sendFile(path.join(web, 'index.html')));
  app.get('/health', (req, res) => res.send('ok'));

  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return bad(res, err.code === 'LIMIT_FILE_SIZE' ? 'File is too big (max 5 MB).' : err.message);
    console.error(err);
    bad(res, 'Something went wrong.', 500);
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 8080;
  createApp().listen(port, () => console.log(`Jobs page on http://localhost:${port}`));
}

module.exports = { createApp };
