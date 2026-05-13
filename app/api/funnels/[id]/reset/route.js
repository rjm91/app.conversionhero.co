import { NextResponse } from 'next/server'
import { createClient } from '../../../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST(request, { params }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const funnelId = params.id

  await db.from('funnel_events').delete().eq('funnel_id', funnelId)
  // Reset both funnel-level and step-level stats so they stay in sync
  await db.from('client_funnel_steps')
    .update({ visitors: 0, leads: 0 })
    .eq('funnel_id', funnelId)
  const { error } = await db.from('client_funnels')
    .update({ visitors: 0, leads: 0, updated_at: new Date().toISOString() })
    .eq('id', funnelId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
