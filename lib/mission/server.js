// Mission Control SERVER engine — used by /api/mission/state (on-page
// refresh), /api/mission/decide, and the cron watcher. Service-role supabase
// client is passed in by the caller; all math comes from ./core so the
// watcher and the IDE can never disagree.
import { aggregate, computeMission, rangeDays } from './core'
import { buildFindings } from './watchers'
import { fetchAllRows } from '../fetch-all'

export async function fetchServerMissionData(db, clientId, start, end) {
  const dayStartISO = new Date(`${start}T00:00:00`).toISOString()
  const dayEndISO = new Date(`${end}T23:59:59.999`).toISOString()
  const [ordersRes, googleRes, metaRes, materialsRes, skusRes, clientRes] = await Promise.all([
    // Paginated — the 1,000-row PostgREST cap silently truncates busy ranges.
    fetchAllRows((from, to) => db.from('client_orders')
      .select('lead_id:order_id, sale_amount, utm_campaign, utm_source, utm_medium, utm_content, shopify_data, created_at')
      .eq('client_id', clientId)
      .gte('created_at', dayStartISO).lte('created_at', dayEndISO)
      .order('created_at', { ascending: false })
      .range(from, to)).then(rows => ({ data: rows })).catch(e => ({ data: [], error: e })),
    db.from('client_google_campaigns').select('*').eq('client_id', clientId)
      .ilike('campaign_name', `%${clientId}%`).gte('date', start).lte('date', end),
    db.from('client_meta_campaigns').select('*').eq('client_id', clientId)
      .gte('date', start).lte('date', end),
    db.from('client_materials').select('name, cost, unit, notes').eq('client_id', clientId),
    db.from('client_skus').select('parent_sku, size').eq('client_id', clientId),
    db.from('client').select('client_name').eq('client_id', clientId).single(),
  ])
  // BOM rows → per-SKU object (client_sku_bom; paginated — 77 SKUs × 16
  // components already exceeds the 1,000-row PostgREST cap).
  const bomRows = await fetchAllRows((from, to) => db.from('client_sku_bom')
    .select('parent_sku, component, qty, value').eq('client_id', clientId)
    .order('id').range(from, to)).catch(() => [])
  const bomBySku = {}
  for (const r of bomRows) (bomBySku[r.parent_sku] = bomBySku[r.parent_sku] || {})[r.component] = r.value ?? Number(r.qty)
  return {
    orders: ordersRes.data || [],
    google: aggregate(googleRes.data || [], 'cost'),
    meta: aggregate(metaRes.data || [], 'spend'),
    googleDaily: (googleRes.data || []).map(r => ({ date: String(r.date).slice(0, 10), spend: Number(r.cost) || 0 })),
    metaDaily: (metaRes.data || []).map(r => ({ date: String(r.date).slice(0, 10), spend: Number(r.spend) || 0 })),
    mfg: { materials: materialsRes.data || [], skus: (skusRes.data || []).map(s => ({ ...s, bom: bomBySku[s.parent_sku] || {} })) },
    clientName: clientRes.data?.client_name || clientId,
    start, end,
  }
}

