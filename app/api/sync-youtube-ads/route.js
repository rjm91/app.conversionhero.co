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

// Helper: run a GAQL query against Google Ads API, trying multiple API versions
async function runGaqlQuery(accessToken, customerId, query, label = 'Google Ads') {
  const versions = ['v21', 'v22']
  let lastError = ''

  for (const version of versions) {
    const res = await fetch(
      `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        cache: 'no-store', // never let Next cache/replay live ad data
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

    if (status === 401) {
      throw new Error(
        `[${label} ${version}] HTTP 401: ${rawText}\n\n` +
        'The access token was obtained from Google but Google Ads API rejected it. ' +
        'This means your OAuth credentials need to be reconnected. ' +
        'Click "Reconnect Google Ads" on this page to fix it.'
      )
    }

    // Skip to the next version if this one is missing (404) or deprecated/blocked.
    const deprecated = /UNSUPPORTED_VERSION|deprecated/i.test(rawText || '')
    if (status !== 404 && !deprecated) {
      throw new Error(`[${label} ${version}] HTTP ${status}: ${rawText}`)
    }

    lastError = `HTTP ${status} on ${version}`
  }

  throw new Error(`[${label}] All versions returned 404. Last: ${lastError}.`)
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
      metrics.impressions,
      metrics.clicks,
      metrics.average_cpc,
      metrics.conversions,
      metrics.conversions_value,
      metrics.cost_per_conversion,
      segments.date
    FROM campaign
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX', 'SHOPPING', 'SEARCH')
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY campaign.name, segments.date
  `

  console.log(`[Sync] Querying customer: ${customerId}, manager: ${process.env.GOOGLE_ADS_MANAGER_ID}, date: ${startDate} → ${endDate}`)
  return runGaqlQuery(accessToken, customerId, query, 'Step 2 - Campaigns')
}

// Step 2a: Fetch ALL campaigns (no date filter) so zero-activity ones still appear
async function fetchAllCampaigns(accessToken, customerId) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX', 'SHOPPING', 'SEARCH')
      AND campaign.status IN ('ENABLED', 'PAUSED')
    ORDER BY campaign.name
  `
  return runGaqlQuery(accessToken, customerId, query, 'Step 2a - All Campaigns')
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
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX', 'SHOPPING', 'SEARCH')
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY ad_group.name, segments.date
  `
  return runGaqlQuery(accessToken, customerId, query, 'Step 2b - Ad Groups')
}

// Step 2b-all: Fetch ALL ad groups (no date filter)
async function fetchAllAdGroups(accessToken, customerId) {
  const query = `
    SELECT
      campaign.id,
      ad_group.id,
      ad_group.name,
      ad_group.status
    FROM ad_group
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX', 'SHOPPING', 'SEARCH')
      AND ad_group.status IN ('ENABLED', 'PAUSED')
    ORDER BY ad_group.name
  `
  return runGaqlQuery(accessToken, customerId, query, 'Step 2b-all - All Ad Groups')
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
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX', 'SHOPPING', 'SEARCH')
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY ad_group_ad.ad.id, segments.date
  `
  return runGaqlQuery(accessToken, customerId, query, 'Step 2c - Ads')
}

// Step 2c-all: Fetch ALL ads (no date filter)
async function fetchAllAds(accessToken, customerId) {
  const query = `
    SELECT
      campaign.id,
      ad_group.id,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.status
    FROM ad_group_ad
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX', 'SHOPPING', 'SEARCH')
      AND ad_group_ad.status IN ('ENABLED', 'PAUSED')
    ORDER BY ad_group_ad.ad.id
  `
  return runGaqlQuery(accessToken, customerId, query, 'Step 2c-all - All Ads')
}

// Step 2d: Query Google Ads API — YouTube video IDs per ad
async function fetchAdVideos(accessToken, customerId) {
  const query = `
    SELECT
      ad_group_ad.ad.id,
      asset.youtube_video_asset.youtube_video_id
    FROM ad_group_ad_asset_view
    WHERE campaign.advertising_channel_type IN ('VIDEO', 'DEMAND_GEN', 'PERFORMANCE_MAX', 'SHOPPING', 'SEARCH')
      AND asset.type = 'YOUTUBE_VIDEO'
  `

  const results = await runGaqlQuery(accessToken, customerId, query, 'Step 2d - Ad Videos')
  const map = {}
  for (const row of results) {
    const adId = row.adGroupAd?.ad?.id?.toString()
    const videoId = row.asset?.youtubeVideoAsset?.youtubeVideoId
    if (adId && videoId && !map[adId]) map[adId] = videoId
  }
  return map
}

// Step 3: Save daily campaign rows to Supabase (including zero-activity campaigns)
async function saveCampaigns(clientId, customerId, campaigns, allCampaigns, startDate, endDate) {
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

  const rows = campaigns.map(row => ({
    client_id:           clientId,
    customer_id:         customerId,
    campaign_id:         row.campaign?.id?.toString() || '',
    campaign_name:       row.campaign?.name || '',
    status:              row.campaign?.status || '',
    channel_type:        row.campaign?.advertisingChannelType || '',
    budget:              (row.campaignBudget?.amountMicros || 0) / 1_000_000,
    cost:                (row.metrics?.costMicros || 0) / 1_000_000,
    impressions:         Number(row.metrics?.impressions || 0),
    clicks:              row.metrics?.clicks || 0,
    cpc:                 (row.metrics?.averageCpc || 0) / 1_000_000,
    conversions:         row.metrics?.conversions || 0,
    cost_per_conversion: row.metrics?.costPerConversion || 0,
    conversions_value:   Number(row.metrics?.conversionsValue || 0),
    date:                row.segments?.date || startDate,
    date_range_start:    startDate,
    date_range_end:      endDate,
    synced_at:           new Date().toISOString(),
  }))

  // Add zero-activity campaigns that had no metrics rows
  const seenIds = new Set(campaigns.map(r => r.campaign?.id?.toString()))
  for (const row of allCampaigns) {
    const cid = row.campaign?.id?.toString()
    if (cid && !seenIds.has(cid)) {
      rows.push({
        client_id:           clientId,
        customer_id:         customerId,
        campaign_id:         cid,
        campaign_name:       row.campaign?.name || '',
        status:              row.campaign?.status || '',
        channel_type:        row.campaign?.advertisingChannelType || '',
        budget:              (row.campaignBudget?.amountMicros || 0) / 1_000_000,
        cost:                0,
        impressions:         0,
        clicks:              0,
        cpc:                 0,
        conversions:         0,
        cost_per_conversion: 0,
        conversions_value:   0,
        date:                startDate,
        date_range_start:    startDate,
        date_range_end:      endDate,
        synced_at:           new Date().toISOString(),
      })
    }
  }

  if (rows.length === 0) return
  const { error } = await supabase.from('client_yt_campaigns').insert(rows)
  if (error) throw new Error('[Step 3 - Supabase] Insert error: ' + JSON.stringify(error))
}

// Step 3b: Save daily ad group rows to Supabase (including zero-activity)
async function saveAdGroups(clientId, customerId, adGroups, allAdGroups, startDate, endDate) {
  await supabase.from('client_yt_ad_groups').delete().eq('client_id', clientId).gte('date', startDate).lte('date', endDate)

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

  const seenIds = new Set(adGroups.map(r => r.adGroup?.id?.toString()))
  for (const row of allAdGroups) {
    const agid = row.adGroup?.id?.toString()
    if (agid && !seenIds.has(agid)) {
      rows.push({
        client_id:           clientId,
        customer_id:         customerId,
        campaign_id:         row.campaign?.id?.toString() || '',
        ad_group_id:         agid,
        ad_group_name:       row.adGroup?.name || '',
        status:              row.adGroup?.status || '',
        cost:                0,
        clicks:              0,
        cpc:                 0,
        conversions:         0,
        cost_per_conversion: 0,
        date:                startDate,
        date_range_start:    startDate,
        date_range_end:      endDate,
        synced_at:           new Date().toISOString(),
      })
    }
  }

  if (rows.length === 0) return
  const { error } = await supabase.from('client_yt_ad_groups').insert(rows)
  if (error) throw new Error('[Step 3b - Supabase] Ad groups insert error: ' + JSON.stringify(error))
}

// Step 3c: Save daily ad rows to Supabase (including zero-activity)
async function saveAds(clientId, customerId, ads, allAds, startDate, endDate, videoMap = {}) {
  await supabase.from('client_yt_ads').delete().eq('client_id', clientId).gte('date', startDate).lte('date', endDate)

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

  const seenIds = new Set(ads.map(r => r.adGroupAd?.ad?.id?.toString()))
  for (const row of allAds) {
    const adId = row.adGroupAd?.ad?.id?.toString()
    if (adId && !seenIds.has(adId)) {
      rows.push({
        client_id:           clientId,
        customer_id:         customerId,
        campaign_id:         row.campaign?.id?.toString() || '',
        ad_group_id:         row.adGroup?.id?.toString() || '',
        ad_id:               adId,
        ad_name:             row.adGroupAd?.ad?.name || '',
        ad_type:             row.adGroupAd?.ad?.type || '',
        status:              row.adGroupAd?.status || '',
        youtube_video_id:    videoMap[adId] || null,
        cost:                0,
        clicks:              0,
        cpc:                 0,
        conversions:         0,
        cost_per_conversion: 0,
        date:                startDate,
        date_range_start:    startDate,
        date_range_end:      endDate,
        synced_at:           new Date().toISOString(),
      })
    }
  }

  if (rows.length === 0) return
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
      const [campaigns, adGroups, ads, videoMap, allCampaigns, allAdGroups, allAds] = await Promise.all([
        fetchYouTubeCampaigns(accessToken, account.customer_id, startDate, endDate),
        fetchAdGroups(accessToken, account.customer_id, startDate, endDate),
        fetchAds(accessToken, account.customer_id, startDate, endDate),
        fetchAdVideos(accessToken, account.customer_id),
        fetchAllCampaigns(accessToken, account.customer_id),
        fetchAllAdGroups(accessToken, account.customer_id),
        fetchAllAds(accessToken, account.customer_id),
      ])
      await Promise.all([
        saveCampaigns(account.client_id, account.customer_id, campaigns, allCampaigns, startDate, endDate),
        saveAdGroups(account.client_id, account.customer_id, adGroups, allAdGroups, startDate, endDate),
        saveAds(account.client_id, account.customer_id, ads, allAds, startDate, endDate, videoMap),
      ])
      const totalCampaigns = new Set([...campaigns.map(r => r.campaign?.id), ...allCampaigns.map(r => r.campaign?.id)]).size
      results.push({ client_id: account.client_id, client_name: account.client_name, campaigns: totalCampaigns, adGroups: adGroups.length + allAdGroups.length, ads: ads.length + allAds.length })
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
