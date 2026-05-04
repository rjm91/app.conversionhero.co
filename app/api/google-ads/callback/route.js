export const dynamic = 'force-dynamic'

import { exchangeCodeForGoogleAdsToken } from '../../../../lib/google-ads'

// Handles the OAuth callback from Google after the user authorizes the app.
// Exchanges the code for a refresh token and persists it to google_ads_tokens table.
export async function GET(request) {
  const { origin, searchParams } = new URL(request.url)
  const code     = searchParams.get('code')
  const error    = searchParams.get('error')
  // return_to is passed via OAuth state param (not in redirect_uri) to avoid redirect_uri_mismatch
  const returnTo = searchParams.get('state') || '/'

  if (error) {
    const msg = encodeURIComponent(`Google Ads auth cancelled: ${error}`)
    return Response.redirect(`${origin}${returnTo}?google_ads_error=${msg}`, 302)
  }

  if (!code) {
    return Response.json({ error: 'No authorization code in callback' }, { status: 400 })
  }

  try {
    // redirect_uri must exactly match what's registered in Google Cloud Console (no query string)
    const callbackUrl = `${origin}/api/google-ads/callback`
    await exchangeCodeForGoogleAdsToken(code, callbackUrl)
    return Response.redirect(`${origin}${returnTo}?google_ads_connected=1`, 302)
  } catch (err) {
    console.error('[Google Ads callback] Error:', err.message)
    const msg = encodeURIComponent('Google Ads reconnect failed: ' + err.message)
    return Response.redirect(`${origin}${returnTo}?google_ads_error=${msg}`, 302)
  }
}
