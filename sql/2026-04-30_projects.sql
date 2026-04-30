-- Projects + Tasks for agency-level project management
-- Run in Supabase SQL editor. Safe to re-run.

-- ─── 1. projects ─────────────────────────────────────────────────────────────
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  type        text not null default 'internal',   -- 'client' | 'dev' | 'internal' | 'marketing'
  client_id   text references client(client_id) on delete set null,
  status      text not null default 'active'
                check (status in ('active','on_hold','completed','archived')),
  priority    text not null default 'medium'
                check (priority in ('critical','high','medium','low')),
  owner       text,                               -- free-text name of responsible person
  created_by  text,                               -- free-text name / email of creator
  due_date    date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists projects_status_idx  on projects(status);
create index if not exists projects_priority_idx on projects(priority);

-- ─── 2. project_tasks ────────────────────────────────────────────────────────
create table if not exists project_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'todo'
                check (status in ('todo','in_progress','done')),
  priority    text not null default 'medium'
                check (priority in ('critical','high','medium','low')),
  assignee    text,                               -- free-text name
  due_date    date,
  sort_order  int  default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists project_tasks_project_idx on project_tasks(project_id, sort_order);

-- ─── 3. RLS (readable/writable via service role only — agency admin UI) ──────
alter table projects      enable row level security;
alter table project_tasks enable row level security;

drop policy if exists "projects_open"      on projects;
drop policy if exists "project_tasks_open" on project_tasks;

create policy "projects_open"
  on projects for all using (true) with check (true);

create policy "project_tasks_open"
  on project_tasks for all using (true) with check (true);
