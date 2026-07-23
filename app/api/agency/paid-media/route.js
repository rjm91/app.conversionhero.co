// Agency paid-media center. READ-ONLY: returns account and campaign rollups for
// Google or Meta across the client fleet. All reads use the service role only
// after the signed-in user is verified as an agency user. Connection secrets
// are never selected or returned.

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { isAgencyUser } from '../../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000
const MAX_ROWS = 50000

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const num = (v) => Number(v) || 0
const digits = (v) => String(v || '').replace(/\D/g, '')
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '')

function isoDay(date) {
  return date.toISOString().slice(0, 10)
}

async function readAll(pageQuery) {
  const rows = []
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await pageQuery(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

function emptyMetrics() {
  return { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0 }
}

function addMetrics(target, row, platform) {
  target.spend += num(platform === 'google' ? row.cost : row.spend)
  target.impressions += num(row.impressions)
  target.clicks += num(row.clicks)
  target.conversions += num(row.conversions)
  target.conversion_value += num(row.conversions_value)
}

function finishMetrics(metrics) {
  return {
    ...metrics,
    cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : null,
    cpa: metrics.conversions > 0 ? metrics.spend / metrics.conversions : null,
    roas: metrics.spend > 0 ? metrics.conversion_value / metrics.spend : null,
    ctr: metrics.impressions > 0 ? metrics.clicks / metrics.impressions : null,
  }
}

function newer(a, b) {
  return String(a || '') >= String(b || '')
}

export async function GET(request) {
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyUser(prof?.role)) return NextResponse.json({ error: 'Agency users only' }, { status: 403 })

  const url = new URL(request.url)
  const platform = url.searchParams.get('platform')
  if (!['google', 'meta'].includes(platform)) return NextResponse.json({ error: 'platform must be google or meta' }, { status: 400 })

  const requestedDays = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10) || 30))
  const end = validDate(url.searchParams.get('end')) ? url.searchParams.get('end') : isoDay(new Date())
  const defaultStartDate = new Date(`${end}T00:00:00Z`)
  defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - requestedDays + 1)
  const start = validDate(url.searchParams.get('start')) ? url.searchParams.get('start') : isoDay(defaultStartDate)
  if (start > end) return NextResponse.json({ error: 'start must be on or before end' }, { status: 400 })

  try {
    const clientsPromise = db.from('client').select('client_id, client_name, industry, status')
    const connectionsPromise = platform === 'google'
      ? db.from('client_google_ads_account').select('client_id, client_name, customer_id, login_customer_id, is_active, industry, refresh_last_run, created_at')
      : db.from('meta_connections').select('client_id, ad_account_id, updated_at')

    const campaignsPromise = platform === 'google'
      ? readAll((from, to) => db.from('client_google_campaigns')
          .select('client_id, customer_id, campaign_id, campaign_name, status, budget, cost, clicks, impressions, conversions, conversions_value, channel_type, date, synced_at')
          .gte('date', start).lte('date', end).order('date', { ascending: false }).range(from, to))
      : readAll((from, to) => db.from('client_meta_campaigns')
          .select('client_id, campaign_id, campaign_name, status, budget, spend, clicks, impressions, conversions, conversions_value, date, synced_at')
          .gte('date', start).lte('date', end).order('date', { ascending: false }).range(from, to))

    const [clientResult, connectionResult, campaignResult] = await Promise.all([clientsPromise, connectionsPromise, campaignsPromise])
    if (clientResult.error) throw clientResult.error
    if (connectionResult.error) throw connectionResult.error

    const clientById = new Map((clientResult.data || []).map(c => [c.client_id, c]))
    const connectionByClient = new Map()
    for (const conn of connectionResult.data || []) {
      const list = connectionByClient.get(conn.client_id) || []
      list.push(conn)
      connectionByClient.set(conn.client_id, list)
    }

    const accounts = new Map()
    const ensureAccount = (clientId, accountId, connection = null, inferred = false) => {
      const cleanId = digits(accountId) || 'unassigned'
      const key = `${clientId}:${cleanId}`
      if (accounts.has(key)) return accounts.get(key)
      const client = clientById.get(clientId) || {}
      const account = {
        key,
        client_id: clientId,
        client_name: client.client_name || connection?.client_name || clientId,
        client_status: client.status || null,
        industry: client.industry || connection?.industry || null,
        account_id: cleanId,
        login_customer_id: platform === 'google' ? digits(connection?.login_customer_id) || null : null,
        connected: !inferred,
        active: platform === 'google' ? connection?.is_active !== false : true,
        last_sync: connection?.refresh_last_run || connection?.updated_at || null,
        campaigns: new Map(),
        metrics: emptyMetrics(),
      }
      accounts.set(key, account)
      return account
    }

    // Connected accounts stay visible even when they have no campaign rows in
    // the selected date range.
    for (const conn of connectionResult.data || []) {
      ensureAccount(conn.client_id, platform === 'google' ? conn.customer_id : conn.ad_account_id, conn, false)
    }

    for (const row of campaignResult.rows) {
      const connections = connectionByClient.get(row.client_id) || []
      let accountId
      let connection = null
      if (platform === 'google') {
        accountId = digits(row.customer_id)
        connection = connections.find(c => digits(c.customer_id) === accountId) || null
        if (!accountId && connections.length === 1) { connection = connections[0]; accountId = digits(connection.customer_id) }
      } else {
        // Current Meta campaign rows are client-scoped and do not yet carry an
        // ad_account_id. A client's single saved connection is the honest join.
        connection = connections.length === 1 ? connections[0] : null
        accountId = connection ? digits(connection.ad_account_id) : 'unassigned'
      }
      const account = ensureAccount(row.client_id, accountId, connection, !connection)
      const campaignId = String(row.campaign_id || row.campaign_name || 'unknown')
      let campaign = account.campaigns.get(campaignId)
      if (!campaign) {
        campaign = {
          campaign_id: campaignId,
          campaign_name: row.campaign_name || campaignId,
          status: row.status || null,
          channel_type: row.channel_type || null,
          budget: num(row.budget),
          latest_date: row.date || null,
          synced_at: row.synced_at || null,
          daily_rows: 0,
          metrics: emptyMetrics(),
        }
        account.campaigns.set(campaignId, campaign)
      }
      campaign.daily_rows += 1
      addMetrics(campaign.metrics, row, platform)
      addMetrics(account.metrics, row, platform)
      if (newer(row.date, campaign.latest_date)) {
        campaign.latest_date = row.date || campaign.latest_date
        campaign.campaign_name = row.campaign_name || campaign.campaign_name
        campaign.status = row.status || campaign.status
        campaign.channel_type = row.channel_type || campaign.channel_type
        campaign.budget = num(row.budget) || campaign.budget
        campaign.synced_at = row.synced_at || campaign.synced_at
      }
      if (newer(row.synced_at, account.last_sync)) account.last_sync = row.synced_at
    }

    const endMs = new Date(`${end}T00:00:00Z`).getTime()
    const accountList = [...accounts.values()].map(account => {
      const campaigns = [...account.campaigns.values()].map(c => ({
        ...c,
        metrics: finishMetrics(c.metrics),
        stale: !c.latest_date || endMs - new Date(`${c.latest_date}T00:00:00Z`).getTime() > 3 * 86400000,
      })).sort((a, b) => b.metrics.spend - a.metrics.spend || a.campaign_name.localeCompare(b.campaign_name))
      return {
        ...account,
        campaigns,
        campaign_count: campaigns.length,
        active_campaigns: campaigns.filter(c => !c.stale && ['ENABLED', 'ACTIVE'].includes(String(c.status || '').toUpperCase())).length,
        metrics: finishMetrics(account.metrics),
      }
    }).sort((a, b) => b.metrics.spend - a.metrics.spend || a.client_name.localeCompare(b.client_name))

    const summaryMetrics = emptyMetrics()
    accountList.forEach(a => {
      summaryMetrics.spend += a.metrics.spend
      summaryMetrics.impressions += a.metrics.impressions
      summaryMetrics.clicks += a.metrics.clicks
      summaryMetrics.conversions += a.metrics.conversions
      summaryMetrics.conversion_value += a.metrics.conversion_value
    })

    return NextResponse.json({
      platform,
      range: { start, end, days: requestedDays },
      summary: {
        accounts: accountList.length,
        connected_accounts: accountList.filter(a => a.connected).length,
        campaigns: accountList.reduce((sum, a) => sum + a.campaign_count, 0),
        active_campaigns: accountList.reduce((sum, a) => sum + a.active_campaigns, 0),
        metrics: finishMetrics(summaryMetrics),
      },
      accounts: accountList,
      truncated: campaignResult.truncated,
      limitation: platform === 'meta'
        ? 'Meta campaign rows are currently client-scoped; ad-set and ad-level entities are not synced yet.'
        : null,
    })
  } catch (error) {
    console.error('[agency paid media]', error)
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 })
  }
}
