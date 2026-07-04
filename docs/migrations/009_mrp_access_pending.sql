-- Session 6 — MRP Integration
-- Adds 'access_pending' as a valid api_integrations.status value.
-- Note: 008_api_health.sql never added a CHECK constraint on `status` (it's a
-- plain `text` column with a default), so there is nothing to ALTER here —
-- any text value, including 'access_pending', is already accepted at the DB
-- level. This migration documents the widened enum for anyone reading the
-- schema later; it's a comment-only no-op, not a real DDL change.

comment on column api_integrations.status is
  'active|unresponsive|broken|down|not_configured|access_pending — access_pending means the integration is wired up and got a clean 403 permission denial, not an outage.';
