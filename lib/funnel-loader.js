import { createClient as createAdminClient } from '@supabase/supabase-js'
import SynergyGenerator from '../components/funnels/synergy-generator/SynergyGenerator'
import SynergyGeneratorThankYou from '../components/funnels/synergy-generator/SynergyGeneratorThankYou'
import SynergyHVAC from '../components/funnels/synergy-hvac/SynergyHVAC'
import SynergyHVACThankYou from '../components/funnels/synergy-hvac/SynergyHVACThankYou'

// All funnels are code-based. Add new slugs here when building a new funnel.
const CODE_FUNNELS = {
  'generator-quote': {
    survey: SynergyGenerator,
    thankYou: SynergyGeneratorThankYou,
  },
  'hvac-second-opinion': {
    survey: SynergyHVAC,
    thankYou: SynergyHVACThankYou,
  },
}

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
}

export async function loadFunnel(slug, variant = null) {
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

  const allSteps = steps || []

  // A/B: if step 1 has variant rows, serve the matching variant.
  // If no variant rows exist (null), return all steps unchanged — current behavior.
  const hasVariants = allSteps.some(s => s.step_order === 1 && s.variant !== null)
  const filteredSteps = hasVariants && variant
    ? allSteps.filter(s => s.step_order !== 1 || s.variant === variant)
    : allSteps

  return { funnel, steps: filteredSteps }
}

export function renderStep({ funnel, step, variant = null }) {
  const shared = {
    funnelId: funnel.id,
    funnelSlug: funnel.slug,
    clientId: funnel.client_id,
    branding: funnel.branding || {},
    tracking: funnel.tracking || {},
    stepId: step.id,
    variant,
  }
  const headCode = funnel.tracking?.headCode

  const codeFunnel = CODE_FUNNELS[funnel.slug]
  if (!codeFunnel) throw new Error(`No component registered for funnel slug: ${funnel.slug}`)
  const Component = step.step_type === 'survey' ? codeFunnel.survey : codeFunnel.thankYou
  const stepEl = <Component {...shared} stepConfig={step.config || {}} />

  return (
    <>
      {headCode && (
        <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: headCode }} />
      )}
      {stepEl}
    </>
  )
}
