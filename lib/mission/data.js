// Mission Control data layer — same sources and math as the ecom dashboard
// (EcomControlCenter), collapsed into one fetch + one compute so the mission
// page and the ask endpoint reason over identical numbers.
import { supabase } from '../supabase'
import { buildCostBook, buildSkuIndex, orderCogs } from '../cogs'
import { deriveChannel, isPaidOrder } from '../../components/EcomControlCenter'

const day = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function rangeDays(n) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - n)
  return { start: day(start), end: day(end) }
}

// Aggregate raw daily campaign rows per campaign_id (same as the dashboard,
// including the stale-ENABLED detection shipped in July).
function aggregate(rows, spendKey) {
  const map = {}
  for (const row of rows || []) {
    const id = row.campaign_id
    if (!map[id]) map[id] = { campaign_id: id, campaign_name: row.campaign_name, status: row.status, budget: row.budget, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0, synced_at: row.synced_at, last_date: '', days: 0 }
    map[id].spend += Number(row[spendKey]) || 0
    map[id].impressions += Number(row.impressions) || 0
    map[id].clicks += Number(row.clicks) || 0
    map[id].conversions += Number(row.conversions) || 0
    map[id].conversions_value += Number(row.conversions_value) || 0
    map[id].days += 1
    const rd = String(row.date).slice(0, 10)
    if (rd > map[id].last_date) map[id].last_date = rd
    if (row.synced_at > map[id].synced_at) { map[id].status = row.status; map[id].budget = row.budget; map[id].synced_at = row.synced_at }
  }
  const list = Object.values(map).sort((a, b) => b.spend - a.spend)
  const latest = list.reduce((mx, c) => (c.last_date > mx ? c.last_date : mx), '')
  if (latest) {
    const d = new Date(latest + 'T00:00:00')
    d.setDate(d.getDate() - 3)
    const cutoff = day(d)
    for (const c of list) c.stale = c.status === 'ENABLED' && c.last_date < cutoff
  }
  return list
}

