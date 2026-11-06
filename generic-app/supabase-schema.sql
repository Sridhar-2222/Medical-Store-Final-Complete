-- BizCore optional Supabase copy. Run once in Supabase -> SQL Editor.
-- Adds ONE new table; nothing else in the project is touched.
-- Replace CHANGE_ME_SECRET with a long random secret and set the same value as
-- SUPABASE_SECRET on the BizCore server (SUPABASE_KEY = the project's anon key).
create table if not exists public.bizcore_records (
  collection text not null,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists bizcore_records_updated on public.bizcore_records (updated_at);
alter table public.bizcore_records enable row level security;

revoke all on public.bizcore_records from anon, authenticated;
grant select, insert, update, delete on public.bizcore_records to anon;

create or replace function public.bizcore_request_ok() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('request.headers', true)::json ->> 'x-bizcore-secret', '') = 'CHANGE_ME_SECRET'
$$;
revoke all on function public.bizcore_request_ok() from public;
grant execute on function public.bizcore_request_ok() to anon;

drop policy if exists bizcore_server_only on public.bizcore_records;
create policy bizcore_server_only on public.bizcore_records
  for all to anon
  using (public.bizcore_request_ok())
  with check (public.bizcore_request_ok());
