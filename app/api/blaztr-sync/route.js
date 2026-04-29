import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { dispatchEvent } from '../../../lib/automations.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (u, o = {}) => fetch(u, { ...o, cache: 'no-store' }) },
    }
  )
}

export async function GET() {
  const apiKey = process.env.BLAZTR_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'BLAZTR_API_KEY not configured' }, { status: 500 })
  }

  // Fetch all leads from Blaztr
  const res = await fetch('https://blaztr.app/api/blaztrApi?action=leads', {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
  })
  const { success, data: blaztrLeads } = await res.json()
  if (!success) return NextResponse.json({ error: 'Blaztr fetch failed' }, { status: 502 })

  // Only process Replied prospects
  const replied = blaztrLeads.filter(l => l.status === 'Replied')
  if (!replied.length) return NextResponse.json({ synced: 0 })

  const supabase = db()

  // Find which blaztr_ids are already synced
  const { data: existing } = await supabase
    .from('agency_leads')
    .select('blaztr_id')
    .in('blaztr_id', replied.map(l => l.id))

  const existingIds = new Set((existing || []).map(r => r.blaztr_id))
  const toInsert = replied.filter(l => !existingIds.has(l.id))

  if (!toInsert.length) return NextResponse.json({ synced: 0 })

  // Insert new leads
  const rows = toInsert.map(l => ({
    blaztr_id: l.id,
    first_name: l.first_name || null,
    last_name: l.last_name || null,
    email: l.email || null,
    company: l.company_name || null,
    lead_status: 'New / Not Yet Contacted',
    meta: {
      source: 'blaztr',
      blaztr_status: l.status,
      industry: l.industry || null,
      state: l.state || null,
      market: l.market || null,
    },
  }))

  const { data: inserted, error } = await supabase
    .from('agency_leads')
    .insert(rows)
    .select('*, agency_funnels(name, slug)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire lead.created automation for each new lead
  for (const lead of inserted) {
    dispatchEvent('lead.created', lead).catch(err =>
      console.error('[blaztr-sync] dispatchEvent error', err)
    )
  }

  return NextResponse.json({ synced: inserted.length })
}
