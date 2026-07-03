-- Klaviyo campaign/flow performance, synced as DAILY rows from the Klaviyo
-- Reporting API by /api/sync-klaviyo (mirrors client_meta_campaigns' shape so
-- the dashboard can range-filter the same way). campaign_id holds either a
-- Klaviyo campaign id or flow id; entity_type says which.
--
-- Run in the Supabase SQL editor, then `npm run db:schema` to refresh docs.

begin;

create table if not exists public.client_klaviyo_campaigns (
  id                uuid primary key default gen_random_uuid(),
  client_id         text not null references public.client(client_id),
  entity_type       text not null default 'campaign',   -- campaign | flow
  campaign_id       text not null,                      -- Klaviyo campaign/flow id
  campaign_name     text,
  channel           text,                               -- email | sms
  date              date not null,
  recipients        bigint,
  opens             bigint,                             -- unique opens
  clicks            bigint,                             -- unique clicks
  conversions       numeric,                            -- Klaviyo-attributed Placed Order count
  conversions_value numeric,                            -- Klaviyo-attributed revenue
  synced_at         timestamptz,
  unique (client_id, campaign_id, date)
);

create index if not exists client_klaviyo_campaigns_client_date_idx
  on public.client_klaviyo_campaigns (client_id, date);

alter table public.client_klaviyo_campaigns enable row level security;
-- No client-facing policies: reads/writes go through service-role API routes
-- (/api/klaviyo-stats, /api/sync-klaviyo).

commit;
