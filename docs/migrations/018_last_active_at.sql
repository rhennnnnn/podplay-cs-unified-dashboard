-- Track real dashboard activity, not just the last Supabase Auth sign-in.
-- Persisted sessions refresh silently without bumping auth.last_sign_in_at, so
-- an active user could look stale on the Team page. This column is written
-- (throttled to ~once per 5 min) by app/dashboard/layout.tsx on each dashboard
-- load, and the Team "Last seen" column shows the most recent of this and the
-- auth sign-in time.
alter table profiles add column if not exists last_active_at timestamptz;
