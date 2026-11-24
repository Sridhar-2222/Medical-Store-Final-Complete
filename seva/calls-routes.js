// Seva missed-call API (mounted at /api/seva). Everything here shows elders'
// phone numbers, so all of it needs the helper PIN, except the provider webhook,
// which needs its own secret token instead.
//
//   GET|POST /missed-calls/hook?token=…        provider webhook (Exotel-style CallFrom, or From/from/caller)
//   POST     /missed-calls                     helper adds a missed call seen on their own phone {phone}
//   GET      /missed-calls?area=               waiting (oldest first) + done today
//   POST     /missed-calls/:id/result          {result: "done"|"no_answer", handled_by, note}
//   POST     /callers                          register an elder (consent)
//   GET      /callers
//   DELETE   /callers/:id

const express = require('express');
const { pinOk } = require('./routes');
const { WAITING, DONE, callerPhone, validateCaller, indiaDayStart, buildList } = require('./calls');

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

function callsRouter({
  store,
  helperPin = process.env.SEVA_HELPER_PIN,
  hookToken = process.env.SEVA_MISSED_CALL_TOKEN,
  now = () => new Date(),
}) {
  const r = express.Router();
  r.use(express.json({ limit: '10kb' }));
  r.use(express.urlencoded({ extended: false, limit: '10kb' }));

  const helperOnly = (req, res, next) => {
    if (!helperPin || pinOk(req.get('x-helper-pin'), helperPin)) return next();
    res.status(401).json({ error: 'Wrong helper PIN.' });
  };

  const hook = async (req, res, next) => {
    if (!hookToken) return res.status(503).json({ error: 'Missed-call number not set up yet.' });
    if (!pinOk(req.query.token, hookToken)) return res.status(401).json({ error: 'Bad token.' });
    const src = { ...req.query, ...(req.body || {}) };
    const phone = callerPhone(src.CallFrom || src.From || src.from || src.caller);
    if (!phone) return res.status(400).json({ error: 'No caller number.' });
    try {
      await store.recordMissedCall(phone, 'provider', now());
      res.json({ ok: true });
    } catch (e) { next(e); }
  };
  r.get('/missed-calls/hook', hook);
  r.post('/missed-calls/hook', hook);

  r.post('/missed-calls', helperOnly, async (req, res, next) => {
    const phone = callerPhone(req.body?.phone);
    if (!phone || phone.length < 10) return res.status(400).json({ errors: { phone: 'Enter the number that called.' } });
    try {
      res.status(201).json(await store.recordMissedCall(phone, 'manual', now()));
    } catch (e) { next(e); }
  });

  r.get('/missed-calls', helperOnly, async (req, res, next) => {
    try {
      const [calls, callers] = await Promise.all([
        store.listMissedCalls({ since: indiaDayStart(now()) }),
        store.listCallers(),
      ]);
      res.json(buildList(calls, callers, { area: clean(String(req.query.area || '')).slice(0, 80) }));
    } catch (e) { next(e); }
  });

  r.post('/missed-calls/:id/result', helperOnly, async (req, res, next) => {
    const result = req.body?.result;
    if (result !== 'done' && result !== 'no_answer') return res.status(400).json({ error: 'result must be done or no_answer.' });
    const handledBy = clean(req.body?.handled_by).slice(0, 80);
    const note = clean(req.body?.note).slice(0, 300);
    try {
      let notOpen = false;
      const row = await store.updateMissedCall(req.params.id, (m) => {
        if (m.status !== WAITING) { notOpen = true; return; }
        m.attempts += 1;
        if (handledBy) m.handled_by = handledBy;
        if (note) m.note = note;
        if (result === 'done') { m.status = DONE; m.handled_at = now().toISOString(); }
      });
      if (!row) return res.status(404).json({ error: 'Not found.' });
      if (notOpen) return res.status(409).json({ error: 'Someone already called back.' });
      res.json(row);
    } catch (e) { next(e); }
  });

  r.post('/callers', helperOnly, async (req, res, next) => {
    const v = validateCaller(req.body);
    if (!v.ok) return res.status(400).json({ errors: v.errors });
    try {
      res.status(201).json(await store.addCaller(v.value, now()));
    } catch (e) {
      if (e.code === 'duplicate_phone') return res.status(409).json({ errors: { phone: e.message } });
      next(e);
    }
  });

  r.get('/callers', helperOnly, async (req, res, next) => {
    try { res.json(await store.listCallers()); } catch (e) { next(e); }
  });

  r.delete('/callers/:id', helperOnly, async (req, res, next) => {
    try {
      if (!(await store.removeCaller(req.params.id, now()))) return res.status(404).json({ error: 'Not found.' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, next) => {
    console.error('Seva calls error', err.message);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  });

  return r;
}

module.exports = { callsRouter };
