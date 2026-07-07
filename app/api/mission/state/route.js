import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { userCanAccessClient } from '../../../../lib/access'
import { refreshClient, measureDueDecisions } from '../../../../lib/mission/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// GET /api/mission/state?client_id=ch069&refresh=1&days=30
// The IDE's server-backed state: open findings (PROBLEMS), decisions
// (Ledger), taught policies. refresh=1 re-runs the watcher server-side so
// the page never depends on the cron having fired recently.
export async function GET(request) {
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const clientId = request.nextUrl.searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
  if (!await userCanAccessClient(user.id, clientId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = admin()
  const days = Math.min(90, Number(request.nextUrl.searchParams.get('days')) || 30)

  let refreshError = null
  if (request.nextUrl.searchParams.get('refresh') === '1') {
    try {
      await refreshClient(db, clientId, days)
      await measureDueDecisions(db, clientId)
    } catch (e) {
      refreshError = e.message // stale state is better than no state
      console.error('[mission/state] refresh failed:', e)
    }
  }

  const [findings, decisions, policies] = await Promise.all([
    db.from('mission_findings').select('*').eq('client_id', clientId).eq('status', 'open')
      .order('severity', { ascending: true }).order('impact_monthly', { ascending: false }),
    db.from('mission_decisions').select('*').eq('client_id', clientId)
      .order('approved_at', { ascending: false }).limit(50),
    db.from('mission_policies').select('*').eq('client_id', clientId).eq('active', true)
      .order('taught_at', { ascending: false }),
  ])
  return NextResponse.json({
    findings: findings.data || [],
    decisions: decisions.data || [],
    policies: policies.data || [],
    refreshError,
    levers_mode: (process.env.MISSION_LEVERS || 'dry_run').toLowerCase(),
  })
}
