// Central role helpers.
//
// `agency_admin_security` is a full mirror of `agency_admin` — same access in
// every way — but a distinct, named role so the security account is auditable
// and separable. Any new agency-admin-level role should be added here once, so
// access checks across the app stay consistent.

export const AGENCY_ADMIN_ROLES = ['agency_admin', 'agency_admin_security']

// True for any full agency-admin (admin or security mirror).
export function isAgencyAdmin(role) {
  return AGENCY_ADMIN_ROLES.includes(role)
}

// True for any agency-side user (admins + standard agency staff).
export function isAgencyUser(role) {
  return isAgencyAdmin(role) || role === 'agency_standard'
}

// True only for the dedicated security account. Use this to gate
// security-governance surfaces (e.g. the Agent Access registry) that
// even a regular agency_admin should not see.
export function isSecurityAdmin(role) {
  return role === 'agency_admin_security'
}

// Roles ordered least → most access (app-wide). Single source of truth for
// dropdowns and the capability matrix.
export const ROLE_ORDER = [
  'client_standard', 'client_admin', 'agency_standard', 'agency_admin', 'agency_admin_security',
]

export const ROLE_LABELS = {
  agency_admin:          'Agency Admin',
  agency_admin_security: 'Agency Admin (Security)',
  agency_standard:       'Agency Standard',
  client_admin:          'Client Admin',
  client_standard:       'Client Standard',
}

// Capability matrix. Each `has(role)` reuses the SAME predicate the real
// enforcement point uses, so this stays honest — it describes what the app
// actually grants, never aspirational/decorative permissions. Keep each row's
// `has` in sync with its enforcing route (noted in `where`).
export const CAPABILITIES = [
  { key: 'own_client',   label: 'View assigned client workspace',      has: () => true,        where: 'all signed-in users' },
  { key: 'all_clients',  label: 'Access all client accounts',          has: isAgencyUser,      where: 'api/clients, paid-ads, billing' },
  { key: 'manage_team',  label: 'Manage team & roles',                 has: isAgencyAdmin,     where: 'api/agency-users' },
  { key: 'payments',     label: 'Record & manage payments',            has: isAgencyAdmin,     where: 'api/manual-payment, api/parse-payment' },
  { key: 'connections',  label: 'Manage ad & data connections',        has: isAgencyAdmin,     where: 'api/meta-connection' },
  { key: 'tab_access',   label: 'Configure client tab access',          has: isAgencyAdmin,     where: 'api/client-tab-access, api/standard-tab-access' },
  { key: 'passwords',    label: 'Set user passwords',                  has: isAgencyAdmin,     where: 'api/admin/set-password' },
  { key: 'roadmap',      label: 'Edit product roadmap',               has: isAgencyAdmin,     where: 'api/roadmap' },
  { key: 'security_gov', label: 'Security governance · Agent Access registry', has: isSecurityAdmin, where: 'api/agent/capabilities' },
]
