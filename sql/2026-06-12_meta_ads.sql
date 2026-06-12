-- Meta (Facebook) Ads integration tables.
-- meta_connections: per-client connection (ad account + long-lived token).
-- client_meta_campaigns: daily campaign spend rows pulled from the Marketing API
-- (mirrors client_yt_campaigns). Attribution reuses orders' utm_campaign, which
-- already holds the Meta campaign ID.

create table if not exists meta_connections (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null unique,
  ad_account_id text not null,                 -- numeric, with or without act_ prefix
  access_token  text not null,                 -- long-lived System User token (ads_read)
  app_secret    text,                          -- optional, for appsecret_proof if required
  updated_at    timestamptz default now()
);

create table if not exists client_meta_campaigns (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null,
  campaign_id   text not null,
  campaign_name text,
  spend         numeric default 0,
  impressions   bigint  default 0,
  clicks        bigint  default 0,
  date          date,
  synced_at     timestamptz default now(),
  unique (client_id, campaign_id, date)
);

create index if not exists client_meta_campaigns_client_idx on client_meta_campaigns (client_id, date);
