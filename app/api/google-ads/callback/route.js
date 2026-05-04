export const dynamic = 'force-dynamic'

import { exchangeCodeForGoogleAdsToken } from '../../../../lib/google-ads'

// Handles the OAuth callback from Google after the user authorizes the app.
// Exchanges the code for a refresh token and persists it to google_ads_tokens table.
export async function GET(request) {
  const { origin, searchParams } = new URL(request.url)
  const code     = searchParams.get('code')
  const error    = searchParams.get('error')
  const returnTo = searchParams.get('return_to') || '/'

  if (error) {
    const msg = encodeURIComponent(`Google Ads auth cancelled: ${error}`)
    return Response.redirect(`${origin}${returnTo}?google_ads_error=${msg}`, 302)
  }

  if (!code) {
    return Response.json({ error: 'No authorization code in callback' }, { status: 400 })
  }

  try {
    // The callbackUrl passed here must exactly match what was used in /auth
    const callbackUrl = `${origin}/api/google-ads/callback?return_to=${encodeURIComponent(returnTo)}`
    await exchangeCodeForGoogleAdsToken(code, callbackUrl)
    return Response.redirect(`${origin}${returnTo}?google_ads_connected=1`, 302)
  } catch (err) {
    console.error('[Google Ads callback] Error:', err.message)
    const msg = encodeURIComponent('Google Ads reconnect failed: ' + err.message)
    return Response.redirect(`${origin}${returnTo}?google_ads_error=${msg}`, 302)
  }
}
