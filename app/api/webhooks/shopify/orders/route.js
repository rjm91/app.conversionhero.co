export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import {
  verifyShopifyWebhook,
  getShopifyConnectionByShop,
  fetchShopifyOrder,
  orderNodeToOrderRow,
} from '../../../../../lib/shopify'

// Receives Shopify orders/create + orders/updated webhooks for real-time
// attribution. The webhook payload doesn't include the customer-journey UTM
// data, so we use it as a trigger: verify the signature, then fetch that one
// order's full data (incl. customerJourneySummary) via GraphQL and upsert it
// into client_orders — same shape as the bulk sync.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function POST(request) {
  // Must read the RAW body to verify the HMAC.
  const rawBody = await request.text()
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const shop = request.headers.get('x-shopify-shop-domain')

  if (!verifyShopifyWebhook(rawBody, hmac)) {
    return new Response('Invalid signature', { status: 401 })
  }

  // Map the store → ConversionHero client. If we don't manage this shop, ack
  // with 200 so Shopify doesn't keep retrying.
  const conn = await getShopifyConnectionByShop(shop)
  if (!conn) return new Response('No connection for shop', { status: 200 })

  try {
    const payload = JSON.parse(rawBody)
    const orderGid = payload.admin_graphql_api_id || (payload.id ? `gid://shopify/Order/${payload.id}` : null)
    if (!orderGid) return new Response('No order id', { status: 200 })

    const node = await fetchShopifyOrder(conn, orderGid)
    if (!node) return new Response('Order not found', { status: 200 })

    const row = orderNodeToOrderRow(conn.client_id, node)
    const { error } = await admin().from('client_orders').upsert(row, { onConflict: 'order_id' })
    if (error) throw new Error(error.message)

    return new Response('ok', { status: 200 })
  } catch (err) {
    // Non-200 → Shopify retries (transient GraphQL/DB errors).
    console.error('[Shopify webhook] Error:', err.message)
    return new Response('Error: ' + err.message, { status: 500 })
  }
}
