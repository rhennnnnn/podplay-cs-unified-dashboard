-- Session 9 (cont.) — DB-backed snapshot cache for onboarding + MRP data.
-- Holds pre-fetched JSON snapshots so the dashboard reads instantly from the DB
-- instead of hitting HubSpot/Sheets live on load. A pg_cron job refreshes these
-- rows every 60 minutes (see the scheduled job at the bottom of this file).

create table if not exists data_cache (
  key         text primary key,          -- e.g. 'onboarding:basic', 'onboarding:pro', 'hubspot:owners', 'mrp:records'
  data        jsonb not null,
  fetched_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table data_cache enable row level security;

-- Any authenticated user can read snapshots (the dashboard reads through them).
drop policy if exists "authenticated read" on data_cache;
create policy "authenticated read" on data_cache
  for select using (auth.role() = 'authenticated');

-- Writes only ever happen through the service-role client (the cron refresh
-- endpoint), which bypasses RLS — no client-side write policy is granted.

-- ---------------------------------------------------------------------------
-- pg_cron schedule (run once, in the Supabase SQL editor / MCP):
-- Requires the pg_cron and pg_net extensions and two DB settings holding the
-- deployed refresh URL + shared secret. Replace the placeholders, then run.
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   -- store the target + secret once (keeps them out of the job definition):
--   alter database postgres set app.cron_refresh_url = 'https://<prod-domain>/api/cron/refresh';
--   alter database postgres set app.cron_secret      = '<CRON_SECRET matching Vercel env>';
--
--   select cron.schedule('onboarding-refresh', '0 * * * *', $$
--     select net.http_post(
--       url     := current_setting('app.cron_refresh_url'),
--       headers := jsonb_build_object('x-cron-secret', current_setting('app.cron_secret'))
--     );
--   $$);
-- ---------------------------------------------------------------------------
