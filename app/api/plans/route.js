import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const DEFAULT_CATS = { airbnb: 0, food: 0, personal: 0, fun: 0 }

export async function GET() {
  const { data, error } = await db()
    .from('plans')
    .select('*')
    .order('start_date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plans: data || [] })
}

export async function POST(request) {
  const body = await request.json()
  const { name, city, url, color, start_date, end_date, categories, flight_route, flight_date, notes } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!start_date || !end_date) return NextResponse.json({ error: 'start_date and end_date required' }, { status: 400 })

  const { data, error } = await db()
    .from('plans')
    .insert({
      name,
      city: city || null,
      url: url || null,
      color: color || '#7c5cff',
      start_date,
      end_date,
      categories: { ...DEFAULT_CATS, ...(categories || {}) },
      flight_route: flight_route || null,
      flight_date: flight_date || null,
      notes: notes || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data })
}
