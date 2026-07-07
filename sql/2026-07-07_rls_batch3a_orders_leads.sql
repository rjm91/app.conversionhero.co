-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Batch 3a — orders/leads core: client_orders, client_lead, client_lead_meta
--
-- First browser-affecting flip. Surfaces that read/write these tables with
-- the USER's session: dashboard (Control Center), mission IDE Orders tab,
-- contacts page (full CRUD: lead insert/update/delete, order update/delete,
-- lead_meta delete), paid-ads, agency home, projection.
--
-- Gate cleared 2026-07-07 before this flip:
--   • root-admin real session → can_access_client('ch069') = true
--   • synthetic no-membership user → false, 0 rows from protected tables
--   • public funnel forms do NOT write client_lead directly (API routes only)
--     → no anon policies needed.
--
-- Shape: full CRUD for authenticated, tenant-gated. client_lead_meta has no
-- client_id — it scopes through its parent lead. Writes from server routes
-- (Shopify sync/webhook, transcriber, agency pipeline) use the service key
-- and bypass RLS.
--
-- Verify after running:  node scripts/rls-verify.mjs batch3a
--                        + reload the dashboard / contacts / mission Orders
-- Rollback: alter table public.<t> disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['client_orders','client_lead'] loop
    execute format('drop policy if exists "%s_tenant_select" on %s', t, t);
    execute format('drop policy if exists "%s_tenant_insert" on %s', t, t);
    execute format('drop policy if exists "%s_tenant_update" on %s', t, t);
    execute format('drop policy if exists "%s_tenant_delete" on %s', t, t);
    execute format('create policy "%s_tenant_select" on %s for select to authenticated using ((select public.can_access_client(client_id)))', t, t);
    execute format('create policy "%s_tenant_insert" on %s for insert to authenticated with check ((select public.can_access_client(client_id)))', t, t);
    execute format('create policy "%s_tenant_update" on %s for update to authenticated using ((select public.can_access_client(client_id))) with check ((select public.can_access_client(client_id)))', t, t);
    execute format('create policy "%s_tenant_delete" on %s for delete to authenticated using ((select public.can_access_client(client_id)))', t, t);
  end loop;
end $$;

-- client_lead_meta scopes through its parent lead.
drop policy if exists "client_lead_meta_tenant_select" on client_lead_meta;
drop policy if exists "client_lead_meta_tenant_insert" on client_lead_meta;
drop policy if exists "client_lead_meta_tenant_update" on client_lead_meta;
drop policy if exists "client_lead_meta_tenant_delete" on client_lead_meta;
create policy "client_lead_meta_tenant_select" on client_lead_meta for select to authenticated
  using (exists (select 1 from client_lead l where l.lead_id = client_lead_meta.lead_id and public.can_access_client(l.client_id)));
create policy "client_lead_meta_tenant_insert" on client_lead_meta for insert to authenticated
  with check (exists (select 1 from client_lead l where l.lead_id = client_lead_meta.lead_id and public.can_access_client(l.client_id)));
create policy "client_lead_meta_tenant_update" on client_lead_meta for update to authenticated
  using (exists (select 1 from client_lead l where l.lead_id = client_lead_meta.lead_id and public.can_access_client(l.client_id)))
  with check (exists (select 1 from client_lead l where l.lead_id = client_lead_meta.lead_id and public.can_access_client(l.client_id)));
create policy "client_lead_meta_tenant_delete" on client_lead_meta for delete to authenticated
  using (exists (select 1 from client_lead l where l.lead_id = client_lead_meta.lead_id and public.can_access_client(l.client_id)));

-- Flip enforcement on (idempotent).
alter table public.client_orders    enable row level security;
alter table public.client_lead      enable row level security;
alter table public.client_lead_meta enable row level security;

-- Report: expect rls_on = true, four tenant_* policies per table.
select c.relname as "table", c.relrowsecurity as rls_on,
       p.polname as policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('client_orders','client_lead','client_lead_meta')
order by 1, 3;
