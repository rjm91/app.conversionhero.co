-- Add 'agency_admin_security' as a valid role on profiles.
-- It's a full mirror of agency_admin; access is enforced in the app via
-- lib/roles.js (isAgencyAdmin / isAgencyUser). This only widens the DB
-- CHECK constraint so the role value can be stored. Safe to re-run.

alter table profiles drop constraint if exists profiles_role_check;

alter table profiles
  add constraint profiles_role_check
  check (role in (
    'agency_admin',
    'agency_admin_security',
    'agency_standard',
    'client_admin',
    'client_standard'
  ));
