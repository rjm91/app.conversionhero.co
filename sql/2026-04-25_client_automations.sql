-- Per-client automations (mirrors agency_automations but scoped to a client).
-- Each client manages their own notification rules separately.

create table if not exists client_automations (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references client(client_id) on delete cascade,
  kind        text not null,
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists client_automations_client_kind_idx
  on client_automations(client_id, kind, enabled);
