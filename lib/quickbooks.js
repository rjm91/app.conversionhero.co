import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const QB_BASE = `https://quickbooks.api.intuit.com/v3/company/${process.env.QB_REALM_ID}`

async function refreshToken(stored) {
  const credentials = Buffer.from(
    `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
    }),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error('QB token refresh failed: ' + JSON.stringify(data))

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  await db().from('qb_tokens').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token || stored.refresh_token,
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('realm_id', process.env.QB_REALM_ID)

  return data.access_token
}

export async function getQBAccessToken() {
  const { data, error } = await db()
    .from('qb_tokens')
    .select('*')
    .eq('realm_id', process.env.QB_REALM_ID)
    .single()

  if (error || !data) throw new Error('QuickBooks not connected')

  // Refresh if expiring within 5 minutes
  if (new Date(data.access_token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    return refreshToken(data)
  }

  return data.access_token
}

export async function qbQuery(sql) {
  const token = await getQBAccessToken()
  const res = await fetch(
    `${QB_BASE}/query?query=${encodeURIComponent(sql)}&minorversion=65`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QB API ${res.status}: ${text}`)
  }
  return res.json()
}

export async function isQBConnected() {
  const { data } = await db()
    .from('qb_tokens')
    .select('realm_id')
    .eq('realm_id', process.env.QB_REALM_ID)
    .single()
  return !!data
}
