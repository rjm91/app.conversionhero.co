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

export async function POST(request) {
  try {
    const { slug, event_type, session_id, meta } = await request.json()
    if (!slug || !event_type) {
      return NextResponse.json({ error: 'slug and event_type required' }, { status: 400 })
    }

    const supabase = db()
    const { data: funnel } = await supabase
      .from('agency_funnels')
      .select('id, visitors, leads')
      .eq('slug', slug)
      .single()

    if (!funnel) return NextResponse.json({ error: 'unknown slug' }, { status: 404 })

    await supabase.from('agency_funnel_events').insert({
      funnel_id: funnel.id,
      event_type,
      session_id: session_id || null,
      meta: meta || null,
    })

    if (event_type === 'page_view') {
      await supabase.from('agency_funnels').update({ visitors: (funnel.visitors || 0) + 1 }).eq('id', funnel.id)
    } else if (event_type === 'lead_submit') {
      await supabase.from('agency_funnels').update({ leads: (funnel.leads || 0) + 1 }).eq('id', funnel.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
