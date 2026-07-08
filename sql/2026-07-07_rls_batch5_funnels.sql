-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Batch 5 — funnel surfaces (the only tables with INTENTIONAL public read)
--
--   client_funnels        public read of LIVE rows (landing-page design,
--                         per 2026-06 decision) + tenant read of everything
--                         (funnels admin pages read drafts from the browser).
--                         Writes stay API/service-side.
--   client_funnel_steps   same shape, scoped through the parent funnel.
--   funnel_events         service-only (pixel posts via /api/funnels/track).
--   agency_funnels / agency_funnel_steps / agency_funnel_events
--                         service-only (no browser readers).
--
-- Sweep first (convention now includes _public_), then create.
-- Verify: node scripts/rls-verify.mjs batch5  + load a live funnel page
-- Rollback: alter table public.<t> disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare r record;
begin
  for r in
    select c.relname as tbl, p.polname as pol
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('client_funnels','client_funnel_steps','funnel_events',
                        'agency_funnels','agency_funnel_steps','agency_funnel_events')
      and p.polname !~ ('^' || c.relname || '_(tenant|self|public)_(select|insert|update|delete)$')
  loop
    execute format('drop policy %I on public.%I', r.pol, r.tbl);
    raise notice 'dropped legacy policy % on %', r.pol, r.tbl;
  end loop;
end $$;

-- client_funnels
drop policy if exists "client_funnels_public_select" on client_funnels;
drop policy if exists "client_funnels_tenant_select" on client_funnels;
create policy "client_funnels_public_select" on client_funnels for select to anon, authenticated
  using (status = 'live');
create policy "client_funnels_tenant_select" on client_funnels for select to authenticated
  using ((select public.can_access_client(client_id)));
alter table public.client_funnels enable row level security;

-- client_funnel_steps — through the parent funnel
drop policy if exists "client_funnel_steps_public_select" on client_funnel_steps;
drop policy if exists "client_funnel_steps_tenant_select" on client_funnel_steps;
create policy "client_funnel_steps_public_select" on client_funnel_steps for select to anon, authenticated
  using (exists (select 1 from client_funnels f
                 where f.id = client_funnel_steps.funnel_id and f.status = 'live'));
create policy "client_funnel_steps_tenant_select" on client_funnel_steps for select to authenticated
  using (exists (select 1 from client_funnels f
                 where f.id = client_funnel_steps.funnel_id and public.can_access_client(f.client_id)));
alter table public.client_funnel_steps enable row level security;

-- service-only
alter table public.funnel_events        enable row level security;
alter table public.agency_funnels       enable row level security;
alter table public.agency_funnel_steps  enable row level security;
alter table public.agency_funnel_events enable row level security;

-- Report
select c.relname as "table", c.relrowsecurity as rls_on, p.polname as policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('client_funnels','client_funnel_steps','funnel_events',
                    'agency_funnels','agency_funnel_steps','agency_funnel_events')
order by 1, 3;
