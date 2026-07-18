export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { getShopifyConnection, getAllShopifyConnections, shopifyGraphQL, ORDER_GQL_FIELDS, orderNodeToOrderRow, orderNodeToItems } from '../../../lib/shopify'

// Pulls Shopify orders and writes them into client_orders so they appear on
// the Customers page and auto-route to the right campaign via the existing
// UTM→campaign match (fetchAttribution reads client_orders.utm_campaign).
//
// Usage:
//   /api/sync-shopify-orders?client_id=ch069                 (one client)
//   /api/sync-shopify-orders?client_id=ch069&start=2026-06-01&end=2026-06-08
//   /api/sync-shopify-orders                                  (all connected clients — cron)

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

const ORDERS_QUERY = `
  query Orders($cursor: String, $q: String) {
    orders(first: 50, after: $cursor, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${ORDER_GQL_FIELDS} } }
    }
  }
`

function isoDay(d) { return d.toISOString().slice(0, 10) }

async function syncOne(conn, start, end) {
  const db = admin()
  const q = `created_at:>=${start} created_at:<=${end}`
  const rows = []
  const items = []
  let cursor = null

  do {
    const data = await shopifyGraphQL(conn.shop_domain, conn.access_token, ORDERS_QUERY, { cursor, q })
    const orders = data.orders
    for (const { node } of orders.edges) {
      rows.push(orderNodeToOrderRow(conn.client_id, node))
      items.push(...orderNodeToItems(conn.client_id, node))
    }
    cursor = orders.pageInfo.hasNextPage ? orders.pageInfo.endCursor : null
  } while (cursor)

  if (rows.length) {
    const { error } = await db.from('client_orders').upsert(rows, { onConflict: 'order_id' })
    if (error) throw new Error(error.message)
    // Replace line items for the synced orders (webhooks/syncs can re-deliver
    // an order after edits — items must reflect the latest state).
    const ids = rows.map(r => r.order_id)
    for (let i = 0; i < ids.length; i += 200) {
      const { error: de } = await db.from('client_order_items').delete().in('order_id', ids.slice(i, i + 200))
      if (de) throw new Error(de.message)
    }
    for (let i = 0; i < items.length; i += 500) {
      const { error: ie } = await db.from('client_order_items').insert(items.slice(i, i + 500))
      if (ie) throw new Error(ie.message)
    }
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
    const conn = await getShopifyConnection(clientId)
    if (!conn) return Response.json({ error: `No Shopify connection for ${clientId}` }, { status: 404 })
    connections = [conn]
  } else {
    connections = await getAllShopifyConnections()
  }

  const results = []
  for (const conn of connections) {
    try {
      const synced = await syncOne(conn, start, end)
      results.push({ client_id: conn.client_id, synced })
    } catch (err) {
      console.error(`[Shopify sync] ${conn.client_id}:`, err.message)
      results.push({ client_id: conn.client_id, error: err.message })
    }
  }

  return Response.json({ ok: true, range: { start, end }, results })
}
