export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Safe JSON parser — returns { ok, data, rawText } so we never throw on HTML responses
async function safeJson(res) {
  const text = await res.text()
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text), rawText: text }
  } catch {
    return { ok: false, status: res.status, data: null, rawText: text.slice(0, 500) }
  }
}

// Step 1: Get fresh access token using refresh token
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  })
  const { ok, status, data, rawText } = await safeJson(res)
  if (!data?.access_token) {
    const isExpired = rawText?.includes('invalid_grant') || rawText?.includes('Token has been expired or revoked')
    if (isExpired) {
      throw new Error('[Step 1 - OAuth] Refresh token expired or revoked. Run: node scripts/get-google-refresh-token.js to generate a new one, then update .env.local and Vercel.')
    }
    throw new Error(`[Step 1 - OAuth] HTTP ${status}: ${rawText}`)
  }
  return data.access_token
}

// Step 2: Query Google Ads API — daily rows per campaign (segments.date)
async function fetchYouTubeCampaigns(accessToken, customerId, startDate, endDate) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.cost_micros,
      metrics.clicks,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion,
      segments.date
    FROM campaign
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX')
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY campaign.name, segments.date
  `

  const versions = ['v20', 'v21', 'v22', 'v19']
  let lastError = ''

  for (const version of versions) {
    const res = await fetch(
      `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers: {
          'Authorization':     `Bearer ${accessToken}`,
          'developer-token':   process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
          'login-customer-id': process.env.GOOGLE_ADS_MANAGER_ID,
          'Content-Type':      'application/json',
        },
        body: JSON.stringify({ query }),
      }
    )

    const { ok, status, data, rawText } = await safeJson(res)

    if (ok) {
      console.log(`Google Ads API: using ${version}`)
      return data.results || []
    }

    if (status !== 404) {
      throw new Error(`[Step 2 - Google Ads API ${version}] HTTP ${status}: ${rawText}`)
    }

    lastError = `HTTP ${status} on ${version}`
  }

  throw new Error(`[Step 2 - Google Ads API] All versions returned 404. Last: ${lastError}.`)
}

// Step 3: Save daily campaign rows to Supabase
async function saveCampaigns(clientId, customerId, campaigns, startDate, endDate) {
  // Delete existing daily rows for this client + date range
  await supabase
    .from('client_yt_campaigns')
    .delete()
    .eq('client_id', clientId)
    .gte('date', startDate)
    .lte('date', endDate)

  // Also clean up any old range-based rows for backward compat
  await supabase
    .from('client_yt_campaigns')
    .delete()
    .eq('client_id', clientId)
    .eq('date_range_start', startDate)
    .eq('date_range_end', endDate)

  if (campaigns.length === 0) return

  const rows = campaigns.map(row => ({
    client_id:           clientId,
    customer_id:         customerId,
    campaign_id:         row.campaign?.id?.toString() || '',
    campaign_name:       row.campaign?.name || '',
    status:              row.campaign?.status || '',
    channel_type:        row.campaign?.advertisingChannelType || '',
    budget:              (row.campaignBudget?.amountMicros || 0) / 1_000_000,
    cost:                (row.metrics?.costMicros || 0) / 1_000_000,
    clicks:              row.metrics?.clicks || 0,
    cpc:                 (row.metrics?.averageCpc || 0) / 1_000_000,
    conversions:         row.metrics?.conversions || 0,
    cost_per_conversion: row.metrics?.costPerConversion || 0,
    date:                row.segments?.date || startDate,
    // Keep range fields populated so existing NOT NULL constraints aren't violated
    date_range_start:    startDate,
    date_range_end:      endDate,
    synced_at:           new Date().toISOString(),
  }))

  const { error } = await supabase.from('client_yt_campaigns').insert(rows)
  if (error) throw new Error('[Step 3 - Supabase] Insert error: ' + JSON.stringify(error))
}

// Main handler
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    const endDate   = searchParams.get('end')   || new Date().toISOString().split('T')[0]
    const startDate = searchParams.get('start') || (() => {
      const d = new Date()
      d.setDate(d.getDate() - 30)
      return d.toISOString().split('T')[0]
    })()

    const missing = ['GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_MANAGER_ID']
      .filter(k => !process.env[k])
    if (missing.length > 0) {
      return Response.json({ success: false, error: 'Missing env vars: ' + missing.join(', ') }, { status: 500 })
    }

    const { data: adsAccounts, error: adsError } = await supabase
      .from('client_google_ads_account')
      .select('client_id, client_name, customer_id, login_customer_id')
      .eq('is_active', true)

    if (adsError) throw new Error('Failed to fetch Google Ads accounts: ' + JSON.stringify(adsError))
    if (!adsAccounts?.length) {
      return Response.json({ success: true, synced: [], message: 'No active Google Ads accounts found.' })
    }

    const accessToken = await getAccessToken()
    const results = []

    for (const account of adsAccounts) {
      const campaigns = await fetchYouTubeCampaigns(accessToken, account.customer_id, startDate, endDate)
      await saveCampaigns(account.client_id, account.customer_id, campaigns, startDate, endDate)
      results.push({ client_id: account.client_id, client_name: account.client_name, campaigns: campaigns.length })
    }

    return Response.json({
      success: true,
      synced: results,
      date_range: { startDate, endDate }
    })

  } catch (err) {
    console.error('Sync error:', err)
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
