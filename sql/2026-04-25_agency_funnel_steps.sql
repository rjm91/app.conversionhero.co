-- Agency-level funnel steps (mirrors client_funnel_steps).

create table if not exists agency_funnel_steps (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references agency_funnels(id) on delete cascade,
  step_order int not null,
  step_type text not null check (step_type in ('landing','thank_you','survey','booking','custom')),
  slug text,
  name text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (funnel_id, step_order),
  unique (funnel_id, slug)
);

create index if not exists agency_funnel_steps_funnel_idx
  on agency_funnel_steps(funnel_id, step_order);

-- Seed default steps for the ai-clone funnel
insert into agency_funnel_steps (funnel_id, step_order, step_type, slug, name)
select f.id, 1, 'landing', null, f.name
from agency_funnels f
where f.slug = 'ai-clone'
  and not exists (select 1 from agency_funnel_steps s where s.funnel_id = f.id and s.step_order = 1);

insert into agency_funnel_steps (funnel_id, step_order, step_type, slug, name)
select f.id, 2, 'thank_you', 'thanks', 'Thank You'
from agency_funnels f
where f.slug = 'ai-clone'
  and not exists (select 1 from agency_funnel_steps s where s.funnel_id = f.id and s.step_order = 2);
