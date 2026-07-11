-- Session 15A — Schema for HubSpot <-> Client Opening Tracker <-> MRP field sync.
--
-- Two pieces:
--   1. locations.mrp_row_key — a durable MRP link. Stores the sheet's "Club"
--      column value at link time so later sessions don't depend on the
--      name-matcher (matchByCompanyNames) staying stable to keep a link alive.
--      (hubspot_deal_id already exists from 001_client_hub.sql — no new column
--      needed for the HubSpot side.)
--   2. location_field_sync — per-field "who wrote this value last" ledger that
--      Session 15D's last-write-wins logic reads/writes. 15A only creates it;
--      no rows are written until 15D.
--
-- Safe to re-run (IF NOT EXISTS everywhere).

alter table public.locations
  add column if not exists mrp_row_key text;

-- Per-field sync ledger. One row per (location, shared field). Only fields that
-- genuinely originate from more than one source are tracked. Confirmed overlap
-- against lib/onboarding-deals.ts (HubSpot) and lib/mrp.ts (MRP):
--   opening_date   tracker + HubSpot (grand_opening / anticipated_opening)
--   presale_date   tracker + HubSpot (presale property — created manually, future read path)
--   delivery_date  tracker (manual) + MRP (hardwareDeliveryDate)
--   qc_date        tracker (manual override) + MRP-derived recommended QC date
--   tier           tracker + HubSpot (podplay_tier)
-- status is intentionally NOT tracked here: it is a tracker-only concept
-- (on-track/at-risk/delayed/opened) with no clean HubSpot/MRP counterpart.
-- field_name is free text (not an enum) so 15D can extend the list without a
-- schema change; the canonical list lives in lib/tracker-link.ts (SHARED_FIELDS).
create table if not exists public.location_field_sync (
  location_id       text not null references public.locations(id) on delete cascade,
  field_name        text not null,
  source            text not null check (source in ('tracker', 'hubspot', 'mrp')),
  source_updated_at timestamptz not null,
  -- Raw value stored directly (not hashed): shared fields are short scalar
  -- dates/strings, so a raw copy costs nothing and lets 15D do its
  -- value-actually-changed comparison and audit logging without re-deriving
  -- the prior value. A hash would add indirection with no benefit at this scale.
  value             text,
  updated_at        timestamptz not null default now(),
  primary key (location_id, field_name)
);

alter table public.location_field_sync enable row level security;

-- Matches api_integrations / data_cache: authenticated read, service-role write
-- only (no client write policy granted — the sync cron uses the service role).
drop policy if exists "authenticated read" on public.location_field_sync;
create policy "authenticated read" on public.location_field_sync
  for select using (auth.role() = 'authenticated');
