-- Agency-level leads captured from public landing pages.

create table if not exists agency_leads (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid references agency_funnels(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  selected_date text,
  selected_time text,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists agency_leads_created_idx
  on agency_leads (created_at desc);

create index if not exists agency_leads_funnel_idx
  on agency_leads (funnel_id, created_at desc);
