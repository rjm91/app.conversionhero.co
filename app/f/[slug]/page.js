import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import FunnelSurvey from '../../../components/FunnelSurvey'

export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function generateMetadata({ params }) {
  const { data } = await admin()
    .from('client_funnels')
    .select('name, config')
    .eq('slug', params.slug)
    .single()
  if (!data) return { title: 'Not found' }
  return { title: data.name, description: data.config?.headline?.title || '' }
}

export default async function FunnelPage({ params }) {
  const { data: funnel, error } = await admin()
    .from('client_funnels')
    .select('id, client_id, name, status, config')
    .eq('slug', params.slug)
    .single()

  if (error || !funnel) notFound()
  if (funnel.status !== 'live') notFound()

  return (
    <FunnelSurvey
      funnelId={funnel.id}
      clientId={funnel.client_id}
      config={funnel.config}
    />
  )
}
