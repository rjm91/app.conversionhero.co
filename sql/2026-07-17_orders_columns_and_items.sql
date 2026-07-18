-- ─────────────────────────────────────────────────────────────────────────────
-- Shopify order data as REAL COLUMNS + a line-items child table, replacing the
-- client_orders.shopify_data jsonb blob.
--
--   • Scalar fields → columns on client_orders (the orders table IS the
--     Shopify order — no 1:1 side table, no join tax).
--   • line_items → client_order_items, one row per order line, FK'd to the
--     order so PostgREST can embed items on order queries and the drill runs
--     order → items → SKU → client_sku_bom → client_materials on live rows.
--
-- Idempotent. The blob column drops in a follow-up after the reading code
-- deploys + a straggler re-backfill.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.client_orders
  add column if not exists order_name         text,
  add column if not exists shopify_channel    text,
  add column if not exists financial_status   text,
  add column if not exists fulfillment_status text,
  add column if not exists delivery_method    text,
  add column if not exists country            text,
  add column if not exists item_count         integer,
  add column if not exists subtotal           numeric,
  add column if not exists discounts          numeric,
  add column if not exists refunds            numeric,
  add column if not exists tax                numeric,
  add column if not exists first_utm_source   text,
  add column if not exists first_utm_medium   text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_utm_content  text,
  add column if not exists last_utm_source    text,
  add column if not exists last_utm_medium    text,
  add column if not exists last_utm_campaign  text,
  add column if not exists last_utm_content   text;

create table if not exists public.client_order_items (
  id bigint generated always as identity primary key,
  client_id text not null references public.client(client_id) on delete cascade,
  order_id  text not null references public.client_orders(order_id) on delete cascade,
  sku   text,
  title text,
  qty   numeric not null default 0
);
create index if not exists client_order_items_order_idx on public.client_order_items (client_id, order_id);
create index if not exists client_order_items_sku_idx   on public.client_order_items (client_id, sku);

alter table public.client_order_items enable row level security;
drop policy if exists client_order_items_tenant_select on public.client_order_items;
create policy client_order_items_tenant_select on public.client_order_items
  for select to authenticated using (can_access_client(client_id));
drop policy if exists client_order_items_tenant_insert on public.client_order_items;
create policy client_order_items_tenant_insert on public.client_order_items
  for insert to authenticated with check (can_access_client(client_id));
drop policy if exists client_order_items_tenant_update on public.client_order_items;
create policy client_order_items_tenant_update on public.client_order_items
  for update to authenticated using (can_access_client(client_id)) with check (can_access_client(client_id));
drop policy if exists client_order_items_tenant_delete on public.client_order_items;
create policy client_order_items_tenant_delete on public.client_order_items
  for delete to authenticated using (can_access_client(client_id));

-- ── Backfill columns from the blob ──
update public.client_orders set
  order_name         = shopify_data->>'order_name',
  shopify_channel    = shopify_data->>'channel',
  financial_status   = shopify_data->>'financial_status',
  fulfillment_status = shopify_data->>'fulfillment_status',
  delivery_method    = shopify_data->>'delivery_method',
  country            = shopify_data->>'country',
  item_count         = nullif(shopify_data->>'item_count', '')::integer,
  subtotal           = nullif(shopify_data->>'subtotal', '')::numeric,
  discounts          = nullif(shopify_data->>'discounts', '')::numeric,
  refunds            = nullif(shopify_data->>'refunds', '')::numeric,
  tax                = nullif(shopify_data->>'tax', '')::numeric,
  first_utm_source   = shopify_data->'first_utm'->>'source',
  first_utm_medium   = shopify_data->'first_utm'->>'medium',
  first_utm_campaign = shopify_data->'first_utm'->>'campaign',
  first_utm_content  = shopify_data->'first_utm'->>'content',
  last_utm_source    = shopify_data->'last_utm'->>'source',
  last_utm_medium    = shopify_data->'last_utm'->>'medium',
  last_utm_campaign  = shopify_data->'last_utm'->>'campaign',
  last_utm_content   = shopify_data->'last_utm'->>'content'
where shopify_data is not null;

-- ── Backfill items from the blob (idempotent: replace per order) ──
delete from public.client_order_items i
  using public.client_orders o
  where i.order_id = o.order_id and o.shopify_data ? 'line_items';

insert into public.client_order_items (client_id, order_id, sku, title, qty)
select o.client_id, o.order_id,
       nullif(li->>'sku', ''), li->>'title',
       coalesce(nullif(li->>'qty', '')::numeric, 0)
from public.client_orders o
cross join lateral jsonb_array_elements(o.shopify_data->'line_items') li
where o.shopify_data ? 'line_items';

select
  (select count(*) from public.client_orders where subtotal is not null) as orders_with_subtotal,
  (select count(*) from public.client_order_items) as item_rows;
