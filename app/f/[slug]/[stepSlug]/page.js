import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { loadFunnel, renderStep } from '../../../../lib/funnel-loader'

export const dynamic = 'force-dynamic'

export default async function FunnelStepPage({ params }) {
  const variant = headers().get('x-funnel-variant') || 'a'
  const loaded = await loadFunnel(params.slug, variant)
  if (!loaded) notFound()
  const step = loaded.steps.find(s => s.slug === params.stepSlug)
  if (!step) notFound()
  return renderStep({ funnel: loaded.funnel, step, variant })
}
