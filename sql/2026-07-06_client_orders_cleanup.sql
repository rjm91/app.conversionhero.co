-- ─────────────────────────────────────────────────────────────────────────────
-- Orders vs leads split — step 2 of 2 (DESTRUCTIVE — run only after step 1
-- ran, the client_orders app code is deployed, and the ecom views verify).
--
-- Removes the Shopify order rows from client_lead so the table is
-- leads-only. Every lead query in the app already excludes 'shopify_%'
-- rows, so nothing user-facing changes when this runs — it just retires
-- the duplicated data.
-- ─────────────────────────────────────────────────────────────────────────────

-- Sanity check first — in_client_orders must be >= in_client_lead:
select
  (select count(*) from public.client_lead
    where lead_id like 'shopify\_%' escape '\') as in_client_lead,
  (select count(*) from public.client_orders)   as in_client_orders;

-- Then delete (meta rows first — FK on client_lead_meta.lead_id):
delete from public.client_lead_meta
 where lead_id like 'shopify\_%' escape '\';

delete from public.client_lead
 where lead_id like 'shopify\_%' escape '\';
