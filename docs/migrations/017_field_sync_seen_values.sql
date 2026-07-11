-- Session 15D — per-source last-seen values for field-level change detection.
--
-- location_field_sync (014) tracks the CURRENT authoritative value + who wrote
-- it. But deciding "did HubSpot/MRP actually change this field?" cannot rely on
-- HubSpot's hs_lastmodifieddate — that's object-level, so an unrelated property
-- edit bumps it and would wrongly revert a CSA's tracker edit with a stale value.
--
-- Fix: remember the value each SOURCE last reported for the field. A source
-- "changed" the field only when its freshly-observed value DIFFERS from what it
-- reported last sync — a true per-field delta, not a timestamp bump. The tracker
-- edit is preserved unless the external source's own value genuinely moved.
--
-- Both nullable (unknown until first observed). Safe to re-run.

alter table public.location_field_sync
  add column if not exists hubspot_seen_value text,
  add column if not exists mrp_seen_value text;
