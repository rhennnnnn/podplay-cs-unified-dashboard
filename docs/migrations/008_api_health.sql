-- Session 7 — API & Key Health Panel
-- Run manually in the Supabase SQL editor (no DDL-execution tool in this environment).

create table if not exists api_integrations (
  id                        text primary key,        -- 'hubspot' | 'mrp_sheets'
  label                     text not null,
  status                    text not null default 'active',  -- active|unresponsive|broken|down|not_configured
  last_success_at           timestamptz,
  last_error_at             timestamptz,
  last_error_message        text,
  requests_used_today       int not null default 0,
  requests_used_date        date not null default current_date,  -- reset used-count when date rolls over
  requests_limit_per_day    int,                      -- null = no limit configured
  auto_poll_interval_minutes int not null default 30,
  auto_poll_paused          boolean not null default false,
  manual_refresh_paused     boolean not null default false,
  paused_all                boolean not null default false,
  next_refresh_allowed_at   timestamptz,              -- shared 60s cooldown, same value for every user
  updated_at                timestamptz default now(),
  updated_by                text
);
alter table api_integrations enable row level security;

create policy "authenticated read" on api_integrations for select using (auth.role() = 'authenticated');
create policy "admin write" on api_integrations for all using (public.is_admin_user()) with check (public.is_admin_user());

insert into api_integrations (id, label, auto_poll_interval_minutes, requests_limit_per_day)
values ('hubspot', 'HubSpot', 30, null), ('mrp_sheets', 'MRP Google Sheet', 60, null)
on conflict (id) do nothing;
