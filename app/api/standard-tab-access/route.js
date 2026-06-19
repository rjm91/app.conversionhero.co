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

  const { data: row, error: readErr } = await db.from('client').select('standard_hidden_tabs').eq('client_id', clientId).single()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 404 })

  const next = { ...(row?.standard_hidden_tabs || {}), [key]: !!hidden }
  const { error: writeErr } = await db.from('client').update({ standard_hidden_tabs: next }).eq('client_id', clientId)
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, standard_hidden_tabs: next })
}
