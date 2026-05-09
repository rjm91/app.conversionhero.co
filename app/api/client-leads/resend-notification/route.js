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

  try {
    await dispatchClientEvent(clientId, 'lead.created', lead)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[resend-notification] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
