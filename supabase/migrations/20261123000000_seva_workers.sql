-- Seva: workers listed by a chemist or helper on their behalf.
-- NOT APPLIED. Review, then run in the Supabase SQL Editor with the owner's approval.
-- After it is applied, set SEVA_STORE=supabase on the server.

create extension if not exists pgcrypto;

create table if not exists seva_workers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 80),
  phone         text not null check (phone ~ '^[6-9][0-9]{9}$'),
  area          text not null check (char_length(area) between 2 and 80),
  work          text not null,
  work_detail   text not null default '',
  registered_by text not null,
  consent       boolean not null check (consent),
  consent_note  text not null default '',
  consent_at    timestamptz not null,
  free_on       date,
  created_at    timestamptz not null default now(),
  removed_at    timestamptz
);

-- One active listing per phone number; a removed person can be listed again.
create unique index if not exists seva_workers_phone_active
  on seva_workers (phone) where removed_at is null;

create index if not exists seva_workers_work_area
  on seva_workers (work, area) where removed_at is null;

-- Only the server (service role key) reads and writes; no direct browser access.
alter table seva_workers enable row level security;
