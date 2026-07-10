-- Session 13 (iteration 2): manual QC date override on the Client Opening Tracker.
-- The tracker's "QC Date" column shows the auto-computed Recommended QC Date by
-- default; if a CSA enters one manually it takes precedence and is labelled
-- "manual". Nullable — most rows rely on the recommendation.
alter table public.locations add column if not exists qc_date date;
