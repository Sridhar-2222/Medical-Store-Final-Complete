// Seva missed-call list: an elder gives a missed call, a helper calls back.
// Elders ("callers") are registered once by family or a helper, with consent,
// so the list can show who called and from which area.

const crypto = require('crypto');
const path = require('path');
const { normalisePhone } = require('./workers');
const { jsonFile } = require('./jsonfile');

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

// Provider numbers can be landlines or odd formats; keep digits if not a mobile.
function callerPhone(raw) {
  return normalisePhone(raw) || String(raw || '').replace(/\D/g, '').slice(-12) || null;
}

function validateCaller(input = {}) {
  const errors = {};
  const name = clean(input.name);
  const area = clean(input.area);
  const phone = normalisePhone(input.phone);
  const registeredBy = clean(input.registered_by);
  const familyPhoneRaw = clean(input.family_phone);
  const familyPhone = familyPhoneRaw ? normalisePhone(familyPhoneRaw) : '';

  if (name.length < 2 || name.length > 80) errors.name = 'Enter their name (2–80 letters).';
  if (!phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
  if (area.length < 2 || area.length > 80) errors.area = 'Enter the area or village.';
  if (registeredBy.length < 2 || registeredBy.length > 80) errors.registered_by = 'Enter your name (son, daughter, helper).';
  if (familyPhone === null) errors.family_phone = 'Family number must be a 10-digit mobile, or leave it empty.';
  if (input.consent !== true) errors.consent = 'They (or their family) must agree to helpers seeing their number and calling back.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name, phone, area,
      needs: clean(input.needs).slice(0, 200),
      family_phone: familyPhone || '',
      registered_by: registeredBy,
      consent: true,
    },
  };
}

const WAITING = 'waiting';
const DONE = 'done';

function fileCallsStore(dir) {
  const callers = jsonFile(path.join(dir, 'seva-callers.json'));
  const calls = jsonFile(path.join(dir, 'seva-missed-calls.json'));

  return {
    async addCaller(c, now) {
      const rows = callers.read();
      if (rows.some((r) => r.phone === c.phone && !r.removed_at)) {
        const e = new Error('This number is already registered.'); e.code = 'duplicate_phone'; throw e;
      }
      const row = { id: crypto.randomUUID(), ...c, consent_at: now.toISOString(), created_at: now.toISOString(), removed_at: null };
      rows.push(row); callers.write(rows);
      return row;
    },
    async listCallers() {
      return callers.read().filter((r) => !r.removed_at).sort((a, b) => a.name.localeCompare(b.name));
    },
    async removeCaller(id, now) {
      const rows = callers.read();
      const row = rows.find((r) => r.id === id && !r.removed_at);
      if (!row) return false;
      row.removed_at = now.toISOString(); callers.write(rows);
      return true;
    },

    // A repeat missed call from a number already waiting bumps that entry instead of adding a new one.
    async recordMissedCall(phone, source, now) {
      const rows = calls.read();
      const open = rows.find((r) => r.phone === phone && r.status === WAITING);
      if (open) {
        open.rings += 1; open.last_at = now.toISOString();
        calls.write(rows);
        return open;
      }
      const row = {
        id: crypto.randomUUID(), phone, source, status: WAITING, rings: 1, attempts: 0,
        first_at: now.toISOString(), last_at: now.toISOString(),
        handled_by: '', note: '', handled_at: null,
      };
      rows.push(row); calls.write(rows);
      return row;
    },
    async listMissedCalls({ since }) {
      return calls.read().filter((r) => r.status === WAITING || (r.handled_at && r.handled_at >= since));
    },
    async updateMissedCall(id, fn) {
      const rows = calls.read();
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      fn(row); calls.write(rows);
      return row;
    },
  };
}

function supabaseCallsStore(supabase) {
  const C = 'seva_callers';
  const M = 'seva_missed_calls';
  const must = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async addCaller(c, now) {
      const { data, error } = await supabase.from(C).insert({ ...c, consent_at: now.toISOString() }).select().single();
      if (error?.code === '23505') { const e = new Error('This number is already registered.'); e.code = 'duplicate_phone'; throw e; }
      if (error) throw error;
      return data;
    },
    async listCallers() {
      return must(await supabase.from(C).select('*').is('removed_at', null).order('name'));
    },
    async removeCaller(id, now) {
      return must(await supabase.from(C).update({ removed_at: now.toISOString() }).eq('id', id).is('removed_at', null).select('id')).length > 0;
    },
    async recordMissedCall(phone, source, now) {
      const open = must(await supabase.from(M).select('*').eq('phone', phone).eq('status', WAITING).maybeSingle());
      if (open) {
        return must(await supabase.from(M).update({ rings: open.rings + 1, last_at: now.toISOString() }).eq('id', open.id).select().single());
      }
      return must(await supabase.from(M).insert({ phone, source, status: WAITING, first_at: now.toISOString(), last_at: now.toISOString() }).select().single());
    },
    async listMissedCalls({ since }) {
      return must(await supabase.from(M).select('*').or(`status.eq.${WAITING},handled_at.gte.${since}`));
    },
    async updateMissedCall(id, fn) {
      const row = must(await supabase.from(M).select('*').eq('id', id).maybeSingle());
      if (!row) return null;
      fn(row);
      const { attempts, status, handled_by, note, handled_at } = row;
      return must(await supabase.from(M).update({ attempts, status, handled_by, note, handled_at }).eq('id', id).select().single());
    },
  };
}

// Start of today in India, as an ISO timestamp, so "done today" means India's day.
function indiaDayStart(now) {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600 * 1000).toISOString();
}

// Waiting calls first, oldest first (fair queue); then today's finished ones, newest first.
function buildList(calls, callers, { area } = {}) {
  const byPhone = new Map(callers.map((c) => [c.phone, c]));
  const a = (area || '').toLowerCase();
  return calls
    .map((m) => {
      const c = byPhone.get(m.phone);
      return {
        id: m.id, phone: m.phone, status: m.status, rings: m.rings, attempts: m.attempts,
        first_at: m.first_at, last_at: m.last_at, handled_by: m.handled_by, note: m.note, handled_at: m.handled_at,
        caller: c ? { name: c.name, area: c.area, needs: c.needs, family_phone: c.family_phone } : null,
      };
    })
    .filter((m) => !a || (m.caller && m.caller.area.toLowerCase().includes(a)))
    .sort((x, y) => {
      if (x.status !== y.status) return x.status === WAITING ? -1 : 1;
      return x.status === WAITING ? x.first_at.localeCompare(y.first_at) : y.handled_at.localeCompare(x.handled_at);
    });
}

module.exports = {
  WAITING, DONE, callerPhone, validateCaller, fileCallsStore, supabaseCallsStore, indiaDayStart, buildList,
};
