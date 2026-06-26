export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isSecurityAdmin } from '../../../../lib/roles'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Security account only — same gate as the Agent Access registry.
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

// Serves the committed schema snapshot (db/schema.json). Regenerate with
// `npm run db:schema`. We read the file rather than re-introspect so the map is
// fast and matches exactly what's version-controlled.
export async function GET(request) {
  const auth = await requireSecurityAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const raw = readFileSync(join(process.cwd(), 'db', 'schema.json'), 'utf8')
    return NextResponse.json(JSON.parse(raw))
  } catch (e) {
    return NextResponse.json({ error: 'No schema snapshot found. Run `npm run db:schema`.' }, { status: 404 })
  }
}
