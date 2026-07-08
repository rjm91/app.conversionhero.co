-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Batch 3c — commerce/ops tables  (v2 — first run failed & rolled back:
-- client_qb_payments has NO client_id column; it's raw QuickBooks invoice
-- data keyed by realm_id with zero browser readers → service-only.)
--
--   select-only (browser reads; writes are service-key syncs/APIs):
--     client_materials, client_skus, client_payments, client_google_ads_account
--   service-only (RLS on, zero policies):
--     client_qb_payments
--   select + insert + update (billing page edits from the browser;
--     no browser delete exists → delete stays service-only):
--     client_billing
--
-- Verify: node scripts/rls-verify.mjs batch3c   + reload billing/manufacturing
-- Rollback: alter table public.<t> disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['client_materials','client_skus','client_payments','client_google_ads_account'] loop
    execute format('drop policy if exists "%s_tenant_select" on %s', t, t);
    execute format('create policy "%s_tenant_select" on %s for select to authenticated using ((select public.can_access_client(client_id)))', t, t);
    execute format('alter table public.%s enable row level security', t);
  end loop;
end $$;

-- Raw QB invoices: agency-internal, service-key only.
alter table public.client_qb_payments enable row level security;

drop policy if exists "client_billing_tenant_select" on client_billing;
drop policy if exists "client_billing_tenant_insert" on client_billing;
drop policy if exists "client_billing_tenant_update" on client_billing;
create policy "client_billing_tenant_select" on client_billing for select to authenticated
  using ((select public.can_access_client(client_id)));
create policy "client_billing_tenant_insert" on client_billing for insert to authenticated
  with check ((select public.can_access_client(client_id)));
create policy "client_billing_tenant_update" on client_billing for update to authenticated
  using ((select public.can_access_client(client_id)))
  with check ((select public.can_access_client(client_id)));
alter table public.client_billing enable row level security;

select c.relname as "table", c.relrowsecurity as rls_on, p.polname as policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('client_materials','client_skus','client_payments','client_qb_payments','client_google_ads_account','client_billing')
order by 1, 3;
