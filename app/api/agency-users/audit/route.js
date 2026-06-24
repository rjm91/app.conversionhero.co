import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAgencyAdmin } from '../../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Recent access-change log. Agency admins only. Returns [] gracefully if the
// role_change_audit table hasn't been created yet (safe before the SQL runs).
export async function GET(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyAdmin(profile?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error: aErr } = await db
    .from('role_change_audit')
    .select('id, actor_email, target_email, old_role, new_role, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  // Missing table / not-yet-migrated → empty log, not an error.
  if (aErr) return NextResponse.json({ entries: [] })
  return NextResponse.json({ entries: data || [] })
}
