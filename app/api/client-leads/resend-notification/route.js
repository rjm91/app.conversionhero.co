import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { dispatchClientEvent } from '../../../../lib/automations.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (u, o = {}) => fetch(u, { ...o, cache: 'no-store' }) },
    }
  )
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const { leadId, clientId } = body

  if (!leadId || !clientId) {
    return NextResponse.json({ error: 'leadId and clientId required' }, { status: 400 })
  }

  const db = admin()

  const { data: lead, error } = await db
    .from('client_lead')
    .select('*')
    .eq('lead_id', leadId)
    .eq('client_id', clientId)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Look up funnel metadata so {{funnel_name}} renders in email templates
  let funnelMeta = null
  if (lead.funnel_id) {
    const { data: f } = await db.from('client_funnels').select('name, slug').eq('id', lead.funnel_id).single()
    funnelMeta = f || null
  }
  // Fallback: try to extract funnel slug from lp_url (e.g. "synergyhome.co/f/generator-quote")
  if (!funnelMeta && lead.lp_url) {
    const slugMatch = lead.lp_url.match(/\/f\/([^/?]+)/)
    if (slugMatch) {
      const { data: f } = await db.from('client_funnels').select('name, slug').eq('slug', slugMatch[1]).single()
      funnelMeta = f || null
    }
  }

  // Fetch survey responses from client_lead_meta
  const { data: metaRows } = await db
    .from('client_lead_meta')
    .select('meta_key, meta_value')
    .eq('lead_id', leadId)
  const surveyMeta = {}
  for (const row of metaRows || []) {
    surveyMeta[row.meta_key] = row.meta_value
  }

  try {
    await dispatchClientEvent(clientId, 'lead.created', {
      ...lead,
      ...surveyMeta,
      agency_funnels: funnelMeta,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[resend-notification] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
