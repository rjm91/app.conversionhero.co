// Mission Control PURE compute — no supabase, no fetch, no browser APIs.
// Shared verbatim by the browser page (lib/mission/data.js) and the server
// cron watcher (lib/mission/server.js), so both always agree on the math.
import { buildCostBook, buildSkuIndex, orderCogs, orderItems, skuUnitCostBreakdown } from '../cogs'
import { deriveChannel, isPaidOrder } from '../channels'
import { computeDailyPnl, orderMoney } from './pnl'

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

// The date-window presets offered in the range picker (mirrors the dashboard).
// [key, label]. 'custom' resolves against caller-supplied start/end.
export const RANGE_PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'],
  ['7d', 'Last 7 Days'], ['14d', 'Last 14 Days'], ['30d', 'Last 30 Days'], ['90d', 'Last 90 Days'],
  ['this_month', 'This Month'], ['last_month', 'Last Month'],
  ['this_year', 'This Year'], ['last_year', 'Last Year'],
  ['all_time', 'All Time'], ['custom', 'Custom'],
]

// Resolve a preset key → { key, label, start, end, days }. start/end are local
// YYYY-MM-DD. The Nd presets keep the original today-minus-N boundary so their
// numbers don't shift. 'all_time' bounds at 2020-01-01 (before any client data).
export function resolveRange(key, customStart, customEnd) {
  const today = new Date()
  const label = (RANGE_PRESETS.find(p => p[0] === key) || [])[1] || 'Last 30 Days'
  const back = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d }
  const mk = (start, end) => {
    const s = typeof start === 'string' ? start : day(start)
    const e = typeof end === 'string' ? end : day(end)
    const days = Math.max(1, Math.round((new Date(e + 'T00:00:00') - new Date(s + 'T00:00:00')) / 86400000) + 1)
    return { key, label, start: s, end: e, days }
  }
  switch (key) {
    case 'today': return mk(today, today)
    case 'yesterday': return mk(back(1), back(1))
    case '7d': return mk(back(7), today)
    case '14d': return mk(back(14), today)
    case '30d': return mk(back(30), today)
    case '90d': return mk(back(90), today)
    case 'this_month': return mk(new Date(today.getFullYear(), today.getMonth(), 1), today)
    case 'last_month': return mk(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0))
    case 'this_year': return mk(new Date(today.getFullYear(), 0, 1), today)
    case 'last_year': return mk(new Date(today.getFullYear() - 1, 0, 1), new Date(today.getFullYear() - 1, 11, 31))
    case 'all_time': return mk('2020-01-01', today)
    case 'custom': return mk(customStart || day(back(30)), customEnd || day(today))
    default: return mk(back(30), today)
  }
}