export async function fetchMissionData(clientId, start, end) {
  const dayStartISO = new Date(`${start}T00:00:00`).toISOString()
  const dayEndISO = new Date(`${end}T23:59:59.999`).toISOString()
  const [ordersRes, googleRes, metaRes, mfgRes, clientRes] = await Promise.all([
    supabase.from('client_lead')
      .select('lead_id, sale_amount, utm_campaign, utm_source, utm_medium, utm_content, shopify_data, created_at')
      .eq('client_id', clientId)
      .like('lead_id', 'shopify_%')
      .gte('created_at', dayStartISO)
      .lte('created_at', dayEndISO)
      .order('created_at', { ascending: false }),
    supabase.from('client_yt_campaigns')
      .select('*').eq('client_id', clientId)
      .ilike('campaign_name', `%${clientId}%`)
      .gte('date', start).lte('date', end),
    supabase.from('client_meta_campaigns')
      .select('*').eq('client_id', clientId)
      .gte('date', start).lte('date', end),
    fetch(`/api/manufacturing?client_id=${clientId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { materials: [], skus: [] }).catch(() => ({ materials: [], skus: [] })),
    supabase.from('client').select('client_name').eq('client_id', clientId).single(),
  ])
  return {
    orders: ordersRes.data || [],
    google: aggregate(googleRes.data || [], 'cost'),
    meta: aggregate(metaRes.data || [], 'spend'),
    mfg: mfgRes || { materials: [], skus: [] },
    clientName: clientRes.data?.client_name || clientId,
    start, end,
  }
}

// One pass over the fetched data → everything the page and the ask endpoint
// need. Mirrors the dashboard: revenue from Shopify orders, real COGS from
// the BOM, per-campaign True ROAS via first-party UTM attribution, paid-only
// ROAS (organic never inflates it).
export function computeMission({ orders, google, meta, mfg, start, end }) {
  const costBook = buildCostBook(mfg.materials)
  const skuIndex = buildSkuIndex(mfg.skus)
  const hasCogs = (mfg.skus?.length || 0) > 0

  const days = Math.max(1, Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1)
  const cogsOf = (o) => hasCogs ? orderCogs(o.shopify_data?.line_items || [], skuIndex, costBook).cogs : 0

  // Per-order rollup + channel split + campaign attribution
  const byChannel = {}
  const attr = {} // campaign_id -> {count, revenue, cogs}
  let revenue = 0, cogs = 0, paidRevenue = 0, paidCogs = 0, attributed = 0
  for (const o of orders) {
    const amt = Number(o.sale_amount) || 0
    const oc = cogsOf(o)
    revenue += amt; cogs += oc
    const ch = deriveChannel(o)
    ;(byChannel[ch] = byChannel[ch] || { revenue: 0, cogs: 0, orders: 0 })
    byChannel[ch].revenue += amt; byChannel[ch].cogs += oc; byChannel[ch].orders += 1
    if (isPaidOrder(o)) { paidRevenue += amt; paidCogs += oc }
    const camp = (o.utm_campaign || '').trim()
    if (camp) {
      attributed += 1
      ;(attr[camp] = attr[camp] || { count: 0, revenue: 0, cogs: 0 })
      attr[camp].count += 1; attr[camp].revenue += amt; attr[camp].cogs += oc
    }
  }

  const margin = revenue > 0 ? (revenue - cogs) / revenue : 0
  const breakeven = margin > 0 ? 1 / margin : null // spend covered when trueRoas ≥ 1 ⇒ platform ROAS breakeven = 1/margin

  const decorate = (c, platform) => {
    const a = attr[String(c.campaign_id)] || { count: 0, revenue: 0, cogs: 0 }
    const contribution = a.revenue - a.cogs
    return {
      ...c, platform,
      chOrders: a.count, chRevenue: a.revenue, chCogs: a.cogs,
      trueRoas: c.spend > 0 ? contribution / c.spend : null,
      roas: c.spend > 0 ? a.revenue / c.spend : null,
      spendPerDay: c.days > 0 ? c.spend / c.days : 0,
    }
  }
  const campaigns = [...google.map(c => decorate(c, 'Google')), ...meta.map(c => decorate(c, 'Meta'))]

  const adSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  const paidContribution = paidRevenue - paidCogs

  return {
    days, hasCogs, margin, breakeven,
    revenue, cogs, adSpend,
    netProfit: revenue - cogs - adSpend,
    orders: orders.length,
    trueRoas: adSpend > 0 ? paidContribution / adSpend : null, // paid-only, margin-aware
    attrRate: orders.length > 0 ? attributed / orders.length : 0,
    byChannel: Object.entries(byChannel)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    campaigns,
  }
}

// Compact JSON the ask endpoint feeds to Claude — small enough to send every
// question, complete enough that answers never need to guess.
export function askContext(clientName, m, range) {
  return {
    client: clientName,
    range,
    kpis: {
      gross_revenue: Math.round(m.revenue),
      cogs_bom: Math.round(m.cogs),
      ad_spend: Math.round(m.adSpend),
      net_profit: Math.round(m.netProfit),
      true_roas_paid_only: m.trueRoas != null ? Number(m.trueRoas.toFixed(2)) : null,
      blended_margin_pct: Number((m.margin * 100).toFixed(1)),
      breakeven_roas: m.breakeven != null ? Number(m.breakeven.toFixed(2)) : null,
      orders: m.orders,
      attribution_rate_pct: Number((m.attrRate * 100).toFixed(1)),
    },
    revenue_by_channel: m.byChannel.map(c => ({ channel: c.name, revenue: Math.round(c.revenue), orders: c.orders, cogs: Math.round(c.cogs) })),
    campaigns: m.campaigns.map(c => ({
      platform: c.platform, name: c.campaign_name, status: c.stale ? 'PAUSED (stale)' : c.status,
      spend: Math.round(c.spend), spend_per_day: Math.round(c.spendPerDay),
      clicks: c.clicks, impressions: c.impressions,
      attributed_orders: c.chOrders, attributed_revenue: Math.round(c.chRevenue),
      true_roas: c.trueRoas != null ? Number(c.trueRoas.toFixed(2)) : null,
    })),
  }
}
