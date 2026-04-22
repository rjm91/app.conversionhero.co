import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const db = adminDb()
  const { data, error } = await db
    .from('client_domains')
    .select('id, domain')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ domains: data || [] })
}

export async function POST(request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, domain } = await request.json()
  if (!clientId || !domain) return NextResponse.json({ error: 'clientId and domain required' }, { status: 400 })

  const db = adminDb()
  const { data, error } = await db
    .from('client_domains')
    .upsert({ client_id: clientId, domain: domain.toLowerCase().trim() }, { onConflict: 'client_id,domain' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ domain: data })
}
