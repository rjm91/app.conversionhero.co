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

  // Memberships (source of truth).
  const [{ data: agencyMems }, { data: clientMems }, { data: profileRows }] = await Promise.all([
    db.from('agency_membership').select('agency_id, role').eq('profile_id', userId).then(r => r, () => ({ data: null })),
    db.from('client_membership').select('client_id, role').eq('profile_id', userId).then(r => r, () => ({ data: null })),
    db.from('profiles').select('role, client_id, agency_id').eq('id', userId).limit(1),
  ])
  const profile = profileRows?.[0]

  // Legacy fallback: no membership rows (tables missing or user un-migrated).
  if ((!agencyMems || agencyMems.length === 0) && (!clientMems || clientMems.length === 0)) {
    if (profile && isAgencyUser(profile.role)) return { all: true, clientIds: [], agencyIds: [] }
    if (profile?.client_id) return { all: false, clientIds: [profile.client_id], agencyIds: [] }
    return { all: false, clientIds: [], agencyIds: [] }
  }

  // Agency reach = each membership agency + all its descendant agencies.
  let reachAgencies = new Set()
  let allAgencies = []
  if (agencyMems && agencyMems.length) {
    const { data: agencies } = await db.from('agency').select('id, parent_agency_id')
    allAgencies = agencies || []
    reachAgencies = descendantsOf(agencyMems.map(m => m.agency_id), allAgencies)
    // If the user reaches every agency, they effectively see all clients.
    if (allAgencies.length && reachAgencies.size === allAgencies.length) {
      return { all: true, clientIds: [], agencyIds: [...reachAgencies] }
    }
  }

  // Clients under reachable agencies.
  const clientIds = new Set((clientMems || []).map(m => m.client_id))
  if (reachAgencies.size) {
    const { data: clients } = await db.from('client').select('client_id').in('agency_id', [...reachAgencies])
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
