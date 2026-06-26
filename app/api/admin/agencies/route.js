export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAgencyAdmin } from '../../../../lib/roles'
import { getGrantScope } from '../../../../lib/access'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Any agency admin may view — scoped to the agencies/clients they control
// (you → everything; a sub-agency admin like Keith → only their subtree).
export async function GET(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  const grant = await getGrantScope(user.id)
  if (!isAgencyAdmin(profile?.role) && !grant.canGrant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: agencies }, { data: clients }, { data: profiles }, aMems, cMems] = await Promise.all([
    db.from('agency').select('id, name, slug, parent_agency_id, status'),
    db.from('client').select('client_id, client_name, agency_id, status'),
    db.from('profiles').select('id, email, full_name'),
    db.from('agency_membership').select('profile_id, agency_id, role').then(r => r, () => ({ data: [] })),
    db.from('client_membership').select('profile_id, client_id, role').then(r => r, () => ({ data: [] })),
  ])
  const emailOf = Object.fromEntries((profiles || []).map(p => [p.id, p.email || p.full_name || p.id]))

  // Filter to the actor's scope.
  const inAgency = id => grant.all || grant.agencyIds.has(id)
  const inClient = id => grant.all || grant.clientIds.has(id)
  const sAgencies = (agencies || []).filter(a => inAgency(a.id))
  const sClients = (clients || []).filter(c => inClient(c.client_id))

  return NextResponse.json({
    grant: { all: grant.all },
    agencies: sAgencies,
    clients: sClients,
    agencyMembers: (aMems?.data || []).filter(m => inAgency(m.agency_id)).map(m => ({ ...m, email: emailOf[m.profile_id] })),
    clientMembers: (cMems?.data || []).filter(m => inClient(m.client_id)).map(m => ({ ...m, email: emailOf[m.profile_id] })),
  })
}
