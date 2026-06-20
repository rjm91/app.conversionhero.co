export const dynamic = 'force-dynamic'

import crypto from 'crypto'
import https from 'https'
import { createClient } from '@supabase/supabase-js'
import { getGoogleAdsAccessToken, getGoogleAdsTokenStatus } from '../../../../lib/google-ads'

// POST via Node's raw https module — bypasses Next.js's patched global fetch.
function rawHttpsPost(host, path, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, text: data }))
    })
    req.on('error', reject); req.write(body); req.end()
  })
}

const fp = (v) => v ? { len: v.length, sha: crypto.createHash('sha256').update(v).digest('hex').slice(0, 12) } : null

// TEMP: raw OAuth exchange so we can see exactly what Google returns on this runtime.
async function rawExchange() {
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data } = await db.from('google_ads_tokens').select('refresh_token').eq('id', 1).single()
    const refresh = data?.refresh_token || process.env.GOOGLE_ADS_REFRESH_TOKEN
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_ADS_CLIENT_ID, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
    })
    const text = await res.text()
    let j = null; try { j = JSON.parse(text) } catch {}
    const at = j?.access_token || ''
    return {
      refresh_fp: fp(refresh),
      http: res.status,
      keys: j ? Object.keys(j) : null,
      token_type: j?.token_type, scope: j?.scope, expires_in: j?.expires_in,
      at_prefix: at.slice(0, 6), at_len: at.length, at_fp: fp(at),
      oauth_error: j?.error || null, raw_first120: text.slice(0, 120),
    }
  } catch (e) { return { exception: e.message } }
}

export async function GET(request) {
  // TEMP: if a caller supplies an externally-minted token, test it from Vercel's egress.
  const injected = request.headers.get('x-test-token')
  if (injected) {
    const out = { injected: true, len: injected.length }
    try {
      const ti = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(injected))
      out.tokeninfo = { http: ti.status, ...(await ti.json()) }
      out.tokeninfo.scope_ok = out.tokeninfo.scope?.includes('adwords')
    } catch (e) { out.tokeninfo = { fetch_error: e.message } }
    try {
      const la = await fetch('https://googleads.googleapis.com/v21/customers:listAccessibleCustomers', {
        headers: { Authorization: `Bearer ${injected}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN },
      })
      out.ads_api = { http: la.status, body: (await la.text()).slice(0, 200) }
    } catch (e) { out.ads_api = { fetch_error: e.message } }
    return Response.json(out)
  }

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

  // TEMP DIAGNOSTIC — does Vercel's egress reach googleapis & present this token OK?
  let tokeninfo = null
  if (accessToken) {
    try {
      const ti = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken))
      const j = await ti.json()
      tokeninfo = { http: ti.status, aud_fp: fp(j.aud || ''), scope: j.scope, exp_in: j.expires_in, error: j.error || null }
    } catch (e) { tokeninfo = { fetch_error: e.message } }
  }

  // Step 2: test actual Google Ads API with the access token
  // listAccessibleCustomers requires no customer/manager ID — pure auth test
  let ads_api_ok = false
  let ads_api_error = null
  let accessible_customers = null
  if (accessToken) {
    try {
      const versions = ['v21', 'v22']
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
        const deprecated = /UNSUPPORTED_VERSION|deprecated/i.test(text || '')
        if (res.status !== 404 && !deprecated) {
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
    // TEMP DIAGNOSTIC — runtime fingerprints (irreversible hashes, no secrets). Remove after debug.
    diag: {
      runtime_node: process.version,
      developer_token: fp(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
      client_id:       fp(process.env.GOOGLE_ADS_CLIENT_ID),
      client_secret:   fp(process.env.GOOGLE_ADS_CLIENT_SECRET),
      manager_id:      fp(process.env.GOOGLE_ADS_MANAGER_ID),
      access_token_len: accessToken ? accessToken.length : 0,
      tokeninfo,
      raw_exchange: await rawExchange(),
      nostore_mint: await (async () => {
        try {
          const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
          const { data } = await db.from('google_ads_tokens').select('refresh_token').eq('id', 1).single()
          const refresh = data?.refresh_token || process.env.GOOGLE_ADS_REFRESH_TOKEN
          const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: process.env.GOOGLE_ADS_CLIENT_ID, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
          })
          const at = (await res.json()).access_token || ''
          const tj = await (await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(at))).json()
          return { mint_http: res.status, at_len: at.length, valid: !tj.error, error: tj.error || null }
        } catch (e) { return { exception: e.message } }
      })(),
      unpatched_mint: await (async () => {
        try {
          const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
          const { data } = await db.from('google_ads_tokens').select('refresh_token').eq('id', 1).single()
          const refresh = data?.refresh_token || process.env.GOOGLE_ADS_REFRESH_TOKEN
          const body = new URLSearchParams({ client_id: process.env.GOOGLE_ADS_CLIENT_ID, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }).toString()
          const r = await rawHttpsPost('oauth2.googleapis.com', '/token', body)
          const at = (JSON.parse(r.text).access_token) || ''
          // validate the unpatched-minted token (also via raw https GET would be ideal, but use global fetch GET which works for usage)
          const ti = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(at))
          const tj = await ti.json()
          return { mint_http: r.status, at_prefix: at.slice(0, 12), at_len: at.length, tokeninfo_http: ti.status, valid: !tj.error, error: tj.error || null }
        } catch (e) { return { exception: e.message } }
      })(),
    },
  })
}
