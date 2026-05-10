import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function PATCH(request, { params }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { config, name, slug, is_active, visitors, leads } = body

  const patch = { updated_at: new Date().toISOString() }
  if (config    !== undefined) patch.config    = config
  if (name      !== undefined) patch.name      = name
  if (slug      !== undefined) patch.slug      = slug
  if (is_active !== undefined) patch.is_active = is_active
  if (visitors  !== undefined) patch.visitors  = visitors
  if (leads     !== undefined) patch.leads     = leads

  const { error } = await admin()
    .from('client_funnel_steps')
    .update(patch)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
