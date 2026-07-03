export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { klaviyoKeyFor, getPlacedOrderMetricId, fetchCampaignIndex, fetchFlowIndex, fetchFlowSeriesRows, fetchCampaignValuesRows } from '../../../lib/klaviyo'

// Pulls Klaviyo campaign + flow performance into client_klaviyo_campaigns.
//   /api/sync-klaviyo?client_id=ch069                          (last 90 days)
//   /api/sync-klaviyo?client_id=ch069&start=2026-05-01&end=2026-07-02
// Key comes from env: KLAVIYO_API_KEY_<CLIENTID> or KLAVIYO_API_KEY.
// Klaviyo's report endpoints are heavily rate-limited (~2/min steady) — the
// dashboard calls this once per page open; each report failure is isolated so
// a 429 on flows doesn't lose the campaign rows.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

function isoDay(d) { return d.toISOString().slice(0, 10) }

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  if (!clientId) return Response.json({ error: 'client_id required' }, { status: 400 })

  const apiKey = klaviyoKeyFor(clientId)
  if (!apiKey) return Response.json({ error: `No Klaviyo API key configured for ${clientId}` }, { status: 404 })

  const end = searchParams.get('end') || isoDay(new Date())
  const start = searchParams.get('start') || isoDay(new Date(Date.now() - 90 * 864e5))
  const syncedAt = new Date().toISOString()

  let metricId
  try {
    metricId = await getPlacedOrderMetricId(apiKey)
  } catch (err) {
    console.error('[Klaviyo sync] metric lookup:', err.message)
    return Response.json({ error: err.message }, { status: 502 })
  }

  const upsert = async (rows) => {
    if (!rows.length) return
    const { error } = await admin()
      .from('client_klaviyo_campaigns')
      .upsert(rows, { onConflict: 'client_id,campaign_id,date' })
    if (error) throw new Error(error.message)
  }

  const results = {}
  // Campaigns: aggregate values attributed to send date (no series endpoint).
  try {
    const index = await fetchCampaignIndex(apiKey)
    const rows = await fetchCampaignValuesRows(apiKey, clientId, metricId, start, end, index, syncedAt)
    await upsert(rows)
    results.campaign = { synced: rows.length }
  } catch (err) {
    console.error(`[Klaviyo sync] ${clientId} campaign:`, err.message)
    results.campaign = { error: err.message }
  }
  // Flows: daily series, chunked into ≤60-day windows inside the lib.
  try {
    const index = await fetchFlowIndex(apiKey)
    const rows = await fetchFlowSeriesRows(apiKey, clientId, metricId, start, end, index, syncedAt)
    await upsert(rows)
    results.flow = { synced: rows.length }
  } catch (err) {
    console.error(`[Klaviyo sync] ${clientId} flow:`, err.message)
    results.flow = { error: err.message }
  }

  return Response.json({ ok: true, range: { start, end }, results })
}
