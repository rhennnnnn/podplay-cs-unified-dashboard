-- Closed Locations: a standalone log of locations that have shut down.
-- Free-text client/location names (entered by the team), not linked to the
-- tracker's `locations` table, so a closure can be recorded for any site.
create table if not exists closed_locations (
  id            uuid primary key default gen_random_uuid(),
  client_name   text,
  location_name text not null,
  close_date    date not null,
  close_reason  text,            -- churned | relocated | contract-ended | temporary | other
  close_note    text,
  created_by    text,
  created_at    timestamptz default now()
);

alter table closed_locations enable row level security;

-- Any authenticated team member can read and manage closure entries.
drop policy if exists "authenticated read" on closed_locations;
create policy "authenticated read" on closed_locations
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated write" on closed_locations;
create policy "authenticated write" on closed_locations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
