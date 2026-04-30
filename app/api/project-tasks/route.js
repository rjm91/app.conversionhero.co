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
  const { project_id, title, description, status, priority, assignee, due_date, sort_order } = body
  if (!project_id || !title) return NextResponse.json({ error: 'project_id and title required' }, { status: 400 })

  const { data, error } = await db()
    .from('project_tasks')
    .insert({ project_id, title, description, status: status || 'todo', priority: priority || 'medium', assignee, due_date: due_date || null, sort_order: sort_order ?? 0 })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}
