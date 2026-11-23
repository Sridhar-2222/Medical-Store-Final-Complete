-- Seva: elders who call, and the missed-call list helpers work from.
-- NOT APPLIED. Review, then run in the Supabase SQL Editor with the owner's approval.
-- Run after 20261123000000_seva_workers.sql. Then set SEVA_STORE=supabase.

create extension if not exists pgcrypto;

create table if not exists seva_callers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 80),
  phone         text not null check (phone ~ '^[6-9][0-9]{9}$'),
  area          text not null check (char_length(area) between 2 and 80),
  needs         text not null default '',
  family_phone  text not null default '',
  registered_by text not null,
  consent       boolean not null check (consent),
  consent_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  removed_at    timestamptz
);

create unique index if not exists seva_callers_phone_active
  on seva_callers (phone) where removed_at is null;

create table if not exists seva_missed_calls (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  source      text not null check (source in ('provider', 'manual')),
  status      text not null default 'waiting' check (status in ('waiting', 'done')),
  rings       integer not null default 1,
  attempts    integer not null default 0,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  handled_by  text not null default '',
  note        text not null default '',
  handled_at  timestamptz
);

-- At most one waiting entry per number; repeat rings bump it.
create unique index if not exists seva_missed_calls_one_waiting
  on seva_missed_calls (phone) where status = 'waiting';

create index if not exists seva_missed_calls_handled_at
  on seva_missed_calls (handled_at) where status = 'done';

-- Only the server (service role key) reads and writes; no direct browser access.
alter table seva_callers enable row level security;
alter table seva_missed_calls enable row level security;
