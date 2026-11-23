// Storage for Seva workers.
// Uses the Supabase table `seva_workers` when SEVA_STORE=supabase (after the
// migration in supabase/migrations is applied); otherwise a local JSON file.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DuplicatePhoneError extends Error {
  constructor() { super('This phone number is already listed.'); this.code = 'duplicate_phone'; }
}

function matches(w, { area, work }) {
  if (w.removed_at) return false;
  if (area && !w.area.toLowerCase().includes(area.toLowerCase())) return false;
  if (work && w.work !== work.toLowerCase()) return false;
  return true;
}

function fileStore(file) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
  };
  const write = (rows) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
    fs.renameSync(tmp, file);
  };
  return {
    async add(worker) {
      const rows = read();
      if (rows.some((r) => r.phone === worker.phone && !r.removed_at)) throw new DuplicatePhoneError();
      const row = { id: crypto.randomUUID(), ...worker, free_on: null, created_at: new Date().toISOString(), removed_at: null };
      rows.push(row);
      write(rows);
      return row;
    },
    async list(filter = {}) {
      return read().filter((w) => matches(w, filter))
        .sort((a, b) => (b.free_on || '').localeCompare(a.free_on || '') || a.name.localeCompare(b.name));
    },
    async setFreeOn(id, date) {
      const rows = read();
      const row = rows.find((r) => r.id === id && !r.removed_at);
      if (!row) return null;
      row.free_on = date;
      write(rows);
      return row;
    },
    async remove(id) {
      const rows = read();
      const row = rows.find((r) => r.id === id && !r.removed_at);
      if (!row) return false;
      row.removed_at = new Date().toISOString();
      write(rows);
      return true;
    },
  };
}

function supabaseStore(supabase) {
  const T = 'seva_workers';
  return {
    async add(worker) {
      const { data, error } = await supabase.from(T).insert(worker).select().single();
      if (error?.code === '23505') throw new DuplicatePhoneError();
      if (error) throw error;
      return data;
    },
    async list({ area, work } = {}) {
      let q = supabase.from(T).select('*').is('removed_at', null);
      if (area) q = q.ilike('area', `%${area.replace(/[%_]/g, '')}%`);
      if (work) q = q.eq('work', work.toLowerCase());
      const { data, error } = await q.order('free_on', { ascending: false, nullsFirst: false }).order('name');
      if (error) throw error;
      return data;
    },
    async setFreeOn(id, date) {
      const { data, error } = await supabase.from(T).update({ free_on: date }).eq('id', id).is('removed_at', null).select().maybeSingle();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { data, error } = await supabase.from(T).update({ removed_at: new Date().toISOString() }).eq('id', id).is('removed_at', null).select('id');
      if (error) throw error;
      return data.length > 0;
    },
  };
}

module.exports = { fileStore, supabaseStore, DuplicatePhoneError };
