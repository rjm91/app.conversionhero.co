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

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const supabase = db()
  const { data, error } = await supabase
    .from('client_automations')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ automations: data || [] })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { client_id, kind, enabled = true, config = {} } = body
    if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!kind) return NextResponse.json({ error: 'kind required' }, { status: 400 })

    const supabase = db()
    const { data, error } = await supabase
      .from('client_automations')
      .insert({ client_id, kind, enabled, config })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, automation: data })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
