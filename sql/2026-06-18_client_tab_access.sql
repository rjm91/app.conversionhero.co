-- Per-client tab visibility for client (non-agency) users.
-- Agency admins always see every tab; client users only see a tab when its key
-- is true here. Missing key = hidden (agency-only by default). This is the
-- "ship a finished tab to a client" switch. Global defaults can layer on later.
--
-- Example: { "manufacturing": true, "paid-ads": true }

alter table client
  add column if not exists tab_access jsonb not null default '{}'::jsonb;
