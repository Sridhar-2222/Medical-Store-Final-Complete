-- FINAL SCHEMA - Run in Supabase SQL Editor
create extension if not exists pgcrypto;

create table if not exists medicines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  batch text default '',
  quantity integer default 0,
  mrp numeric default 0,
  expiry date,
  updated_at timestamp default now(),
  unique(name, batch)
);

create table if not exists bill_history (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  medicines_count integer,
  created_at timestamp default now()
);

-- Storage for bills
insert into storage.buckets (id, name, public) values ('bills', 'bills', true) on conflict (id) do nothing;

-- Allow all (for your private app, secure later with RLS)
alter table medicines disable row level security;
