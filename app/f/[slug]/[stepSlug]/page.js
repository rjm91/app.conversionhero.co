import { notFound } from 'next/navigation'
import { loadFunnel, renderStep } from '../../../../lib/funnel-loader'

export const dynamic = 'force-dynamic'

export default async function FunnelStepPage({ params }) {
  const loaded = await loadFunnel(params.slug)
  if (!loaded) notFound()
  const step = loaded.steps.find(s => s.slug === params.stepSlug)
  if (!step) notFound()
  return renderStep({ funnel: loaded.funnel, step })
}
