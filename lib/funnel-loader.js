import { createClient as createAdminClient } from '@supabase/supabase-js'
import FunnelSurvey from '../components/FunnelSurvey'
import FunnelThankYou from '../components/FunnelThankYou'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function loadFunnel(slug) {
  const db = admin()
  const { data: funnel } = await db
    .from('client_funnels')
    .select('id, client_id, name, status, slug, branding, tracking')
    .eq('slug', slug)
    .single()
  if (!funnel || funnel.status !== 'live') return null

  const { data: steps } = await db
    .from('client_funnel_steps')
    .select('*')
    .eq('funnel_id', funnel.id)
    .order('step_order', { ascending: true })

  return { funnel, steps: steps || [] }
}

export function renderStep({ funnel, step }) {
  const shared = {
    funnelId: funnel.id,
    funnelSlug: funnel.slug,
    clientId: funnel.client_id,
    branding: funnel.branding || {},
    tracking: funnel.tracking || {},
  }
  if (step.step_type === 'survey') {
    return <FunnelSurvey {...shared} stepConfig={step.config || {}} />
  }
  return <FunnelThankYou {...shared} stepConfig={step.config || {}} />
}
