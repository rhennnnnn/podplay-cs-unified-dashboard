-- Session 13: relax required-field validation on the Client Opening Tracker.
-- Opening Date becomes optional at save time (surfaced as a red "missing" nudge
-- in the UI instead of a hard block). Drop the NOT NULL constraint on
-- locations.opening_date so partial rows can be created. Client Name, Location
-- (name), Tier and Tracking are enforced in the form, not at the DB level.
alter table public.locations alter column opening_date drop not null;
