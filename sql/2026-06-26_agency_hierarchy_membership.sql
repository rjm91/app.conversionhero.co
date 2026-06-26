-- ── Agency hierarchy + membership (white-label access foundation) ───────────
-- 1. agency.parent_agency_id  → agencies can nest (ConversionHero ▸ FIT ▸ clients)
-- 2. agency_membership / client_membership → one identity can hold roles at BOTH
--    the agency and client level (Keith = FIT agency_admin AND ShieldTech client_admin)
-- 3. Seed the FIT agency under ConversionHero
-- 4. Backfill memberships from existing profiles so access is unchanged today
--
-- Access rule the app enforces (see lib/access.js): an agency member sees their
-- agency + all DESCENDANT agencies' clients; a client member sees only assigned
-- clients. ConversionHero is the root, so its admins still see everything.
--
-- Safe + transactional. Run the whole block in the Supabase SQL Editor.

begin;

-- 1. Agencies can nest under a parent agency (self-reference).
alter table public.agency
  add column if not exists parent_agency_id uuid references public.agency(id);

-- 2. Membership tables. role is per-membership, so the same person can be an
--    agency_admin of one agency and a client_admin of a specific client.
create table if not exists public.agency_membership (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  agency_id   uuid not null references public.agency(id)   on delete cascade,
  role        text not null,                 -- agency_admin | agency_admin_security | agency_standard
  granted_by  uuid references public.profiles(id),
  granted_at  timestamptz not null default now(),
  unique (profile_id, agency_id)
);
create index if not exists agency_membership_profile_idx on public.agency_membership (profile_id);
create index if not exists agency_membership_agency_idx  on public.agency_membership (agency_id);

create table if not exists public.client_membership (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id)        on delete cascade,
  client_id   text not null references public.client(client_id)   on delete cascade,
  role        text not null,                 -- client_admin | client_standard
  granted_by  uuid references public.profiles(id),
  granted_at  timestamptz not null default now(),
  unique (profile_id, client_id)
);
create index if not exists client_membership_profile_idx on public.client_membership (profile_id);
create index if not exists client_membership_client_idx  on public.client_membership (client_id);

-- 3. Seed Keith's agency (FIT) nested under ConversionHero, with a fixed id.
insert into public.agency (id, name, slug, parent_agency_id)
values (
  '22222222-2222-2222-2222-222222222222',
  'Freedom Innovative Technologies',
  'fit',
  '11111111-1111-1111-1111-111111111111'   -- ConversionHero (the root)
)
on conflict (id) do nothing;

-- 4. Backfill memberships from existing profiles so nobody's access changes.
--    Agency-side users → agency_membership for their agency (ConversionHero).
--    Client-side users → client_membership for their assigned client.
insert into public.agency_membership (profile_id, agency_id, role)
select p.id, p.agency_id, p.role
from public.profiles p
where p.role in ('agency_admin', 'agency_admin_security', 'agency_standard')
  and p.agency_id is not null
on conflict (profile_id, agency_id) do nothing;

insert into public.client_membership (profile_id, client_id, role)
select p.id, p.client_id, p.role
from public.profiles p
where p.role in ('client_admin', 'client_standard')
  and p.client_id is not null
on conflict (profile_id, client_id) do nothing;

-- 5. RLS on the new membership tables (service-role routes bypass it; a user may
--    read their own memberships).
alter table public.agency_membership enable row level security;
drop policy if exists "read own agency memberships" on public.agency_membership;
create policy "read own agency memberships" on public.agency_membership
  for select to authenticated using (profile_id = auth.uid());

alter table public.client_membership enable row level security;
drop policy if exists "read own client memberships" on public.client_membership;
create policy "read own client memberships" on public.client_membership
  for select to authenticated using (profile_id = auth.uid());

commit;
