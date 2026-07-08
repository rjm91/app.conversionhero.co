-- ─────────────────────────────────────────────────────────────────────────────
-- 'agent' becomes a first-class role (architecture decision 1b: the agent is
-- a member of the client — an auth user with client_membership role 'agent').
--
-- profiles_role_check rejected role='agent' when minting the ShieldTech agent
-- identity. Current live role values (verified 2026-07-07): profiles has
-- client_admin / agency_admin / agency_admin_security; memberships likewise.
-- New constraint = the app's full role ladder (lib/roles.js ROLE_ORDER) +
-- 'agent', so no existing row can violate it.
--
-- Report at the end shows the constraint definitions for the record.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('client_standard','client_admin','agency_standard',
                  'agency_admin','agency_admin_security','agent'));

-- Membership role checks (names per convention; no-ops if they don't exist).
alter table public.client_membership drop constraint if exists client_membership_role_check;
alter table public.client_membership add constraint client_membership_role_check
  check (role in ('client_standard','client_admin','agent'));

alter table public.agency_membership drop constraint if exists agency_membership_role_check;
alter table public.agency_membership add constraint agency_membership_role_check
  check (role in ('agency_standard','agency_admin','agency_admin_security','agent'));

select conrelid::regclass as "table", conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in ('profiles_role_check','client_membership_role_check','agency_membership_role_check')
order by 1;
