import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshClient, measureDueDecisions } from '../../../../lib/mission/server'
import { snapshotDailyPnl } from '../../../../lib/mission/pnl-snapshot'
import { rangeDays } from '../../../../lib/mission/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Daily Vercel cron (see vercel.json): runs the watcher for every ecom
// client — refreshes daily metrics, syncs findings (dedupe + auto-resolve),
// measures decisions that are 7+ days old, and pings Slack on new
// high-severity findings if SLACK_WEBHOOK_URL is set.
// The IDE also refreshes on page load, so intraday freshness doesn't depend
// on this; the cron is the heartbeat that fills PROBLEMS while nobody looks.
export async function GET(request) {
  if (process.env.CRON_SECRET) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const { data: clients, error } = await db.from('client')
    .select('client_id, client_name').eq('is_ecom', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []
  const alerts = []
  for (const c of (clients || [])) {
    try {
      const before = await db.from('mission_findings')
        .select('finding_key').eq('client_id', c.client_id).eq('status', 'open')
      const priorKeys = new Set((before.data || []).map(r => r.finding_key))

      const r = await refreshClient(db, c.client_id, 35)
      const measured = await measureDueDecisions(db, c.client_id)
      // Lock the daily P&L record for the rolling 35-day window (re-locks
      // recent days so refunds land; older days stay frozen). Best-effort.
      try { const { start, end } = rangeDays(35); await snapshotDailyPnl(db, c.client_id, start, end) } catch (e) { console.error('[pnl-snapshot]', c.client_id, e.message) }

      const after = await db.from('mission_findings')
        .select('finding_key, severity, title, impact_monthly').eq('client_id', c.client_id).eq('status', 'open')
      const fresh = (after.data || []).filter(f => !priorKeys.has(f.finding_key))
      for (const f of fresh.filter(f => f.severity === 'high')) {
        alerts.push(`⚠️ ${c.client_name || c.client_id}: ${f.title}${f.impact_monthly > 0 ? ` (~$${Math.round(f.impact_monthly).toLocaleString()}/mo)` : ''}`)
      }
      results.push({ client_id: c.client_id, open_findings: r.findings, new: fresh.length, measured })
    } catch (e) {
      console.error(`[mission-watcher] ${c.client_id}:`, e)
      results.push({ client_id: c.client_id, error: e.message })
    }
  }

  if (alerts.length && process.env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `Mission Watcher — new high-severity findings:\n${alerts.join('\n')}` }),
      })
    } catch (e) { console.error('[mission-watcher] slack:', e) }
  }

  return NextResponse.json({ ran: results.length, results, alerted: alerts.length })
}
