-- Per-channel daily P&L — one row per client × day × channel (Meta, Google,
-- Direct, Klaviyo, Shop, Draft Order, …). Facts only (revenue, orders, cogs,
-- spend); ratios (ROAS/AOV/%-of-paid) are always derived, never stored.
-- Written by the nightly snapshot (lib/mission/pnl-snapshot.js), which also
-- rewrites the trailing 7 days so late refunds/edits are absorbed.

create table if not exists public.client_channel_daily_pnl (
  client_id text not null references public.client(client_id) on delete cascade,
  day date not null,
  channel text not null,
  gross_revenue numeric not null default 0,
  net_revenue   numeric not null default 0,
  discounts     numeric not null default 0,
  refunds       numeric not null default 0,
  orders        integer not null default 0,
  new_orders    integer not null default 0,
  cogs          numeric not null default 0,
  spend         numeric not null default 0,
  computed_at timestamptz not null default now(),
  primary key (client_id, day, channel)
);
create index if not exists client_channel_daily_pnl_day_idx on public.client_channel_daily_pnl (client_id, day);

alter table public.client_channel_daily_pnl enable row level security;
drop policy if exists client_channel_daily_pnl_tenant_select on public.client_channel_daily_pnl;
create policy client_channel_daily_pnl_tenant_select on public.client_channel_daily_pnl
  for select to authenticated using (can_access_client(client_id));
