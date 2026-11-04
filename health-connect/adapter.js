// Android Health Connect -> Supabase `public.vital_readings` adapter.
//
// Pure functions only: no network, no Android APIs. The Android side (a
// Capacitor plugin or native Kotlin module) reads Health Connect records and
// passes them here as JSON using the Jetpack record field names:
//
//   StepsRecord          { count, startTime, endTime, metadata }
//   HeartRateRecord      { samples:[{ time, beatsPerMinute }], startTime, endTime, metadata }
//   BodyTemperatureRecord{ time, temperature:{ inCelsius }, measurementLocation, metadata }
//   metadata             { id, dataOrigin:{ packageName }, device?:{ manufacturer, model } }
//
// Output rows match the live `vital_readings` columns and CHECK constraint
// (inspected 2026-11-04). Inserts must use upsert on the existing unique index
// (user_id, source, external_id) so re-syncs never duplicate readings.

const CONSENT_VERSION = 'vital-v1';

// What the production CHECK constraint accepts today for source='health_connect'.
// pulse/temperature need migration proposals/0001_health_connect_vitals.sql
// (owned by Codex) before they can be stored.
const LIVE_SCHEMA_SUPPORTS = new Set(['steps']);

// SkinTemperatureRecord holds *deltas* from a baseline, not body temperature.
// It must never be written as metric='temperature'.
const UNSUPPORTED_RECORD_TYPES = new Set(['SkinTemperatureRecord']);

function assertConsent(pref) {
  if (!pref || pref.enabled !== true || !pref.consented_at || pref.withdrawn_at
      || pref.consent_version !== CONSENT_VERSION) {
    const err = new Error('Health data import blocked: user has not given current vital-v1 consent');
    err.code = 'NO_CONSENT';
    throw err;
  }
}

function deviceLabel(meta) {
  const d = meta?.device;
  const parts = [d?.manufacturer, d?.model].filter(Boolean).join(' ');
  const label = parts || meta?.dataOrigin?.packageName || null;
  return label ? String(label).slice(0, 80) : null;
}

function iso(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid timestamp: ${t}`);
  return d.toISOString();
}

function baseRow(userId, meta) {
  return {
    user_id: userId,
    source: 'health_connect',
    method: 'measured',
    origin: 'device',
    channel: 'native_import',
    review_status: 'not_required',
    device_label: deviceLabel(meta),
  };
}

function mapSteps(userId, r) {
  const count = Number(r.count);
  if (!Number.isInteger(count) || count < 0 || count > 200000) {
    return { rejected: `steps count out of range: ${r.count}` };
  }
  return {
    row: {
      ...baseRow(userId, r.metadata),
      metric: 'steps', unit: 'steps', value: count,
      observed_at: iso(r.endTime),
      external_id: `hc:steps:${r.metadata?.id}`.slice(0, 200),
    },
  };
}

function mapHeartRate(userId, r) {
  // One reading per sample; Health Connect batches many samples per record.
  return (r.samples || []).map((s, i) => {
    const bpm = Number(s.beatsPerMinute);
    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 250) return { rejected: `heart rate out of range: ${s.beatsPerMinute}` };
    return {
      row: {
        ...baseRow(userId, r.metadata),
        metric: 'pulse', unit: 'bpm', value: Math.round(bpm),
        observed_at: iso(s.time),
        external_id: `hc:hr:${r.metadata?.id}:${i}`.slice(0, 200),
      },
    };
  });
}

function mapBodyTemperature(userId, r) {
  const c = Number(r.temperature?.inCelsius);
  if (!Number.isFinite(c) || c < 30 || c > 45) return { rejected: `temperature out of range: ${r.temperature?.inCelsius}` };
  return {
    row: {
      ...baseRow(userId, r.metadata),
      metric: 'temperature', unit: 'C', value: Math.round(c * 10) / 10,
      observed_at: iso(r.time),
      external_id: `hc:temp:${r.metadata?.id}`.slice(0, 200),
    },
  };
}

const MAPPERS = {
  StepsRecord: mapSteps,
  HeartRateRecord: mapHeartRate,
  BodyTemperatureRecord: mapBodyTemperature,
};

/**
 * @param {string} userId  auth.users id
 * @param {object} pref    the user's vital_preferences row
 * @param {Array<{recordType:string}>} records  Health Connect records
 * @param {{schemaSupports?: Set<string>}} [opts]  pass all metrics once the migration is applied
 * @returns {{rows: object[], skipped: {recordType:string, reason:string}[]}}
 */
function toVitalReadings(userId, pref, records, opts = {}) {
  assertConsent(pref);
  const supports = opts.schemaSupports || LIVE_SCHEMA_SUPPORTS;
  const rows = [];
  const skipped = [];
  for (const rec of records || []) {
    const type = rec?.recordType;
    if (UNSUPPORTED_RECORD_TYPES.has(type)) {
      skipped.push({ recordType: type, reason: 'skin temperature is a delta, not body temperature' });
      continue;
    }
    const mapper = MAPPERS[type];
    if (!mapper) { skipped.push({ recordType: type, reason: 'unsupported record type' }); continue; }
    if (!rec.metadata?.id) { skipped.push({ recordType: type, reason: 'missing metadata.id (needed for dedupe)' }); continue; }
    for (const out of [].concat(mapper(userId, rec))) {
      if (out.rejected) { skipped.push({ recordType: type, reason: out.rejected }); continue; }
      if (!supports.has(out.row.metric)) {
        skipped.push({ recordType: type, reason: `metric '${out.row.metric}' from health_connect not yet allowed by DB constraint` });
        continue;
      }
      rows.push(out.row);
    }
  }
  return { rows, skipped };
}

// Health Connect permissions the Android app must request (AndroidManifest.xml).
const REQUIRED_PERMISSIONS = {
  steps: 'android.permission.health.READ_STEPS',
  pulse: 'android.permission.health.READ_HEART_RATE',
  temperature: 'android.permission.health.READ_BODY_TEMPERATURE',
};

module.exports = { toVitalReadings, assertConsent, REQUIRED_PERMISSIONS, CONSENT_VERSION, LIVE_SCHEMA_SUPPORTS };
