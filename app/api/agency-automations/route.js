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

export async function GET() {
  const supabase = db()
  const { data, error } = await supabase
    .from('agency_automations')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ automations: data || [] })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { kind, enabled = true, config = {} } = body
    if (!kind) return NextResponse.json({ error: 'kind is required' }, { status: 400 })

    const supabase = db()
    const { data, error } = await supabase
      .from('agency_automations')
      .insert({ kind, enabled, config })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, automation: data })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
