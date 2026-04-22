import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function requireAgency(supabase) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = adminDb()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!profile?.role?.startsWith('agency_')) return null
  return user
}

export async function PATCH(request, { params }) {
  const supabase = createServerClient()
  const user = await requireAgency(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const db = adminDb()

  const payload = { ...body }
  if (payload.stage === 'Closed Won' || payload.stage === 'Closed Lost') {
    payload.closed_at = new Date().toISOString()
  }

  const { data, error } = await db.from('sales_deals').update(payload).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deal: data })
}

export async function DELETE(request, { params }) {
  const supabase = createServerClient()
  const user = await requireAgency(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()
  const { error } = await db.from('sales_deals').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
