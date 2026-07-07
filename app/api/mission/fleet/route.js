import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { isAgencyUser } from '../../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// GET /api/mission/fleet — the agency cockpit: every ecom client's open
// problems, 30d rollup (from client_daily_metrics), and recent decisions
// with measured impact. Agency-side users only.
export async function GET() {
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyUser(profile?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [clientsRes, findingsRes, metricsRes, decisionsRes] = await Promise.all([
    db.from('client').select('client_id, client_name, is_ecom').eq('is_ecom', true),
    db.from('mission_findings').select('*').eq('status', 'open').order('impact_monthly', { ascending: false }),
    db.from('client_daily_metrics').select('*').gte('date', since),
    db.from('mission_decisions').select('client_id, what, status, est_impact_monthly, measured, approved_at')
      .order('approved_at', { ascending: false }).limit(25),
  ])

  const clients = clientsRes.data || []
  const ecomIds = new Set(clients.map(c => c.client_id))
  const rollup = {}
  for (const r of (metricsRes.data || [])) {
    if (!ecomIds.has(r.client_id)) continue
    const b = rollup[r.client_id] = rollup[r.client_id] || { revenue: 0, orders: 0, cogs: 0, spend: 0 }
    b.revenue += Number(r.revenue) || 0
    b.orders += Number(r.orders) || 0
    b.cogs += Number(r.cogs) || 0
    b.spend += (Number(r.spend_google) || 0) + (Number(r.spend_meta) || 0)
  }
  const findings = (findingsRes.data || []).filter(f => ecomIds.has(f.client_id))
  const decisions = (decisionsRes.data || []).filter(d => ecomIds.has(d.client_id))
  const measuredTotal = decisions.reduce((s, d) => s + (Number(d.measured?.delta_monthly) || 0), 0)

  return NextResponse.json({
    clients: clients.map(c => ({
      ...c,
      metrics: rollup[c.client_id] || null,
      open_problems: findings.filter(f => f.client_id === c.client_id).length,
      high_problems: findings.filter(f => f.client_id === c.client_id && f.severity === 'high').length,
    })),
    findings, decisions, measuredTotal,
  })
}
