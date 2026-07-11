-- Session 15C — DB-level duplicate guard on the HubSpot link.
--
-- Three separate paths can now create a `locations` row for the same HubSpot
-- onboarding: the manual Track Opening dialog, the new per-record "Import Now"
-- button, and the hourly cron auto-import. All three check for an existing row
-- before inserting, but a check-then-insert race (a CSA clicking "Import Now"
-- the same minute the cron tick fires) could still slip two rows through.
--
-- A partial unique index on hubspot_deal_id (where not null) makes the second
-- concurrent insert fail at the DB, so every insert path that catches its own
-- error already degrades to a clean "already tracked" no-op. `id` (the slug PK)
-- only guards same-NAME collisions, not same-deal ones — this closes that gap.
--
-- Safe to re-run (IF NOT EXISTS). Verified zero existing duplicates before
-- creating (Session 15C).

create unique index if not exists locations_hubspot_deal_id_key
  on public.locations (hubspot_deal_id)
  where hubspot_deal_id is not null;
