export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { getGoogleAdsAccessToken } from '../../../lib/google-ads'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

const META_STATUS = { 1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending risk review', 8: 'Pending settlement', 9: 'In grace period', 100: 'Pending closure', 101: 'Closed' }
const META_REASON = { 1: 'ads policy violation', 2: 'IP review', 3: 'payment risk', 4: 'account shut down', 5: 'AFC review', 6: 'business integrity review', 7: 'permanently closed', 8: 'unused reseller account', 9: 'unused account' }

async function metaHealth(db, clientId) {
  const { data: c } = await db.from('meta_connections').select('ad_account_id, access_token, app_secret').eq('client_id', clientId).single()
  if (!c) return { connected: false }
  try {
    const id = String(c.ad_account_id).replace(/\D/g, '')
    const params = new URLSearchParams({ fields: 'name,account_status,disable_reason', access_token: c.access_token })
    if (c.app_secret) params.set('appsecret_proof', crypto.createHmac('sha256', c.app_secret).update(c.access_token).digest('hex'))
    const res = await fetch(`https://graph.facebook.com/v21.0/act_${id}?${params}`)
    const j = await res.json()
    if (j.error) {
      if (j.error.code === 190) return { connected: true, ok: false, status: 'Disabled', detail: 'Meta access token is invalid or removed — this commonly happens when the ad account or business gets disabled. Reconnect Meta.' }
      return { connected: true, ok: false, status: 'Error', detail: j.error.message }
    }
    if (j.account_status !== 1) {
      const st = META_STATUS[j.account_status] || `status ${j.account_status}`
      const reason = META_REASON[j.disable_reason]
      return { connected: true, ok: false, status: st, detail: `Meta ad account is ${st}${reason ? ` (${reason})` : ''}.` }
    }
    return { connected: true, ok: true, status: 'Active', name: j.name }
  } catch (e) { return { connected: true, ok: false, status: 'Error', detail: e.message } }
}

async function googleHealth(db, clientId) {
  const { data } = await db.from('client_google_ads_account').select('customer_id, login_customer_id').eq('client_id', clientId).limit(1)
  const acct = (data || [])[0]
  if (!acct) return { connected: false }
  try {
    const token = await getGoogleAdsAccessToken()
    const query = 'SELECT customer.status, customer.descriptive_name FROM customer'
    let lastErr = ''
    for (const v of ['v21', 'v22']) {
      const res = await fetch(`https://googleads.googleapis.com/${v}/customers/${acct.customer_id}/googleAds:search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': acct.login_customer_id || process.env.GOOGLE_ADS_MANAGER_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const text = await res.text()
      if (res.ok) {
        let data2 = null; try { data2 = JSON.parse(text) } catch {}
        const status = data2?.results?.[0]?.customer?.status || 'UNKNOWN'
        const ok = status === 'ENABLED'
        return { connected: true, ok, status: status === 'ENABLED' ? 'Active' : status, detail: ok ? undefined : `Google Ads account status is ${status}.` }
      }
      if (res.status === 401) return { connected: true, ok: false, status: 'Auth failed', detail: 'Google Ads rejected the credentials — reconnect Google Ads.' }
      const deprecated = /UNSUPPORTED_VERSION|deprecated/i.test(text)
      if (res.status !== 404 && !deprecated) return { connected: true, ok: false, status: 'Error', detail: `Google Ads API HTTP ${res.status}.` }
      lastErr = `HTTP ${res.status} on ${v}`
    }
    return { connected: true, ok: false, status: 'Error', detail: `Google Ads API unreachable (${lastErr}).` }
  } catch (e) { return { connected: true, ok: false, status: 'Error', detail: e.message } }
}

export async function GET(request) {
  const clientId = new URL(request.url).searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
  const db = admin()
  const [meta, google] = await Promise.all([metaHealth(db, clientId), googleHealth(db, clientId)])
  return NextResponse.json({ client_id: clientId, platforms: { meta, google } })
}
