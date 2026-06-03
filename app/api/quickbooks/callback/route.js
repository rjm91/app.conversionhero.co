import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function fail(request, msg) {
  const url = new URL('/control/payments', request.url)
  url.searchParams.set('qb', 'error')
  url.searchParams.set('msg', String(msg).slice(0, 300))
  return NextResponse.redirect(url)
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const code    = searchParams.get('code')
    const realmId = searchParams.get('realmId')
    const oauthErr = searchParams.get('error')

    if (oauthErr) return fail(request, `Intuit returned: ${oauthErr}`)
    if (!code || !realmId) return fail(request, 'Missing code or realmId from Intuit')

    if (!process.env.QB_CLIENT_ID || !process.env.QB_CLIENT_SECRET || !process.env.QB_REDIRECT_URI) {
      return fail(request, 'Server missing QB_CLIENT_ID / QB_CLIENT_SECRET / QB_REDIRECT_URI')
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

    const tokens = await tokenRes.json().catch(() => ({}))
    if (!tokens.access_token) {
      // Surface Intuit's real reason (e.g. invalid_grant, redirect_uri mismatch)
      const reason = tokens.error_description || tokens.error || `HTTP ${tokenRes.status}`
      return fail(request, `Token exchange failed: ${reason}`)
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    const sb = db()

    const { error: dbErr } = await sb.from('qb_tokens').upsert({
      realm_id:                realmId,
      access_token:            tokens.access_token,
      refresh_token:           tokens.refresh_token,
      access_token_expires_at: expiresAt,
      updated_at:              new Date().toISOString(),
    }, { onConflict: 'realm_id' })

    if (dbErr) return fail(request, `Saving token failed: ${dbErr.message}`)

    // Verify it actually persisted (write succeeded but row missing => silent issue)
    const { data: check, error: checkErr } = await sb.from('qb_tokens').select('realm_id').eq('realm_id', realmId)
    if (checkErr) return fail(request, `Readback failed: ${checkErr.message}`)
    if (!check || check.length === 0) return fail(request, `Wrote token but readback found 0 rows (realm …${String(realmId).slice(-4)})`)

    // Fire-and-forget: refresh synced data (never block the redirect)
    const origin = new URL(request.url).origin
    fetch(`${origin}/api/cron/sync-payments`).catch(() => {})

    const ok = new URL('/control/payments', request.url)
    ok.searchParams.set('qb', 'connected')
    return NextResponse.redirect(ok)
  } catch (err) {
    return fail(request, err?.message || 'Unexpected callback error')
  }
}
