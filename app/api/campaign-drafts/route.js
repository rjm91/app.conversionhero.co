import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function authorize(clientId, { write } = {}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }

  const db = admin()
  const { data: profile } = await db
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const isAgency = profile?.role === 'agency_admin' || profile?.role === 'agency_standard'
  const isClientMember = profile?.client_id === clientId
  if (!isAgency && !isClientMember) return { error: 'Forbidden', status: 403 }
  if (write && !isAgency && profile?.role !== 'client_admin') return { error: 'Forbidden', status: 403 }
  return { db }
}

export async function GET(request) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 })

  const auth = await authorize(clientId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.db
    .from('client_campaign_drafts')
    .select('doc, updated_at')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ doc: data?.doc || { campaigns: [] }, updatedAt: data?.updated_at || null })
}

export async function PUT(request) {
  const body = await request.json()
  const { client_id, doc } = body
  if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  if (typeof doc !== 'object' || doc === null || !Array.isArray(doc.campaigns)) {
    return NextResponse.json({ error: 'doc must be { campaigns: [...] }' }, { status: 400 })
  }

  const auth = await authorize(client_id, { write: true })
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.db
    .from('client_campaign_drafts')
    .upsert({ client_id, doc, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    .select('updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updatedAt: data?.updated_at })
}
