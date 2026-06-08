export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { getShopifyAuthUrl, isValidShop } from '../../../../lib/shopify'

// Initiates the Shopify OAuth install/connect flow.
// Usage: /api/shopify/auth?shop=ek14hy-03.myshopify.com&client_id=ch069
// After the merchant approves, Shopify redirects to /api/shopify/callback.
//
// SETUP (one-time): in the Shopify dev dashboard → app → Configuration,
// the Redirect URL must include: https://app.conversionhero.co/api/shopify/callback
export async function GET(request) {
  const { origin, searchParams } = new URL(request.url)
  const shop     = searchParams.get('shop')
  const clientId = searchParams.get('client_id')

  if (!isValidShop(shop)) {
    return Response.json({ error: 'Invalid or missing shop (expected {store}.myshopify.com)' }, { status: 400 })
  }
  if (!clientId) {
    return Response.json({ error: 'Missing client_id' }, { status: 400 })
  }

  // client_id rides along in the OAuth state param so the callback can map the store to the client
  const callbackUrl = `${origin}/api/shopify/callback`
  return Response.redirect(getShopifyAuthUrl(shop, callbackUrl, clientId), 302)
}
