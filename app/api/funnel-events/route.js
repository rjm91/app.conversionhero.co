import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const { funnelId, clientId, eventType, stepId, sessionId, leadId, meta = {} } = body

  if (!funnelId || !eventType) {
    return NextResponse.json({ success: false, error: 'funnelId + eventType required' }, { status: 400 })
  }

  const db = admin()

  await db.from('funnel_events').insert({
    funnel_id: funnelId,
    client_id: clientId || null,
    event_type: eventType,
    step_id: stepId || null,
    session_id: sessionId || null,
    lead_id: leadId || null,
    utm_source: meta.utm_source || null,
    utm_medium: meta.utm_medium || null,
    utm_campaign: meta.utm_campaign || null,
    utm_content: meta.utm_content || null,
    gclid: meta.gclid || null,
    wbraid: meta.wbraid || null,
    user_agent: request.headers.get('user-agent') || null,
  })

  // Bump visitor count on page_view (only once per session)
  if (eventType === 'page_view') {
    const { data } = await db.from('client_funnels').select('visitors').eq('id', funnelId).single()
    if (data) await db.from('client_funnels').update({ visitors: (data.visitors || 0) + 1 }).eq('id', funnelId)
  }

  return NextResponse.json({ success: true })
}
