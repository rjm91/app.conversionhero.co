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
  // Atomic single-key merge — avoids the read-modify-write race that let one
  // toggle clobber another (see sql/2026-06-20_atomic_tab_access.sql).
  const { data, error } = await db.rpc('set_client_tab_access', { p_client_id: clientId, p_key: key, p_visible: !!visible })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, tab_access: data })
}
