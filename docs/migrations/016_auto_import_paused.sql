-- Session 15C (follow-up) — dedicated auto-import pause flag.
--
-- Auto-import/backfill (lib/tracker-sync.ts) previously piggy-backed on
-- auto_poll_paused, so pausing the board's auto-refresh also stopped
-- auto-import and vice-versa. Per user, auto-import gets its OWN switch,
-- independent of polling — pausing auto-import must NOT pause polling, and
-- pausing polling must NOT pause auto-import. paused_all still overrides both.
--
-- NOT NULL DEFAULT false so every existing row reads "not paused" immediately
-- (the reported "it pauses even when the toggle is off" failure mode can't
-- happen — an unset/absent value is a hard false, never null/undefined).
--
-- Safe to re-run.

alter table public.api_integrations
  add column if not exists auto_import_paused boolean not null default false;
