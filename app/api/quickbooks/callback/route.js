import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code    = searchParams.get('code')
  const realmId = searchParams.get('realmId')

  if (!code || !realmId) {
    return NextResponse.redirect(new URL('/control?qb=error', request.url))
  }

  const credentials = Buffer.from(
    `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept:         'application/json',
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: process.env.QB_REDIRECT_URI,
    }),
  })

  const tokens = await tokenRes.json()
  if (!tokens.access_token) {
    return NextResponse.redirect(new URL('/control?qb=error', request.url))
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await db().from('qb_tokens').upsert({
    realm_id:                realmId,
    access_token:            tokens.access_token,
    refresh_token:           tokens.refresh_token,
    access_token_expires_at: expiresAt,
    updated_at:              new Date().toISOString(),
  }, { onConflict: 'realm_id' })

  // Trigger immediate sync in background so data is fresh right away
  const origin = new URL(request.url).origin
  fetch(`${origin}/api/cron/sync-payments`).catch(() => {})

  return NextResponse.redirect(new URL('/control/payments', request.url))
}
