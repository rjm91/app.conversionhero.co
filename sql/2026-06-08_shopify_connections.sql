-- Stores each client's Shopify OAuth connection (one row per client).
-- The sync route reads { shop_domain, access_token } by client_id to pull
-- orders from the Shopify Admin API. Tokens are obtained via the OAuth flow
-- (/api/shopify/auth → /api/shopify/callback) or, for a single client, by
-- pasting an in-admin custom-app token directly into a row.

create table if not exists shopify_connections (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null unique,        -- one Shopify store per client
  shop_domain  text not null,               -- e.g. 'tryshieldtech.myshopify.com'
  access_token text not null,               -- shpat_… (custom app) or OAuth access token
  scope        text,                        -- granted scopes, e.g. 'read_orders,read_customer_events'
  installed_at timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Prevent the same store from being linked to two different clients.
create unique index if not exists shopify_connections_shop_domain_idx
  on shopify_connections (shop_domain);
