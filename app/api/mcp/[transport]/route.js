// Remote MCP server for external AI agents (Chorus) — READ-ONLY ShieldTech
// data access over Streamable HTTP.
//
//   • get_daily_pnl     — one day's locked P&L + per-channel rows
//   • get_pnl_range     — day rows across a range (trends)
//   • list_tables       — the queryable schema
//   • query_table       — the SAME guarded query the mission terminal agent
//                         uses: RLS agent identity, table/operator allowlist,
//                         enforced row caps. Reads only; writes are impossible.
//
// Auth: shared key, either ?key=… on the URL or Authorization: Bearer.
// Tenant: CHORUS_MCP_CLIENT (default ch069) — the key maps to ONE client.

import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { verify as verifyToken, originOf } from '../../../../lib/mcp-oauth'
import { createClient } from '@supabase/supabase-js'
import { getAgentDb, runAgentQuery, agentSchemaPrompt } from '../../../../lib/mission/agent-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CLIENT_ID = process.env.CHORUS_MCP_CLIENT || 'ch069'
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const dayInTz = (tz, offset = 0) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const d = new Date(parts + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
const json = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 1) }] })

const handler = createMcpHandler((server) => {
  server.tool(
    'get_daily_pnl',
    `One business day's locked Daily P&L for ${CLIENT_ID} (America/Phoenix days): blended totals (net sales, gross profit, orders, spend, COGS) plus one row per channel (Meta, Google, Direct, Klaviyo, …) with revenue/orders/cogs/spend. Ratios like ROAS = channel net_revenue ÷ spend. Defaults to yesterday.`,
    { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; defaults to yesterday in the client business timezone') },
    async ({ date }) => {
      const db = admin()
      const day = date || dayInTz('America/Phoenix', -1)
      const [{ data: pnl }, { data: channels }] = await Promise.all([
        db.from('client_daily_pnl').select('date, net_sales, gross_profit, total_orders, total_spend, cogs, metrics').eq('client_id', CLIENT_ID).eq('date', day).maybeSingle(),
        db.from('client_channel_daily_pnl').select('channel, gross_revenue, net_revenue, discounts, refunds, orders, new_orders, cogs, spend').eq('client_id', CLIENT_ID).eq('day', day).order('net_revenue', { ascending: false }),
      ])
      if (!pnl) return json({ day, error: 'no locked P&L row for this day yet' })
      const m = pnl.metrics || {}
      return json({
        day,
        blended: {
          gross_sales: m.grossSales, discounts: m.discounts, refunds: m.refunds, net_sales: pnl.net_sales,
          orders: pnl.total_orders, new_orders: m.nOrders, ad_spend: pnl.total_spend,
          blended_roas: m.blendedRoas, aov: m.trueAov, cpa: m.blendedCpa,
          cogs: pnl.cogs, contribution_margin: m.contributionMargin, gross_profit: pnl.gross_profit,
        },
        channels: channels || [],
      })
    },
  )

  server.tool(
    'get_pnl_range',
    `Daily P&L rows for ${CLIENT_ID} across a date range (inclusive) — for trends and week/month questions.`,
    {
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    },
    async ({ start, end }) => {
      const { data, error } = await admin().from('client_daily_pnl')
        .select('date, net_sales, gross_profit, total_orders, total_spend, cogs')
        .eq('client_id', CLIENT_ID).gte('date', start).lte('date', end).order('date')
      if (error) return json({ error: error.message })
      return json({ days: data || [] })
    },
  )

  server.tool(
    'list_tables',
    'The queryable tables and their columns (the allowlisted, RLS-governed ecom schema).',
    {},
    async () => ({ content: [{ type: 'text', text: agentSchemaPrompt() }] }),
  )

  server.tool(
    'query_table',
    `Run ONE guarded read query against ${CLIENT_ID}'s data — same engine as the in-app agent: allowlisted tables (see list_tables), operators eq/neq/gt/gte/lt/lte/like/ilike/in/is, hard row cap, automatic tenant scope, optional group-by aggregation. READ ONLY.`,
    {
      table: z.string(),
      select: z.array(z.string()).optional(),
      filters: z.array(z.object({ column: z.string(), op: z.string(), value: z.any() })).optional(),
      order: z.object({ column: z.string(), ascending: z.boolean().optional() }).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      aggregate: z.object({
        group_by: z.string(),
        metrics: z.array(z.object({ op: z.string(), column: z.string().optional() })).optional(),
      }).optional(),
    },
    async (input) => {
      try {
        const db = await getAgentDb(CLIENT_ID)
        const out = await runAgentQuery(db, CLIENT_ID, input)
        return json(out)
      } catch (e) { return json({ error: String(e?.message || e) }) }
    },
  )
}, {}, { basePath: '/api/mcp' })

// Auth gate: an OAuth access token (issued via /api/oauth/*, HMAC-verified)
// or the raw shared key (?key= / Bearer). 401s advertise the discovery URL so
// MCP clients (Chorus) can run the OAuth flow.
const withKey = (h) => async (req, ctx) => {
  const expected = process.env.CHORUS_MCP_KEY
  if (!expected) return new Response('MCP disabled (no CHORUS_MCP_KEY set)', { status: 503 })
  const url = new URL(req.url)
  const got = url.searchParams.get('key') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const tok = verifyToken(got)
  const ok = got === expected || (tok && tok.t === 'access')
  if (!ok) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': `Bearer resource_metadata="${originOf(req)}/.well-known/oauth-protected-resource"` },
    })
  }
  return h(req, ctx)
}

export const GET = withKey(handler)
export const POST = withKey(handler)
export const DELETE = withKey(handler)
