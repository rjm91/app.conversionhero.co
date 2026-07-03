export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { klaviyoKeyFor, getPlacedOrderMetricId, fetchCampaignIndex, fetchFlowIndex, fetchSeriesReport, seriesToRows } from '../../../lib/klaviyo'

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

  const results = {}
  for (const kind of ['campaign', 'flow']) {
    try {
      const index = kind === 'campaign' ? await fetchCampaignIndex(apiKey) : await fetchFlowIndex(apiKey)
      const report = await fetchSeriesReport(apiKey, kind, metricId, start, end)
      const rows = seriesToRows(clientId, kind, report, index, syncedAt)
      if (rows.length) {
        const { error } = await admin()
          .from('client_klaviyo_campaigns')
          .upsert(rows, { onConflict: 'client_id,campaign_id,date' })
        if (error) throw new Error(error.message)
      }
      results[kind] = { synced: rows.length }
    } catch (err) {
      console.error(`[Klaviyo sync] ${clientId} ${kind}:`, err.message)
      results[kind] = { error: err.message }
    }
  }

  return Response.json({ ok: true, range: { start, end }, results })
}
