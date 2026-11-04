const test = require('node:test');
const assert = require('node:assert');
const { toVitalReadings } = require('../health-connect/adapter');

const USER = '00000000-0000-0000-0000-000000000001';
const CONSENT = { enabled: true, consent_version: 'vital-v1', consented_at: '2026-11-01T00:00:00Z', withdrawn_at: null };
const meta = (id) => ({ id, dataOrigin: { packageName: 'com.google.android.apps.fitness' }, device: { manufacturer: 'Samsung', model: 'SM-A146' } });

test('blocks import without consent', () => {
  assert.throws(() => toVitalReadings(USER, null, []), /consent/);
  assert.throws(() => toVitalReadings(USER, { ...CONSENT, withdrawn_at: '2026-11-02' }, []), /consent/);
});

test('maps steps to a row the live constraint accepts', () => {
  const { rows, skipped } = toVitalReadings(USER, CONSENT, [
    { recordType: 'StepsRecord', count: 4210, startTime: '2026-11-03T00:00:00Z', endTime: '2026-11-03T23:59:59Z', metadata: meta('s1') },
  ]);
  assert.equal(skipped.length, 0);
  assert.deepEqual(rows[0], {
    user_id: USER, source: 'health_connect', method: 'measured', origin: 'device', channel: 'native_import',
    review_status: 'not_required', device_label: 'Samsung SM-A146', metric: 'steps', unit: 'steps', value: 4210,
    observed_at: '2026-11-03T23:59:59.000Z', external_id: 'hc:steps:s1',
  });
});

test('heart rate and temperature held back until DB migration, then mapped', () => {
  const recs = [
    { recordType: 'HeartRateRecord', samples: [{ time: '2026-11-03T08:00:00Z', beatsPerMinute: 72 }, { time: '2026-11-03T08:01:00Z', beatsPerMinute: 400 }], metadata: meta('h1') },
    { recordType: 'BodyTemperatureRecord', time: '2026-11-03T09:00:00Z', temperature: { inCelsius: 37.24 }, metadata: meta('t1') },
    { recordType: 'SkinTemperatureRecord', metadata: meta('k1') },
  ];
  const live = toVitalReadings(USER, CONSENT, recs);
  assert.equal(live.rows.length, 0);
  assert.ok(live.skipped.some((s) => /not yet allowed/.test(s.reason)));
  assert.ok(live.skipped.some((s) => /delta/.test(s.reason)));

  const after = toVitalReadings(USER, CONSENT, recs, { schemaSupports: new Set(['steps', 'pulse', 'temperature']) });
  assert.deepEqual(after.rows.map((r) => [r.metric, r.value, r.external_id]), [
    ['pulse', 72, 'hc:hr:h1:0'], ['temperature', 37.2, 'hc:temp:t1'],
  ]);
  assert.ok(after.skipped.some((s) => /out of range: 400/.test(s.reason)));
});

test('records without metadata.id are skipped (cannot dedupe)', () => {
  const { rows, skipped } = toVitalReadings(USER, CONSENT, [{ recordType: 'StepsRecord', count: 1, endTime: '2026-11-03T00:00:00Z' }]);
  assert.equal(rows.length, 0);
  assert.match(skipped[0].reason, /metadata.id/);
});
