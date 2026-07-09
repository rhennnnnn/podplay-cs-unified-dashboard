-- 011_presale_delivery_dates.sql
-- Adds PreSale Date and Delivery Date to the Client Opening Tracker.
-- Both are optional (nullable) date columns on the locations table.
-- Safe to re-run (IF NOT EXISTS).

alter table public.locations
  add column if not exists presale_date date,
  add column if not exists delivery_date date;
