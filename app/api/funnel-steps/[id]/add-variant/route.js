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
  const { data: step } = await db
    .from('client_funnel_steps')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!step) return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  if (step.step_order !== 1) return NextResponse.json({ error: 'Only step 1 can have variants' }, { status: 400 })
  if (step.variant !== null) return NextResponse.json({ error: 'Step already has a variant assigned' }, { status: 400 })

  // Set existing step to variant a
  const { error: updateError } = await db
    .from('client_funnel_steps')
    .update({ variant: 'a', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Create variant b as a copy
  const { variant: _v, id: _id, created_at: _c, updated_at: _u, visitors: _vis, leads: _leads, ...rest } = step
  const { error: insertError } = await db
    .from('client_funnel_steps')
    .insert({
      ...rest,
      variant: 'b',
      name: (step.name || step.step_type) + ' — Variant B',
      visitors: 0,
      leads: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
