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
  return { user, role: prof?.role, isAdmin: isAgencyAdmin(prof?.role) }
}

export async function GET(request) {
  const clientId = new URL(request.url).searchParams.get('client_id')
  const a = await auth(request, clientId)
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })
  const { data } = await admin().from('client').select('settings').eq('client_id', clientId).single()
  const settings = { ...(data?.settings || {}) }
  // The Slack webhook can post to the client's channel — only admins see it.
  if (!a.isAdmin && settings.slack_pnl_webhook) settings.slack_pnl_webhook = '••••••'
  return NextResponse.json({ settings })
}

// Traffic-light dials (True ROAS + CAC) — the settings client admins may edit.
const ROAS_KEYS = ['roas_red_below', 'roas_green_above', 'cac_green_below', 'cac_red_above']

export async function PATCH(request) {
  const { client_id, settings } = await request.json()
  const a = await auth(request, client_id)
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })

  // Whitelist + coerce the keys we manage — never trust the whole blob.
  const patch = {}
  if (settings?.cost_per_label != null) patch.cost_per_label = Math.max(0, Number(settings.cost_per_label) || 0)
  for (const k of ROAS_KEYS) {
    if (settings?.[k] == null) continue
    const n = Number(settings[k])
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'ROAS thresholds must be positive numbers' }, { status: 400 })
    patch[k] = Math.round(n * 100) / 100
  }
  if (typeof settings?.timezone === 'string') patch.timezone = settings.timezone
  if (typeof settings?.daily_pnl_slack === 'boolean') patch.daily_pnl_slack = settings.daily_pnl_slack
  // Digest body template ({{token}} text). Empty string = reset to default.
  if (typeof settings?.digest_template === 'string') patch.digest_template = settings.digest_template.slice(0, 4000)
  if (typeof settings?.slack_pnl_webhook === 'string') {
    const url = settings.slack_pnl_webhook.trim()
    // Ignore the redaction placeholder (a non-admin round-trip) and only accept
    // a real Slack Incoming Webhook — never store arbitrary URLs.
    if (url === '' || /^https:\/\/hooks\.slack\.com\//.test(url)) patch.slack_pnl_webhook = url
    else if (url !== '••••••') return NextResponse.json({ error: 'Webhook must be a https://hooks.slack.com/… URL' }, { status: 400 })
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  // Writes are agency-admin-only, except the ROAS thresholds, which client
  // admins (and agency staff) may also tune for their own dashboard.
  if (!a.isAdmin) {
    const onlyRoas = Object.keys(patch).every(k => ROAS_KEYS.includes(k))
    const mayRoas = a.role === 'client_admin' || a.role === 'agency_standard'
    if (!(onlyRoas && mayRoas)) return NextResponse.json({ error: 'Agency admins only' }, { status: 403 })
  }

  const db = admin()
  const { data: cur } = await db.from('client').select('settings').eq('client_id', client_id).single()
  const next = { ...(cur?.settings || {}), ...patch }
  const red = next.roas_red_below != null ? Number(next.roas_red_below) : 1
  const green = next.roas_green_above != null ? Number(next.roas_green_above) : 1.2
  if (red >= green) return NextResponse.json({ error: 'Red threshold must be below the green threshold' }, { status: 400 })
  if (next.cac_green_below != null && next.cac_red_above != null && Number(next.cac_green_below) >= Number(next.cac_red_above)) {
    return NextResponse.json({ error: 'CAC green threshold must be below the red threshold' }, { status: 400 })
  }
  const { error } = await db.from('client').update({ settings: next }).eq('client_id', client_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, settings: next })
}
