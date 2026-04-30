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

export async function POST(request) {
  const body = await request.json()
  const { user_id, email, event, metadata = {} } = body
  if (!event) return NextResponse.json({ error: 'event required' }, { status: 400 })

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null

  const { data, error } = await db()
    .from('user_activity')
    .insert({ user_id: user_id || null, email: email || null, event, metadata, ip })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data })
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const limit  = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const event  = searchParams.get('event')
  const userId = searchParams.get('user_id')

  let query = db()
    .from('user_activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (event)  query = query.eq('event', event)
  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data })
}
