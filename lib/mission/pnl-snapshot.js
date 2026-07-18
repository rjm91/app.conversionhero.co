// Daily P&L snapshot writer — SERVER ONLY.
// Computes the P&L for each day in a range and upserts one row per day into
// client_daily_pnl (the historical record). Reuses the same merge as the live
// Overview (client_orders + campaign tables + BOM) via fetchServerMissionData,
// so snapshots and the live view agree.
import { computeDailyPnl, orderMoney } from './pnl'
import { buildCostBook, buildSkuIndex, orderCogs, orderItems } from '../cogs'
import { fetchServerMissionData } from './server'
import { deriveChannel } from '../channels'

const round = (n) => Math.round((Number(n) || 0) * 100) / 100
// Bucket an order into a CALENDAR DAY in the client's business timezone — a
// daily P&L must match the merchant's local day, not UTC (ShieldTech runs on
// Arizona time; orders placed 8pm AZT are next-day in UTC). en-CA → YYYY-MM-DD.
// TODO: make the timezone a per-client setting; America/Phoenix for now.
const DEFAULT_TZ = 'America/Phoenix'
const dayKey = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

// Full-history first-order-per-email → the set of order IDs that are each
// customer's first-ever order (so "new" is correct on any day). Paginated.
async function firstOrderIdSet(db, clientId) {
  const ids = new Set(); const seen = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('client_orders')
      .select('order_id, email, created_at').eq('client_id', clientId)
      .not('email', 'is', null).order('created_at', { ascending: true }).range(from, from + 999)
    if (error) break
    for (const r of data) { const e = (r.email || '').toLowerCase().trim(); if (e && !seen.has(e)) { seen.add(e); ids.add(r.order_id) } }
    if (!data || data.length < 1000) break
  }
  return ids
}

// Snapshot every day in [start, end] for one client. Returns the day count.
export async function snapshotDailyPnl(db, clientId, start, end, config = {}) {
  // Per-client settings (cost_per_label, timezone) unless the caller overrides.
  let s = {}
  try { const { data } = await db.from('client').select('settings').eq('client_id', clientId).single(); s = data?.settings || {} } catch { /* pre-migration */ }
  const costPerLabel = config.costPerLabel != null ? config.costPerLabel : (s.cost_per_label != null ? Number(s.cost_per_label) : 25)
  const tz = config.timezone || s.timezone || DEFAULT_TZ
  const firstIds = await firstOrderIdSet(db, clientId)
  // Fetch a day wider each side so TZ-shifted edge days are complete, then
  // only keep buckets within the requested [start, end].
  const shift = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
  const data = await fetchServerMissionData(db, clientId, shift(start, -1), shift(end, 1))

  const costBook = buildCostBook(data.mfg.materials)
  const skuIndex = buildSkuIndex(data.mfg.skus)
  const hasCogs = (data.mfg.skus?.length || 0) > 0
  const cogsOf = (o) => hasCogs ? orderCogs(orderItems(o), skuIndex, costBook).cogs : 0

  const byDay = {}
  const bucket = (k) => (byDay[k] = byDay[k] || { orders: [], google: 0, meta: 0 })
  for (const o of data.orders) bucket(dayKey(o.created_at, tz)).orders.push(o)
  for (const r of data.googleDaily) bucket(r.date).google += r.spend
  for (const r of data.metaDaily) bucket(r.date).meta += r.spend

  const now = new Date().toISOString()
  const rows = Object.entries(byDay).filter(([date]) => date >= start && date <= end).map(([date, g]) => {
    const cogsTotal = g.orders.reduce((s, o) => s + cogsOf(o), 0)
    const pnlOrders = g.orders.map(o => ({
      ...orderMoney(o),
      isNew: firstIds.has(o.lead_id || o.order_id),
      shipped: (o.fulfillment_status || '').toUpperCase() === 'FULFILLED',
    }))
    const p = computeDailyPnl(pnlOrders, { google: g.google, meta: g.meta }, cogsTotal, { costPerLabel, sessions: null })
    p.newClassified = true
    // Per-platform splits (order channel = paid attribution, matching the
    // Overview table): net revenue, BOM COGS, and orders per Meta/Google, so
    // the Slack digest can show channel ROAS / AOV / % of paid / CM.
    const ch = {
      meta:   { net: 0, cogs: 0, orders: 0, spend: round(g.meta) },
      google: { net: 0, cogs: 0, orders: 0, spend: round(g.google) },
    }
    for (const o of g.orders) {
      const c = deriveChannel(o)
      const t = c === 'Meta' ? ch.meta : c === 'Google' ? ch.google : null
      if (!t) continue
      const mm = orderMoney(o)
      t.net += mm.net; t.cogs += cogsOf(o)
      if (mm.net > 0) t.orders += 1
    }
    for (const k of ['meta', 'google']) { ch[k].net = round(ch[k].net); ch[k].cogs = round(ch[k].cogs) }
    p.channels = ch
    return {
      client_id: clientId, date,
      net_sales: round(p.netSales), gross_profit: round(p.grossProfit),
      total_orders: p.totalOrders, total_spend: round(p.totalSpend), cogs: round(p.cogs),
      metrics: p,
      source_refs: { order_ids: g.orders.map(o => o.lead_id || o.order_id) },
      cost_per_label: costPerLabel, computed_at: now,
    }
  })
  if (rows.length) {
    const { error } = await db.from('client_daily_pnl').upsert(rows, { onConflict: 'client_id,date' })
    if (error) throw new Error(error.message)
  }
  return rows.length
}
