// Real levers — the ONLY code in Mission Control that can touch ad platforms.
// Gated by MISSION_LEVERS env: 'off' | 'dry_run' (default) | 'live'.
//   off:     approvals log only, no lever record beyond the mode
//   dry_run: builds the EXACT platform request + rollback plan, never sends
//   live:    executes, records the response and rollback info
// Every call is recorded in mission_decisions.execution for the audit trail.
import { getGoogleAdsAccessToken } from '../google-ads'

const GV = 'v21'
const MODE = () => (process.env.MISSION_LEVERS || 'dry_run').toLowerCase()

async function jfetch(url, opts) {
  const res = await fetch(url, { ...opts, cache: 'no-store' })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { /* keep raw */ }
  return { ok: res.ok, status: res.status, data, raw: text.slice(0, 800) }
}

/* ── Google Ads ─────────────────────────────────────────── */
async function googleCustomer(db, clientId) {
  const { data } = await db.from('client_google_ads_account')
    .select('customer_id, is_active').eq('client_id', clientId)
  const acct = (data || []).find(a => a.is_active === true || String(a.is_active).toLowerCase() === 'true')
  if (!acct) throw new Error('no active Google Ads account for this client')
  return String(acct.customer_id).replace(/-/g, '')
}

const gHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  'login-customer-id': process.env.GOOGLE_ADS_MANAGER_ID,
  'Content-Type': 'application/json',
})

async function googlePause(db, clientId, campaignId, dry) {
  const cid = await googleCustomer(db, clientId)
  const request = {
    url: `https://googleads.googleapis.com/${GV}/customers/${cid}/campaigns:mutate`,
    body: { operations: [{ update: { resourceName: `customers/${cid}/campaigns/${campaignId}`, status: 'PAUSED' }, updateMask: 'status' }] },
  }
  const rollback = { note: 'set status back to ENABLED', resourceName: `customers/${cid}/campaigns/${campaignId}`, prior_status: 'ENABLED' }
  if (dry) return { executed: false, request, rollback }
  const token = await getGoogleAdsAccessToken()
  const res = await jfetch(request.url, { method: 'POST', headers: gHeaders(token), body: JSON.stringify(request.body) })
  if (!res.ok) throw new Error(`Google pause failed HTTP ${res.status}: ${res.raw}`)
  return { executed: true, request, response: res.data, rollback }
}

async function googleScaleBudget(db, clientId, campaignId, factor, dry) {
  const cid = await googleCustomer(db, clientId)
  const token = await getGoogleAdsAccessToken()
  // Look up the campaign's budget resource + current amount (needed even for
  // dry-run so the plan shows real numbers).
  const q = await jfetch(`https://googleads.googleapis.com/${GV}/customers/${cid}/googleAds:search`, {
    method: 'POST', headers: gHeaders(token),
    body: JSON.stringify({ query: `SELECT campaign.id, campaign.campaign_budget, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campaignId}` }),
  })
  if (!q.ok) throw new Error(`Google budget lookup failed HTTP ${q.status}: ${q.raw}`)
  const row = q.data?.results?.[0]
  if (!row) throw new Error('campaign not found in Google Ads')
  const budgetRes = row.campaign.campaignBudget
  const current = Number(row.campaignBudget?.amountMicros || 0)
  const next = Math.round(current * factor)
  const request = {
    url: `https://googleads.googleapis.com/${GV}/customers/${cid}/campaignBudgets:mutate`,
    body: { operations: [{ update: { resourceName: budgetRes, amountMicros: String(next) }, updateMask: 'amount_micros' }] },
  }
  const rollback = { note: 'restore previous daily budget', resourceName: budgetRes, prior_amount_micros: String(current) }
  if (dry) return { executed: false, request, rollback, plan: { current_daily: current / 1e6, next_daily: next / 1e6 } }
  const res = await jfetch(request.url, { method: 'POST', headers: gHeaders(token), body: JSON.stringify(request.body) })
  if (!res.ok) throw new Error(`Google budget mutate failed HTTP ${res.status}: ${res.raw}`)
  return { executed: true, request, response: res.data, rollback, plan: { current_daily: current / 1e6, next_daily: next / 1e6 } }
}

