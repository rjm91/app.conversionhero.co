export const dynamic = 'force-dynamic'

import { getGoogleAdsAuthUrl } from '../../../../lib/google-ads'

// Initiates the Google Ads OAuth re-auth flow.
// Usage: link the user to /api/google-ads/auth?return_to=/control/ch014/youtube-ads
// After Google approval, they land back at the return_to URL.
//
// SETUP REQUIRED (one-time):
//   In Google Cloud Console → APIs & Services → Credentials → your OAuth client
//   → Authorized redirect URIs → add:
//     https://app.conversionhero.co/api/google-ads/callback
export async function GET(request) {
  const { origin, searchParams } = new URL(request.url)
  const returnTo = searchParams.get('return_to') || '/'
  // redirect_uri must match Google Cloud Console exactly (no query string)
  // pass return_to via OAuth state param instead
  const callbackUrl = `${origin}/api/google-ads/callback`
  const authUrl = getGoogleAdsAuthUrl(callbackUrl, returnTo)
  return Response.redirect(authUrl, 302)
}
