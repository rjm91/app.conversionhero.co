import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request) {
  // Verify caller is an agency_admin via their session token
  const authHeader = request.headers.get('authorization') || ''
  const callerToken = authHeader.replace('Bearer ', '')
  if (!callerToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = adminDb()
  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(callerToken)
  if (authErr || !caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', caller.id).single()
  if (profile?.role !== 'agency_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, password } = await request.json()
  if (!userId || !password) return NextResponse.json({ error: 'userId and password required' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

  const { error } = await supabase.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
