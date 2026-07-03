// Klaviyo Reporting API client — SERVER-SIDE ONLY (needs the secret API key).
// Key resolution: KLAVIYO_API_KEY_<CLIENTID> (per-client) falls back to
// KLAVIYO_API_KEY (single-client setups, e.g. ShieldTech today).
//
// API shape notes (learned the hard way):
//  - Flows support DAILY SERIES reports, but only ≤60 days per request → chunk.
//  - Campaigns only support VALUES (aggregate) reports — no series endpoint.
//    A campaign is a one-shot send anyway, so we attribute its totals to its
//    send date and store that as the row's date.
//  - Report endpoints are strictly rate-limited (~1/s burst, a few/min steady)
//    → one retry on 429, honoring Retry-After.
// Klaviyo's numbers are ITS attribution (engagement windows) — the dashboard
// shows them alongside our first-party UTM-verified numbers, never mixed.

const BASE = 'https://a.klaviyo.com/api'
const REVISION = '2025-04-15'

export function klaviyoKeyFor(clientId) {
  return process.env[`KLAVIYO_API_KEY_${String(clientId || '').toUpperCase()}`] || process.env.KLAVIYO_API_KEY || null
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function kFetch(apiKey, path, init = {}, retried = false) {
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
  if (res.status === 429 && !retried) {
    const wait = Math.min(60, Number(res.headers.get('Retry-After')) || 35)
    await sleep(wait * 1000)
    return kFetch(apiKey, path, init, true)
  }
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

// id → { name, channel, sendDate } for campaigns (messages.channel filter is required).
export async function fetchCampaignIndex(apiKey) {
  const index = {}
  for (const channel of ['email', 'sms']) {
    const list = await kFetchAll(apiKey, `/campaigns/?filter=${encodeURIComponent(`equals(messages.channel,'${channel}')`)}`)
    for (const c of list) {
      const sendTime = c.attributes?.send_time || c.attributes?.scheduled_at || null
      index[c.id] = { name: c.attributes?.name || c.id, channel, sendDate: sendTime ? String(sendTime).slice(0, 10) : null, status: c.attributes?.status || null }
    }
  }
  return index
}

// id → { name } for flows (channel lives on individual messages).
export async function fetchFlowIndex(apiKey) {
  const list = await kFetchAll(apiKey, '/flows/')
  const index = {}
  for (const f of list) index[f.id] = { name: f.attributes?.name || f.id, channel: null, status: f.attributes?.status || null }
  return index
}

const STATISTICS = ['recipients', 'opens_unique', 'clicks_unique', 'conversions', 'conversion_value']
const timeframe = (start, end) => ({ start: `${start}T00:00:00+00:00`, end: `${end}T23:59:59+00:00` })

// Klaviyo reports can return several result groups for one entity (e.g. one
// per send_channel on a flow). The table keys on (client_id, campaign_id,
// date), so merge same-entity same-day rows — a single upsert batch with
// duplicate keys makes Postgres error ("cannot affect row a second time").
function mergeRows(rows) {
  const byKey = {}
  for (const r of rows) {
    const k = `${r.campaign_id}|${r.date}`
    const m = byKey[k]
    if (!m) { byKey[k] = { ...r }; continue }
    m.recipients += r.recipients
    m.opens += r.opens
    m.clicks += r.clicks
    m.conversions += r.conversions
    m.conversions_value += r.conversions_value
    if (m.channel !== r.channel) m.channel = null // mixed channels → unlabeled
  }
  return Object.values(byKey)
}

// Flows: daily series, chunked into ≤60-day windows (API limit), rows merged.
export async function fetchFlowSeriesRows(apiKey, clientId, metricId, start, end, index, syncedAt) {
  const rows = []
  let winStart = new Date(`${start}T00:00:00Z`)
  const rangeEnd = new Date(`${end}T00:00:00Z`)
  while (winStart <= rangeEnd) {
    const winEnd = new Date(Math.min(winStart.getTime() + 59 * 864e5, rangeEnd.getTime()))
    const report = await kFetch(apiKey, '/flow-series-reports/', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'flow-series-report',
          attributes: {
            statistics: STATISTICS,
            timeframe: timeframe(winStart.toISOString().slice(0, 10), winEnd.toISOString().slice(0, 10)),
            interval: 'daily',
            conversion_metric_id: metricId,
          },
        },
      }),
    })
    const attrs = report?.data?.attributes || {}
    const dates = (attrs.date_times || []).map(d => String(d).slice(0, 10))
    for (const r of attrs.results || []) {
      const id = r.groupings?.flow_id
      if (!id) continue
      const meta = index[id] || {}
      const s = r.statistics || {}
      for (let i = 0; i < dates.length; i++) {
        const row = statsAt(s, i)
        if (!row) continue
        rows.push({
          client_id: clientId, entity_type: 'flow', campaign_id: id,
          campaign_name: meta.name || id, channel: r.groupings?.send_channel || meta.channel || null,
          status: meta.status || null,
          date: dates[i], ...row, synced_at: syncedAt,
        })
      }
    }
    winStart = new Date(winEnd.getTime() + 864e5)
  }
  return mergeRows(rows)
}

// Campaigns: aggregate values over the range, attributed to each send date.
// Send dates outside the range clamp to its edges so the row stays queryable
// within the window it was synced for.
export async function fetchCampaignValuesRows(apiKey, clientId, metricId, start, end, index, syncedAt) {
  const report = await kFetch(apiKey, '/campaign-values-reports/', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          statistics: STATISTICS,
          timeframe: timeframe(start, end),
          conversion_metric_id: metricId,
        },
      },
    }),
  })
  const rows = []
  for (const r of report?.data?.attributes?.results || []) {
    const id = r.groupings?.campaign_id
    if (!id) continue
    const meta = index[id] || {}
    const row = statsScalar(r.statistics || {})
    if (!row) continue
    let date = meta.sendDate || end
    if (date < start) date = start
    if (date > end) date = end
    rows.push({
      client_id: clientId, entity_type: 'campaign', campaign_id: id,
      campaign_name: meta.name || id, channel: meta.channel || r.groupings?.send_channel || null,
      status: meta.status || null,
      date, ...row, synced_at: syncedAt,
    })
  }
  return mergeRows(rows)
}

// One day's stats from a series result (arrays); null if the day is all-zero.
function statsAt(s, i) {
  const recipients = Math.round(Number(s.recipients?.[i]) || 0)
  const opens = Math.round(Number(s.opens_unique?.[i]) || 0)
  const clicks = Math.round(Number(s.clicks_unique?.[i]) || 0)
  const conversions = Number(s.conversions?.[i]) || 0
  const conversions_value = Number(s.conversion_value?.[i]) || 0
  if (!recipients && !opens && !clicks && !conversions && !conversions_value) return null
  return { recipients, opens, clicks, conversions, conversions_value }
}

// Aggregate stats from a values result (scalars); null if all-zero.
function statsScalar(s) {
  const recipients = Math.round(Number(s.recipients) || 0)
  const opens = Math.round(Number(s.opens_unique) || 0)
  const clicks = Math.round(Number(s.clicks_unique) || 0)
  const conversions = Number(s.conversions) || 0
  const conversions_value = Number(s.conversion_value) || 0
  if (!recipients && !opens && !clicks && !conversions && !conversions_value) return null
  return { recipients, opens, clicks, conversions, conversions_value }
}
