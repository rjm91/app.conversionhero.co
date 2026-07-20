export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { userCanAccessClient } from '../../../../lib/access'
import { isAgencyAdmin } from '../../../../lib/roles'
import { sendDailyPnlDigest, buildDigestForDay } from '../../../../lib/mission/pnl-digest'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// GET /api/mission/pnl-digest?client_id=…&date=…
// Preview the digest without posting: returns the Slack payload AND the plain
// text (SMS/Chorus) rendering of the same template. Any user with client access.
export async function GET(request) {
  const sp = new URL(request.url).searchParams
  const client_id = sp.get('client_id')
  const date = sp.get('date') || undefined
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user || !client_id || !(await userCanAccessClient(user.id, client_id))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = admin()
  const { data: client } = await db.from('client').select('client_id, client_name, settings').eq('client_id', client_id).single()
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 })
  const out = await buildDigestForDay(db, client, date ? { date } : {})
  if (out.error) return NextResponse.json({ error: `No P&L data for ${out.date} yet.`, date: out.date }, { status: 404 })
  return NextResponse.json({
    ok: true, date: out.date, payload: out.payload, text: out.text,
    template: out.template, defaultTemplate: out.defaultTemplate, custom: out.custom,
    tokens: out.tokens, footer: out.footer, url: out.url,
  })
}

// POST /api/mission/pnl-digest  { client_id, date? }
// Sends the Daily P&L Slack digest NOW (for testing the wiring). Agency-admin
// only. Defaults to yesterday in the client's timezone.
export async function POST(request) {
  const { client_id, date, format } = await request.json()
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user || !client_id || !(await userCanAccessClient(user.id, client_id))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = admin()
  const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyAdmin(prof?.role)) return NextResponse.json({ error: 'Agency admins only' }, { status: 403 })

  const { data: client } = await db.from('client').select('client_id, client_name, settings').eq('client_id', client_id).single()
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 })
  if (!client.settings?.slack_pnl_webhook) return NextResponse.json({ error: 'No Slack webhook saved — add one first.' }, { status: 400 })

  const result = await sendDailyPnlDigest(db, client, { ...(date ? { date } : {}), ...(format === 'text' ? { format } : {}) })
  const ok = result.posted
  return NextResponse.json({ ok, result }, { status: ok ? 200 : 502 })
}
