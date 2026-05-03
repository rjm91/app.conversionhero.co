import { createClient as createAdminClient } from '@supabase/supabase-js'
import FunnelSurvey from '../components/FunnelSurvey'
import FunnelThankYou from '../components/FunnelThankYou'
import SynergyGenerator from '../components/funnels/synergy-generator/SynergyGenerator'
import SynergyGeneratorThankYou from '../components/funnels/synergy-generator/SynergyGeneratorThankYou'
import SynergyHVAC from '../components/funnels/synergy-hvac/SynergyHVAC'
import SynergyHVACThankYou from '../components/funnels/synergy-hvac/SynergyHVACThankYou'

// Code-based funnel registry. Each entry maps a funnel slug to bespoke
// survey + thank-you components, bypassing the generic FunnelSurvey renderer.
// Add new entries here to register additional code-based funnels.
const CODE_FUNNELS = {
  'generator-quote': {
    survey: SynergyGenerator,
    thankYou: SynergyGeneratorThankYou,
  },
  'hvac-quote': {
    survey: SynergyHVAC,
    thankYou: SynergyHVACThankYou,
  },
}

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
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
  const headCode = funnel.tracking?.headCode

  const codeFunnel = CODE_FUNNELS[funnel.slug]
  let stepEl
  if (codeFunnel) {
    const Component = step.step_type === 'survey' ? codeFunnel.survey : codeFunnel.thankYou
    stepEl = <Component {...shared} stepConfig={step.config || {}} />
  } else {
    stepEl = step.step_type === 'survey'
      ? <FunnelSurvey {...shared} stepConfig={step.config || {}} />
      : <FunnelThankYou {...shared} stepConfig={step.config || {}} />
  }

  return (
    <>
      {headCode && (
        <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: headCode }} />
      )}
      {stepEl}
    </>
  )
}
