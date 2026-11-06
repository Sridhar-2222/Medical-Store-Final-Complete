-- BizCore optional Supabase mirror. Run once in Supabase -> SQL Editor.
-- The app works without this; it only adds an off-site copy and lets a fresh
-- server (e.g. a free host that wipes its disk) restore itself automatically.
create table if not exists bizcore_records (
  collection text not null,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists bizcore_records_updated on bizcore_records (updated_at);

-- Only the server (service_role key) may read/write. Never put that key in a browser.
alter table bizcore_records enable row level security;
-- (No policies = anon/authenticated keys are denied; service_role bypasses RLS.)
