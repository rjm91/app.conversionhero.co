export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { getGoogleAdsAccessToken } from '../../../lib/google-ads'

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

  console.log(`[Sync] Querying customer: ${customerId}, manager: ${process.env.GOOGLE_ADS_MANAGER_ID}, date: ${startDate} → ${endDate}`)

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
      return data.results || []
    }

    if (status === 401) {
      throw new Error(
        `[Step 2 - Google Ads API ${version}] HTTP 401: ${rawText}\n\n` +
        'The access token was obtained from Google but Google Ads API rejected it. ' +
        'This means your OAuth credentials need to be reconnected. ' +
        'Click "Reconnect Google Ads" on this page to fix it.'
      )
    }

    if (status !== 404) {
      throw new Error(`[Step 2 - Google Ads API ${version}] HTTP ${status}: ${rawText}`)
    }

    lastError = `HTTP ${status} on ${version}`
  }

  throw new Error(`[Step 2 - Google Ads API] All versions returned 404. Last: ${lastError}.`)
}

// Step 2b: Query Google Ads API — daily rows per ad group
async function fetchAdGroups(accessToken, customerId, startDate, endDate) {
  const query = `
    SELECT
      campaign.id,
      ad_group.id,
      ad_group.name,
      ad_group.status,
      metrics.cost_micros,
      metrics.clicks,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion,
      segments.date
    FROM ad_group
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX')
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY ad_group.name, segments.date
  `

  const versions = ['v20', 'v21', 'v22', 'v19']
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
    if (ok) return data.results || []
    if (status === 401) throw new Error(`[Google Ads API ${version}] HTTP 401: ${rawText}`)
    if (status !== 404) throw new Error(`[Google Ads API ${version}] HTTP ${status}: ${rawText}`)
  }
  return []
}

// Step 2c: Query Google Ads API — daily rows per ad
async function fetchAds(accessToken, customerId, startDate, endDate) {
  const query = `
    SELECT
      campaign.id,
      ad_group.id,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.status,
      metrics.cost_micros,
      metrics.clicks,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion,
      segments.date
    FROM ad_group_ad
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX')
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY ad_group_ad.ad.id, segments.date
  `

  const versions = ['v20', 'v21', 'v22', 'v19']
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
    if (ok) return data.results || []
    if (status === 401) throw new Error(`[Google Ads API ${version}] HTTP 401: ${rawText}`)
    if (status !== 404) throw new Error(`[Google Ads API ${version}] HTTP ${status}: ${rawText}`)
  }
  return []
}

// Step 2d: Query Google Ads API — YouTube video IDs per ad
async function fetchAdVideos(accessToken, customerId) {
  const query = `
    SELECT
      ad_group_ad.ad.id,
      asset.youtube_video_asset.youtube_video_id
    FROM ad_group_ad_asset_view
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX')
      AND asset.type = 'YOUTUBE_VIDEO'
  `

  const versions = ['v20', 'v21', 'v22', 'v19']
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
      // Build map: ad_id → youtube_video_id (first video wins per ad)
      const map = {}
      for (const row of (data.results || [])) {
        const adId = row.adGroupAd?.ad?.id?.toString()
        const videoId = row.asset?.youtubeVideoAsset?.youtubeVideoId
        if (adId && videoId && !map[adId]) map[adId] = videoId
      }
      return map
    }
    if (status === 401) throw new Error(`[Google Ads API ${version}] HTTP 401: ${rawText}`)
    if (status !== 404) throw new Error(`[Google Ads API ${version}] HTTP ${status}: ${rawText}`)
  }
  return {}
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

