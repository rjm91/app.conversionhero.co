-- QuickBooks OAuth token storage (one row per QB company)
create table if not exists qb_tokens (
  realm_id                 text primary key,
  access_token             text not null,
  refresh_token            text not null,
  access_token_expires_at  timestamptz not null,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- QB customer mapping + last sync timestamp on billing config
alter table client_billing add column if not exists qb_customer_id text;
alter table client_billing add column if not exists qb_last_synced_at timestamptz;
