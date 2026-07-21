// Client-scoped schema graph — the ecom tables a CLIENT may see, parsed from
// db/schema.md. Row data is NOT served here; the client page reads rows with
// the user's own supabase session, so RLS tenant policies do the scoping.
// Gated: the signed-in user must reach the client (userCanAccessClient).

import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { userCanAccessClient } from '../../../../lib/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The client-safe ecom module tables (mirrors the agent's view of the world).
const CLIENT_TABLES = [
  'client_orders', 'client_order_items', 'client_skus', 'client_sku_bom',
  'client_materials', 'client_google_campaigns', 'client_google_ad_groups',
  'client_google_ads', 'client_meta_campaigns', 'client_klaviyo_campaigns',
  'client_daily_pnl', 'client_channel_daily_pnl', 'client_daily_metrics',
]

function parseSchema(md) {
  const lines = md.split('\n')
  const tables = []
  let cur = null
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = line.match(/^##\s+`([^`]+)`/)
    if (h) { cur = CLIENT_TABLES.includes(h[1]) ? { name: h[1], columns: [] } : null; if (cur) tables.push(cur); continue }
    if (!cur || line[0] !== '|') continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (cells.length < 5) continue
    const [col, type, nul, , key] = cells
    if (col === 'Column' || col.startsWith('---') || col === '') continue
    const c = { name: col, type, nullable: /^yes$/i.test(nul), key: '' }
    const flags = []
    if (/\bPK\b/.test(key)) flags.push('PK')
    const fk = key.match(/FK\s*[→>-]+\s*([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/)
    if (fk) { flags.push('FK'); c.ref = { table: fk[1], col: fk[2] } }
    c.key = flags.join('+')
    cur.columns.push(c)
  }
  return tables
}

export async function GET(request) {
  const clientId = new URL(request.url).searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await userCanAccessClient(user.id, clientId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const md = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.md'), 'utf8')
    const tables = parseSchema(md)
    const names = new Set(tables.map(t => t.name))
    const edges = []
    for (const t of tables) for (const c of t.columns) {
      if (c.ref && names.has(c.ref.table)) edges.push({ from: t.name, col: c.name, to: c.ref.table, toCol: c.ref.col })
    }
    // The DB declares almost no real FKs — the module joins on logical keys
    // (order_id, sku, campaign_id, business day). Curated edges so the schema
    // map shows how the tables actually relate; marked logical for the UI.
    const LOGICAL_EDGES = [
      ['client_order_items', 'order_id', 'client_orders', 'order_id'],
      ['client_sku_bom', 'parent_sku', 'client_skus', 'sku'],
      ['client_sku_bom', 'component', 'client_materials', 'name'],
      ['client_order_items', 'sku', 'client_skus', 'sku'],
      ['client_google_ad_groups', 'campaign_id', 'client_google_campaigns', 'campaign_id'],
      ['client_google_ads', 'ad_group_id', 'client_google_ad_groups', 'ad_group_id'],
      ['client_channel_daily_pnl', 'day', 'client_daily_pnl', 'date'],
      ['client_daily_metrics', 'date', 'client_daily_pnl', 'date'],
      ['client_orders', 'created_at', 'client_daily_pnl', 'date'],
      ['client_google_campaigns', 'date', 'client_daily_pnl', 'date'],
      ['client_meta_campaigns', 'date', 'client_daily_pnl', 'date'],
      ['client_klaviyo_campaigns', 'send_time', 'client_channel_daily_pnl', 'day'],
    ]
    const seen = new Set(edges.map(e => `${e.from}→${e.to}`))
    for (const [from, col, to, toCol] of LOGICAL_EDGES) {
      if (!names.has(from) || !names.has(to)) continue
      if (seen.has(`${from}→${to}`) || seen.has(`${to}→${from}`)) continue
      seen.add(`${from}→${to}`)
      edges.push({ from, col, to, toCol, logical: true })
    }
    return NextResponse.json({ tables, edges })
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
