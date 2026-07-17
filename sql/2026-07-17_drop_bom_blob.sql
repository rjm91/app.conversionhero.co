-- Follow-up to 2026-07-17_client_sku_bom.sql — run AFTER the row-reading code
-- is deployed and verified. Removes the legacy jsonb blob; client_sku_bom is
-- now the single source of truth for BOMs.

alter table public.client_skus drop column if exists bom;

select parent_sku, size from public.client_skus limit 3;
