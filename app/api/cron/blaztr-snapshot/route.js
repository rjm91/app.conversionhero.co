import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { snapshotBlaztrDaily } from '../../../../lib/blaztr-snapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Daily Vercel cron — records one Blaztr summary snapshot into blaztr_daily so
// the Revenue Channels trend chart can plot metrics over time.
export async function GET() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const s = await snapshotBlaztrDaily(db)
  return NextResponse.json({
    ok: !!s,
    day: new Date().toISOString().slice(0, 10),
    sent: s?.total_sent ?? null,
    replies: s?.total_replies ?? null,
  })
}
