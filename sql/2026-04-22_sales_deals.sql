create table if not exists sales_deals (
  id           uuid primary key default gen_random_uuid(),
  prospect     text not null,
  company      text,
  email        text,
  phone        text,
  stage        text not null default 'Prospect',
  setter_email text,
  closer_email text,
  value        numeric(10,2) default 0,
  notes        text,
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- stage must be one of the pipeline stages
alter table sales_deals
  add constraint sales_deals_stage_check
  check (stage in ('Prospect', 'Appt Set', 'Showed', 'Closed Won', 'Closed Lost'));

-- auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger sales_deals_updated_at
  before update on sales_deals
  for each row execute procedure set_updated_at();

-- RLS: agency users only (enforce in API layer via service role)
alter table sales_deals enable row level security;
