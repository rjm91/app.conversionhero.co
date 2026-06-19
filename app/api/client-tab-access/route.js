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

// Only agency admins may change which tabs a client's users can see.
async function requireAgencyAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyAdmin(profile?.role)) return { error: 'Forbidden', status: 403 }
  return { user }
}

// PUT { clientId, key, visible } → set one tab's client visibility for a client.
export async function PUT(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { clientId, key, visible } = await request.json()
  if (!clientId || !key) return NextResponse.json({ error: 'clientId and key required' }, { status: 400 })

  const db = adminDb()
  const { data: row, error: readErr } = await db.from('client').select('tab_access').eq('client_id', clientId).single()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 404 })

  const next = { ...(row?.tab_access || {}), [key]: !!visible }
  const { error: writeErr } = await db.from('client').update({ tab_access: next }).eq('client_id', clientId)
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, tab_access: next })
}
