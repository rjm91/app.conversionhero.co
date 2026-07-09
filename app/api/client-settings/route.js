export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../lib/supabase-server'
import { userCanAccessClient } from '../../../lib/access'
import { isAgencyAdmin } from '../../../lib/roles'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Per-client operational settings (daily-P&L cost_per_label, timezone, …).
// Read: any user who can reach the client. Write: agency admins only.
async function auth(request, clientId) {
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user || !clientId || !(await userCanAccessClient(user.id, clientId))) return { error: 'Unauthorized', status: 401 }
  const { data: prof } = await admin().from('profiles').select('role').eq('id', user.id).single()
  return { user, isAdmin: isAgencyAdmin(prof?.role) }
}

export async function GET(request) {
  const clientId = new URL(request.url).searchParams.get('client_id')
  const a = await auth(request, clientId)
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })
  const { data } = await admin().from('client').select('settings').eq('client_id', clientId).single()
  return NextResponse.json({ settings: data?.settings || {} })
}

export async function PATCH(request) {
  const { client_id, settings } = await request.json()
  const a = await auth(request, client_id)
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })
  if (!a.isAdmin) return NextResponse.json({ error: 'Agency admins only' }, { status: 403 })

  // Whitelist + coerce the keys we manage — never trust the whole blob.
  const patch = {}
  if (settings?.cost_per_label != null) patch.cost_per_label = Math.max(0, Number(settings.cost_per_label) || 0)
  if (typeof settings?.timezone === 'string') patch.timezone = settings.timezone
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const db = admin()
  const { data: cur } = await db.from('client').select('settings').eq('client_id', client_id).single()
  const next = { ...(cur?.settings || {}), ...patch }
  const { error } = await db.from('client').update({ settings: next }).eq('client_id', client_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, settings: next })
}
