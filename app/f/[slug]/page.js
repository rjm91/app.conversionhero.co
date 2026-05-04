import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { loadFunnel, renderStep } from '../../../lib/funnel-loader'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const loaded = await loadFunnel(params.slug)
  if (!loaded) return { title: 'Not found' }
  return { title: loaded.funnel.name }
}

export default async function FunnelEntryPage({ params }) {
  const variant = headers().get('x-funnel-variant') || 'a'
  const loaded = await loadFunnel(params.slug, variant)
  if (!loaded) notFound()
  const entry = loaded.steps.find(s => s.step_order === 1)
  if (!entry) notFound()
  return renderStep({ funnel: loaded.funnel, step: entry, variant })
}
