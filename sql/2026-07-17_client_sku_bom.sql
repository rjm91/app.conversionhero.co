-- ─────────────────────────────────────────────────────────────────────────────
-- client_sku_bom — the BOM as REAL ROWS instead of a jsonb blob on client_skus.
-- One row per SKU × component: numeric components (magnets, yards, counts) use
-- qty; size-style components (box_size 'Mini', bag_size 'Small Bag',
-- magnet_box_size '8x2x2') use value. Generic across clients — no per-client
-- columns. Drill story: order → line item → SKU → these rows → client_materials
-- unit cost → dollars. The UI pivots back to the CEO-sheet layout for display.
--
-- Backfill converts the existing blobs. client_skus.bom is dropped in a
-- follow-up AFTER the reading code deploys (sql/…_drop_bom_blob.sql).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.client_sku_bom (
  id bigint generated always as identity primary key,
  client_id text not null references public.client(client_id) on delete cascade,
  parent_sku text not null,
  component text not null,
  qty numeric,
  value text,
  updated_at timestamptz not null default now(),
  unique (client_id, parent_sku, component),
  check (qty is not null or value is not null)
);
create index if not exists client_sku_bom_sku_idx on public.client_sku_bom (client_id, parent_sku);

alter table public.client_sku_bom enable row level security;
drop policy if exists client_sku_bom_tenant_select on public.client_sku_bom;
create policy client_sku_bom_tenant_select on public.client_sku_bom
  for select to authenticated using (can_access_client(client_id));

-- Backfill from the current jsonb blobs (idempotent).
insert into public.client_sku_bom (client_id, parent_sku, component, qty, value)
select s.client_id, s.parent_sku, t.key,
  case when t.value ~ '^-?[0-9]+(\.[0-9]+)?$' then t.value::numeric end,
  case when t.value ~ '^-?[0-9]+(\.[0-9]+)?$' then null else t.value end
from public.client_skus s
cross join lateral jsonb_each_text(s.bom) t
where t.value is not null and btrim(t.value) <> ''
on conflict (client_id, parent_sku, component)
do update set qty = excluded.qty, value = excluded.value, updated_at = now();

select count(*) as bom_rows, count(distinct parent_sku) as skus from public.client_sku_bom;
