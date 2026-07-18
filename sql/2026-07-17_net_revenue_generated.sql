-- True revenue per order, as a GENERATED column (Postgres computes it; it can
-- never drift from the formula). Merchandise basis: subtotal − refunds.
-- Matches the Daily P&L's Net Sales exactly. NULL when subtotal was never
-- captured (pre-backfill rows fall back to sale_amount in code).
alter table public.client_orders
  add column if not exists net_revenue numeric
  generated always as (subtotal - coalesce(refunds, 0)) stored;
