-- Registered apps / integrations (e.g. Blaztr). Agency admins create these;
-- each can carry a logo and an API key (secret). The api_key is only ever read
-- server-side — never returned to the browser.
create table if not exists integrations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'other',   -- cold_email | ads | crm | analytics | other
  logo_url   text,
  api_key    text,                             -- secret; service-role access only
  status     text not null default 'draft',    -- connected (has key) | draft
  owner_id   uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- All access goes through the service-role API route; no client policies.
alter table integrations enable row level security;
