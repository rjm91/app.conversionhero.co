-- Run this in Supabase SQL editor.
-- Safe to re-run: uses IF NOT EXISTS + ON CONFLICT guards.
-- Does NOT overwrite existing funnels — only adds columns + backfills new step rows.

-- ─── 1. Add funnel-level columns (branding + tracking move out of config) ───
alter table client_funnels
  add column if not exists branding jsonb default '{}'::jsonb,
  add column if not exists tracking jsonb default '{}'::jsonb;

-- ─── 2. client_funnel_steps: each page within a funnel ──────────────────────
create table if not exists client_funnel_steps (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references client_funnels(id) on delete cascade,
  step_order int not null,
  step_type text not null check (step_type in ('survey','thank_you','landing','booking','custom')),
  slug text,                    -- null for step_order=1 (funnel entry); else /f/{funnel-slug}/{slug}
  name text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (funnel_id, step_order),
  unique (funnel_id, slug)
);

create index if not exists client_funnel_steps_funnel_idx
  on client_funnel_steps(funnel_id, step_order);

-- ─── 3. Backfill: move branding + tracking out of existing config blobs ────
update client_funnels
set
  branding = coalesce(config->'branding', '{}'::jsonb),
  tracking = coalesce(config->'tracking', '{}'::jsonb)
where (branding is null or branding = '{}'::jsonb)
  and config is not null;

-- ─── 4. Backfill step rows for every existing funnel that has none ─────────
-- 4a. Survey step (step_order=1) — holds the questions/fields from config.steps
insert into client_funnel_steps (funnel_id, step_order, step_type, slug, name, config)
select
  f.id,
  1,
  'survey',
  null,
  coalesce(f.name, 'Survey'),
  jsonb_build_object(
    'headline', f.config->'headline',
    'footer',   f.config->'footer',
    'steps',    coalesce(f.config->'steps', '[]'::jsonb)
  )
from client_funnels f
where f.config is not null
  and not exists (
    select 1 from client_funnel_steps s
    where s.funnel_id = f.id and s.step_order = 1
  );

-- 4b. Thank-you step (step_order=2) — pull from the last survey step's thankYou
--     or fall back to a sensible default.
insert into client_funnel_steps (funnel_id, step_order, step_type, slug, name, config)
select
  f.id,
  2,
  'thank_you',
  'thanks',
  'Thank You',
  jsonb_build_object(
    'title',
      coalesce(
        (f.config->'steps'->-1->'thankYou'->>'title'),
        'We''ve Got Your Info!'
      ),
    'message',
      coalesce(
        (f.config->'steps'->-1->'thankYou'->>'message'),
        'A specialist will reach out to you shortly.'
      ),
    'cta', jsonb_build_object(
      'label', null,
      'href',  null
    )
  )
from client_funnels f
where f.config is not null
  and not exists (
    select 1 from client_funnel_steps s
    where s.funnel_id = f.id and s.step_order = 2
  );

-- ─── 5. RLS (optional, matches your existing pattern for funnel tables) ────
alter table client_funnel_steps enable row level security;

drop policy if exists "funnel_steps_read_public" on client_funnel_steps;
create policy "funnel_steps_read_public"
  on client_funnel_steps for select
  using (true);  -- public funnels need to be readable by the renderer

-- Writes happen via server-side service role, so no other policies needed.
