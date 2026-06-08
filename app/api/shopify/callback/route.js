export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { verifyShopifyHmac, exchangeShopifyCode, saveShopifyConnection, isValidShop } from '../../../../lib/shopify'

// Handles the OAuth callback from Shopify after the merchant approves.
// Verifies the HMAC, exchanges the code for an access token, and persists the
// connection to shopify_connections keyed by client_id (passed via state).
export async function GET(request) {
  const url        = new URL(request.url)
  const { origin } = url
  const shop       = url.searchParams.get('shop')
  const code       = url.searchParams.get('code')
  const clientId   = url.searchParams.get('state')   // we set state = client_id in /auth
  const returnTo   = clientId ? `/control/${clientId}/paid-ads` : '/'

  if (!isValidShop(shop)) {
    return Response.json({ error: 'Invalid shop' }, { status: 400 })
  }
  if (!verifyShopifyHmac(url.search)) {
    const msg = encodeURIComponent('Shopify connect failed: HMAC verification failed')
    return Response.redirect(`${origin}${returnTo}?shopify_error=${msg}`, 302)
  }
  if (!code) {
    return Response.json({ error: 'No authorization code in callback' }, { status: 400 })
  }

  try {
    const { access_token, scope } = await exchangeShopifyCode(shop, code)
    await saveShopifyConnection(clientId, shop, access_token, scope)
    return Response.redirect(`${origin}${returnTo}?shopify_connected=1`, 302)
  } catch (err) {
    console.error('[Shopify callback] Error:', err.message)
    const msg = encodeURIComponent('Shopify connect failed: ' + err.message)
    return Response.redirect(`${origin}${returnTo}?shopify_error=${msg}`, 302)
  }
}
