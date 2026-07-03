export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../lib/supabase-server'
import { userCanAccessClient } from '../../../lib/access'

// Read client_klaviyo_campaigns for a date range. The table is RLS-locked
// (service-role only), so the dashboard fetches through this gated route.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
  if (!await userCanAccessClient(user.id, clientId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let q = admin().from('client_klaviyo_campaigns').select('*').eq('client_id', clientId)
  if (start) q = q.gte('date', start)
  if (end) q = q.lte('date', end)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}
