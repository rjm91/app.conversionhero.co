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

export async function GET() {
  const { data, error } = await db()
    .from('projects')
    .select('*, project_tasks(id, status)')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projects: data || [] })
}

export async function POST(request) {
  const body = await request.json()
  const { name, description, type, client_id, status, priority, owner, created_by, due_date } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await db()
    .from('projects')
    .insert({ name, description, type: type || 'internal', client_id: client_id || null, status: status || 'active', priority: priority || 'medium', owner, created_by, due_date: due_date || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data })
}
