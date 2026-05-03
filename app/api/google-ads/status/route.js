export const dynamic = 'force-dynamic'

import { getGoogleAdsAccessToken, getGoogleAdsTokenStatus } from '../../../../lib/google-ads'

export async function GET() {
  const status = await getGoogleAdsTokenStatus()

  let access_token_ok = false
  let access_token_error = null
  try {
    const token = await getGoogleAdsAccessToken()
    access_token_ok = !!token
  } catch (err) {
    access_token_error = err.message
  }

  return Response.json({
    ...status,
    access_token_ok,
    access_token_error,
    env: {
      client_id:        !!process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret:    !!process.env.GOOGLE_ADS_CLIENT_SECRET,
      developer_token:  !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      manager_id:       !!process.env.GOOGLE_ADS_MANAGER_ID,
    },
  })
}
