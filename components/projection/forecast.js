// Day-of-week weighted-average forecaster.
//
// Each projected day = weighted average of the SAME WEEKDAY over the trailing
// weeks (most recent weeks weighted heavier), scaled by a gentle growth trend
// (last 28 days vs the 28 before, clamped so one hot month can't explode the
// curve). Ecom daily series have strong weekday shape — this keeps projected
// curves looking like real ones instead of a flat line.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const sum = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0)

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
