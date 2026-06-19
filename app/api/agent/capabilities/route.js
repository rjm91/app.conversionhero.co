export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSecurityAdmin } from '../../../../lib/roles'
import { getCapabilities } from '../../../../lib/agent/capabilities'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Gated to the security account only — even a regular agency_admin can't read it.
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

// GET → the agent capability manifest (derived from the live tool registry).
export async function GET(request) {
  const auth = await requireSecurityAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json(getCapabilities())
}
