-- Cache table for GoHighLevel API data
-- Refreshed on schedule (3x/day) or manually via dashboard button
create table if not exists ghl_cache (
  id text primary key default 'singleton',
  data jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);

alter table ghl_cache enable row level security;

create policy "Allow all for service role" on ghl_cache
  for all using (true) with check (true);
