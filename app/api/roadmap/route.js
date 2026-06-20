export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAgencyAdmin } from '../../../lib/roles'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAgencyAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role, email').eq('id', user.id).single()
  if (!isAgencyAdmin(profile?.role)) return { error: 'Forbidden', status: 403 }
  return { db, email: profile.email || user.email }
}

const STATUSES = ['now', 'next', 'later', 'done']

// GET → all roadmap items
export async function GET(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { data, error } = await auth.db.from('dev_roadmap').select('*').order('status').order('sort_order').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

// POST → create or update an item
export async function POST(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const b = await request.json()
  if (!b.id && !b.title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const fields = {}
  if (b.title !== undefined) fields.title = String(b.title).trim()
  if (b.notes !== undefined) fields.notes = b.notes || null
  if (b.status !== undefined) fields.status = STATUSES.includes(b.status) ? b.status : 'next'
  if (b.priority !== undefined) fields.priority = b.priority || null
  if (b.blocked !== undefined) fields.blocked = !!b.blocked
  if (b.blocked_on !== undefined) fields.blocked_on = b.blocked_on || null
  if (b.sort_order !== undefined) fields.sort_order = Number(b.sort_order) || 0
  fields.updated_at = new Date().toISOString()

  let res
  if (b.id) {
    res = await auth.db.from('dev_roadmap').update(fields).eq('id', b.id).select().single()
  } else {
    fields.created_by = auth.email
    res = await auth.db.from('dev_roadmap').insert(fields).select().single()
  }
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
  return NextResponse.json({ item: res.data })
}

// DELETE ?id= → remove an item
export async function DELETE(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await auth.db.from('dev_roadmap').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
