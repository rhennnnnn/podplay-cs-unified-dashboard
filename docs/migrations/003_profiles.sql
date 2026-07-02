-- Account Management — profiles table replaces email->firstname derivation.
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  first_name  text unique not null,
  last_name   text not null,
  role        text not null default 'default',  -- 'default' | 'admin'
  created_by  text,
  created_at  timestamptz default now()
);
alter table profiles enable row level security;

-- Any authenticated user can read all profiles (needed for tracker dropdowns)
drop policy if exists "authenticated read" on profiles;
create policy "authenticated read" on profiles
  for select using (auth.role() = 'authenticated');

-- Only admins can insert/update/delete profiles
-- Admin check: look up auth.uid() in profiles where role = 'admin'
drop policy if exists "admin write" on profiles;
create policy "admin write" on profiles
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  ) with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Password changes go through Supabase Auth directly, not this table.

-- Seed the 3 admin accounts (run after confirming their auth.users IDs exist).
insert into profiles (id, email, first_name, last_name, role, created_by)
select id, email,
  split_part(email, '.', 1) as first_name,  -- rhen, john, kyle
  'PodPlay' as last_name,
  'admin' as role,
  'system' as created_by
from auth.users
where email in ('rhen.pabalan@podplay.app','john.lester@podplay.app','kyle@podplay.app')
on conflict (id) do update set role = 'admin';

-- john.lester@ should be 'John' not 'john'.
update profiles set first_name = 'John' where email = 'john.lester@podplay.app';
