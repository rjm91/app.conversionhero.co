import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(_request, { params }) {
  try {
    const { id } = await params
    const supabase = db()
    await supabase.from('agency_funnel_events').delete().eq('funnel_id', id)
    await supabase.from('agency_funnels').update({ visitors: 0, leads: 0 }).eq('id', id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
