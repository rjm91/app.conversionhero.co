// Daily P&L — the client's morning report. ONE calc, used by both the
// dashboard Control Center and the mission terminal Overview so they can
// never disagree. Pure arithmetic; the caller supplies classified orders +
// spend + COGS + config.
//
// Money basis = merchandise (excl. tax/shipping), matching the client sheet:
//   gross = subtotal + discounts   ·   net = subtotal − refunds
//
// Each order in `orders` should carry:
//   { net, gross, discounts, refunds, isNew (bool), shipped (bool) }
// where isNew = customer's first-ever order (classified upstream against full
// history) and shipped = fulfilled.

const pct = (a, b) => (b ? a / b : null)
const sum = (arr, f) => arr.reduce((n, x) => n + (Number(f(x)) || 0), 0)

// orders: classified rows · spend: {google, meta} · cogs: total $ for range
// config: { costPerLabel, sessions } (sessions = GA4 users, or null)
export function computeDailyPnl(orders, spend, cogs, config = {}) {
  const o = orders || []
  const costPerLabel = Number(config.costPerLabel) || 0
  const sessions = config.sessions != null ? Number(config.sessions) : null

  const grossSales = sum(o, x => x.gross)
  const discounts = sum(o, x => x.discounts)
  const refunds = sum(o, x => x.refunds)
  const netSales = sum(o, x => x.net)

  const totalOrders = o.filter(x => (Number(x.net) || 0) > 0).length
  const nOrders = o.filter(x => x.isNew && (Number(x.net) || 0) > 0).length

  const google = Number(spend?.google) || 0
  const meta = Number(spend?.meta) || 0
  const totalSpend = google + meta

  const ordersShipped = o.filter(x => x.shipped).length
  const shippingCosts = ordersShipped * costPerLabel
  const cogsTotal = Number(cogs) || 0
  const contributionMargin = netSales - cogsTotal - totalSpend
  const grossProfit = contributionMargin - shippingCosts

  return {
    grossSales,
    discounts, discountsPct: pct(discounts, grossSales),
    refunds, refundsPct: pct(refunds, grossSales),
    netSales,
    totalOrders,
    nOrders, nOrderPct: pct(nOrders, totalOrders),
    trueAov: pct(netSales, totalOrders),
    metaSpend: meta, metaPctOfNet: pct(meta, netSales),
    googleSpend: google, googlePctOfNet: pct(google, netSales),
    totalSpend,
    blendedRoas: pct(netSales, totalSpend),
    blendedCpa: pct(totalSpend, totalOrders),
    nCpa: pct(totalSpend, nOrders),           // paid spend per NEW customer
    users: sessions,
    cpVisit: sessions ? pct(totalSpend, sessions) : null,
    cvrBlended: sessions ? pct(totalOrders, sessions) : null,
    cogs: cogsTotal, cogsPct: pct(cogsTotal, netSales),
    contributionMargin,
    ordersShipped,
    shippingCosts, shippingPct: pct(shippingCosts, netSales),
    avgCostPerLabel: costPerLabel,
    grossProfit, grossProfitPct: pct(grossProfit, netSales),
    profitMargin: pct(grossProfit, netSales),
  }
}

// Merchandise money from a client_orders row (falls back to sale_amount when
// the new discount/refund fields aren't captured yet — pre-backfill orders).
export function orderMoney(row) {
  const sd = row.shopify_data || {}
  const has = sd.subtotal != null || sd.discounts != null
  if (has) {
    const subtotal = Number(sd.subtotal) || 0
    const discounts = Number(sd.discounts) || 0
    const refunds = Number(sd.refunds) || 0
    return { gross: subtotal + discounts, discounts, refunds, net: subtotal - refunds }
  }
  // Fallback: treat sale_amount as net, no discount/refund detail.
  const amt = Number(row.sale_amount) || 0
  return { gross: amt, discounts: 0, refunds: 0, net: amt }
}
