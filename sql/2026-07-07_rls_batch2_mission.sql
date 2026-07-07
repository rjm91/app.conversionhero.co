-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Batch 2 — tighten the mission tables to the tenant boundary
--
-- Current state (2026-07-05 file): RLS on, but policies are `for all
-- using(true) with check(true)` TO PUBLIC — the anon key can read AND write
-- these tables. Confirmed live 2026-07-07 (anon read 13 findings / 93 metric
-- rows). All app access goes through service-role API routes, so nothing
-- user-facing depends on the permissive policies.
--
-- New shape:
--   • SELECT for authenticated users gated by can_access_client(client_id)
--     (Batch 0 helper — membership OR agency subtree OR root admin). This is
--     what the future agent identity and any direct browser reads ride on.
--   • NO insert/update/delete policies — writes remain service-role only
--     (cron watcher, /api/mission/* routes bypass RLS).
--
-- Verify after running:  node scripts/rls-verify.mjs batch2
-- Rollback (restores the permissive policies):
--   re-run the do-block at the bottom of sql/2026-07-05_mission_tables.sql
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['client_daily_metrics','mission_findings','mission_decisions','mission_policies'] loop
    -- retire the anon-writable permissive policy
    execute format('drop policy if exists "%s_all" on %s', t, t);
    -- tenant-scoped read for signed-in humans and (later) agent identities
    execute format('drop policy if exists "%s_tenant_select" on %s', t, t);
    execute format(
      'create policy "%s_tenant_select" on %s for select to authenticated using ((select public.can_access_client(client_id)))',
      t, t
    );
  end loop;
end $$;

-- Report: expect rls_on = true and exactly one *_tenant_select policy each.
select c.relname as "table", c.relrowsecurity as rls_on,
       p.polname as policy, pg_get_expr(p.polqual, p.polrelid) as using_expr
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('client_daily_metrics','mission_findings','mission_decisions','mission_policies')
order by 1, 3;
