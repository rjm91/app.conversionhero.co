export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { getMetaConnection, getAllMetaConnections, fetchMetaCampaignInsights, metaInsightToRow } from '../../../lib/meta'

// Pulls Meta (Facebook) campaign spend into client_meta_campaigns.
//   /api/sync-meta-ads?client_id=ch069                          (one client)
//   /api/sync-meta-ads?client_id=ch069&start=2026-05-01&end=2026-06-12
//   /api/sync-meta-ads                                           (all connected — cron)

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

function isoDay(d) { return d.toISOString().slice(0, 10) }

async function syncOne(conn, start, end) {
  const insights = await fetchMetaCampaignInsights(conn, start, end)
  const rows = insights.map(r => metaInsightToRow(conn.client_id, r))
  if (rows.length) {
    const { error } = await admin()
      .from('client_meta_campaigns')
      .upsert(rows, { onConflict: 'client_id,campaign_id,date' })
    if (error) throw new Error(error.message)
  }
  return rows.length
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const end   = searchParams.get('end')   || isoDay(new Date())
  const start = searchParams.get('start') || isoDay(new Date(Date.now() - 30 * 864e5))

  let connections
  if (clientId) {
    const conn = await getMetaConnection(clientId)
    if (!conn) return Response.json({ error: `No Meta connection for ${clientId}` }, { status: 404 })
    connections = [conn]
  } else {
    connections = await getAllMetaConnections()
  }

  const results = []
  for (const conn of connections) {
    try {
      results.push({ client_id: conn.client_id, synced: await syncOne(conn, start, end) })
    } catch (err) {
      console.error(`[Meta sync] ${conn.client_id}:`, err.message)
      results.push({ client_id: conn.client_id, error: err.message })
    }
  }
  return Response.json({ ok: true, range: { start, end }, results })
}
