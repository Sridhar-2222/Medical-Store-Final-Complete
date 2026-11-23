// Seva API: chemist/helper registers a worker; customers search and call.
//   POST   /api/seva/workers                 list a worker (helper PIN)
//   GET    /api/seva/workers?area=&work=     search (public: name, work, area, phone)
//   POST   /api/seva/workers/:id/free-today  mark free today (helper PIN)
//   DELETE /api/seva/workers/:id             take a worker off the list (helper PIN)
//   GET    /api/seva/work-types

const express = require('express');
const crypto = require('crypto');
const { WORK_TYPES, validateWorker, indiaDate, publicView } = require('./workers');
const { DuplicatePhoneError } = require('./store');

function pinOk(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sevaRouter({ store, helperPin = process.env.SEVA_HELPER_PIN, now = () => new Date() }) {
  const r = express.Router();
  r.use(express.json({ limit: '10kb' }));

  // Writes need the helper PIN when one is set, so strangers can't list or remove people.
  const helperOnly = (req, res, next) => {
    if (!helperPin || pinOk(req.get('x-helper-pin'), helperPin)) return next();
    res.status(401).json({ error: 'Wrong helper PIN.' });
  };

  r.get('/work-types', (req, res) => res.json(WORK_TYPES));

  r.post('/workers', helperOnly, async (req, res, next) => {
    const v = validateWorker(req.body);
    if (!v.ok) return res.status(400).json({ errors: v.errors });
    try {
      const row = await store.add({ ...v.value, consent_at: now().toISOString() });
      res.status(201).json(publicView(row, now()));
    } catch (e) {
      if (e instanceof DuplicatePhoneError) return res.status(409).json({ errors: { phone: e.message } });
      next(e);
    }
  });

  r.get('/workers', async (req, res, next) => {
    try {
      const area = String(req.query.area || '').trim().slice(0, 80);
      const work = String(req.query.work || '').trim().slice(0, 40);
      const rows = await store.list({ area, work });
      res.json(rows.slice(0, 200).map((w) => publicView(w, now())));
    } catch (e) { next(e); }
  });

  r.post('/workers/:id/free-today', helperOnly, async (req, res, next) => {
    try {
      const row = await store.setFreeOn(req.params.id, req.body?.free === false ? null : indiaDate(now()));
      if (!row) return res.status(404).json({ error: 'Not found.' });
      res.json(publicView(row, now()));
    } catch (e) { next(e); }
  });

  r.delete('/workers/:id', helperOnly, async (req, res, next) => {
    try {
      if (!(await store.remove(req.params.id))) return res.status(404).json({ error: 'Not found.' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, next) => {
    console.error('Seva error', err.message);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  });

  return r;
}

module.exports = { sevaRouter, pinOk };
