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
    throw new Error(`[Step 1 - OAuth] HTTP ${status}: ${rawText}`)
  }
  return data.access_token
}

// Step 2: Query Google Ads API for YouTube campaigns
// Tries versions from newest to oldest until one works
async function fetchYouTubeCampaigns(accessToken, customerId, startDate, endDate) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      metrics.cost_micros,
      metrics.clicks,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM campaign
    WHERE campaign.advertising_channel_type = 'VIDEO'
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY campaign.name
  `

  const versions = ['v19', 'v18', 'v17', 'v20', 'v21', 'v22', 'v16']
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

    // 404 = version not found, try next. Any other error = real problem, stop.
    if (status !== 404) {
      throw new Error(`[Step 2 - Google Ads API ${version}] HTTP ${status}: ${rawText}`)
    }

    lastError = `HTTP ${status} on ${version}`
  }

  throw new Error(`[Step 2 - Google Ads API] All versions returned 404. Last: ${lastError}. Check developers.google.com/google-ads/api/docs/release-notes for current version.`)
}

// Step 3: Save campaigns to Supabase
async function saveCampaigns(clientId, customerId, campaigns, startDate, endDate) {
  // Remove old data for this client + date range first
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
    budget:              (row.campaignBudget?.amountMicros || 0) / 1_000_000,
    cost:                (row.metrics?.costMicros || 0) / 1_000_000,
    clicks:              row.metrics?.clicks || 0,
    cpc:                 (row.metrics?.averageCpc || 0) / 1_000_000,
    conversions:         row.metrics?.conversions || 0,
    cost_per_conversion: row.metrics?.costPerConversion || 0,
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

    // Env var check — catch missing vars early
    const missing = ['GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_MANAGER_ID']
      .filter(k => !process.env[k])
    if (missing.length > 0) {
      return Response.json({ success: false, error: 'Missing env vars: ' + missing.join(', ') }, { status: 500 })
    }

    const { data: clients, error: clientError } = await supabase
      .from('client')
      .select('client_id')
      .eq('status', 'Active')

    if (clientError) throw new Error('Failed to fetch clients: ' + JSON.stringify(clientError))

    const customerMap = {
      'ch013': '7756372893', // Synergy Home
    }

    const accessToken = await getAccessToken()
    const results = []

    for (const client of clients) {
      const customerId = customerMap[client.client_id]
      if (!customerId) continue

      const campaigns = await fetchYouTubeCampaigns(accessToken, customerId, startDate, endDate)
      await saveCampaigns(client.client_id, customerId, campaigns, startDate, endDate)
      results.push({ client_id: client.client_id, campaigns: campaigns.length })
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
