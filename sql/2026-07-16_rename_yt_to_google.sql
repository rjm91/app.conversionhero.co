-- ─────────────────────────────────────────────────────────────────────────────
-- Rename the Google Ads tables: client_yt_* → client_google_* (the "yt" prefix
-- predates the account syncing more than YouTube campaigns; the tables hold ALL
-- Google Ads data). Postgres carries PK/FK/indexes/RLS policies through a
-- rename untouched — no data moves.
--
-- Compatibility views keep the OLD names working (reads AND writes — a bare
-- single-table view is auto-updatable) so the currently-deployed app keeps
-- running until the renamed code deploys. security_invoker makes the views run
-- with the caller's permissions, so RLS behaves exactly as before.
--
-- Run in the Supabase SQL editor BEFORE the renamed code deploys.
-- Once the new code is live, drop the views with the block at the bottom.
-- Afterwards: npm run db:schema to regenerate db/schema.md.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.client_yt_campaigns rename to client_google_campaigns;
alter table public.client_yt_ad_groups rename to client_google_ad_groups;
alter table public.client_yt_ads       rename to client_google_ads;

create view public.client_yt_campaigns with (security_invoker) as
  select * from public.client_google_campaigns;
create view public.client_yt_ad_groups with (security_invoker) as
  select * from public.client_google_ad_groups;
create view public.client_yt_ads with (security_invoker) as
  select * from public.client_google_ads;

-- ── Cleanup (run AFTER the renamed code is deployed and verified) ──
-- drop view public.client_yt_campaigns;
-- drop view public.client_yt_ad_groups;
-- drop view public.client_yt_ads;
