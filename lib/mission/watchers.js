// Watcher v0 — deterministic rules over the mission metrics. Each finding is
// a drafted action with evidence and an impact estimate. No LLM involved:
// these are the checks a good media buyer runs every morning, encoded.
// True ROAS here = (attributed revenue − BOM COGS) ÷ spend, so breakeven is
// exactly 1.0x — below it a campaign burns real margin, not just "low ROAS".

const money = (n) => '$' + Math.round(n).toLocaleString()

export function buildFindings(m) {
  const f = []
  if (!m) return f
  const live = m.campaigns.filter(c => c.status === 'ENABLED' && !c.stale)

  // 1. Margin bleeders: enabled campaign, meaningful spend, True ROAS < 1.
  // Guards against noise: campaigns under 4 days old are skipped entirely
  // (attribution lag makes early reads meaningless), and zero-attribution
  // campaigns get a "check tracking" finding instead of fake bleed math.
  for (const c of live) {
    if (!m.hasCogs || c.spend < 200 || c.trueRoas == null) continue
    if (c.days < 4) continue // too new to judge — orders may not have UTM-matched yet
    if (c.trueRoas < 1 && c.chOrders === 0) {
      f.push({
        id: `noattr-${c.platform}-${c.campaign_id}`,
        severity: 'medium', icon: '🧭',
        title: `${c.campaign_name} (${c.platform}) — spend but zero attributed orders`,
        why: `${money(c.spend)} spent over ${c.days} days with ${c.clicks.toLocaleString()} clicks and no orders carrying its campaign UTM. Two possibilities: the ads genuinely aren't converting, or the tracking is broken (missing UTMs, redirect stripping params). Verify tracking before judging ROAS — a pause decision on broken attribution kills campaigns that might be working.`,
        impactMonthly: 0,
        confidence: 'medium',
        evidence: [`${c.days} days`, `${c.clicks.toLocaleString()} clicks`, `${money(c.spendPerDay)}/day`],
        action: { kind: 'audit_utms', platform: c.platform, campaign_id: c.campaign_id, ledger: `Verify UTM tracking on ${c.campaign_name}` },
      })
      continue
    }
    if (c.trueRoas < 1) {
      const monthlyBleed = c.spendPerDay * 30 * (1 - c.trueRoas)
      // Re-route candidate needs real spend behind its ROAS — a 13x on $80 is noise
      const winner = live.filter(x => x !== c && x.trueRoas > 1.5 && x.spend >= 500 && x.chOrders >= 5).sort((a, b) => b.trueRoas - a.trueRoas)[0]
      f.push({
        id: `bleed-${c.platform}-${c.campaign_id}`,
        severity: 'high', icon: '🚨',
        title: `Pause ${c.campaign_name} (${c.platform}) — below margin breakeven`,
        why: `True ROAS ${c.trueRoas.toFixed(2)}x over the range (breakeven 1.00x on real BOM margin). ${money(c.spend)} spent → ${money(c.chRevenue)} attributed revenue − ${money(c.chCogs)} COGS. Every day at ${money(c.spendPerDay)}/day loses ~${money(c.spendPerDay * (1 - c.trueRoas))} of contribution.${winner ? ` Re-route candidate: ${winner.campaign_name} at ${winner.trueRoas.toFixed(2)}x.` : ''}`,
        impactMonthly: monthlyBleed,
        confidence: c.days >= 5 ? 'high' : 'medium',
        evidence: [`${c.days} days of data`, `${c.chOrders} attributed orders`, `BOM margin ${(m.margin * 100).toFixed(1)}%`],
        action: { kind: 'pause_campaign', platform: c.platform, campaign_id: c.campaign_id, ledger: `Pause ${c.campaign_name} on ${c.platform}` },
      })
    }
  }

  // 2. Scale headroom: clear winner well above breakeven (real volume only)
  const winners = live.filter(c => c.trueRoas != null && c.trueRoas >= 2 && c.spend >= 500 && c.chOrders >= 5 && c.days >= 4).sort((a, b) => b.trueRoas - a.trueRoas)
  if (winners[0]) {
    const w = winners[0]
    f.push({
      id: `scale-${w.platform}-${w.campaign_id}`,
      severity: 'medium', icon: '📈',
      title: `Scale ${w.campaign_name} (${w.platform}) — margin headroom`,
      why: `True ROAS ${w.trueRoas.toFixed(2)}x — every $1 of spend returns ${'$' + w.trueRoas.toFixed(2)} of contribution after real COGS. A +20% budget test (${money(w.spendPerDay * 0.2)}/day) is low-risk with a revert point.`,
      impactMonthly: w.spendPerDay * 0.2 * 30 * (w.trueRoas - 1) * 0.7, // discounted for diminishing returns
      confidence: 'medium',
      evidence: [`${w.chOrders} attributed orders`, `${money(w.spend)} spend over ${w.days} days`],
      action: { kind: 'scale_campaign', platform: w.platform, campaign_id: w.campaign_id, ledger: `Scale ${w.campaign_name} +20% budget test` },
    })
  }

  // 3. Email under-use: Klaviyo share of revenue below 10%
  const klav = m.byChannel.find(c => c.name === 'Klaviyo')
  const klavShare = m.revenue > 0 ? (klav?.revenue || 0) / m.revenue : 0
  if (m.revenue > 5000 && klavShare < 0.10) {
    f.push({
      id: 'klaviyo-underuse',
      severity: 'medium', icon: '✉️',
      title: 'Klaviyo is under-driving revenue',
      why: `Email/SMS is ${(klavShare * 100).toFixed(1)}% of revenue (${money(klav?.revenue || 0)}); healthy ecom runs 15–30%. The gap is owned-audience revenue with ~zero acquisition cost — winback and post-purchase flows are the usual fix.`,
      impactMonthly: (m.revenue / m.days) * 30 * (0.15 - klavShare) * 0.4, // conservative: capture 40% of the gap to 15%
      confidence: 'medium',
      evidence: [`${klav?.orders || 0} Klaviyo-attributed orders (first-party UTMs)`, `benchmark 15–30% of revenue`],
      action: { kind: 'draft_flow', ledger: 'Klaviyo flow gap flagged — draft winback' },
    })
  }

  // 4. Attribution health: too many orders unmatched to campaigns
  if (m.orders >= 20 && m.attrRate < 0.5) {
    f.push({
      id: 'attribution-low',
      severity: 'low', icon: '🧭',
      title: 'Attribution rate is low — decisions are flying partly blind',
      why: `Only ${(m.attrRate * 100).toFixed(0)}% of orders carry a campaign UTM. Per-campaign True ROAS understates winners when their orders arrive untagged. Usual causes: missing UTMs on new ads, link shorteners stripping params, or brand-search orders landing as Direct.`,
      impactMonthly: 0,
      confidence: 'high',
      evidence: [`${m.orders} orders in range`, `${Math.round(m.attrRate * m.orders)} attributed`],
      action: { kind: 'audit_utms', ledger: 'UTM audit flagged' },
    })
  }

  const rank = { high: 0, medium: 1, low: 2 }
  return f.sort((a, b) => rank[a.severity] - rank[b.severity] || b.impactMonthly - a.impactMonthly)
}
