-- Fix infinite recursion in the "admin write" policy on profiles.
-- The policy's USING clause queried profiles from within a policy ON
-- profiles, and since the policy applies to ALL commands (including
-- SELECT), even a plain read re-triggered RLS evaluation on itself forever.
-- A SECURITY DEFINER function breaks the loop by running the admin check
-- with the function owner's privileges, bypassing RLS on the inner lookup.

create or replace function public.is_admin_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

drop policy if exists "admin write" on profiles;
create policy "admin write" on profiles
  for all using (public.is_admin_user()) with check (public.is_admin_user());
