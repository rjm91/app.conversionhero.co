import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function readRefreshToken() {
  const { data } = await db()
    .from('google_ads_tokens')
    .select('refresh_token')
    .eq('id', 1)
    .single()
  return data?.refresh_token || process.env.GOOGLE_ADS_REFRESH_TOKEN
}

async function writeRefreshToken(token) {
  await db()
    .from('google_ads_tokens')
    .upsert({ id: 1, refresh_token: token, updated_at: new Date().toISOString() })
}

export async function getGoogleAdsAccessToken() {
  const refreshToken = await readRefreshToken()
  if (!refreshToken) {
    throw new Error('[Google Ads OAuth] No refresh token in google_ads_tokens table or GOOGLE_ADS_REFRESH_TOKEN env var. Run: node scripts/get-google-refresh-token.js')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })

  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }

  if (!data?.access_token) {
    const expired = text.includes('invalid_grant') || text.includes('Token has been expired or revoked')
    if (expired) {
      throw new Error('[Google Ads OAuth] Refresh token expired or revoked. Run: node scripts/get-google-refresh-token.js then POST the new token to /api/google-ads/seed')
    }
    throw new Error(`[Google Ads OAuth] HTTP ${res.status}: ${text}`)
  }

  // Persist rotated refresh token if Google issued a new one
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await writeRefreshToken(data.refresh_token)
  }

  return data.access_token
}

export async function setGoogleAdsRefreshToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Invalid refresh token')
  await writeRefreshToken(token)
}

export async function getGoogleAdsTokenStatus() {
  const { data } = await db()
    .from('google_ads_tokens')
    .select('updated_at, refresh_token')
    .eq('id', 1)
    .single()
  return {
    has_db_token: !!data?.refresh_token,
    db_token_preview: data?.refresh_token ? data.refresh_token.slice(0, 8) + '...' + data.refresh_token.slice(-4) : null,
    db_updated_at: data?.updated_at || null,
    has_env_fallback: !!process.env.GOOGLE_ADS_REFRESH_TOKEN,
  }
}
