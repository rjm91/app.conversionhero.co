-- Denormalize client_id onto child tables so every tenant table carries its
-- own client_id (RLS without joins; clean scale-out). client_qb_payments is
-- intentionally excluded: it's agency-scope (agreement invoices), not client.

alter table public.client_funnel_steps add column if not exists client_id text references public.client(client_id) on delete cascade;
update public.client_funnel_steps s set client_id = f.client_id
  from public.client_funnels f where f.id = s.funnel_id and s.client_id is null;
create index if not exists client_funnel_steps_client_idx on public.client_funnel_steps (client_id);

alter table public.client_lead_meta add column if not exists client_id text references public.client(client_id) on delete cascade;
update public.client_lead_meta m set client_id = l.client_id
  from public.client_lead l where l.lead_id = m.lead_id and m.client_id is null;
create index if not exists client_lead_meta_client_idx on public.client_lead_meta (client_id);

select
  (select count(*) filter (where client_id is null) from public.client_funnel_steps) as steps_null,
  (select count(*) filter (where client_id is null) from public.client_lead_meta) as lead_meta_null;
