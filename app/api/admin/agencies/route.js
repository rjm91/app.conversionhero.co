export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSecurityAdmin } from '../../../../lib/roles'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireSecurityAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isSecurityAdmin(profile?.role)) return { error: 'Forbidden', status: 403 }
  return { ok: true }
}

// The white-label org chart: agencies (with parent), each agency's clients, and
// its members (agency + client memberships, resolved to emails).
export async function GET(request) {
  const auth = await requireSecurityAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const db = adminDb()

  const [{ data: agencies }, { data: clients }, { data: profiles }, aMems, cMems] = await Promise.all([
    db.from('agency').select('id, name, slug, parent_agency_id, status'),
    db.from('client').select('client_id, client_name, agency_id, status'),
    db.from('profiles').select('id, email, full_name'),
    db.from('agency_membership').select('profile_id, agency_id, role').then(r => r, () => ({ data: [] })),
    db.from('client_membership').select('profile_id, client_id, role').then(r => r, () => ({ data: [] })),
  ])
  const emailOf = Object.fromEntries((profiles || []).map(p => [p.id, p.email || p.full_name || p.id]))

  return NextResponse.json({
    agencies: agencies || [],
    clients: clients || [],
    agencyMembers: (aMems?.data || []).map(m => ({ ...m, email: emailOf[m.profile_id] })),
    clientMembers: (cMems?.data || []).map(m => ({ ...m, email: emailOf[m.profile_id] })),
  })
}
