-- Adds impressions to Google campaign rows so the Ecom Control Center (and any
-- view) can show CTR (clicks ÷ impressions). Backfilled on the next Google sync.

alter table client_yt_campaigns
  add column if not exists impressions bigint default 0;
