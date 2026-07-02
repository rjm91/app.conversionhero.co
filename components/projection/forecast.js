// Day-of-week weighted-average forecaster.
//
// Each projected day = weighted average of the SAME WEEKDAY over the trailing
// weeks (most recent weeks weighted heavier), scaled by a gentle growth trend
// (last 28 days vs the 28 before, clamped so one hot month can't explode the
// curve). Ecom daily series have strong weekday shape — this keeps projected
// curves looking like real ones instead of a flat line.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const sum = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0)

// ── Scenario planning ────────────────────────────────────────────────────────
// A scenario layers PLANNED changes the history can't know about onto the
// baseline projection: budget pushes (per platform, from a date) and dated
// events (promos, Black Friday). Spend scales linearly with the levers; paid
// revenue responds with diminishing returns (ratio^elasticity) because doubling
// spend never doubles sales. Organic revenue only moves with event multipliers.

export function defaultScenario() {
  return {
    elasticity: 0.7,
    budget: {
      google: { pct: 0, from: '' },
      meta:   { pct: 0, from: '' },
      tiktok: { pct: 0, from: '' },
    },
    events: [], // { label, start, end, revMult, spendMult }
  }
}

export function isNeutralScenario(s) {
  if (!s) return true
  if (Object.values(s.budget || {}).some(b => (Number(b?.pct) || 0) !== 0)) return false
  return !(s.events || []).some(e =>
    e.start && e.end && ((Number(e.revMult) || 1) !== 1 || (Number(e.spendMult) || 1) !== 1))
}

// base: { dates, revenue, paidRevenue, orderCount, gSpend, mSpend, tSpend }
// (all arrays aligned to dates). Returns the same shape, scenario-adjusted.
export function applyScenario(base, scenario) {
  const n = base.dates.length
  const el = clamp(Number(scenario?.elasticity) || 0.7, 0.1, 1.2)
  const out = { dates: base.dates, revenue: [], paidRevenue: [], orderCount: [], gSpend: [], mSpend: [], tSpend: [] }
  const budgetMult = (platform, d) => {
    const b = scenario?.budget?.[platform]
    if (!b || (b.from && d < b.from)) return 1
    return Math.max(0, 1 + (Number(b.pct) || 0) / 100)
  }
  for (let i = 0; i < n; i++) {
    const d = base.dates[i]
    let evRev = 1, evSpend = 1
    for (const e of scenario?.events || []) {
      if (!e.start || !e.end || d < e.start || d > e.end) continue
      evRev *= Math.max(0, Number(e.revMult) || 1)
      evSpend *= Math.max(0, Number(e.spendMult) || 1)
    }
    const g = base.gSpend[i] * budgetMult('google', d) * evSpend
    const m = base.mSpend[i] * budgetMult('meta', d) * evSpend
    const t = base.tSpend[i] * budgetMult('tiktok', d) * evSpend
    const baseSpendDay = base.gSpend[i] + base.mSpend[i] + base.tSpend[i]
    const spendRatio = baseSpendDay > 0 ? (g + m + t) / baseSpendDay : 1
    // Diminishing returns: paid revenue follows spend^elasticity, not spend.
    const paid = base.paidRevenue[i] * Math.pow(Math.max(spendRatio, 0.01), el) * evRev
    const organic = Math.max(0, base.revenue[i] - base.paidRevenue[i]) * evRev
    const revenue = organic + paid
    out.gSpend.push(g); out.mSpend.push(m); out.tSpend.push(t)
    out.paidRevenue.push(paid)
    out.revenue.push(revenue)
    // Orders track revenue (AOV assumed stable through the scenario).
    out.orderCount.push(base.orderCount[i] * (base.revenue[i] > 0 ? revenue / base.revenue[i] : evRev))
  }
  return out
}

// values: consecutive DAILY numbers, oldest → newest (last element = yesterday).
// horizon: how many future days to project. Returns number[horizon], day 1 = today.
export function projectSeries(values, horizon, { decay = 0.72, maxSamples = 8, trendClamp = [0.6, 1.75] } = {}) {
  const n = values.length
  if (!n || horizon <= 0) return Array(Math.max(0, horizon)).fill(0)
  const mean = sum(values) / n

  // Growth trend: average of the last 28 days vs the 28 days before that.
  let dailyGrowth = 1
  if (n >= 42) {
    const recentAvg = sum(values.slice(n - 28)) / 28
    const priorLen = Math.min(28, n - 28)
    const priorAvg = sum(values.slice(n - 28 - priorLen, n - 28)) / priorLen
    if (priorAvg > 0 && recentAvg > 0) {
      dailyGrowth = Math.pow(clamp(recentAvg / priorAvg, trendClamp[0], trendClamp[1]), 1 / 28)
    }
  }

  const out = []
  for (let f = 1; f <= horizon; f++) {
    // Same-weekday historical samples: index (n-1) + f - 7k, most recent first.
    let wSum = 0, wvSum = 0, taken = 0
    for (let k = Math.max(1, Math.ceil(f / 7)); taken < maxSamples; k++) {
      const i = n - 1 + f - 7 * k
      if (i < 0) break
      const w = Math.pow(decay, taken)
      wvSum += values[i] * w
      wSum += w
      taken++
    }
    const base = wSum > 0 ? wvSum / wSum : mean
    out.push(Math.max(0, base * Math.pow(dailyGrowth, f)))
  }
  return out
}
