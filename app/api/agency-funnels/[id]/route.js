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

export async function GET(_request, { params }) {
  const { id } = await params
  const supabase = db()
  const { data: funnel, error: fErr } = await supabase
    .from('agency_funnels').select('*').eq('id', id).single()
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 404 })

  const { data: steps } = await supabase
    .from('agency_funnel_steps').select('*').eq('funnel_id', id).order('step_order')
  return NextResponse.json({ funnel, steps: steps || [] })
}

export async function PATCH(request, { params }) {
  const { id } = await params
  const body = await request.json()
  const supabase = db()
  const { data, error } = await supabase
    .from('agency_funnels').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ funnel: data })
}
