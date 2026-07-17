// The agent's database arm — SERVER ONLY.
//
// Implements architecture decision #2 (free-form READS through a guarded
// structured query tool) on top of decision #1 (the agent is a scoped
// identity; RLS caps everything at its own tenant).
//
// Two exports:
//   getAgentDb(clientId)  → a supabase client authenticated AS that client's
//                           agent identity (agent+<clientId>@…). RLS applies
//                           to every query it makes — a hallucinated filter
//                           can never cross tenants. Sessions are minted via
//                           the admin magiclink API and cached ~50 min.
//   runAgentQuery(db, clientId, input) → executes one structured query with
//                           the guards from the architecture doc: table
//                           allowlist, operator allowlist, enforced row cap,
//                           auto client_id scope, timeout.
//
// The per-ask query budget lives in the caller (app/api/mission/ask).

import { createClient } from '@supabase/supabase-js'
import schema from '../../db/schema.json'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

// Ecom module's table view (decision 2c: per-client schema view, not the
// whole DB). Every table here is already RLS-governed; the allowlist is for
// prompt-size and noise, not security.
export const AGENT_TABLES = [
  'client_orders', 'client_lead', 'client_google_campaigns', 'client_google_ad_groups',
  'client_google_ads', 'client_meta_campaigns', 'client_klaviyo_campaigns',
  'client_materials', 'client_skus', 'client_sku_bom', 'client_daily_metrics',
  'mission_findings', 'mission_decisions', 'mission_policies',
  'client_funnels', 'client_payments', 'calendar_events',
  'client_asset', 'client_video_scripts',
]

// table → { columns:[names], hasClientId } from the committed schema snapshot
// (db/schema.json is the single source of truth — decision 2d).
const TABLE_MAP = {}
for (const t of schema.tables || []) {
  if (!AGENT_TABLES.includes(t.name)) continue
  TABLE_MAP[t.name] = {
    columns: t.columns.map(c => c.name),
    hasClientId: t.columns.some(c => c.name === 'client_id'),
  }
}

// Compact schema block for the system prompt.
export function agentSchemaPrompt() {
  return Object.entries(TABLE_MAP)
    .map(([name, t]) => `${name}(${t.columns.join(', ')})`)
    .join('\n')
}

const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'])
const MAX_ROWS = 200
const MAX_FILTERS = 8
const QUERY_TIMEOUT_MS = 10_000
const AGG_PAGE = 1000
const AGG_MAX_ROWS = 10_000  // aggregation scans up to this many rows server-side
const AGG_MAX_GROUPS = 50

/* ── agent session cache: clientId → { client, exp } ── */
const sessions = new Map()

