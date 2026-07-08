-- ─────────────────────────────────────────────────────────────────────────────
-- Batch 3d hotfix — sweep legacy policies off the batch-3d tables
--
-- The 3d report shows pre-rollout policies alongside ours (calendar_events
-- "Authenticated read"/"Authenticated write", client_asset "asset_auth", …).
-- Those are `to authenticated using(true)`-style: not anon-visible (so the
-- harness passes) but they let ANY logged-in user cross tenants — they OR
-- past tenant_select exactly like the anon ones did.
--
-- Deterministic sweep: on the 3d tables, drop every policy whose name does
-- not match our convention (<table>_tenant_* / user_activity_self_select).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare r record;
begin
  for r in
    select c.relname as tbl, p.polname as pol
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('client_asset','client_folder','client_video_scripts',
                        'client_avatar_videos','client_campaign_drafts','client_automations',
                        'client_domains','calendar_events','projects','project_tasks','user_activity')
      and p.polname !~ ('^' || c.relname || '_(tenant|self)_(select|insert|update|delete)$')
  loop
    execute format('drop policy %I on public.%I', r.pol, r.tbl);
    raise notice 'dropped legacy policy % on %', r.pol, r.tbl;
  end loop;
end $$;

-- Report: only conforming policy names should remain.
select c.relname as "table", c.relrowsecurity as rls_on, p.polname as policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('client_asset','client_folder','client_video_scripts',
                    'client_avatar_videos','client_campaign_drafts','client_automations',
                    'client_domains','calendar_events','projects','project_tasks','user_activity')
order by 1, 3;
