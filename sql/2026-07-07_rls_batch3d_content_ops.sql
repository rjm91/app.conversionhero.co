-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Batch 3d — content & ops tables
--
--   full CRUD from the browser (videos/assets/scripts pages):
--     client_asset, client_folder, client_video_scripts
--   select-only (writes are service-key APIs/crons):
--     client_avatar_videos, client_campaign_drafts, client_automations,
--     client_domains, calendar_events, projects
--   scoped through parent (no client_id column):
--     project_tasks → projects.client_id
--   self-scoped:
--     user_activity → user_id = auth.uid() (select own rows; writes service-only)
--
-- Verify: node scripts/rls-verify.mjs batch3d   + reload videos pages/projects
-- Rollback: alter table public.<t> disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────

-- Full CRUD, tenant-gated
do $$
declare t text;
begin
  foreach t in array array['client_asset','client_folder','client_video_scripts'] loop
    execute format('drop policy if exists "%s_tenant_select" on %s', t, t);
    execute format('drop policy if exists "%s_tenant_insert" on %s', t, t);
    execute format('drop policy if exists "%s_tenant_update" on %s', t, t);
    execute format('drop policy if exists "%s_tenant_delete" on %s', t, t);
    execute format('create policy "%s_tenant_select" on %s for select to authenticated using ((select public.can_access_client(client_id)))', t, t);
    execute format('create policy "%s_tenant_insert" on %s for insert to authenticated with check ((select public.can_access_client(client_id)))', t, t);
    execute format('create policy "%s_tenant_update" on %s for update to authenticated using ((select public.can_access_client(client_id))) with check ((select public.can_access_client(client_id)))', t, t);
    execute format('create policy "%s_tenant_delete" on %s for delete to authenticated using ((select public.can_access_client(client_id)))', t, t);
    execute format('alter table public.%s enable row level security', t);
  end loop;
end $$;

-- Select-only, tenant-gated
do $$
declare t text;
begin
  foreach t in array array['client_avatar_videos','client_campaign_drafts','client_automations','client_domains','calendar_events','projects'] loop
    execute format('drop policy if exists "%s_tenant_select" on %s', t, t);
    execute format('create policy "%s_tenant_select" on %s for select to authenticated using ((select public.can_access_client(client_id)))', t, t);
    execute format('alter table public.%s enable row level security', t);
  end loop;
end $$;

-- project_tasks: scope through the parent project
drop policy if exists "project_tasks_tenant_select" on project_tasks;
create policy "project_tasks_tenant_select" on project_tasks for select to authenticated
  using (exists (select 1 from projects pr where pr.id = project_tasks.project_id and public.can_access_client(pr.client_id)));
alter table public.project_tasks enable row level security;

-- user_activity: users read their own rows; writes stay service-only
drop policy if exists "user_activity_self_select" on user_activity;
create policy "user_activity_self_select" on user_activity for select to authenticated
  using (user_id = auth.uid());
alter table public.user_activity enable row level security;

select c.relname as "table", c.relrowsecurity as rls_on, p.polname as policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('client_asset','client_folder','client_video_scripts','client_avatar_videos',
                    'client_campaign_drafts','client_automations','client_domains','calendar_events',
                    'projects','project_tasks','user_activity')
order by 1, 3;
