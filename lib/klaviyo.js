// Klaviyo Reporting API client — SERVER-SIDE ONLY (needs the secret API key).
// Key resolution: KLAVIYO_API_KEY_<CLIENTID> (per-client) falls back to
// KLAVIYO_API_KEY (single-client setups, e.g. ShieldTech today).
//
// Data model: we pull DAILY series of Placed Order conversions + engagement
// per campaign and per flow, and store them like the ad-platform tables so the
// dashboard range-filters identically. Klaviyo's numbers are ITS attribution
// (engagement windows) — the dashboard shows them alongside our first-party
// UTM-verified numbers, never mixed.

const BASE = 'https://a.klaviyo.com/api'
const REVISION = '2025-04-15'

export function klaviyoKeyFor(clientId) {
  return process.env[`KLAVIYO_API_KEY_${String(clientId || '').toUpperCase()}`] || process.env.KLAVIYO_API_KEY || null
}

async function kFetch(apiKey, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: REVISION,
      accept: 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Klaviyo ${init.method || 'GET'} ${path} → ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

// Follow cursor pagination (links.next) on a GET collection.
async function kFetchAll(apiKey, path, maxPages = 10) {
  const out = []
  let url = path
  for (let i = 0; i < maxPages && url; i++) {
    const page = await kFetch(apiKey, url)
    out.push(...(page.data || []))
    const next = page.links?.next
    url = next ? next.replace(BASE, '') : null
  }
  return out
}

// The conversion metric the reports attribute revenue to. Prefer Shopify's
// Placed Order if the account has several same-named metrics.
export async function getPlacedOrderMetricId(apiKey) {
  const metrics = await kFetchAll(apiKey, '/metrics/')
  const placed = metrics.filter(m => m.attributes?.name === 'Placed Order')
  if (!placed.length) throw new Error('No "Placed Order" metric found in this Klaviyo account')
  const shopify = placed.find(m => /shopify/i.test(m.attributes?.integration?.name || ''))
  return (shopify || placed[0]).id
}

// id → { name, channel } for campaigns (the messages.channel filter is required).
export async function fetchCampaignIndex(apiKey) {
  const index = {}
  for (const channel of ['email', 'sms']) {
    const list = await kFetchAll(apiKey, `/campaigns/?filter=${encodeURIComponent(`equals(messages.channel,'${channel}')`)}`)
    for (const c of list) index[c.id] = { name: c.attributes?.name || c.id, channel }
  }
  return index
}

// id → { name } for flows (channel lives on individual messages; label email).
export async function fetchFlowIndex(apiKey) {
  const list = await kFetchAll(apiKey, '/flows/')
  const index = {}
  for (const f of list) index[f.id] = { name: f.attributes?.name || f.id, channel: null }
  return index
}

const STATISTICS = ['recipients', 'opens_unique', 'clicks_unique', 'conversions', 'conversion_value']

// Daily series per campaign/flow. kind: 'campaign' | 'flow'.
export async function fetchSeriesReport(apiKey, kind, metricId, start, end) {
  const body = {
    data: {
      type: `${kind}-series-report`,
      attributes: {
        statistics: STATISTICS,
        timeframe: { start: `${start}T00:00:00+00:00`, end: `${end}T23:59:59+00:00` },
        interval: 'daily',
        conversion_metric_id: metricId,
      },
    },
  }
  return kFetch(apiKey, `/${kind}-series-reports/`, { method: 'POST', body: JSON.stringify(body) })
}

// Flatten a series report into client_klaviyo_campaigns rows (skips all-zero days).
export function seriesToRows(clientId, kind, report, index, syncedAt) {
  const attrs = report?.data?.attributes || {}
  const dates = (attrs.date_times || []).map(d => String(d).slice(0, 10))
  const rows = []
  for (const r of attrs.results || []) {
    const id = r.groupings?.campaign_id || r.groupings?.flow_id
    if (!id) continue
    const meta = index[id] || {}
    const s = r.statistics || {}
    for (let i = 0; i < dates.length; i++) {
      const recipients = Math.round(Number(s.recipients?.[i]) || 0)
      const opens = Math.round(Number(s.opens_unique?.[i]) || 0)
      const clicks = Math.round(Number(s.clicks_unique?.[i]) || 0)
      const conversions = Number(s.conversions?.[i]) || 0
      const value = Number(s.conversion_value?.[i]) || 0
      if (!recipients && !opens && !clicks && !conversions && !value) continue
      rows.push({
        client_id: clientId,
        entity_type: kind,
        campaign_id: id,
        campaign_name: meta.name || id,
        channel: meta.channel || null,
        date: dates[i],
        recipients, opens, clicks, conversions,
        conversions_value: value,
        synced_at: syncedAt,
      })
    }
  }
  return rows
}
