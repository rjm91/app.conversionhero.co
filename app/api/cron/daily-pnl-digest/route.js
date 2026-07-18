export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendDailyPnlDigest } from '../../../../lib/mission/pnl-digest'
import { snapshotDailyPnl } from '../../../../lib/mission/pnl-snapshot'

// Morning Vercel cron (see vercel.json — 0 14 * * * = 7am America/Phoenix).
// Posts yesterday's LOCKED Daily P&L to each ecom client's C-level Slack
// channel, for clients that opted in (settings.daily_pnl_slack) and configured
// a webhook (settings.slack_pnl_webhook). Numbers come from client_daily_pnl,
// so the digest matches the app exactly.
export async function GET(request) {
  if (process.env.CRON_SECRET) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const { data: clients, error } = await db.from('client')
    .select('client_id, client_name, settings').eq('is_ecom', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Re-snapshot the trailing 7 days for EVERY ecom client (not just Slack
  // opt-ins) — late refunds and order edits change past days, so the locked
  // record follows the truth. Then send digests to the opted-in clients.
  const day = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10) }
  const snapshots = []
  for (const c of (clients || [])) {
    try { snapshots.push({ client_id: c.client_id, days: await snapshotDailyPnl(db, c.client_id, day(-7), day(0)) }) }
    catch (e) { snapshots.push({ client_id: c.client_id, error: String(e?.message || e) }) }
  }

  const opted = (clients || []).filter(c => c.settings?.daily_pnl_slack && c.settings?.slack_pnl_webhook)
  const results = []
  for (const c of opted) {
    try { results.push(await sendDailyPnlDigest(db, c)) }
    catch (e) { results.push({ client_id: c.client_id, error: String(e?.message || e) }) }
  }
  return NextResponse.json({ ran: results.length, snapshots, results })
}
