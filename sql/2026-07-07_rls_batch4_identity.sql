-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Batch 4 — identity & tenancy layer
--
-- Closes the last anon-open tables (client 71 rows, profiles 8, plans 3) and
-- replaces every legacy policy (agency "read own agency", membership
-- self-reads, agency_transcriptions public read/write, profiles self-access)
-- with reach-based policies on the Batch-0 helpers.
--
-- Shapes:
--   client              select + update within reach (clients page edits
--                       status/settings from the browser; insert/delete stay
--                       service-side)
--   agency              select within reach (subtree)
--   agency_membership   select: own rows OR agency within reach
--   client_membership   select: own rows OR client within reach
--   profiles            select: self OR root admin OR profile belongs to a
--                       client/agency within reach (covers team surfaces);
--                       update: self only
--   agency_leads        select within agency reach (writes are API/cron)
--   agency_automations  select within agency reach
--   agency_transcriptions select within agency reach (replaces public CRUD!)
--   plans, email_templates, dev_roadmap, role_change_audit
--                       service-only (RLS on, zero policies)
--
-- Sweep first: on all batch-4 tables, drop every policy not matching our
-- naming convention — retires all legacy policies in one deterministic pass.
--
-- Note on recursion: policies call SECURITY DEFINER helpers which read
-- client/profiles/memberships internally — definer bypasses RLS, no cycles.
--
-- Verify: node scripts/rls-verify.mjs batch4   + reload the app end to end
-- Rollback: alter table public.<t> disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Sweep legacy policies
do $$
declare r record;
begin
  for r in
    select c.relname as tbl, p.polname as pol
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('client','agency','agency_membership','client_membership','profiles',
                        'plans','email_templates','dev_roadmap','role_change_audit',
                        'agency_leads','agency_automations','agency_transcriptions')
      and p.polname !~ ('^' || c.relname || '_(tenant|self)_(select|insert|update|delete)$')
  loop
    execute format('drop policy %I on public.%I', r.pol, r.tbl);
    raise notice 'dropped legacy policy % on %', r.pol, r.tbl;
  end loop;
end $$;

-- 2) client — read + update within reach
drop policy if exists "client_tenant_select" on client;
drop policy if exists "client_tenant_update" on client;
create policy "client_tenant_select" on client for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy "client_tenant_update" on client for update to authenticated
  using ((select public.can_access_client(client_id)))
  with check ((select public.can_access_client(client_id)));
alter table public.client enable row level security;

-- 3) agency — read within subtree reach
drop policy if exists "agency_tenant_select" on agency;
create policy "agency_tenant_select" on agency for select to authenticated
  using ((select public.can_access_agency(id)));
alter table public.agency enable row level security;

-- 4) memberships — own rows OR rows inside your reach
drop policy if exists "agency_membership_tenant_select" on agency_membership;
create policy "agency_membership_tenant_select" on agency_membership for select to authenticated
  using (profile_id = auth.uid() or (select public.can_access_agency(agency_id)));
alter table public.agency_membership enable row level security;

drop policy if exists "client_membership_tenant_select" on client_membership;
create policy "client_membership_tenant_select" on client_membership for select to authenticated
  using (profile_id = auth.uid() or (select public.can_access_client(client_id)));
alter table public.client_membership enable row level security;

-- 5) profiles — self + reach; update self-only
drop policy if exists "profiles_self_select" on profiles;
drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_select" on profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_root_admin()
    or exists (select 1 from client_membership cm
               where cm.profile_id = profiles.id and public.can_access_client(cm.client_id))
    or exists (select 1 from agency_membership am
               where am.profile_id = profiles.id and public.can_access_agency(am.agency_id))
    or (profiles.client_id is not null and public.can_access_client(profiles.client_id))
  );
create policy "profiles_self_update" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
alter table public.profiles enable row level security;

-- 6) agency-scoped data tables — select within reach, writes service-side
do $$
declare t text;
begin
  foreach t in array array['agency_leads','agency_automations','agency_transcriptions'] loop
    execute format('drop policy if exists "%s_tenant_select" on %s', t, t);
    execute format('create policy "%s_tenant_select" on %s for select to authenticated using ((select public.can_access_agency(agency_id)))', t, t);
    execute format('alter table public.%s enable row level security', t);
  end loop;
end $$;

-- 7) service-only tables — RLS on, zero policies
alter table public.plans             enable row level security;
alter table public.email_templates   enable row level security;
alter table public.dev_roadmap       enable row level security;
alter table public.role_change_audit enable row level security;

-- Report
select c.relname as "table", c.relrowsecurity as rls_on, p.polname as policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('client','agency','agency_membership','client_membership','profiles',
                    'plans','email_templates','dev_roadmap','role_change_audit',
                    'agency_leads','agency_automations','agency_transcriptions')
order by 1, 3;
