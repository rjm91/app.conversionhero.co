-- Align Meta (Facebook) campaign data with Google: add status, daily budget,
-- and platform-reported conversions to client_meta_campaigns.
-- Run in the Supabase SQL editor.

alter table client_meta_campaigns
  add column if not exists status      text,
  add column if not exists budget      numeric default 0,
  add column if not exists conversions numeric default 0;
