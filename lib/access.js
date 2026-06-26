import { createClient } from '@supabase/supabase-js'
import { isAgencyUser } from './roles'

// Central access resolver for the multi-tenant model.
//
//   • An agency member sees their agency + all DESCENDANT agencies' clients.
//   • A client member sees only the clients they're assigned to.
//   • ConversionHero is the root agency, so its admins reach every agency →
//     they see everything (identical to the legacy behavior).
//
// Reads the membership tables (agency_membership / client_membership) as the
// source of truth, and falls back to the legacy profiles.role/client_id model
// if those tables/rows aren't present yet — so this is safe to deploy before
// the migration has run.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Build target → descendants from the agency tree, then collect a subtree.
function descendantsOf(agencyIds, agencies) {
  const children = {}
  for (const a of agencies) {
    if (a.parent_agency_id) (children[a.parent_agency_id] ||= []).push(a.id)
  }
  const reach = new Set()
  const stack = [...agencyIds]
  while (stack.length) {
    const id = stack.pop()
    if (reach.has(id)) continue
    reach.add(id)
    for (const c of children[id] || []) stack.push(c)
  }
  return reach
}

/**
 * Resolve what a user can reach.
 * Returns { all, clientIds, agencyIds } —
 *   all=true  → user reaches every agency (e.g. a root-agency admin); don't filter.
 *   clientIds → explicit list of client_ids the user may access (when all=false).
 */
export async function getAccessScope(userId) {
  if (!userId) return { all: false, clientIds: [], agencyIds: [] }
  const db = admin()

  // Memberships (source of truth), plus the profile for fallback.
  const [{ data: agencyMems }, { data: clientMems }, { data: profileRows }] = await Promise.all([
    db.from('agency_membership').select('agency_id, role').eq('profile_id', userId).then(r => r, () => ({ data: null })),
    db.from('client_membership').select('client_id, role').eq('profile_id', userId).then(r => r, () => ({ data: null })),
    db.from('profiles').select('role, client_id, agency_id').eq('id', userId).limit(1),
  ])
  const profile = profileRows?.[0]

  // Resolve the user's agency reach + direct client grants. Memberships win;
  // otherwise fall back to the profile columns. An agency user with no
  // membership row is still scoped to their OWN agency_id (never all) — so a
  // freshly-created sub-agency admin can't briefly see every client.
  const agencySeed = (agencyMems && agencyMems.length)
    ? agencyMems.map(m => m.agency_id)
    : (profile && isAgencyUser(profile.role) && profile.agency_id ? [profile.agency_id] : [])
  const directClients = new Set(
    (clientMems && clientMems.length) ? clientMems.map(m => m.client_id)
    : (profile?.client_id ? [profile.client_id] : [])
  )

  if (agencySeed.length === 0 && directClients.size === 0) {
    return { all: false, clientIds: [], agencyIds: [] }
  }

  // Agency reach = each seed agency + all its descendant agencies.
  let reachAgencies = new Set()
  if (agencySeed.length) {
    const { data: agencies } = await db.from('agency').select('id, parent_agency_id').then(r => r, () => ({ data: null }))
    if (agencies && agencies.length) {
      reachAgencies = descendantsOf(agencySeed, agencies)
      // Reaches every agency → effectively sees all clients.
      if (reachAgencies.size === agencies.length) return { all: true, clientIds: [], agencyIds: [...reachAgencies] }
    } else {
      // Pre-migration (no parent column / table) — just the seed agency itself.
      reachAgencies = new Set(agencySeed)
    }
  }

  const clientIds = new Set(directClients)
  if (reachAgencies.size) {
    const { data: clients } = await db.from('client').select('client_id').in('agency_id', [...reachAgencies]).then(r => r, () => ({ data: null }))
    for (const c of clients || []) clientIds.add(c.client_id)
  }
  return { all: false, clientIds: [...clientIds], agencyIds: [...reachAgencies] }
}

/** Boolean check: can this user access this one client? */
export async function userCanAccessClient(userId, clientId) {
  if (!userId || !clientId) return false
  const scope = await getAccessScope(userId)
  if (scope.all) return true
  return scope.clientIds.includes(clientId)
}

/**
 * What an ADMIN may GRANT — the agencies + clients they control. Enforces the
 * "you can only grant access to what you control" rule. Only agency admins can
 * grant (a client_admin can't). Returns:
 *   { canGrant, all, agencyIds:Set<string>, clientIds:Set<string> }
 */
export async function getGrantScope(userId) {
  const empty = { canGrant: false, all: false, agencyIds: new Set(), clientIds: new Set() }
  if (!userId) return empty
  const db = admin()

  const [{ data: profileRows }, { data: agencyMems }] = await Promise.all([
    db.from('profiles').select('role, agency_id').eq('id', userId).limit(1),
    db.from('agency_membership').select('agency_id, role').eq('profile_id', userId).then(r => r, () => ({ data: null })),
  ])
  const profile = profileRows?.[0]
  if (!profile) return empty

  // Admin agencies = agency memberships with an admin role, else (fallback) the
  // profile's own agency if the user is an agency admin.
  const adminRoles = new Set(['agency_admin', 'agency_admin_security'])
  let seed = (agencyMems || []).filter(m => adminRoles.has(m.role)).map(m => m.agency_id)
  if (seed.length === 0 && adminRoles.has(profile.role) && profile.agency_id) seed = [profile.agency_id]
  if (seed.length === 0) return empty // not an agency admin → cannot grant

  const { data: agencies } = await db.from('agency').select('id, parent_agency_id').then(r => r, () => ({ data: null }))
  const reach = (agencies && agencies.length) ? descendantsOf(seed, agencies) : new Set(seed)
  if (agencies && agencies.length && reach.size === agencies.length) {
    return { canGrant: true, all: true, agencyIds: reach, clientIds: new Set() }
  }
  const { data: clients } = await db.from('client').select('client_id').in('agency_id', [...reach]).then(r => r, () => ({ data: null }))
  return { canGrant: true, all: false, agencyIds: reach, clientIds: new Set((clients || []).map(c => c.client_id)) }
}
