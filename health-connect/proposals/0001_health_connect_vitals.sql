-- PROPOSAL ONLY — NOT APPLIED. Owner: Codex (database). Author: Claude Code, 2026-11-04.
--
-- Why: the live CHECK constraint `vital_readings_check` only accepts
-- source='health_connect' for metric='steps'. Heart rate and body temperature
-- read from Android Health Connect are rejected today.
--
-- This adds two branches and keeps every existing branch unchanged.
-- Codex: diff against the live definition before applying:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'vital_readings_check';

begin;

alter table public.vital_readings drop constraint vital_readings_check;

alter table public.vital_readings add constraint vital_readings_check check (coalesce(
  -- existing: steps from Health Connect / HealthKit
  ((metric = 'steps') and (source = any (array['health_connect','healthkit'])) and (method = 'measured')
    and (unit = 'steps') and (value between 0 and 200000) and (value = trunc(value)))
  -- NEW: heart rate from Health Connect
  or ((metric = 'pulse') and (source = 'health_connect') and (method = 'measured') and (unit = 'bpm')
    and (channel = 'native_import') and (value between 30 and 250))
  -- NEW: body temperature from Health Connect (BodyTemperatureRecord only; never skin-temp deltas)
  or ((metric = 'temperature') and (source = 'health_connect') and (method = 'measured') and (unit = 'C')
    and (channel = 'native_import') and (value between 30 and 45))
  -- existing branches below, copied verbatim from the live definition
  or ((metric = 'pulse') and (source = 'camera') and (method = 'estimated') and (unit = 'bpm') and (value between 40 and 200))
  or ((metric = 'breathing') and (source = 'breath_taps') and (method = 'estimated') and (unit = 'breaths/min') and (value between 1 and 80))
  or ((metric = 'temperature') and (source = 'thermometer_entry') and (method = 'manual') and (unit = 'C') and (value between 30 and 45))
  or ((metric = 'sleep') and (source = 'sleep_log') and (method = 'manual') and (origin = 'manual') and (channel = 'typed')
    and (unit = 'min') and (value between 30 and 1080) and (value = trunc(value)))
  or ((channel = 'photo_ocr') and (origin = 'device') and (method = 'measured') and (review_status = 'confirmed') and (original_value is not null) and (
       ((metric = 'temperature') and (source = 'thermometer_display') and (unit = 'C') and (value between 30 and 45) and (original_unit = any (array['C','F'])))
    or ((metric = 'spo2') and (source = 'oximeter_display') and (unit = '%') and (value between 50 and 100) and (original_unit = '%'))
    or ((metric = 'pulse') and (source = 'oximeter_display') and (unit = 'bpm') and (value between 30 and 250) and (original_unit = 'bpm'))
    or ((metric = 'bp') and (source = 'bp_monitor_display') and (unit = 'mmHg') and (original_unit = 'mmHg') and (value between 50 and 300)
        and (value_secondary between 30 and 200) and (value > value_secondary))
    or ((metric = 'glucose') and (source = 'glucometer_display') and (original_unit = unit)
        and (((unit = 'mg/dL') and (value between 10 and 1000)) or ((unit = 'mmol/L') and (value between 0.5 and 55))))
  ))
, false));

commit;
