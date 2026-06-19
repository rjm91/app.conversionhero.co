import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isAgencyUser } from '../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { client_name, industry, city, state, account_type } = body

    if (!client_name) {
      return NextResponse.json({ error: 'client_name is required' }, { status: 400 })
    }

    const acctType = account_type === 'ecom' ? 'ecom' : 'home_service'

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
        account_type: acctType,
        is_ecom: acctType === 'ecom',
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

// Update a client's brand board. Agency admins, or admins of that client, may edit.
export async function PATCH(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const body = await request.json()
  const { client_id, branding } = body
  if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  if (typeof branding !== 'object' || branding === null) {
    return NextResponse.json({ error: 'branding must be an object' }, { status: 400 })
  }

  const isAgency = isAgencyUser(profile?.role)
  const isClientAdmin = profile?.role === 'client_admin' && profile?.client_id === client_id
  if (!isAgency && !isClientAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await db
    .from('client')
    .update({ branding })
    .eq('client_id', client_id)
    .select('client_id, branding')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, client: data })
}
