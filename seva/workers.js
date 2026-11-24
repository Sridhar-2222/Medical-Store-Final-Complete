// Seva: a chemist or helper lists a worker who has no smartphone.
// Customers then find the worker by area and work and call their basic phone.
// Pure validation lives here; storage is in store.js.

const WORK_TYPES = [
  'labour', 'mason', 'painter', 'plumber', 'electrician', 'carpenter',
  'driver', 'auto', 'cook', 'cleaning', 'farm', 'fruit seller',
  'vegetable seller', 'grocery', 'tailor', 'other',
];

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

// Accepts "98480 12345", "+91 9848012345", "09848012345"; returns "9848012345" or null.
function normalisePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

// Returns { ok: true, value } or { ok: false, errors: { field: message } }.
function validateWorker(input = {}) {
  const errors = {};
  const name = clean(input.name);
  const area = clean(input.area);
  const work = clean(input.work).toLowerCase();
  const registeredBy = clean(input.registered_by);
  const phone = normalisePhone(input.phone);

  if (name.length < 2 || name.length > 80) errors.name = 'Enter the worker\'s name (2–80 letters).';
  if (!phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
  if (area.length < 2 || area.length > 80) errors.area = 'Enter the area or village.';
  if (!WORK_TYPES.includes(work)) errors.work = 'Choose a type of work.';
  if (registeredBy.length < 2 || registeredBy.length > 80) errors.registered_by = 'Enter your name or shop name.';
  if (input.consent !== true) errors.consent = 'The worker must say yes to being listed, with their number shown to customers.';

  const workDetail = clean(input.work_detail).slice(0, 120);
  if (work === 'other' && !workDetail) errors.work_detail = 'Say what work they do.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      phone,
      area,
      work,
      work_detail: workDetail,
      registered_by: registeredBy,
      consent: true,
      consent_note: clean(input.consent_note).slice(0, 200),
    },
  };
}

// Today's date in India, so "free today" resets at Indian midnight.
function indiaDate(now = new Date()) {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

// Shape sent to customers: no consent notes or who listed them.
function publicView(w, now = new Date()) {
  return {
    id: w.id,
    name: w.name,
    phone: w.phone,
    area: w.area,
    work: w.work,
    work_detail: w.work_detail,
    free_today: w.free_on === indiaDate(now),
  };
}

module.exports = { WORK_TYPES, normalisePhone, validateWorker, indiaDate, publicView };
