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
  'client_orders', 'client_lead', 'client_yt_campaigns', 'client_yt_ad_groups',
  'client_yt_ads', 'client_meta_campaigns', 'client_klaviyo_campaigns',
  'client_materials', 'client_skus', 'client_daily_metrics',
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

/* ── agent session cache: clientId → { client, exp } ── */
const sessions = new Map()

export async function getAgentDb(clientId) {
  const cached = sessions.get(clientId)
  if (cached && cached.exp > Date.now()) return cached.client

  const email = `agent+${clientId}@conversionhero.co`
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

  // Mint a session without a password: magiclink token → verifyOtp.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkErr) throw new Error(`no agent identity for ${clientId}: ${linkErr.message}`)
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
  const { table, select, filters = [], order, limit } = input || {}
  const spec = TABLE_MAP[table]
  if (!spec) return { error: `table "${table}" is not in your schema — available: ${Object.keys(TABLE_MAP).join(', ')}` }

  const cols = Array.isArray(select) && select.length ? select.filter(c => spec.columns.includes(c)) : null
  if (Array.isArray(select) && select.length && !cols.length) {
    return { error: `none of the requested columns exist on ${table} — its columns: ${spec.columns.join(', ')}` }
  }

  let q = db.from(table).select(cols ? cols.join(',') : '*')
  // Defense in depth + noise reduction: always pin the tenant when possible.
  // (RLS already guarantees the boundary even without this.)
  if (spec.hasClientId) q = q.eq('client_id', clientId)

  for (const f of (Array.isArray(filters) ? filters : []).slice(0, MAX_FILTERS)) {
    if (!f?.column || !spec.columns.includes(f.column)) return { error: `unknown filter column "${f?.column}" on ${table}` }
    if (!OPS.has(f.op)) return { error: `operator "${f.op}" not allowed — use: ${[...OPS].join(', ')}` }
    q = q[f.op](f.column, f.op === 'in' && !Array.isArray(f.value) ? String(f.value).split(',') : f.value)
  }
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
