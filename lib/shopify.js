import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Scopes requested during OAuth. read_orders unlocks orders + customer journey
// (UTM/campaign data); read_customer_events ensures the visit data comes through.
export const SHOPIFY_SCOPES = 'read_orders,read_customer_events'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// A valid Shopify store domain looks like {store}.myshopify.com
export function isValidShop(shop) {
  return typeof shop === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
}

// Build the OAuth consent URL. `state` carries the client_id so the callback
// knows which ConversionHero client this store belongs to.
export function getShopifyAuthUrl(shop, callbackUrl, state) {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY,
    scope: SHOPIFY_SCOPES,
    redirect_uri: callbackUrl,
    state,
  })
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

// Verify the HMAC Shopify appends to the callback query string. Computed over
// the raw query (hmac/signature removed, remaining pairs sorted, joined by '&').
export function verifyShopifyHmac(rawQuery) {
  const pairs = rawQuery.replace(/^\?/, '').split('&').filter(Boolean)
  let hmac = ''
  const kept = []
  for (const pair of pairs) {
    const key = pair.slice(0, pair.indexOf('='))
    if (key === 'hmac') { hmac = decodeURIComponent(pair.slice(pair.indexOf('=') + 1)); continue }
    if (key === 'signature') continue
    kept.push(pair)
  }
  if (!hmac) return false
  kept.sort()
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(kept.join('&'))
    .digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'))
  } catch {
    return false
  }
}

// Exchange the OAuth authorization code for a permanent access token.
export async function exchangeShopifyCode(shop, code) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`)
  }
  return res.json() // { access_token, scope }
}

// Upsert a client's Shopify connection (one row per client_id).
export async function saveShopifyConnection(clientId, shop, accessToken, scope) {
  const { error } = await admin()
    .from('shopify_connections')
    .upsert({
      client_id:    clientId,
      shop_domain:  shop,
      access_token: accessToken,
      scope,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'client_id' })
  if (error) throw new Error(error.message)
}

// Read a client's Shopify connection (used by the sync route).
export async function getShopifyConnection(clientId) {
  const { data } = await admin()
    .from('shopify_connections')
    .select('client_id, shop_domain, access_token, scope')
    .eq('client_id', clientId)
    .single()
  return data
}

// All connections (used by the cron to sync every connected client).
export async function getAllShopifyConnections() {
  const { data } = await admin()
    .from('shopify_connections')
    .select('client_id, shop_domain, access_token')
  return data || []
}

// Admin API version used for order pulls.
export const SHOPIFY_API_VERSION = '2025-04'

// Run a GraphQL query against a store's Admin API.
export async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error('Shopify GraphQL error: ' + JSON.stringify(json.errors))
  return json.data
}

// Look up a connection by its store domain (used by the webhook receiver).
export async function getShopifyConnectionByShop(shop) {
  const { data } = await admin()
    .from('shopify_connections')
    .select('client_id, shop_domain, access_token')
    .eq('shop_domain', shop)
    .single()
  return data
}

// Shared order field selection (bulk sync + webhook fetch the same shape).
export const ORDER_GQL_FIELDS = `
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
    firstVisit { utmParameters { campaign source medium content term } }
    lastVisit  { utmParameters { campaign source medium content term } }
  }
`

// Map Shopify's raw sourceName to a friendly sales-channel label.
export function channelLabel(sourceName) {
  if (!sourceName) return null
  const map = {
    web: 'Online Store',
    pos: 'Point of Sale',
    shopify_draft_order: 'Draft Order',
    shopify_draft: 'Draft Order',
    iphone: 'Mobile',
    android: 'Mobile',
  }
  if (map[sourceName]) return map[sourceName]
  return sourceName.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Map a Shopify order GraphQL node → a client_lead row. UTM IDs come from
// whichever visit (last preferred, first fallback) has them.
export function orderNodeToLeadRow(clientId, node) {
  const cjs   = node.customerJourneySummary || {}
  const first = cjs.firstVisit?.utmParameters || {}
  const last  = cjs.lastVisit?.utmParameters  || {}
  const utmPick = (k) => last[k] || first[k] || null
  const lineItems = (node.lineItems?.edges || []).map(e => e.node)
  const products  = lineItems.map(li => li.title + (li.quantity > 1 ? ` ×${li.quantity}` : '')).join(', ')
  const itemCount = lineItems.reduce((n, li) => n + (li.quantity || 0), 0)
  const numericId = String(node.id).split('/').pop()
  return {
    lead_id:      `shopify_${numericId}`,
    client_id:    clientId,
    first_name:   node.billingAddress?.firstName || node.shippingAddress?.firstName || null,
    last_name:    node.billingAddress?.lastName  || node.shippingAddress?.lastName  || null,
    email:        node.email || null,
    sale_amount:  node.totalPriceSet?.shopMoney?.amount ? Number(node.totalPriceSet.shopMoney.amount) : null,
    lead_status:  'Customer',
    ch_notes:     products ? `Shopify order ${node.name}: ${products}` : `Shopify order ${node.name}`,
    utm_campaign: utmPick('campaign'),
    utm_source:   utmPick('source'),
    utm_medium:   utmPick('medium'),
    utm_content:  utmPick('content'),
    utm_term:     utmPick('term'),
    created_at:   node.createdAt,
    shopify_data: {
      order_name:         node.name,
      channel:            channelLabel(node.sourceName),
      financial_status:   node.displayFinancialStatus || null,
      fulfillment_status: node.displayFulfillmentStatus || null,
      item_count:         itemCount,
      delivery_method:    node.shippingLine?.title || null,
      // Keep BOTH visits so channel attribution can detect a Google/Facebook
      // touch anywhere in the journey, even when the last click was email.
      first_utm: { source: first.source || null, medium: first.medium || null, campaign: first.campaign || null, content: first.content || null },
      last_utm:  { source: last.source  || null, medium: last.medium  || null, campaign: last.campaign  || null, content: last.content  || null },
    },
  }
}

// Fetch a single order's full data by its GID (used by the webhook).
export async function fetchShopifyOrder(conn, orderGid) {
  const query = `query($id: ID!) { order(id: $id) { ${ORDER_GQL_FIELDS} } }`
  const data = await shopifyGraphQL(conn.shop_domain, conn.access_token, query, { id: orderGid })
  return data.order
}

// Verify a Shopify webhook HMAC (base64 of HMAC-SHA256 over the raw body).
export function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!hmacHeader) return false
  const digest = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(rawBody, 'utf8').digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))
  } catch {
    return false
  }
}
