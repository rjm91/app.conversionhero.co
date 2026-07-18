-- Denormalized order timestamp on line items — lets client_order_items be
-- browsed/filtered by date without joining client_orders. Writers set it on
-- insert; backfill covers existing rows.
alter table public.client_order_items add column if not exists ordered_at timestamptz;

update public.client_order_items i
  set ordered_at = o.created_at
  from public.client_orders o
  where o.order_id = i.order_id and i.ordered_at is distinct from o.created_at;

create index if not exists client_order_items_date_idx on public.client_order_items (client_id, ordered_at);

select count(*) filter (where ordered_at is not null) as with_date, count(*) as total from public.client_order_items;
