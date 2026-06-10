export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { getShopifyConnection, getAllShopifyConnections, shopifyGraphQL } from '../../../../lib/shopify'

// Registers the orders/create + orders/updated webhooks on a client's store so
// new orders flow in real-time to /api/webhooks/shopify/orders.
//
// Usage:
//   /api/shopify/register-webhooks?client_id=ch069   (one client)
//   /api/shopify/register-webhooks                    (all connected clients)

const TOPICS = ['ORDERS_CREATE', 'ORDERS_UPDATED']

const MUTATION = `
  mutation Create($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`

async function registerFor(conn, callbackUrl) {
  const results = []
  for (const topic of TOPICS) {
    try {
      const data = await shopifyGraphQL(conn.shop_domain, conn.access_token, MUTATION, {
        topic,
        sub: { callbackUrl, format: 'JSON' },
      })
      const res = data.webhookSubscriptionCreate
      results.push({
        topic,
        id: res.webhookSubscription?.id || null,
        errors: res.userErrors?.length ? res.userErrors.map(e => e.message) : null,
      })
    } catch (err) {
      results.push({ topic, error: err.message })
    }
  }
  return results
}

export async function GET(request) {
  const { origin, searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const callbackUrl = `${origin}/api/webhooks/shopify/orders`

  let connections
  if (clientId) {
    const conn = await getShopifyConnection(clientId)
    if (!conn) return Response.json({ error: `No Shopify connection for ${clientId}` }, { status: 404 })
    connections = [conn]
  } else {
    connections = await getAllShopifyConnections()
  }

  const out = []
  for (const conn of connections) {
    out.push({ client_id: conn.client_id, shop: conn.shop_domain, registered: await registerFor(conn, callbackUrl) })
  }
  return Response.json({ ok: true, callbackUrl, results: out })
}
