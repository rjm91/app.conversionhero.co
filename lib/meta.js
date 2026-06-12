import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const META_API_VERSION = 'v21.0'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function getMetaConnection(clientId) {
  const { data } = await admin()
    .from('meta_connections')
    .select('client_id, ad_account_id, access_token, app_secret')
    .eq('client_id', clientId)
    .single()
  return data
}

export async function getAllMetaConnections() {
  const { data } = await admin()
    .from('meta_connections')
    .select('client_id, ad_account_id, access_token, app_secret')
  return data || []
}

// Normalize an ad account id to the act_<digits> form the API expects.
function actId(id) {
  const s = String(id).trim()
  return s.startsWith('act_') ? s : `act_${s.replace(/\D/g, '')}`
}

// Pull daily campaign-level insights for an ad account over a date range.
export async function fetchMetaCampaignInsights(conn, since, until) {
  const params = new URLSearchParams({
    level: 'campaign',
    time_increment: '1',
    fields: 'campaign_id,campaign_name,spend,impressions,clicks',
    time_range: JSON.stringify({ since, until }),
    limit: '500',
    access_token: conn.access_token,
  })
  // If the app enforces it, Meta requires appsecret_proof = HMAC-SHA256(token, app_secret)
  if (conn.app_secret) {
    const proof = crypto.createHmac('sha256', conn.app_secret).update(conn.access_token).digest('hex')
    params.set('appsecret_proof', proof)
  }

  const rows = []
  let url = `https://graph.facebook.com/${META_API_VERSION}/${actId(conn.ad_account_id)}/insights?${params}`
  while (url) {
    const res = await fetch(url)
    const json = await res.json()
    if (json.error) throw new Error(`Meta API error: ${json.error.message || JSON.stringify(json.error)}`)
    for (const r of (json.data || [])) rows.push(r)
    url = json.paging?.next || null
  }
  return rows
}

// Map a Meta insights row → a client_meta_campaigns row.
export function metaInsightToRow(clientId, r) {
  return {
    client_id:     clientId,
    campaign_id:   String(r.campaign_id),
    campaign_name: r.campaign_name || '',
    spend:         Number(r.spend || 0),
    impressions:   Number(r.impressions || 0),
    clicks:        Number(r.clicks || 0),
    date:          r.date_start,   // time_increment=1 → date_start is the day
    synced_at:     new Date().toISOString(),
  }
}
