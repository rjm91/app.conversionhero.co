-- ─────────────────────────────────────────────────────────────────────────────
-- Batch 3b hotfix — drop legacy "Allow all for anon" policies
--
-- client_yt_ad_groups and client_yt_ads carried pre-rollout anon-permissive
-- policies that OR past tenant_select (harness: anon read 1,640 ad-group and
-- 3,216 ad rows post-flip). Same failure mode as client_lead's legacy policy.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Allow all for anon" on public.client_yt_ad_groups;
drop policy if exists "Allow all for anon" on public.client_yt_ads;

-- Confirm: exactly one tenant_select per table, nothing else.
select c.relname as "table", p.polname as policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('client_yt_ad_groups','client_yt_ads')
order by 1, 2;
