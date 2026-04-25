import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

const EDITABLE = [
  'first_name', 'last_name', 'email', 'phone', 'company',
  'lead_status', 'appt_status', 'sale_status',
  'sale_amount', 'appt_date', 'appt_time', 'ch_notes',
]

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const body = await request.json()
    const update = {}
    for (const k of EDITABLE) {
      if (k in body) update[k] = body[k] === '' ? null : body[k]
    }

    const supabase = db()
    const { data, error } = await supabase
      .from('agency_leads')
      .update(update)
      .eq('id', id)
      .select('*, agency_funnels(name, slug)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, lead: data })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params
    const supabase = db()
    const { error } = await supabase.from('agency_leads').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
