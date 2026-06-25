import { createClient } from '@supabase/supabase-js'
import { isAgencyUser } from '../roles'

// Read-only analytics tools for the ecom Copilot. Everything here computes from
// real Supabase data — Shopify orders (client_lead.sale_amount > 0, per the ecom
// gotcha: no lead_status filter) joined to Google Ads spend (client_yt_campaigns)
// and attributed via client_lead.utm_campaign.
//
// COGS is not yet wired into the data model (see the Products/COGS work). Until
// it is, contribution-margin metrics are computed from an ASSUMED gross-margin
// rate that every tool returns in `assumptions` so the agent always discloses it.

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

const DEFAULT_GROSS_MARGIN_PCT = 60 // DTC products on paid ads typically need ~60–75% (see PRODUCT.md)

async function canAccess(user, clientId) {
  const db = adminClient()
  const { data: profile } = await db.from('profiles').select('role, client_id').eq('id', user.id).single()
  if (!profile) return false
  if (isAgencyUser(profile.role)) return true
  return profile.client_id === clientId
}

function monthRange() {
  const today = new Date()
  return {
    start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  }
}

export const COPILOT_TOOL_DEFINITIONS = [
  {
    name: 'getMarginSummary',
    description: 'Get the ecom margin overview for a client over a date range: revenue (Shopify orders), ad spend (Google Ads), order count, AOV, plain ROAS (revenue ÷ spend), attribution rate (share of orders matched to a campaign), and the ESTIMATED contribution margin + margin-aware ROAS (contribution ÷ spend). Use for "how are we doing", "what is our margin/ROAS", overview questions. Dates default to the current month. Returns an `assumptions` object — ALWAYS disclose the assumed gross-margin % when you report any margin figure.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        startDate: { type: 'string', description: 'ISO YYYY-MM-DD. Defaults to first of current month.' },
        endDate: { type: 'string', description: 'ISO YYYY-MM-DD. Defaults to today.' },
        assumedGrossMarginPct: { type: 'number', description: 'Gross-margin % to assume for COGS (default 60). Use the value the user gives if they state their margin.' },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'getCampaignsByMargin',
    description: 'Rank the client\'s ad campaigns by margin-aware ROAS (estimated contribution ÷ spend), not platform ROAS. Attributes Shopify orders to campaigns via utm_campaign. Returns per-campaign spend, attributed revenue, estimated contribution, margin ROAS, and order count. Use for "which campaign has the best margin", "what should I scale", "where is the money". Defaults to the current month.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        assumedGrossMarginPct: { type: 'number', description: 'Gross-margin % to assume (default 60).' },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'getRecentOrders',
    description: 'List recent Shopify orders for a client with revenue, date, and the campaign each is attributed to (via utm_campaign). Use for "show me orders", "recent sales", "which orders came from X". Returns up to `limit` orders (default 20), newest first.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        limit: { type: 'number', description: 'Max orders to return (default 20, max 100).' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
      },
      required: ['clientId'],
    },
  },
]

const COPILOT_TOOL_NAMES = new Set(COPILOT_TOOL_DEFINITIONS.map(t => t.name))
export function isCopilotTool(name) { return COPILOT_TOOL_NAMES.has(name) }

export async function runCopilotTool({ name, input, user }) {
  if (name === 'getMarginSummary') return getMarginSummary({ ...input, user })
  if (name === 'getCampaignsByMargin') return getCampaignsByMargin({ ...input, user })
  if (name === 'getRecentOrders') return getRecentOrders({ ...input, user })
  return { error: `Unknown copilot tool: ${name}` }
}

// Pull orders (Shopify) + campaign spend for a window, in one place.
async function loadWindow({ clientId, startDate, endDate }) {
  const { start: ds, end: de } = monthRange()
  const start = startDate || ds
  const end = endDate || de
  const db = adminClient()
  const [ordersRes, campsRes] = await Promise.all([
    db.from('client_lead')
      .select('sale_amount, created_at, utm_campaign, first_name, last_name')
      .eq('client_id', clientId)
      .gt('sale_amount', 0)
      .gte('created_at', start)
      .lte('created_at', end + 'T23:59:59-12:00')
      .limit(10000),
    db.from('client_yt_campaigns')
      .select('campaign_name, campaign_id, cost, date')
      .eq('client_id', clientId)
      .gte('date', start)
      .lte('date', end),
  ])
  return { start, end, orders: ordersRes.data || [], campaigns: campsRes.data || [], error: ordersRes.error || campsRes.error }
}

function assumptionsFor(pct) {
  const marginPct = pct != null ? Number(pct) : DEFAULT_GROSS_MARGIN_PCT
  return {
    assumedGrossMarginPct: marginPct,
    cogsSource: 'assumed',
    note: `Contribution margin is ESTIMATED using an assumed ${marginPct}% gross margin. Real per-product COGS is not yet wired into the data model — disclose this assumption when reporting margin figures.`,
  }
}

