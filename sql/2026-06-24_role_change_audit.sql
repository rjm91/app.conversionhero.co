-- Access-change audit log: one immutable row per role change made on the
-- Team & Roles page. Written best-effort by api/agency-users PATCH; read back
-- by api/agency-users/audit GET. Mirrors the shape SF/ServiceNow folks expect
-- from an access review (who changed whom, from what, to what, when).

create table if not exists role_change_audit (
  id           uuid        primary key default gen_random_uuid(),
  actor_id     uuid        references auth.users(id) on delete set null,
  actor_email  text,
  target_id    uuid        references auth.users(id) on delete set null,
  target_email text,
  old_role     text,
  new_role     text        not null,
  created_at   timestamptz not null default now()
);

create index if not exists role_change_audit_created_at_idx on role_change_audit (created_at desc);
create index if not exists role_change_audit_target_idx     on role_change_audit (target_id, created_at desc);

alter table role_change_audit enable row level security;

-- Service role only (writes + reads go through the service-role API routes).
drop policy if exists "service role full access" on role_change_audit;
create policy "service role full access" on role_change_audit
  using (true) with check (true);
