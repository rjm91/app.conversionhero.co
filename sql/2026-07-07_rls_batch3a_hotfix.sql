-- ─────────────────────────────────────────────────────────────────────────────
-- Batch 3a hotfix — drop the legacy permissive policy on client_lead
--
-- "Allow read access to leads" predates the RLS rollout and is permissive to
-- anon: policies OR together, so it defeated client_lead_tenant_select
-- (harness caught it — anon still read all 282 leads after the 3a flip).
--
-- Also: a full inventory of EVERY policy in public, with roles + expressions,
-- so any other legacy permissive policies get caught before batches 3b-3d.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Allow read access to leads" on public.client_lead;

-- Inventory: every policy in the public schema. Look for roles = {public}
-- or using_expr = true on any table — those are legacy and need review.
select c.relname as "table",
       p.polname as policy,
       case p.polcmd when 'r' then 'select' when 'a' then 'insert'
                     when 'w' then 'update' when 'd' then 'delete'
                     when '*' then 'all' end as cmd,
       coalesce(array_to_string(array(
         select rolname from pg_roles where oid = any(p.polroles)), ','), 'public') as roles,
       pg_get_expr(p.polqual, p.polrelid)      as using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order by 1, 2;
