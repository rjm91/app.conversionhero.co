-- Generic table for agency-level automations.
-- One row per rule; "kind" identifies what it does, "config" holds its settings.
-- Today: 'lead.notification.email'. Future: 'lead.notification.sms', 'lead.slack', etc.

create table if not exists agency_automations (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists agency_automations_kind_enabled_idx
  on agency_automations(kind, enabled);
