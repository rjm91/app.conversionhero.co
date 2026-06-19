export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  if (profile?.role !== 'agency_admin') return { error: 'Forbidden', status: 403 }
  return { db, email: profile.email || user.email }
}

// POST → record a manual payment
export async function POST(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const b = await request.json()
  if (!b.clientId || !b.amount || !b.method) return NextResponse.json({ error: 'Client, amount, and method are required' }, { status: 400 })
  const amount = Number(b.amount)
  if (!(amount > 0)) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })

  const row = {
    client_id:     b.clientId,
    merchant:      b.method,                 // Zelle / Cash / Check / Wire / etc.
    amount,
    date_created:  b.date || new Date().toISOString().slice(0, 10),
    customer_name: b.customerName || null,
    description:   b.description || null,
    is_manual:     true,
    created_by:    auth.email,
  }
  const { error } = await auth.db.from('client_payments').insert(row)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE → remove a manual payment (manual rows only; synced rows are protected)
export async function DELETE(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await auth.db.from('client_payments').delete().eq('id', id).eq('is_manual', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
