export const dynamic = 'force-dynamic'

import { setGoogleAdsRefreshToken } from '../../../../lib/google-ads'

// One-time seed endpoint. Protected by SEED_SECRET to prevent abuse.
// Usage:
//   curl -X POST https://app.conversionhero.co/api/google-ads/seed \
//     -H "Content-Type: application/json" \
//     -d '{"secret":"<SEED_SECRET>","refresh_token":"<token>"}'
export async function POST(request) {
  try {
    const { secret, refresh_token } = await request.json()

    if (!process.env.SEED_SECRET) {
      return Response.json({ error: 'SEED_SECRET env var not set' }, { status: 500 })
    }
    if (secret !== process.env.SEED_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!refresh_token || typeof refresh_token !== 'string') {
      return Response.json({ error: 'refresh_token required' }, { status: 400 })
    }

    await setGoogleAdsRefreshToken(refresh_token)

    return Response.json({ success: true, message: 'Refresh token saved to google_ads_tokens' })
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
