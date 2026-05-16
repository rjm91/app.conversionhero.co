import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { client_name, industry, city, state } = body

    if (!client_name) {
      return NextResponse.json({ error: 'client_name is required' }, { status: 400 })
    }

    const db = admin()

    // Auto-generate next client_id (ch001, ch002, ...)
    const { data: existing } = await db
      .from('client')
      .select('client_id')
      .like('client_id', 'ch%')
      .order('client_id', { ascending: false })
      .limit(1)

    let nextNum = 1
    if (existing?.length) {
      const match = existing[0].client_id.match(/^ch(\d+)$/)
      if (match) nextNum = parseInt(match[1], 10) + 1
    }
    const client_id = `ch${String(nextNum).padStart(3, '0')}`

    const { data, error } = await db
      .from('client')
      .insert({
        client_id,
        client_name,
        industry: industry || null,
        city: city || null,
        state: state || null,
        status: 'Active',
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, client: data })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
  let q = admin()
    .from('client')
    .select('client_id, client_name, status')
    .order('client_name', { ascending: true })
  if (!includeInactive) q = q.eq('status', 'Active')
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ clients: data || [] })
}
