-- ─────────────────────────────────────────────────────────────────────────────
-- Orders vs leads split — step 1 of 2 (non-destructive)
--
-- client_lead has been holding BOTH ecom orders (lead_id 'shopify_%') and true
-- leads (funnel form fills / quote requests / manual contacts). Orders are
-- transactions, leads are intent — different entities with different
-- lifecycles — so orders move to their own table. client_lead goes back to
-- meaning leads/contacts only, which scales cleanly across industries:
--   Ecom          → client_orders is the primary acquisition record
--   Home Service  → client_lead is the primary acquisition record
--   Both          → a client can have leads AND orders (e.g. a lead magnet
--                   on an ecom store) with no special-casing anywhere.
--
-- Rollout order:
--   1. Run this file (creates client_orders + copies shopify rows into it).
--   2. Deploy the app code that reads/writes client_orders.
--   3. Verify the ecom views (ShieldTech dashboard / mission / paid ads).
--   4. Run sql/2026-07-06_client_orders_cleanup.sql to delete the shopify
--      rows from client_lead. The app excludes them from every lead query,
--      so timing of the cleanup is not critical.
--
-- RLS: intentionally left disabled to match client_lead — the browser reads
-- both tables directly with the anon key today. Revisit both together when
-- RLS is rolled out.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.client_orders (
  order_id     text primary key,  -- 'shopify_<id>' today; prefix with the platform for future sources
  client_id    text references public.client(client_id),
  created_at   timestamptz,
  first_name   text,
  last_name    text,
  email        text,
  phone        text,
  address      text,
  city         text,
  state        text,
  zip_code     text,
  sale_amount  numeric,
  source       text default 'shopify',  -- platform the order came from (shopify | manual | ...)
  notes        text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_adgroup  text,
  utm_content  text,
  utm_term     text,
  gclid        text,
  wbraid       text,
  funnel_id    uuid,
  shopify_data jsonb
);

create index if not exists client_orders_client_created_idx
  on public.client_orders (client_id, created_at desc);
create index if not exists client_orders_client_campaign_idx
  on public.client_orders (client_id, utm_campaign);

-- Backfill: copy every Shopify order row out of client_lead, keeping the same
-- primary-key values so in-app keys (cogsByOrder[lead_id]) and any
-- client_lead_meta references stay valid. Idempotent — safe to re-run.
insert into public.client_orders (
  order_id, client_id, created_at, first_name, last_name, email, phone,
  address, city, state, zip_code, sale_amount, source, notes,
  utm_source, utm_medium, utm_campaign, utm_adgroup, utm_content, utm_term,
  gclid, wbraid, funnel_id, shopify_data
)
select
  lead_id, client_id, created_at, first_name, last_name, email, phone,
  address, city, state, zip_code, sale_amount, 'shopify', ch_notes,
  utm_source, utm_medium, utm_campaign, utm_adgroup, utm_content, utm_term,
  gclid, wbraid, funnel_id, shopify_data
from public.client_lead
where lead_id like 'shopify\_%' escape '\'
on conflict (order_id) do nothing;
