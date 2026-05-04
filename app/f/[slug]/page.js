import { notFound } from 'next/navigation'
import { loadFunnel, renderStep } from '../../../lib/funnel-loader'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const loaded = await loadFunnel(params.slug)
  if (!loaded) return { title: 'Not found' }
  const entry = loaded.steps.find(s => s.step_order === 1)
  return {
    title: loaded.funnel.name,
    description: entry?.config?.headline?.title || '',
  }
}

export default async function FunnelEntryPage({ params }) {
  const loaded = await loadFunnel(params.slug)
  if (!loaded) notFound()
  const entry = loaded.steps.find(s => s.step_order === 1)
  if (!entry) notFound()
  return renderStep({ funnel: loaded.funnel, step: entry })
}