// Refresh one client: recompute metrics + findings, sync to DB.
// - daily metrics upserted for the window
// - new findings inserted, existing ones updated (last_seen)
// - open findings that no longer fire are auto-resolved
// - taught policies suppress their finding_key
export async function refreshClient(db, clientId, days = 30) {
  const { start, end } = rangeDays(days)
  const data = await fetchServerMissionData(db, clientId, start, end)
  const m = computeMission(data)

  // 1. daily metrics rollup
  if (m.daily.length) {
    const rows = m.daily.map(d => ({
      client_id: clientId, date: d.date,
      revenue: Math.round(d.revenue * 100) / 100, orders: d.orders,
      cogs: Math.round(d.cogs * 100) / 100,
      spend_google: Math.round(d.spendGoogle * 100) / 100,
      spend_meta: Math.round(d.spendMeta * 100) / 100,
      updated_at: new Date().toISOString(),
    }))
    await db.from('client_daily_metrics').upsert(rows, { onConflict: 'client_id,date' })
  }

  // 2. findings sync
  const [{ data: policies }, { data: existing }] = await Promise.all([
    db.from('mission_policies').select('finding_key').eq('client_id', clientId).eq('active', true),
    db.from('mission_findings').select('finding_key, status').eq('client_id', clientId),
  ])
  const taught = new Set((policies || []).map(p => p.finding_key))
  const byKey = Object.fromEntries((existing || []).map(r => [r.finding_key, r.status]))

  const current = buildFindings(m).filter(f => !taught.has(f.id))
  const now = new Date().toISOString()
  const currentKeys = new Set(current.map(f => f.id))

  for (const f of current) {
    const prior = byKey[f.id]
    if (prior === 'dismissed' || prior === 'approved') continue // decided — don't reopen
    await db.from('mission_findings').upsert({
      client_id: clientId, finding_key: f.id,
      severity: f.severity, icon: f.icon, title: f.title, why: f.why,
      impact_monthly: Math.round(f.impactMonthly), confidence: f.confidence,
      evidence: f.evidence, action: f.action,
      status: 'open', source: 'watcher', last_seen: now, resolved_at: null,
    }, { onConflict: 'client_id,finding_key' })
  }
  // auto-resolve watcher findings that stopped firing (only open ones)
  for (const [key, status] of Object.entries(byKey)) {
    if (status === 'open' && !currentKeys.has(key) && !key.startsWith('cmd-') && !key.startsWith('agent-')) {
      await db.from('mission_findings')
        .update({ status: 'resolved', resolved_at: now })
        .eq('client_id', clientId).eq('finding_key', key).eq('status', 'open')
    }
  }
  return { metrics: m, findings: current.length }
}

// Baseline snapshot at approval time: 7-day net-per-day run rate.
export async function snapshotBaseline(db, clientId) {
  const { start, end } = rangeDays(7)
  const { data } = await db.from('client_daily_metrics')
    .select('*').eq('client_id', clientId).gte('date', start).lte('date', end)
  const rows = data || []
  const sum = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0)
  const daysN = Math.max(1, rows.length)
  return {
    window: { start, end },
    days: daysN,
    net_per_day: Math.round((sum('revenue') - sum('cogs') - sum('spend_google') - sum('spend_meta')) / daysN),
    revenue_per_day: Math.round(sum('revenue') / daysN),
    spend_per_day: Math.round((sum('spend_google') + sum('spend_meta')) / daysN),
  }
}

// Measure decisions ≥7 days old: compare the 7 days AFTER approval to the
// baseline snapshotted at approval. Estimates become receipts.
export async function measureDueDecisions(db, clientId) {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: due } = await db.from('mission_decisions')
    .select('id, approved_at, baseline')
    .eq('client_id', clientId).is('measured_at', null)
    .neq('status', 'reverted')
    .lt('approved_at', cutoff)
  let measured = 0
  for (const d of (due || [])) {
    const startD = new Date(d.approved_at)
    const endD = new Date(startD.getTime() + 7 * 86400000)
    const p = (n) => String(n).padStart(2, '0')
    const iso = (x) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
    const { data: rows } = await db.from('client_daily_metrics')
      .select('*').eq('client_id', clientId)
      .gt('date', iso(startD)).lte('date', iso(endD))
    if (!rows?.length) continue
    const sum = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0)
    const after = Math.round((sum('revenue') - sum('cogs') - sum('spend_google') - sum('spend_meta')) / rows.length)
    const before = d.baseline?.net_per_day
    await db.from('mission_decisions').update({
      measured: {
        net_per_day_before: before ?? null,
        net_per_day_after: after,
        delta_monthly: before != null ? Math.round((after - before) * 30) : null,
        window_days: rows.length,
        note: 'whole-account net/day delta — directional, not campaign-isolated',
      },
      measured_at: new Date().toISOString(),
    }).eq('id', d.id)
    measured++
  }
  return measured
}