export async function getAgentDb(clientId) {
  const cached = sessions.get(clientId)
  if (cached && cached.exp > Date.now()) return cached.client

  const email = `agent+${clientId}@conversionhero.co`
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

  // Provisioning check FIRST — generateLink would silently auto-create a
  // bare auth user for unknown emails (zero-membership → zero rows → the
  // agent would confidently report "no data"). Require the minted identity:
  // a profiles row for the email AND a client_membership with role 'agent'.
  const { data: prof } = await admin.from('profiles').select('id').eq('email', email).limit(1)
  const agentProfileId = prof?.[0]?.id
  if (!agentProfileId) throw new Error(`no agent identity provisioned for ${clientId} — mint it first (profiles + client_membership role 'agent')`)
  const { data: mem } = await admin.from('client_membership').select('id').eq('profile_id', agentProfileId).eq('client_id', clientId).eq('role', 'agent').limit(1)
  if (!mem?.length) throw new Error(`agent identity for ${clientId} exists but has no 'agent' membership — refusing to mint a session`)

  // Mint a session without a password: magiclink token → verifyOtp.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkErr) throw new Error(`agent session mint failed for ${clientId}: ${linkErr.message}`)
  const tokenHash = linkData?.properties?.hashed_token
  if (!tokenHash) throw new Error(`agent link mint failed for ${clientId}`)

  const authClient = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: otp, error: otpErr } = await authClient.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (otpErr || !otp?.session?.access_token) throw new Error(`agent session mint failed: ${otpErr?.message || 'no session'}`)

  // A client whose every request carries the AGENT's JWT — RLS sees the agent.
  const db = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${otp.session.access_token}` } },
  })
  sessions.set(clientId, { client: db, exp: Date.now() + 50 * 60 * 1000 })
  return db
}

/* ── the guarded structured query ── */
export async function runAgentQuery(db, clientId, input) {
  const { table, select, filters = [], order, limit, aggregate } = input || {}
  const spec = TABLE_MAP[table]
  if (!spec) return { error: `table "${table}" is not in your schema — available: ${Object.keys(TABLE_MAP).join(', ')}` }

  // Silent narrowing is worse than an error — a query that runs with fewer
  // columns/filters than requested makes the agent confidently wrong. Every
  // guard here REJECTS with a corrective message instead of trimming.
  const cols = Array.isArray(select) && select.length ? select : null
  if (cols) {
    const unknown = cols.filter(c => !spec.columns.includes(c))
    if (unknown.length) {
      return { error: `unknown column(s) on ${table}: ${unknown.join(', ')} — its columns: ${spec.columns.join(', ')}` }
    }
  }
  const flt = Array.isArray(filters) ? filters : []
  if (flt.length > MAX_FILTERS) {
    return { error: `too many filters (${flt.length} > ${MAX_FILTERS}) — combine conditions or split into multiple queries` }
  }

  const applyFilters = (q) => {
    // Defense in depth + noise reduction: always pin the tenant when possible.
    // (RLS already guarantees the boundary even without this.)
    if (spec.hasClientId) q = q.eq('client_id', clientId)
    for (const f of flt) q = q[f.op](f.column, f.value)
    return q
  }
  for (const f of flt) {
    if (!f?.column || !spec.columns.includes(f.column)) return { error: `unknown filter column "${f?.column}" on ${table}` }
    if (!OPS.has(f.op)) return { error: `operator "${f.op}" not allowed — use: ${[...OPS].join(', ')}` }
    if (f.op === 'in' && !Array.isArray(f.value)) {
      return { error: `op "in" requires an array value (got ${typeof f.value}) — e.g. {"op":"in","value":["a","b"]}` }
    }
  }

  // ── aggregation mode: group-by computed server-side over up to 10k rows,
  // returning compact groups — the row cap never distorts the math. ──
  if (aggregate?.group_by) {
    const g = aggregate.group_by
    if (!spec.columns.includes(g)) return { error: `unknown group_by column "${g}" on ${table}` }
    const metrics = Array.isArray(aggregate.metrics) && aggregate.metrics.length ? aggregate.metrics : [{ op: 'count' }]
    for (const m of metrics) {
      if (!['count', 'sum', 'avg', 'min', 'max'].includes(m.op)) return { error: `aggregate op "${m.op}" not allowed — count, sum, avg, min, max` }
      if (m.op !== 'count' && !spec.columns.includes(m.column)) return { error: `unknown aggregate column "${m.column}" on ${table}` }
    }
    const needCols = [g, ...metrics.filter(m => m.column).map(m => m.column)]
    const groups = new Map()
    let scanned = 0
    for (let page = 0; scanned < AGG_MAX_ROWS; page++) {
      const { data, error } = await applyFilters(db.from(table).select([...new Set(needCols)].join(',')))
        .range(page * AGG_PAGE, page * AGG_PAGE + AGG_PAGE - 1)
      if (error) return { error: error.message }
      for (const row of data) {
        const key = row[g] ?? '(null)'
        let grp = groups.get(key)
        if (!grp) { grp = { n: 0, sums: {}, mins: {}, maxs: {} }; groups.set(key, grp) }
        grp.n++
        for (const m of metrics) {
          if (m.op === 'count') continue
          const v = Number(row[m.column])
          if (Number.isNaN(v)) continue
          grp.sums[m.column] = (grp.sums[m.column] || 0) + v
          grp.mins[m.column] = Math.min(grp.mins[m.column] ?? v, v)
          grp.maxs[m.column] = Math.max(grp.maxs[m.column] ?? v, v)
        }
      }
      scanned += data.length
      if (data.length < AGG_PAGE) break
    }
    const sortMetric = metrics.find(m => m.op !== 'count')
    const rows = [...groups.entries()].map(([key, grp]) => {
      const out = { [g]: key, count: grp.n }
      for (const m of metrics) {
        if (m.op === 'count') continue
        if (m.op === 'sum') out[`sum_${m.column}`] = Math.round(grp.sums[m.column] * 100) / 100
        if (m.op === 'avg') out[`avg_${m.column}`] = Math.round((grp.sums[m.column] / grp.n) * 100) / 100
        if (m.op === 'min') out[`min_${m.column}`] = grp.mins[m.column]
        if (m.op === 'max') out[`max_${m.column}`] = grp.maxs[m.column]
      }
      return out
    }).sort((a, b) => sortMetric
      ? (b[`sum_${sortMetric.column}`] ?? b[`avg_${sortMetric.column}`] ?? 0) - (a[`sum_${sortMetric.column}`] ?? a[`avg_${sortMetric.column}`] ?? 0)
      : b.count - a.count)
    const top = Math.max(1, Math.min(Number(aggregate.top) || AGG_MAX_GROUPS, AGG_MAX_GROUPS))
    return {
      groups: rows.slice(0, top),
      total_groups: rows.length,
      rows_scanned: scanned,
      ...(scanned >= AGG_MAX_ROWS ? { warning: `hit the ${AGG_MAX_ROWS}-row scan cap — narrow the date range for exact numbers` } : {}),
    }
  }

  let q = applyFilters(db.from(table).select(cols ? cols.join(',') : '*'))
  if (order?.column && spec.columns.includes(order.column)) {
    q = q.order(order.column, { ascending: order.ascending !== false })
  }
  // The cap is injected here — never trusted from the model (decision 2b).
  const cap = Math.max(1, Math.min(Number(limit) || 50, MAX_ROWS))
  q = q.limit(cap)

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), QUERY_TIMEOUT_MS)
  try {
    const { data, error } = await q.abortSignal(ctl.signal)
    if (error) return { error: error.message }
    return { rows: data, count: data.length, truncated: data.length === cap ? `showing first ${cap} — narrow with filters or aggregate` : undefined }
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'query timed out (10s)' : e.message }
  } finally {
    clearTimeout(timer)
  }
}
