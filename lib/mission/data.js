// Mission Control BROWSER data layer — fetches with the user's supabase
// session + gated API routes. All math lives in ./core (shared with the
// server cron watcher, so page and watcher always agree).
import { supabase } from '../supabase'
import { fetchAllRows } from '../fetch-all'
import { aggregate } from './core'

export { computeMission, askContext, rangeDays, resolveRange, RANGE_PRESETS, rowToFinding } from './core'

export async function fetchMissionData(clientId, start, end) {
  const dayStartISO = new Date(`${start}T00:00:00`).toISOString()
  const dayEndISO = new Date(`${end}T23:59:59.999`).toISOString()
  const [ordersRes, googleRes, metaRes, mfgRes, clientRes] = await Promise.all([
    // Full rows — the Orders tab's column picker can mirror the table 1:1.
    // Paginated: PostgREST caps single requests at 1,000 rows; a 90d window
    // exceeds that and would silently truncate KPIs.
    fetchAllRows((from, to) => supabase.from('client_orders')
      .select('*, lead_id:order_id, client_order_items(sku, qty, title)')
      .eq('client_id', clientId)
      .gte('created_at', dayStartISO)
      .lte('created_at', dayEndISO)
      .order('created_at', { ascending: false })
      .range(from, to)).then(rows => ({ data: rows })).catch(e => ({ data: [], error: e })),
    supabase.from('client_google_campaigns')
      .select('*').eq('client_id', clientId)
      .ilike('campaign_name', `%${clientId}%`)
      .gte('date', start).lte('date', end),
    supabase.from('client_meta_campaigns')
      .select('*').eq('client_id', clientId)
      .gte('date', start).lte('date', end),
    fetch(`/api/manufacturing?client_id=${clientId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { materials: [], skus: [] }).catch(() => ({ materials: [], skus: [] })),
    supabase.from('client').select('client_name, settings').eq('client_id', clientId).single(),
  ])

  // New-customer classification for the daily P&L: pull each customer's
  // FIRST-ever order date (all history), then a customer is "new in range" if
  // their first order falls inside [start, end]. Best-effort — on any failure
  // newEmails stays null and the P&L shows nOrders as "—" rather than wrong.
  let newEmails = null
  try {
    const hist = await fetchAllRows((from, to) => supabase.from('client_orders')
      .select('email, created_at').eq('client_id', clientId)
      .not('email', 'is', null).order('created_at', { ascending: true }).range(from, to))
    const first = new Map()
    for (const r of hist) {
      const e = (r.email || '').toLowerCase().trim()
      if (e && !first.has(e)) first.set(e, r.created_at) // ordered asc → first seen = first order
    }
    const s = new Date(`${start}T00:00:00`), en = new Date(`${end}T23:59:59.999`)
    newEmails = new Set()
    for (const [e, d] of first) { const t = new Date(d); if (t >= s && t <= en) newEmails.add(e) }
  } catch { newEmails = null }

  return {
    orders: ordersRes.data || [],
    newEmails,
    google: aggregate(googleRes.data || [], 'cost'),
    meta: aggregate(metaRes.data || [], 'spend'),
    googleDaily: (googleRes.data || []).map(r => ({ date: String(r.date).slice(0, 10), spend: Number(r.cost) || 0 })),
    metaDaily: (metaRes.data || []).map(r => ({ date: String(r.date).slice(0, 10), spend: Number(r.spend) || 0 })),
    mfg: mfgRes || { materials: [], skus: [] },
    clientName: clientRes.data?.client_name || clientId,
    // Daily-P&L config from per-client settings (cost_per_label, timezone).
    pnlConfig: { costPerLabel: clientRes.data?.settings?.cost_per_label, timezone: clientRes.data?.settings?.timezone },
    settings: clientRes.data?.settings || {},
    start, end,
  }
}
