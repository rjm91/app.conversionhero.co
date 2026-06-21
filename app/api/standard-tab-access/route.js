export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAgencyAdmin } from '../../../lib/roles'

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Agency admins (any client) or a client_admin of THIS client may set which tabs
// their client_standard users can access.
async function requireManager(request, clientId) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role, client_id').eq('id', user.id).single()
  if (isAgencyAdmin(profile?.role)) return { db }
  if (profile?.role === 'client_admin' && profile.client_id === clientId) return { db }
  return { error: 'Forbidden', status: 403 }
}

// PUT { clientId, key, hidden } → hide/show a tab for this client's standard users.
export async function PUT(request) {
  const { clientId, key, hidden } = await request.json()
  if (!clientId || !key) return NextResponse.json({ error: 'clientId and key required' }, { status: 400 })

  const auth = await requireManager(request, clientId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const db = auth.db

  // Atomic single-key merge — avoids the read-modify-write race (see
  // sql/2026-06-20_atomic_tab_access.sql).
  const { data, error } = await db.rpc('set_client_standard_hidden', { p_client_id: clientId, p_key: key, p_hidden: !!hidden })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, standard_hidden_tabs: data })
}
