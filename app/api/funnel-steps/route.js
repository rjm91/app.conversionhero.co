import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST(request) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log('[POST /api/funnel-steps] auth check:', user?.id || 'no user', authError?.message || 'no error')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { funnel_id, step_order, step_type, variant, is_active, config, name, slug } = body

  if (!funnel_id || !step_order || !step_type) {
    return NextResponse.json({ error: 'funnel_id, step_order, and step_type are required' }, { status: 400 })
  }

  const insertData = {
    funnel_id,
    step_order,
    step_type,
    variant:   variant   ?? null,
    is_active: is_active ?? false,
    config:    config    ?? {},
  }
  // Only include optional columns if provided — avoids 500s on missing columns
  if (name !== undefined && name !== null) insertData.name = name
  if (slug !== undefined && slug !== null) insertData.slug = slug

  const { data: step, error } = await admin()
    .from('client_funnel_steps')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.error('[POST /api/funnel-steps] Supabase error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, step })
}
