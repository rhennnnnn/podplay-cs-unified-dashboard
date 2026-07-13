-- 018_cron_sync_job.sql (Session 17A) — hardening for the field-sync tail.
--
-- The hourly `onboarding-refresh` job (jobid 1, `0 * * * *`) hits
-- /api/cron/refresh, which rebuilds every snapshot (~48s) and only then runs
-- the tracker import + field-level LWW sync. The sync therefore runs LAST and
-- is the first work starved if that heavy chain is ever truncated.
--
-- This adds a SECOND, independent hourly job on a :30 offset that hits the new
-- lightweight /api/cron/sync endpoint. That endpoint skips the external
-- rebuild and only runs the import sweep + field sync over the snapshots that
-- already exist, so it finishes in a few seconds and gives the sync a fast,
-- reliable pass every hour regardless of the refresh job's duration.
--
-- Both endpoints' sync work self-gates on shouldAllowAutoImport / shouldAllowPoll
-- and caps writes-per-tick, so two passes per hour is idempotent and safe.
--
-- Run AFTER the branch is deployed (the endpoint 404s until then). Idempotent:
-- unschedule any prior copy of this job name first.
select cron.unschedule('onboarding-sync')
where exists (select 1 from cron.job where jobname = 'onboarding-sync');

select cron.schedule(
  'onboarding-sync',
  '30 * * * *',
  $$
    select net.http_post(
      url     := 'https://podplay-cs-unified-dashboard.vercel.app/api/cron/sync',
      headers := '{"x-cron-secret":"dev-cron-secret-9f3a2b7c"}'::jsonb
    );
  $$
);
