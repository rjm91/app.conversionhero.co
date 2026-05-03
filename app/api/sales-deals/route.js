import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../lib/supabase-server'
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

export async function GET(request) {
  const supabase = createServerClient()
  const user = await requireAgency(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  const db = adminDb()
  let query = db.from('sales_deals').select('*').order('created_at', { ascending: false })
  if (start) query = query.gte('created_at', start)
  if (end) query = query.lte('created_at', end + 'T23:59:59-12:00')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deals: data })
}

export async function POST(request) {
  const supabase = createServerClient()
  const user = await requireAgency(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { prospect, company, email, phone, stage, setter_email, closer_email, value, notes } = body
  if (!prospect) return NextResponse.json({ error: 'prospect is required' }, { status: 400 })

  const db = adminDb()
  const { data, error } = await db.from('sales_deals').insert([{
    prospect, company, email, phone,
    stage: stage || 'Prospect',
    setter_email, closer_email,
    value: value || 0,
    notes,
  }]).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deal: data })
}
