import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET is intentionally non-destructive: a destructive GET can be triggered by
// prefetchers, scanners, or link previews and silently wipe the connection.
export async function GET(request) {
  return NextResponse.redirect(new URL('/control/payments?qb=disconnect_requires_post', request.url))
}

// Actual disconnect must be an explicit POST.
export async function POST(request) {
  const supabase = db()
  if (process.env.QB_REALM_ID) {
    await supabase.from('qb_tokens').delete().eq('realm_id', process.env.QB_REALM_ID)
  } else {
    await supabase.from('qb_tokens').delete().neq('realm_id', '')
  }
  return NextResponse.json({ ok: true })
}