/* ── Meta ───────────────────────────────────────────────── */
async function metaConn(db, clientId) {
  const { data } = await db.from('meta_connections')
    .select('ad_account_id, access_token').eq('client_id', clientId).limit(1).single()
  if (!data?.access_token) throw new Error('no Meta connection for this client')
  return data
}

async function metaPause(db, clientId, campaignId, dry) {
  const conn = await metaConn(db, clientId)
  const request = { url: `https://graph.facebook.com/v21.0/${campaignId}`, body: { status: 'PAUSED' } }
  const rollback = { note: 'set status back to ACTIVE', campaign_id: campaignId, prior_status: 'ACTIVE' }
  if (dry) return { executed: false, request, rollback }
  const res = await jfetch(`${request.url}?status=PAUSED&access_token=${encodeURIComponent(conn.access_token)}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Meta pause failed HTTP ${res.status}: ${res.raw}`)
  return { executed: true, request, response: res.data, rollback }
}

async function metaScaleBudget(db, clientId, campaignId, factor, dry) {
  const conn = await metaConn(db, clientId)
  const cur = await jfetch(`https://graph.facebook.com/v21.0/${campaignId}?fields=daily_budget,name&access_token=${encodeURIComponent(conn.access_token)}`)
  if (!cur.ok) throw new Error(`Meta budget lookup failed HTTP ${cur.status}: ${cur.raw}`)
  const current = Number(cur.data?.daily_budget || 0) // cents
  if (!current) throw new Error('campaign has no daily_budget at campaign level (budget may live on ad sets)')
  const next = Math.round(current * factor)
  const request = { url: `https://graph.facebook.com/v21.0/${campaignId}`, body: { daily_budget: next } }
  const rollback = { note: 'restore previous daily budget (cents)', campaign_id: campaignId, prior_daily_budget: current }
  if (dry) return { executed: false, request, rollback, plan: { current_daily: current / 100, next_daily: next / 100 } }
  const res = await jfetch(`${request.url}?daily_budget=${next}&access_token=${encodeURIComponent(conn.access_token)}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Meta budget mutate failed HTTP ${res.status}: ${res.raw}`)
  return { executed: true, request, response: res.data, rollback, plan: { current_daily: current / 100, next_daily: next / 100 } }
}

/* ── entry point ────────────────────────────────────────── */
export async function executeLever(db, clientId, finding) {
  const mode = MODE()
  const action = finding?.action || {}
  const kind = action.kind
  const platform = action.platform
  const campaignId = action.campaign_id
  const base = { mode, kind: kind || null, platform: platform || null, campaign_id: campaignId || null, at: new Date().toISOString() }

  if (mode === 'off') return { ...base, executed: false, note: 'levers off — logged only' }
  if (!kind || !campaignId || !platform) return { ...base, executed: false, note: 'no executable action on this finding (advisory card)' }

  const dry = mode !== 'live'
  try {
    let result
    if (kind === 'pause_campaign') {
      result = platform === 'Google' ? await googlePause(db, clientId, campaignId, dry)
             : platform === 'Meta' ? await metaPause(db, clientId, campaignId, dry)
             : null
    } else if (kind === 'scale_campaign') {
      result = platform === 'Google' ? await googleScaleBudget(db, clientId, campaignId, 1.2, dry)
             : platform === 'Meta' ? await metaScaleBudget(db, clientId, campaignId, 1.2, dry)
             : null
    }
    if (!result) return { ...base, executed: false, note: `unsupported kind/platform: ${kind}/${platform}` }
    return { ...base, ...result, note: dry ? 'dry run — request built and recorded, NOT sent' : 'executed live' }
  } catch (e) {
    return { ...base, executed: false, error: e.message }
  }
}
