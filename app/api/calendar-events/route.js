import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function GET(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')

  let q = admin().from('calendar_events').select('*, client:client_id(client_id, client_name)')
  if (clientId) q = q.eq('client_id', clientId)
  if (from) q = q.gte('scheduled_date', from)
  if (to) q = q.lte('scheduled_date', to)
  q = q.order('scheduled_date', { ascending: true })

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}

export async function POST(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  if (!body.clientId || !body.title || !body.scheduledDate) {
    return NextResponse.json({ error: 'clientId, title, scheduledDate required' }, { status: 400 })
  }

  const payload = {
    client_id: body.clientId,
    type: body.type || 'video',
    title: body.title,
    scheduled_date: body.scheduledDate,
    status: body.status || 'scheduled',
    platform: body.platform || null,
    notes: body.notes || null,
    linked_script_id: body.linkedScriptId || null,
    linked_campaign_id: body.linkedCampaignId || null,
    created_by: user.id,
  }

  const { data, error } = await admin().from('calendar_events').insert([payload]).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function PATCH(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...rest } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch = { updated_at: new Date().toISOString() }
  if (rest.title !== undefined) patch.title = rest.title
  if (rest.scheduledDate !== undefined) patch.scheduled_date = rest.scheduledDate
  if (rest.status !== undefined) patch.status = rest.status
  if (rest.type !== undefined) patch.type = rest.type
  if (rest.platform !== undefined) patch.platform = rest.platform
  if (rest.notes !== undefined) patch.notes = rest.notes

  const { data, error } = await admin().from('calendar_events').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function DELETE(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await admin().from('calendar_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