// Aggregate raw daily campaign rows per campaign_id (incl. stale detection).
export function aggregate(rows, spendKey) {
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

// One pass over fetched data → everything the IDE and watcher need.
export function computeMission({ orders, google, meta, googleDaily = [], metaDaily = [], mfg, start, end, newEmails = null, pnlConfig = {} }) {
  const costBook = buildCostBook(mfg.materials)
  const skuIndex = buildSkuIndex(mfg.skus)
  const hasCogs = (mfg.skus?.length || 0) > 0

  const days = Math.max(1, Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1)
  const cogsOf = (o) => hasCogs ? orderCogs(orderItems(o), skuIndex, costBook).cogs : 0

  const byChannel = {}
  const attr = {}
  let revenue = 0, cogs = 0, paidRevenue = 0, paidCogs = 0, attributed = 0
  const dailyMap = {}
  const bucket = (d) => (dailyMap[d] = dailyMap[d] || { date: d, revenue: 0, orders: 0, cogs: 0, spend: 0, spendGoogle: 0, spendMeta: 0 })
  const p = (n) => String(n).padStart(2, '0')

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
    const dt = new Date(o.created_at)
    const b = bucket(`${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`)
    b.revenue += amt; b.orders += 1; b.cogs += oc
  }
  for (const r of googleDaily) { const b = bucket(r.date); b.spend += r.spend; b.spendGoogle += r.spend }
  for (const r of metaDaily) { const b = bucket(r.date); b.spend += r.spend; b.spendMeta += r.spend }
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

  const margin = revenue > 0 ? (revenue - cogs) / revenue : 0
  const breakeven = margin > 0 ? 1 / margin : null

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

  // Daily P&L — the client's morning report. Classify each order (new vs
  // returning by first-order email, shipped by fulfillment) then run the
  // shared calc. newEmails = set of emails whose first-ever order is in range.
  const googleSpend = google.reduce((s, c) => s + (Number(c.spend) || 0), 0)
  const metaSpend = meta.reduce((s, c) => s + (Number(c.spend) || 0), 0)
  const pnlOrders = orders.map(o => ({
    ...orderMoney(o),
    isNew: newEmails ? newEmails.has((o.email || '').toLowerCase().trim()) : false,
    shipped: (o.fulfillment_status || '').toUpperCase() === 'FULFILLED',
  }))
  const pnl = computeDailyPnl(pnlOrders, { google: googleSpend, meta: metaSpend }, cogs, {
    costPerLabel: pnlConfig.costPerLabel != null ? pnlConfig.costPerLabel : 25,
    sessions: pnlConfig.sessions != null ? pnlConfig.sessions : null,
  })
  pnl.newClassified = !!newEmails // so the UI can show "—" instead of a wrong 0

  // Per-order drill records — every P&L line on the Overview can be traced back
  // to its source rows (client_orders → line items → SKU → BOM → client_materials).
  // Precomputed here so the UI is presentational and the cascade reconciles to
  // the exact aggregates above.
  const drillOrders = orders.map(o => {
    const mm = orderMoney(o)
    const cg = hasCogs ? orderCogs(orderItems(o), skuIndex, costBook) : { cogs: 0, lines: [] }
    const lines = cg.lines.map(l => ({
      ...l,
      bom: l.matched ? skuUnitCostBreakdown(skuIndex.find(l.parent)?.bom || {}, costBook, l.vinyl) : [],
    }))
    return {
      id: o.order_id, name: o.order_name || o.order_id,
      date: o.created_at, email: o.email || '',
      gross: mm.gross, discounts: mm.discounts, refunds: mm.refunds, net: mm.net,
      isNew: newEmails ? newEmails.has((o.email || '').toLowerCase().trim()) : false,
      shipped: (o.fulfillment_status || '').toUpperCase() === 'FULFILLED',
      channel: deriveChannel(o),
      cogs: cg.cogs, lines,
    }
  })

  return {
    daily, days, hasCogs, margin, breakeven, pnl,
    sources: {
      orders: drillOrders,
      hasCogs,
      costPerLabel: pnlConfig.costPerLabel != null ? pnlConfig.costPerLabel : 25,
      tz: pnlConfig.timezone || null, // business timezone for daily bucketing
      // Traffic-light dials (per-client, editable in the P&L key popovers).
      // True ROAS uses the roas_* pair; CAC stays uncolored until both are set.
      roasRedBelow: pnlConfig.roasRedBelow != null ? Number(pnlConfig.roasRedBelow) : 1,
      roasGreenAbove: pnlConfig.roasGreenAbove != null ? Number(pnlConfig.roasGreenAbove) : 1.2,
      cacGreenBelow: pnlConfig.cacGreenBelow != null ? Number(pnlConfig.cacGreenBelow) : null,
      cacRedAbove: pnlConfig.cacRedAbove != null ? Number(pnlConfig.cacRedAbove) : null,
    },
    revenue, cogs, adSpend,
    netProfit: revenue - cogs - adSpend,
    orders: orders.length,
    trueRoas: adSpend > 0 ? paidContribution / adSpend : null,
    attrRate: orders.length > 0 ? attributed / orders.length : 0,
    byChannel: Object.entries(byChannel)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    campaigns,
  }
}

// Compact JSON the ask endpoint feeds to Claude.
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
    daily: (m.daily || []).map(d => ({
      date: d.date, revenue: Math.round(d.revenue), orders: d.orders,
      cogs: Math.round(d.cogs), ad_spend: Math.round(d.spend),
    })),
  }
}

// Convert a DB mission_findings row into the finding shape the IDE renders.
export function rowToFinding(row) {
  return {
    id: row.finding_key,
    severity: row.severity, icon: row.icon || '⚠️',
    title: row.title, why: row.why,
    impactMonthly: Number(row.impact_monthly) || 0,
    confidence: row.confidence || 'medium',
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    action: row.action || { ledger: row.title },
  }
}