async function getMarginSummary({ clientId, startDate, endDate, assumedGrossMarginPct, user }) {
  if (!await canAccess(user, clientId)) return { error: 'Access denied for this client' }
  const { start, end, orders, campaigns, error } = await loadWindow({ clientId, startDate, endDate })
  if (error) return { error: error.message }

  const revenue = orders.reduce((s, o) => s + (Number(o.sale_amount) || 0), 0)
  const adSpend = campaigns.reduce((s, c) => s + (Number(c.cost) || 0), 0)
  const orderCount = orders.length
  const attributed = orders.filter(o => (o.utm_campaign || '').trim()).length

  const a = assumptionsFor(assumedGrossMarginPct)
  const contribution = revenue * (a.assumedGrossMarginPct / 100) // gross margin − ad spend handled separately
  const contributionAfterAds = contribution - adSpend

  const round = n => Number(n.toFixed(2))
  return {
    dateRange: { start, end },
    revenue: round(revenue),
    adSpend: round(adSpend),
    orderCount,
    aov: orderCount > 0 ? round(revenue / orderCount) : 0,
    plainRoas: adSpend > 0 ? round(revenue / adSpend) : null,
    attributionRate: orderCount > 0 ? round((attributed / orderCount) * 100) : 0,
    estimatedContributionMargin: round(contribution),
    estimatedNetContribution: round(contributionAfterAds),
    marginAwareRoas: adSpend > 0 ? round(contribution / adSpend) : null,
    assumptions: a,
  }
}

async function getCampaignsByMargin({ clientId, startDate, endDate, assumedGrossMarginPct, user }) {
  if (!await canAccess(user, clientId)) return { error: 'Access denied for this client' }
  const { start, end, orders, campaigns, error } = await loadWindow({ clientId, startDate, endDate })
  if (error) return { error: error.message }

  const a = assumptionsFor(assumedGrossMarginPct)
  const marginMult = a.assumedGrossMarginPct / 100

  // Spend per campaign (by name).
  const byCampaign = {}
  const keyOf = name => (name || 'Unknown').trim() || 'Unknown'
  for (const c of campaigns) {
    const k = keyOf(c.campaign_name)
    if (!byCampaign[k]) byCampaign[k] = { campaign: k, spend: 0, revenue: 0, orders: 0 }
    byCampaign[k].spend += Number(c.cost) || 0
  }
  // Attribute order revenue to campaigns via utm_campaign (best-effort name match).
  let unattributedRevenue = 0, unattributedOrders = 0
  for (const o of orders) {
    const tag = (o.utm_campaign || '').trim()
    const amt = Number(o.sale_amount) || 0
    if (!tag) { unattributedRevenue += amt; unattributedOrders++; continue }
    // match a spend bucket whose name contains the utm tag or vice-versa
    const hit = Object.keys(byCampaign).find(k => {
      const kn = k.toLowerCase(), tn = tag.toLowerCase()
      return kn === tn || kn.includes(tn) || tn.includes(kn)
    })
    const bucket = hit ? byCampaign[hit] : (byCampaign[tag] || (byCampaign[tag] = { campaign: tag, spend: 0, revenue: 0, orders: 0 }))
    bucket.revenue += amt
    bucket.orders++
  }
  const round = n => Number(n.toFixed(2))
  const rows = Object.values(byCampaign).map(b => {
    const contribution = b.revenue * marginMult
    return {
      campaign: b.campaign,
      spend: round(b.spend),
      attributedRevenue: round(b.revenue),
      orders: b.orders,
      estimatedContribution: round(contribution),
      marginAwareRoas: b.spend > 0 ? round(contribution / b.spend) : null,
      plainRoas: b.spend > 0 ? round(b.revenue / b.spend) : null,
    }
  }).sort((x, y) => (y.marginAwareRoas || 0) - (x.marginAwareRoas || 0))

  return {
    dateRange: { start, end },
    campaigns: rows,
    unattributed: { revenue: round(unattributedRevenue), orders: unattributedOrders },
    assumptions: a,
  }
}

async function getRecentOrders({ clientId, limit, startDate, endDate, user }) {
  if (!await canAccess(user, clientId)) return { error: 'Access denied for this client' }
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 100)
  const { start, end, orders, error } = await loadWindow({ clientId, startDate, endDate })
  if (error) return { error: error.message }
  const round = n => Number(n.toFixed(2))
  const rows = orders
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, cap)
    .map(o => ({
      date: String(o.created_at || '').slice(0, 10),
      revenue: round(Number(o.sale_amount) || 0),
      campaign: (o.utm_campaign || '').trim() || null,
      customer: [o.first_name, o.last_name].filter(Boolean).join(' ') || null,
    }))
  return { dateRange: { start, end }, count: rows.length, orders: rows }
}
