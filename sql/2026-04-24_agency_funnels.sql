-- Agency-level landing pages (offer pages used to send prospects).
-- Static HTML lives at /public/p/<slug>/index.html. This table tracks
-- metadata + counters for each page so they show up on /control/funnels.
create table if not exists agency_funnels (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  status      text default 'draft',
  visitors    int  default 0,
  leads       int  default 0,
  created_at  timestamptz default now()
);

-- Raw event log for the agency landing pages. Mirrors funnel_events
-- but agency-scoped (no client_id).
create table if not exists agency_funnel_events (
  id          bigserial primary key,
  funnel_id   uuid references agency_funnels(id) on delete cascade,
  event_type  text not null,
  session_id  text,
  meta        jsonb,
  created_at  timestamptz default now()
);

create index if not exists agency_funnel_events_funnel_idx
  on agency_funnel_events (funnel_id, created_at desc);

-- Seed the first funnel so the UI has a row to render.
insert into agency_funnels (slug, name, status)
values ('ai-clone', 'AI Clone — HVAC Beta', 'draft')
on conflict (slug) do nothing;
