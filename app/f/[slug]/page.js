import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { loadFunnel, renderStep } from '../../../lib/funnel-loader'

export const dynamic = 'force-dynamic'

// Variant slugs: generator-quote-1 → variant 1 (a), generator-quote-2 → variant 2 (b), etc.
const VARIANT_LABELS = ['a', 'b', 'c', 'd', 'e', 'f']

function parseSlug(slug) {
  const match = slug.match(/^(.+)-(\d+)$/)
  if (match) {
    const num = parseInt(match[2], 10)
    if (num >= 1 && num <= VARIANT_LABELS.length) {
      return { baseSlug: match[1], variantLabel: VARIANT_LABELS[num - 1] }
    }
  }
  return { baseSlug: slug, variantLabel: null }
}

export async function generateMetadata({ params }) {
  const { baseSlug } = parseSlug(params.slug)
  const loaded = await loadFunnel(baseSlug)
  if (!loaded) return { title: 'Not found' }
  const entry = loaded.steps.find(s => s.step_order === 1)
  return {
    title: loaded.funnel.name,
    description: entry?.config?.headline?.title || '',
  }
}

export default async function FunnelEntryPage({ params }) {
  const { baseSlug, variantLabel } = parseSlug(params.slug)
  const loaded = await loadFunnel(baseSlug)
  if (!loaded) notFound()

  // Direct variant URL (e.g. /f/generator-quote-2) — serve that specific variant
  if (variantLabel) {
    const step = loaded.steps.find(s => s.step_order === 1 && s.variant === variantLabel)
    if (!step) notFound()
    return renderStep({ funnel: loaded.funnel, step })
  }

  // Rotator URL — split traffic among active variants
  const surveySteps = loaded.steps.filter(s => s.step_order === 1 && s.is_active)
  if (!surveySteps.length) notFound()

  if (surveySteps.length === 1) {
    return renderStep({ funnel: loaded.funnel, step: surveySteps[0] })
  }

  // Multiple active variants — read the cookie to pick one.
  // On first visit the middleware sets the cookie on the response, but it isn't
  // readable by cookies() until the *next* request. So if no cookie exists yet,
  // pick a random variant here (same logic as middleware).
  const cookieStore = cookies()
  const variantCookie = cookieStore.get('ch_variant')?.value
  let step

  if (variantCookie) {
    const matched = surveySteps.find(s => s.variant === variantCookie)
    step = matched || surveySteps[0]
  } else {
    // First visit — no cookie yet, pick randomly
    step = surveySteps[Math.floor(Math.random() * surveySteps.length)]
  }

  return renderStep({ funnel: loaded.funnel, step })
}
