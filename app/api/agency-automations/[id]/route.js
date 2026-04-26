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

const EDITABLE = ['enabled', 'config', 'kind']

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const body = await request.json()
    const update = { updated_at: new Date().toISOString() }
    for (const k of EDITABLE) {
      if (k in body) update[k] = body[k]
    }

    const supabase = db()
    const { data, error } = await supabase
      .from('agency_automations')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, automation: data })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params
    const supabase = db()
    const { error } = await supabase.from('agency_automations').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  // Test send: POST /api/agency-automations/[id] with action=test
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    if (body.action !== 'test') {
      return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    }

    const supabase = db()
    const { data: rule, error } = await supabase
      .from('agency_automations')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !rule) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const { dispatchEvent } = await import('../../../../lib/automations.js')
    await dispatchEvent('lead.created', {
      first_name: 'Test',
      last_name: 'Lead',
      email: 'test@example.com',
      phone: '555-0100',
      company: 'Test Co',
      agency_funnels: { name: 'Test Funnel', slug: 'test-funnel' },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
