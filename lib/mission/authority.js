// Viewer authority for the mission terminal — SERVER ONLY.
// One source of truth for "what does this human unlock when they ask":
// used by /api/mission/ask to gate the query tool and by /api/mission/state
// to tell the UI what to display in the prompt hint (decision 1a: user-level
// restriction lives at the presentation layer; this is that layer's brain).
import { createClient } from '@supabase/supabase-js'
import { isAgencyUser } from '../roles'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// { role, queries } — role is the effective label for THIS client
// (membership-first, legacy profile fallback, mirroring lib/access.js);
// queries = may this user use the agent's free-form query tool here.
export async function getViewerAuthority(userId, clientId) {
  const db = admin()
  const [{ data: profRows }, { data: clientMems }, { data: agencyMems }] = await Promise.all([
    db.from('profiles').select('role, client_id').eq('id', userId).limit(1),
    db.from('client_membership').select('role').eq('profile_id', userId).eq('client_id', clientId),
    db.from('agency_membership').select('role').eq('profile_id', userId).then(r => r, () => ({ data: null })),
  ])
  const profile = profRows?.[0]

  const agencyRole = (agencyMems || []).find(m => isAgencyUser(m.role))?.role
    || (profile && isAgencyUser(profile.role) ? profile.role : null)
  const clientRole = (clientMems || [])[0]?.role
    || (profile?.client_id === clientId ? profile.role : null)

  const role = agencyRole || clientRole || 'viewer'
  const queries = !!(agencyRole || clientRole === 'client_admin')
  return { role, queries }
}

export async function userCanUseQueries(userId, clientId) {
  return (await getViewerAuthority(userId, clientId)).queries
}
