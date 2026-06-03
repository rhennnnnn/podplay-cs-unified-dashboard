-- Client Opening Tracker — Supabase database setup
-- Run these in the Supabase dashboard: SQL Editor → New query → Run.

-- 1. Create the table (only needed once, when setting up a fresh project)
create table if not exists locations (
  id            text primary key,
  client_name   text,
  name          text not null,   -- location name
  opening_date  date not null,
  tracker       text,
  status        text default 'on-track',  -- on-track | at-risk | delayed | opened
  notes         text,
  pre_open_done  boolean default false,
  post_open_done boolean default false
);

-- 2. Enable row-level security and allow team read/write with the public (anon) key
alter table locations enable row level security;
create policy "team read"  on locations for select using (true);
create policy "team write" on locations for all    using (true) with check (true);

-- Note: client_name was added after the initial table. If you ever rebuild and
-- the column is missing, run:
--   alter table locations add column client_name text;
