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
