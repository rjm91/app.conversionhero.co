-- ─────────────────────────────────────────────────────────────────────────────
-- client_daily_pnl — the historical P&L RECORD (one immutable-ish row per day).
--
-- The mission Overview computes the P&L live from client_orders + campaign
-- tables + BOM every load, so historical days silently drift (e.g. an Aug
-- refund changes a July day). This table snapshots each day's full P&L so it
-- becomes an auditable record you can back-trace: `metrics` holds the complete
-- computeDailyPnl output, `source_refs` holds the order/campaign IDs that fed
-- it, `computed_at` stamps when it was locked.
--
-- Written nightly by the cron (rolling ~35-day window re-locks recent days;
-- older days stay frozen) and backfilled via /api/mission/pnl-snapshot.
-- Same tenant RLS as everything else. Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.client_daily_pnl (
  client_id      text not null references public.client(client_id),
  date           date not null,
  -- headline columns (indexed/queryable); full detail lives in metrics jsonb
  net_sales      numeric,
  gross_profit   numeric,
  total_orders   int,
  total_spend    numeric,
  cogs           numeric,
  metrics        jsonb not null default '{}',   -- complete computeDailyPnl output
  source_refs    jsonb not null default '{}',   -- { order_ids:[...] } — back-trace to client_orders
  cost_per_label numeric,                        -- the config used (auditability)
  computed_at    timestamptz not null default now(),
  primary key (client_id, date)
);

create index if not exists client_daily_pnl_client_date_idx
  on public.client_daily_pnl (client_id, date desc);

alter table public.client_daily_pnl enable row level security;
drop policy if exists "client_daily_pnl_tenant_select" on public.client_daily_pnl;
create policy "client_daily_pnl_tenant_select" on public.client_daily_pnl
  for select to authenticated
  using ((select public.can_access_client(client_id)));

select 'client_daily_pnl' as table_name,
       (select count(*) from public.client_daily_pnl) as rows,
       (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = 'client_daily_pnl') as policies;
