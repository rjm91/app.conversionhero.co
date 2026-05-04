import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function readRefreshToken() {
  const { data, error } = await db()
    .from('google_ads_tokens')
    .select('refresh_token')
    .eq('id', 1)
    .single()
  if (error && error.code !== 'PGRST116') {
    // PGRST116 = row not found — expected on empty table, not an error
    console.error('[Google Ads] DB read error:', JSON.stringify(error))
  }
  console.log(`[Google Ads] Refresh token source: ${data?.refresh_token ? 'db' : 'env'}`)
  return data?.refresh_token || process.env.GOOGLE_ADS_REFRESH_TOKEN
}

async function writeRefreshToken(token) {
  const { error } = await db()
    .from('google_ads_tokens')
    .upsert({ id: 1, refresh_token: token, updated_at: new Date().toISOString() })
  if (error) {
    // Do NOT silently swallow this — a lost rotated token causes the next sync to fail with 401
    console.error('[Google Ads] CRITICAL: Failed to persist refresh token to DB:', JSON.stringify(error))
    throw new Error('Failed to save Google Ads refresh token to DB: ' + JSON.stringify(error))
  }
}

export async function getGoogleAdsAccessToken() {
  const refreshToken = await readRefreshToken()
  if (!refreshToken) {
    throw new Error(
      '[Google Ads OAuth] No refresh token found in DB or env var. ' +
      'Click "Reconnect Google Ads" in the UI or run: node scripts/get-google-refresh-token.js'
    )
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
    const isExpired = text.includes('invalid_grant') || text.includes('Token has been expired or revoked')
    if (isExpired) {
      throw new Error(
        '[Google Ads OAuth] Refresh token expired or revoked. ' +
        'Click "Reconnect Google Ads" in the UI or run: node scripts/get-google-refresh-token.js'
      )
    }
    throw new Error(`[Google Ads OAuth] Token exchange failed (HTTP ${res.status}): ${text}`)
  }

  // Persist rotated refresh token if Google issued a new one
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    console.log('[Google Ads] Refresh token rotated — saving new token to DB')
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
    has_db_token:     !!data?.refresh_token,
    db_token_preview: data?.refresh_token
      ? data.refresh_token.slice(0, 8) + '...' + data.refresh_token.slice(-4)
      : null,
    db_updated_at:    data?.updated_at || null,
    has_env_fallback: !!process.env.GOOGLE_ADS_REFRESH_TOKEN,
  }
}

// ─── In-app OAuth re-auth ─────────────────────────────────────────────────────
// callbackUrl must be registered in Google Cloud Console → OAuth credentials
// → Authorized redirect URIs (e.g. https://app.conversionhero.co/api/google-ads/callback)

export function getGoogleAdsAuthUrl(callbackUrl, returnTo) {
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id:     process.env.GOOGLE_ADS_CLIENT_ID,
    redirect_uri:  callbackUrl, // must match Google Cloud Console exactly — no query string
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/adwords',
    access_type:   'offline',
    prompt:        'consent', // always force consent so we always receive a refresh_token
    state:         returnTo || '/', // carry return_to through the flow without touching redirect_uri
  }).toString()
}

export async function exchangeCodeForGoogleAdsToken(code, callbackUrl) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  callbackUrl,
    }),
  })

  const data = await res.json()

  if (!data.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. ' +
      'Make sure the OAuth app is Published (not Testing) in Google Cloud Console. ' +
      'Response: ' + JSON.stringify(data)
    )
  }

  await writeRefreshToken(data.refresh_token)
  return data.refresh_token
}
