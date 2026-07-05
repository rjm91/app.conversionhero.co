-- Mission Control persistence: findings (PROBLEMS), decisions (Ledger),
-- policies (taught rules), and the daily metrics rollup that powers the
-- cron watcher + measured outcomes.
-- Run this in Supabase SQL editor.

-- Daily rollup cache — derived from client_lead + campaign tables, never a
-- source of truth. Refreshed by the cron watcher and on-page refresh.
create table if not exists client_daily_metrics (
  client_id text not null,
  date date not null,
  revenue numeric not null default 0,
  orders int not null default 0,
  cogs numeric not null default 0,
  spend_google numeric not null default 0,
  spend_meta numeric not null default 0,
  updated_at timestamptz default now(),
  primary key (client_id, date)
);

-- Watcher findings — PROBLEMS panel. finding_key is the watcher's stable id
-- (e.g. 'bleed-Google-123'), deduped per client across runs.
create table if not exists mission_findings (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  finding_key text not null,
  severity text not null default 'medium' check (severity in ('high','medium','low')),
  icon text,
  title text not null,
  why text,
  impact_monthly numeric default 0,
  confidence text default 'medium',
  evidence jsonb default '[]'::jsonb,
  action jsonb default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','approved','dismissed','resolved')),
  source text not null default 'watcher',   -- watcher | command | agent
  first_seen timestamptz default now(),
  last_seen timestamptz default now(),
  resolved_at timestamptz,
  decided_at timestamptz,
  decided_by text,
  teach_reason text,
  unique (client_id, finding_key)
);
create index if not exists mission_findings_open_idx on mission_findings(client_id, status);

-- Decisions — the Ledger. Baseline is snapshotted at approval; measured is
-- written by the cron watcher ~7 days later (estimates become receipts).
create table if not exists mission_decisions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  finding_key text not null,
  what text not null,
  est_impact_monthly numeric default 0,
  status text not null default 'logged' check (status in ('logged','dry_run','executed','reverted')),
  finding jsonb,                             -- full card snapshot for undo
  baseline jsonb,                            -- metrics at approval time
  measured jsonb,                            -- before/after result
  measured_at timestamptz,
  execution jsonb,                           -- lever call record (mode, request, response, rollback)
  approved_by text,
  approved_at timestamptz default now()
);
create index if not exists mission_decisions_client_idx on mission_decisions(client_id, approved_at desc);

-- Taught policies — standing rules from dismiss+teach.
create table if not exists mission_policies (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  finding_key text not null,
  reason text not null,
  taught_by text,
  taught_at timestamptz default now(),
  active boolean not null default true
);
create index if not exists mission_policies_client_idx on mission_policies(client_id, active);

-- RLS: enabled with permissive policies (all access goes through gated
-- service-role API routes, matching the pattern used by other app tables).
alter table client_daily_metrics enable row level security;
alter table mission_findings enable row level security;
alter table mission_decisions enable row level security;
alter table mission_policies enable row level security;

do $$
declare t text;
begin
  foreach t in array array['client_daily_metrics','mission_findings','mission_decisions','mission_policies'] loop
    execute format('drop policy if exists "%s_all" on %s', t, t);
    execute format('create policy "%s_all" on %s for all using (true) with check (true)', t, t);
  end loop;
end $$;
