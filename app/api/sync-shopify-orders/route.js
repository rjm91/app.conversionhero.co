export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { getShopifyConnection, getAllShopifyConnections, shopifyGraphQL } from '../../../lib/shopify'

// Pulls Shopify orders and writes them into client_lead so they appear on the
// Leads page and auto-route to the right campaign via the existing UTM→campaign
// match (fetchAttribution reads client_lead.utm_campaign).
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
      edges {
        node {
          id
          name
          createdAt
          email
          sourceName
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet { shopMoney { amount } }
          billingAddress { firstName lastName }
          shippingAddress { firstName lastName }
          shippingLine { title }
          lineItems(first: 50) { edges { node { title quantity } } }
          customerJourneySummary {
            lastVisit { utmParameters { campaign source medium content } }
          }
        }
      }
    }
  }
`

function isoDay(d) { return d.toISOString().slice(0, 10) }

// Map Shopify's raw sourceName to a friendly sales-channel label.
function channelLabel(sourceName) {
  if (!sourceName) return null
  const map = {
    web: 'Online Store',
    pos: 'Point of Sale',
    shopify_draft_order: 'Draft Order',
    'shopify_draft': 'Draft Order',
    iphone: 'Mobile',
    android: 'Mobile',
  }
  if (map[sourceName]) return map[sourceName]
  // Fallback: title-case the raw value
  return sourceName.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

async function syncOne(conn, start, end) {
  const db = admin()
  const q = `created_at:>=${start} created_at:<=${end}`
  const rows = []
  let cursor = null

  do {
    const data = await shopifyGraphQL(conn.shop_domain, conn.access_token, ORDERS_QUERY, { cursor, q })
    const orders = data.orders
    for (const { node } of orders.edges) {
      const utm = node.customerJourneySummary?.lastVisit?.utmParameters || {}
      const lineItems = node.lineItems.edges.map(e => e.node)
      const products = lineItems
        .map(li => li.title + (li.quantity > 1 ? ` ×${li.quantity}` : ''))
        .join(', ')
      const itemCount = lineItems.reduce((n, li) => n + (li.quantity || 0), 0)
      const numericId = node.id.split('/').pop()
      rows.push({
        lead_id:      `shopify_${numericId}`,                    // deterministic → re-sync upserts, no dupes
        client_id:    conn.client_id,
        first_name:   node.billingAddress?.firstName || node.shippingAddress?.firstName || null,
        last_name:    node.billingAddress?.lastName  || node.shippingAddress?.lastName  || null,
        email:        node.email || null,
        sale_amount:  node.totalPriceSet?.shopMoney?.amount ? Number(node.totalPriceSet.shopMoney.amount) : null,
        lead_status:  'Customer',
        ch_notes:     products ? `Shopify order ${node.name}: ${products}` : `Shopify order ${node.name}`,
        utm_campaign: utm.campaign || null,                      // = Google campaign ID → auto-routes
        utm_source:   utm.source || null,
        utm_medium:   utm.medium || null,
        utm_content:  utm.content || null,
        created_at:   node.createdAt,
        shopify_data: {                                          // ecom-only fields for the Shopify-style Contacts view
          order_name:         node.name,
          channel:            channelLabel(node.sourceName),
          financial_status:   node.displayFinancialStatus || null,
          fulfillment_status: node.displayFulfillmentStatus || null,
          item_count:         itemCount,
          delivery_method:    node.shippingLine?.title || null,
        },
      })
    }
    cursor = orders.pageInfo.hasNextPage ? orders.pageInfo.endCursor : null
  } while (cursor)

  if (rows.length) {
    const { error } = await db.from('client_lead').upsert(rows, { onConflict: 'lead_id' })
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
