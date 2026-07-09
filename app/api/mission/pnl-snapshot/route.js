export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { userCanAccessClient } from '../../../../lib/access'
import { snapshotDailyPnl } from '../../../../lib/mission/pnl-snapshot'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Backfill / recompute the daily P&L record for a client over a range.
//   GET /api/mission/pnl-snapshot?client_id=ch069&start=2026-01-01&end=2026-07-09
// Auth: the signed-in user must reach the client, OR a Bearer CRON_SECRET
// (so the cron and manual backfills share one path).
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  if (!clientId || !start || !end) return NextResponse.json({ error: 'client_id, start, end required' }, { status: 400 })

  const cronOk = process.env.CRON_SECRET && request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const ssr = createServerClient()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user || !(await userCanAccessClient(user.id, clientId))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const days = await snapshotDailyPnl(admin(), clientId, start, end)
    return NextResponse.json({ ok: true, client_id: clientId, range: { start, end }, days_snapshotted: days })
  } catch (e) {
    console.error('[pnl-snapshot]', e)
    return NextResponse.json({ error: e.message || 'snapshot failed' }, { status: 500 })
  }
}
