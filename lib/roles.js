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