// Step 3b: Save daily ad group rows to Supabase
async function saveAdGroups(clientId, customerId, adGroups, startDate, endDate) {
  await supabase.from('client_yt_ad_groups').delete().eq('client_id', clientId).gte('date', startDate).lte('date', endDate)
  if (adGroups.length === 0) return

  const rows = adGroups.map(row => ({
    client_id:           clientId,
    customer_id:         customerId,
    campaign_id:         row.campaign?.id?.toString() || '',
    ad_group_id:         row.adGroup?.id?.toString() || '',
    ad_group_name:       row.adGroup?.name || '',
    status:              row.adGroup?.status || '',
    cost:                (row.metrics?.costMicros || 0) / 1_000_000,
    clicks:              row.metrics?.clicks || 0,
    cpc:                 (row.metrics?.averageCpc || 0) / 1_000_000,
    conversions:         row.metrics?.conversions || 0,
    cost_per_conversion: row.metrics?.costPerConversion || 0,
    date:                row.segments?.date || startDate,
    date_range_start:    startDate,
    date_range_end:      endDate,
    synced_at:           new Date().toISOString(),
  }))

  const { error } = await supabase.from('client_yt_ad_groups').insert(rows)
  if (error) throw new Error('[Step 3b - Supabase] Ad groups insert error: ' + JSON.stringify(error))
}

// Step 3c: Save daily ad rows to Supabase
async function saveAds(clientId, customerId, ads, startDate, endDate, videoMap = {}) {
  await supabase.from('client_yt_ads').delete().eq('client_id', clientId).gte('date', startDate).lte('date', endDate)
  if (ads.length === 0) return

  const rows = ads.map(row => ({
    client_id:           clientId,
    customer_id:         customerId,
    campaign_id:         row.campaign?.id?.toString() || '',
    ad_group_id:         row.adGroup?.id?.toString() || '',
    ad_id:               row.adGroupAd?.ad?.id?.toString() || '',
    ad_name:             row.adGroupAd?.ad?.name || '',
    ad_type:             row.adGroupAd?.ad?.type || '',
    status:              row.adGroupAd?.status || '',
    youtube_video_id:    videoMap[row.adGroupAd?.ad?.id?.toString()] || null,
    cost:                (row.metrics?.costMicros || 0) / 1_000_000,
    clicks:              row.metrics?.clicks || 0,
    cpc:                 (row.metrics?.averageCpc || 0) / 1_000_000,
    conversions:         row.metrics?.conversions || 0,
    cost_per_conversion: row.metrics?.costPerConversion || 0,
    date:                row.segments?.date || startDate,
    date_range_start:    startDate,
    date_range_end:      endDate,
    synced_at:           new Date().toISOString(),
  }))

  const { error } = await supabase.from('client_yt_ads').insert(rows)
  if (error) throw new Error('[Step 3c - Supabase] Ads insert error: ' + JSON.stringify(error))
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

    const missing = ['GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_MANAGER_ID']
      .filter(k => !process.env[k])
    if (missing.length > 0) {
      return Response.json({ success: false, error: 'Missing env vars: ' + missing.join(', ') }, { status: 500 })
    }

    const { data: allAccounts, error: adsError } = await supabase
      .from('client_google_ads_account')
      .select('client_id, client_name, customer_id, login_customer_id, is_active')

    const adsAccounts = (allAccounts || []).filter(a => a.is_active === true || String(a.is_active).toLowerCase() === 'true')

    if (adsError) throw new Error('Failed to fetch Google Ads accounts: ' + JSON.stringify(adsError))
    if (!adsAccounts?.length) {
      return Response.json({ success: true, synced: [], message: 'No active Google Ads accounts found.' })
    }

    const accessToken = await getGoogleAdsAccessToken()
    const results = []

    for (const account of adsAccounts) {
      const [campaigns, adGroups, ads, videoMap] = await Promise.all([
        fetchYouTubeCampaigns(accessToken, account.customer_id, startDate, endDate),
        fetchAdGroups(accessToken, account.customer_id, startDate, endDate),
        fetchAds(accessToken, account.customer_id, startDate, endDate),
        fetchAdVideos(accessToken, account.customer_id),
      ])
      await Promise.all([
        saveCampaigns(account.client_id, account.customer_id, campaigns, startDate, endDate),
        saveAdGroups(account.client_id, account.customer_id, adGroups, startDate, endDate),
        saveAds(account.client_id, account.customer_id, ads, startDate, endDate, videoMap),
      ])
      results.push({ client_id: account.client_id, client_name: account.client_name, campaigns: campaigns.length, adGroups: adGroups.length, ads: ads.length })
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
