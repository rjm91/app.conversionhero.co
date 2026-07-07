-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Batch 3b — campaign tables (read-only from the browser)
--
-- client_yt_campaigns / client_yt_ad_groups / client_yt_ads /
-- client_meta_campaigns / client_klaviyo_campaigns.
-- All browser access is SELECT (dashboard, paid-ads, mission, projection);
-- every write is a sync cron on the service key. → tenant_select only.
--
-- Verify: node scripts/rls-verify.mjs batch3b   + reload dashboard/paid-ads
-- Rollback: alter table public.<t> disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['client_yt_campaigns','client_yt_ad_groups','client_yt_ads','client_meta_campaigns','client_klaviyo_campaigns'] loop
    execute format('drop policy if exists "%s_tenant_select" on %s', t, t);
    execute format('create policy "%s_tenant_select" on %s for select to authenticated using ((select public.can_access_client(client_id)))', t, t);
    execute format('alter table public.%s enable row level security', t);
  end loop;
end $$;

select c.relname as "table", c.relrowsecurity as rls_on, p.polname as policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('client_yt_campaigns','client_yt_ad_groups','client_yt_ads','client_meta_campaigns','client_klaviyo_campaigns')
order by 1, 3;
