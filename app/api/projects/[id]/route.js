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

export async function GET(_, { params }) {
  const { data, error } = await db()
    .from('projects')
    .select('*, project_tasks(*)')
    .eq('id', params.id)
    .order('sort_order', { referencedTable: 'project_tasks', ascending: true })
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data })
}

export async function PATCH(request, { params }) {
  const body = await request.json()
  const allowed = ['name', 'description', 'type', 'client_id', 'status', 'priority', 'owner', 'due_date']
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
  updates.updated_at = new Date().toISOString()

  const { data, error } = await db()
    .from('projects')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data })
}

export async function DELETE(_, { params }) {
  const { error } = await db().from('projects').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
