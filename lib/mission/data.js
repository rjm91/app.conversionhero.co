// Mission Control BROWSER data layer — fetches with the user's supabase
// session + gated API routes. All math lives in ./core (shared with the
// server cron watcher, so page and watcher always agree).
import { supabase } from '../supabase'
import { fetchAllRows } from '../fetch-all'
import { aggregate } from './core'

export { computeMission, askContext, rangeDays, rowToFinding } from './core'

export async function fetchMissionData(clientId, start, end) {
  const dayStartISO = new Date(`${start}T00:00:00`).toISOString()
  const dayEndISO = new Date(`${end}T23:59:59.999`).toISOString()
  const [ordersRes, googleRes, metaRes, mfgRes, clientRes] = await Promise.all([
    // Full rows — the Orders tab's column picker can mirror the table 1:1.
    // Paginated: PostgREST caps single requests at 1,000 rows; a 90d window
    // exceeds that and would silently truncate KPIs.
    fetchAllRows((from, to) => supabase.from('client_orders')
      .select('*, lead_id:order_id')
      .eq('client_id', clientId)
      .gte('created_at', dayStartISO)
      .lte('created_at', dayEndISO)
      .order('created_at', { ascending: false })
      .range(from, to)).then(rows => ({ data: rows })).catch(e => ({ data: [], error: e })),
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
    googleDaily: (googleRes.data || []).map(r => ({ date: String(r.date).slice(0, 10), spend: Number(r.cost) || 0 })),
    metaDaily: (metaRes.data || []).map(r => ({ date: String(r.date).slice(0, 10), spend: Number(r.spend) || 0 })),
    mfg: mfgRes || { materials: [], skus: [] },
    clientName: clientRes.data?.client_name || clientId,
    start, end,
  }
}
