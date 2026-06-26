-- ── Multi-tenant agency layer ──────────────────────────────────────────────
-- Introduces an `agency` table as the top of the hierarchy so the platform can
-- be white-labeled to multiple agencies later. Today there is exactly one
-- agency (ConversionHero); every existing client + agency-owned record is
-- backfilled to it.
--
-- SAFE BY DESIGN:
--   • Fixed agency id is used as the DEFAULT on every agency_id column, so new
--     inserts auto-belong to ConversionHero — existing app code needs NO change.
--   • All existing rows are backfilled before agency_id is set NOT NULL.
--   • Transactional: if anything fails, nothing is applied.
--
-- Run the whole block in the Supabase SQL Editor.

begin;

-- 1. The agency (tenant) table.
create table if not exists public.agency (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,                 -- url / subdomain identifier
  domain      text,                        -- custom white-label domain (optional)
  branding    jsonb not null default '{}'::jsonb,  -- logo, colors (mirrors client.branding)
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Seed the current agency with a FIXED id (used as the column default below).
insert into public.agency (id, name, slug)
values ('11111111-1111-1111-1111-111111111111', 'ConversionHero', 'conversionhero')
on conflict (id) do nothing;

-- 3. Add agency_id → agency to client + every agency-owned table, backfill to
--    ConversionHero, and lock NOT NULL. The DEFAULT keeps future inserts working
--    without touching app code.
do $$
declare
  t text;
  ch uuid := '11111111-1111-1111-1111-111111111111';
begin
  foreach t in array array[
    'client',
    'agency_funnels', 'agency_leads', 'agency_automations', 'agency_transcriptions',
    'email_templates', 'integrations', 'blaztr_daily', 'profiles'
  ] loop
    execute format('alter table public.%I add column if not exists agency_id uuid default %L', t, ch);
    execute format('update public.%I set agency_id = %L where agency_id is null', t, ch);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_agency_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (agency_id) references public.agency(id)', t, t || '_agency_id_fkey');
    execute format('alter table public.%I alter column agency_id set not null', t);
  end loop;
end $$;

-- 4. Lock down the new agency table with Row-Level Security.
--    Server routes use the service-role key (which bypasses RLS), so this only
--    affects browser/anon access. A logged-in user may read the agency they
--    belong to (via profiles.agency_id); no one can read other agencies.
alter table public.agency enable row level security;

drop policy if exists "read own agency" on public.agency;
create policy "read own agency" on public.agency
  for select to authenticated
  using (id in (select agency_id from public.profiles where id = auth.uid()));

commit;
