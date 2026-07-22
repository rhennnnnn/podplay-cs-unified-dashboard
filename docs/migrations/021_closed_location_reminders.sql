-- Personal reminders for Closed Locations (021). Lets whoever logs a
-- (often future/scheduled) closure be pinged when the reminder fires — both
-- in-app and via a Slack post to #cs-team-daily that @mentions them.
--
-- remind_at is a full timestamp stored in UTC; the closure form interprets the
-- chosen time as US Eastern (America/New_York) and converts to UTC on save.
-- Additive and nullable, safe to re-run.
alter table closed_locations add column if not exists remind_at              timestamptz;
alter table closed_locations add column if not exists remind_user_email      text;   -- who to @mention (personal)
alter table closed_locations add column if not exists reminder_done          boolean not null default false;
alter table closed_locations add column if not exists reminder_slack_sent_at timestamptz;  -- dedupe Slack sends
