-- Finale of the shopify_data → columns + client_order_items migration.
-- Run after the reading code deployed and the straggler re-backfill.
alter table public.client_orders drop column if exists shopify_data;
