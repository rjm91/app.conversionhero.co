export const dynamic = 'force-dynamic'

import { getGoogleAdsAccessToken, getGoogleAdsTokenStatus } from '../../../../lib/google-ads'

export async function GET() {
  const status = await getGoogleAdsTokenStatus()

  // Step 1: test OAuth exchange
  let access_token_ok = false
  let access_token_error = null
  let accessToken = null
  try {
    accessToken = await getGoogleAdsAccessToken()
    access_token_ok = !!accessToken
  } catch (err) {
    access_token_error = err.message
  }

  // Step 2: test actual Google Ads API with the access token
  // listAccessibleCustomers requires no customer/manager ID — pure auth test
  let ads_api_ok = false
  let ads_api_error = null
  let accessible_customers = null
  if (accessToken) {
    try {
      const versions = ['v20', 'v19', 'v18']
      for (const v of versions) {
        const res = await fetch(
          `https://googleads.googleapis.com/${v}/customers:listAccessibleCustomers`,
          {
            headers: {
              'Authorization':   `Bearer ${accessToken}`,
              'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
            },
          }
        )
        const text = await res.text()
        let data
        try { data = JSON.parse(text) } catch { data = null }
        if (res.ok) {
          ads_api_ok = true
          accessible_customers = data?.resourceNames || []
          break
        }
        if (res.status !== 404) {
          ads_api_error = `HTTP ${res.status} (${v}): ${text.slice(0, 500)}`
          break
        }
      }
    } catch (err) {
      ads_api_error = err.message
    }
  }

  return Response.json({
    ...status,
    access_token_ok,
    access_token_error,
    ads_api_ok,
    ads_api_error,
    accessible_customers,
    env: {
      client_id:       !!process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret:   !!process.env.GOOGLE_ADS_CLIENT_SECRET,
      developer_token: !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      manager_id:      !!process.env.GOOGLE_ADS_MANAGER_ID,
      manager_id_val:  process.env.GOOGLE_ADS_MANAGER_ID, // show actual value to check format
    },
  })
}
