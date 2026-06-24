-- Daily snapshot of Blaztr cold-email totals.
-- Blaztr exposes no time-series/history endpoint, so we record the `summary`
-- once per day to build a trend over time (one row per day, idempotent upsert).
create table if not exists blaztr_daily (
  day             date primary key,
  total_campaigns int     not null default 0,
  total_leads     int     not null default 0,
  total_sent      int     not null default 0,
  total_replies   int     not null default 0,
  total_bounced   int     not null default 0,
  reply_rate      numeric not null default 0,
  active_senders  int     not null default 0,
  updated_at      timestamptz not null default now()
);

-- Agency-only table; all access goes through service-role API routes.
alter table blaztr_daily enable row level security;
