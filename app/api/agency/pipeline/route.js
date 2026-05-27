import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function requireAgency(supabase) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = adminDb()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!profile?.role?.startsWith('agency_')) return null
  return user
}

export async function GET(request) {
  const supabase = createServerClient()
  const user = await requireAgency(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  const db = adminDb()

  // Build date-filtered queries
  let paymentsQuery = db.from('client_payments').select('client_id, amount, date_created')
  if (start) paymentsQuery = paymentsQuery.gte('date_created', start)
  if (end) paymentsQuery = paymentsQuery.lte('date_created', end + 'T23:59:59')

  let campaignsQuery = db.from('client_yt_campaigns').select('client_id, campaign_id, campaign_name, status, cost, date')
  if (start) campaignsQuery = campaignsQuery.gte('date', start)
  if (end) campaignsQuery = campaignsQuery.lte('date', end)

  let leadsQuery = db.from('client_lead').select('client_id, lead_id, lead_status, appt_status, sale_status, first_name, last_name, email, phone, company, city, state, created_at, appt_date')
  if (start) leadsQuery = leadsQuery.gte('created_at', start)
  if (end) leadsQuery = leadsQuery.lte('created_at', end + 'T23:59:59')

  const [
    { data: clients, error: clientErr },
    { data: payments, error: payErr },
    { data: campaigns, error: campErr },
    { data: leads, error: leadErr },
  ] = await Promise.all([
    db.from('client').select('client_id, client_name, industry, city, state, status, created_at'),
    paymentsQuery,
    campaignsQuery,
    leadsQuery,
  ])

  if (clientErr || payErr || campErr || leadErr) {
    const errors = { clientErr, payErr, campErr, leadErr }
    console.error('[pipeline] query errors:', errors)
    return NextResponse.json({ error: 'Query failed', details: errors }, { status: 500 })
  }

  // Fetch billing for onboarding clients
  const onboardingIds = (clients || []).filter(c => c.status === 'Onboarding').map(c => c.client_id)
  let billing = []
  if (onboardingIds.length > 0) {
    const { data } = await db.from('client_billing').select('client_id, retainer_amount, monthly_budget').in('client_id', onboardingIds)
    billing = data || []
  }

  return NextResponse.json({
    clients: clients || [],
    payments: payments || [],
    campaigns: campaigns || [],
    leads: leads || [],
    billing: billing,
  })
}
