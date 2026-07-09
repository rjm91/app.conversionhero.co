-- ─────────────────────────────────────────────────────────────────────────────
-- client.settings — per-client operational config for the daily P&L (and
-- future ops settings). First key: cost_per_label (avg shipping cost per
-- shipped order; Shopify Shipping label cost isn't exposed via API, so it's a
-- client-set average). Also reserves timezone for the daily-P&L day boundary.
--
-- jsonb so we add keys without migrations. Existing RLS on `client` (Batch 4)
-- already governs reads; writes go through the agency-admin-gated
-- /api/client-settings route (service role). Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.client add column if not exists settings jsonb not null default '{}';

-- Seed ShieldTech with its known values (cost-per-label from Jason's sheet;
-- business timezone for the P&L day boundary). Safe to re-run.
update public.client
  set settings = coalesce(settings, '{}') || '{"cost_per_label": 25, "timezone": "America/Phoenix"}'
  where client_id = 'ch069' and (settings->>'cost_per_label') is null;

select client_id, settings from public.client where client_id = 'ch069';
