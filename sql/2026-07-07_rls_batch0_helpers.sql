-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Batch 0 — access-resolution helpers (additive, enforces nothing)
--
-- SQL mirror of lib/access.js. These two must stay in lockstep — if you
-- change the access model there, change it here (and vice versa).
--
--   • Agency member → their agency + all DESCENDANT agencies' clients.
--   • Client member → only the clients they're assigned to.
--   • Reaching a ROOT agency (parent_agency_id is null) → sees everything
--     (ConversionHero is the single root; every agency nests under it).
--   • Legacy fallback: users with no membership rows fall back to
--     profiles.role / profiles.client_id / profiles.agency_id — same as
--     lib/access.js, so this deploys safely before membership backfill.
--
-- All functions are SECURITY DEFINER so they can read the membership tables
-- even after those tables get RLS (Batch 4). STABLE → evaluated once per
-- statement in policies when written as `(select public.can_access_client(client_id))`.
--
-- Rollback: drop function public.can_access_client(text);
--           drop function public.can_access_agency(uuid);
--           drop function public.is_root_admin();
--           drop function public.accessible_agencies();
-- ─────────────────────────────────────────────────────────────────────────────

-- Every agency the current user reaches: membership seeds (else profile
-- fallback for agency-side roles), expanded down the parent_agency_id tree.
create or replace function public.accessible_agencies()
returns table (agency_id uuid)
language sql stable security definer
set search_path = public
as $$
  with recursive seed as (
    select am.agency_id
    from agency_membership am
    where am.profile_id = auth.uid()
    union
    -- Legacy fallback: only when the user has NO agency membership rows,
    -- and only for agency-side roles (mirrors lib/access.js agencySeed).
    select p.agency_id
    from profiles p
    where p.id = auth.uid()
      and p.agency_id is not null
      and p.role in ('agency_admin', 'agency_admin_security', 'agency_standard')
      and not exists (
        select 1 from agency_membership am2 where am2.profile_id = auth.uid()
      )
  ),
  reach (agency_id) as (
    select s.agency_id from seed s
    union
    select a.id
    from agency a
    join reach r on a.parent_agency_id = r.agency_id
  )
  select r.agency_id from reach r
$$;

-- Root-agency reach ⇒ sees everything. Mirrors lib/access.js `all: true`
-- (reach == every agency), which holds because the tree has one root.
create or replace function public.is_root_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accessible_agencies() aa
    join agency a on a.id = aa.agency_id
    where a.parent_agency_id is null
  )
$$;

-- The tenant-boundary check almost every policy will use.
create or replace function public.can_access_client(cid text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select cid is not null and (
    -- direct client membership
    exists (
      select 1 from client_membership cm
      where cm.profile_id = auth.uid() and cm.client_id = cid
    )
    -- legacy fallback: profile.client_id, only when NO membership rows exist
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.client_id = cid
        and not exists (
          select 1 from client_membership cm2 where cm2.profile_id = auth.uid()
        )
    )
    -- agency reach: the client's owning agency is in the user's subtree
    or exists (
      select 1
      from client c
      join public.accessible_agencies() aa on c.agency_id = aa.agency_id
      where c.client_id = cid
    )
    -- root admin sees everything (covers clients with null agency_id)
    or public.is_root_admin()
  )
$$;

-- Agency-scoped check (agency_* tables, Batch 4+).
create or replace function public.can_access_agency(aid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select aid is not null and (
    exists (select 1 from public.accessible_agencies() aa where aa.agency_id = aid)
    or public.is_root_admin()
  )
$$;

-- Anon calls resolve auth.uid() = null → everything returns false/empty,
-- so granting execute broadly is safe; policies still gate to authenticated.
grant execute on function public.accessible_agencies() to authenticated, anon, service_role;
grant execute on function public.is_root_admin() to authenticated, anon, service_role;
grant execute on function public.can_access_client(text) to authenticated, anon, service_role;
grant execute on function public.can_access_agency(uuid) to authenticated, anon, service_role;
