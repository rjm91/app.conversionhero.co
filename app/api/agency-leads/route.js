import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../lib/supabase-server'
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
  // Scope to the logged-in user's OWN agency — the "My Agency" pipeline is each
  // agency's own acquisition, never another agency's.
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = db()
  const { data: prof } = await supabase.from('profiles').select('agency_id').eq('id', user.id).single()
  const agencyId = prof?.agency_id || null

  let q = supabase
    .from('agency_leads')
    .select('*, agency_funnels(name, slug)')
    .order('created_at', { ascending: false })
  if (agencyId) q = q.eq('agency_id', agencyId)
  else return NextResponse.json({ leads: [] }) // no agency → no agency pipeline
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { slug, first_name, last_name, email, phone, company, selected_date, selected_time, meta, blaztr_id, notify = true } = body

    const supabase = db()
    let funnel_id = null
    if (slug) {
      const { data: f } = await supabase
        .from('agency_funnels')
        .select('id')
        .eq('slug', slug)
        .single()
      if (f) funnel_id = f.id
    }

    const { data, error } = await supabase
      .from('agency_leads')
      .insert({
        funnel_id,
        blaztr_id: blaztr_id || null,
        first_name: first_name || null,
        last_name: last_name || null,
        email: email || null,
        phone: phone || null,
        company: company || null,
        selected_date: selected_date || null,
        selected_time: selected_time || null,
        meta: meta || null,
        lead_status: 'New / Not Yet Contacted',
      })
      .select('*, agency_funnels(name, slug)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (notify) {
      dispatchEvent('lead.created', data).catch(err =>
        console.error('[agency-leads] dispatchEvent error', err)
      )
    }

    return NextResponse.json({ ok: true, lead: data })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
