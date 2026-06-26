-- Wire the "loose" client-owned tables to the client table.
-- Generated from db/schema.json by scripts/gen-fk-migration.mjs.
-- Adds client_id → client.client_id foreign keys so relationships are
-- declared + enforced (and the Schema Map snaps into one tree).
--
-- Run this whole block in the Supabase SQL Editor. It is transactional:
-- if anything fails, nothing is applied.

begin;

-- client_avatar_videos  (client_id NOT NULL → NO ACTION)
delete from public.client_avatar_videos
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.client_avatar_videos
  drop constraint if exists client_avatar_videos_client_id_fkey,
  add constraint client_avatar_videos_client_id_fkey
  foreign key (client_id) references public.client(client_id);

-- client_campaign_drafts  (client_id NOT NULL → NO ACTION)
delete from public.client_campaign_drafts
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.client_campaign_drafts
  drop constraint if exists client_campaign_drafts_client_id_fkey,
  add constraint client_campaign_drafts_client_id_fkey
  foreign key (client_id) references public.client(client_id);

-- client_domains  (client_id NOT NULL → NO ACTION)
delete from public.client_domains
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.client_domains
  drop constraint if exists client_domains_client_id_fkey,
  add constraint client_domains_client_id_fkey
  foreign key (client_id) references public.client(client_id);

-- client_google_ads_account  (client_id NOT NULL → NO ACTION)
delete from public.client_google_ads_account
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.client_google_ads_account
  drop constraint if exists client_google_ads_account_client_id_fkey,
  add constraint client_google_ads_account_client_id_fkey
  foreign key (client_id) references public.client(client_id);

-- client_meta_campaigns  (client_id NOT NULL → NO ACTION)
delete from public.client_meta_campaigns
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.client_meta_campaigns
  drop constraint if exists client_meta_campaigns_client_id_fkey,
  add constraint client_meta_campaigns_client_id_fkey
  foreign key (client_id) references public.client(client_id);

-- client_payments  (client_id nullable → ON DELETE SET NULL)
update public.client_payments set client_id = null
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.client_payments
  drop constraint if exists client_payments_client_id_fkey,
  add constraint client_payments_client_id_fkey
  foreign key (client_id) references public.client(client_id) on delete set null;

-- client_yt_ad_groups  (client_id NOT NULL → NO ACTION)
delete from public.client_yt_ad_groups
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.client_yt_ad_groups
  drop constraint if exists client_yt_ad_groups_client_id_fkey,
  add constraint client_yt_ad_groups_client_id_fkey
  foreign key (client_id) references public.client(client_id);

-- client_yt_ads  (client_id NOT NULL → NO ACTION)
delete from public.client_yt_ads
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.client_yt_ads
  drop constraint if exists client_yt_ads_client_id_fkey,
  add constraint client_yt_ads_client_id_fkey
  foreign key (client_id) references public.client(client_id);

-- meta_connections  (client_id NOT NULL → NO ACTION)
delete from public.meta_connections
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.meta_connections
  drop constraint if exists meta_connections_client_id_fkey,
  add constraint meta_connections_client_id_fkey
  foreign key (client_id) references public.client(client_id);

-- shopify_connections  (client_id NOT NULL → NO ACTION)
delete from public.shopify_connections
  where client_id is not null and client_id not in (select client_id from public.client);
alter table public.shopify_connections
  drop constraint if exists shopify_connections_client_id_fkey,
  add constraint shopify_connections_client_id_fkey
  foreign key (client_id) references public.client(client_id);

commit;
