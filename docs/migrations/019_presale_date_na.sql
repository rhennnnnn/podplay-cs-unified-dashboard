-- 019_presale_date_na.sql
-- Session 17D — distinguish "pre-sale date not yet known" (blank, still alerts as
-- missing) from "this client has no pre-sale, confirmed N/A" (blank but should NOT
-- alert). A plain null presale_date can't express both, so add a sibling boolean.
--   presale_date_na = false  -> not yet set (missing-date alert still applies)
--   presale_date_na = true   -> confirmed N/A (no alert), presale_date stays null
-- Default false so every existing row keeps its current "missing" behavior.
-- Safe to re-run (IF NOT EXISTS).

alter table public.locations
  add column if not exists presale_date_na boolean not null default false;
