import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { userCanAccessClient } from '../../../../lib/access'
import { getAgentDb, runAgentQuery, agentSchemaPrompt } from '../../../../lib/mission/agent-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'claude-opus-4-8'
const MAX_QUERIES_PER_ASK = 6   // per-turn budget (decision 2b) — runaway agents surface as errors
const MAX_TOOL_ROUNDS = 8

// UI-only tools. The dashboard executes these in front of the user — they
// move things around INSIDE the IDE (tabs, cards, local ledger). None of
// them can touch ad platforms, money, or the database.
const TOOLS = [
  {
    name: 'open_tab',
    description: 'Open a view tab in the IDE for the user. Use when they ask to see or go to a surface (campaigns, orders, ledger, manual…).',
    input_schema: {
      type: 'object',
      properties: { view: { type: 'string', enum: ['overview', 'google', 'meta', 'orders', 'klaviyo', 'manual', 'ledger', 'policies'] } },
      required: ['view'],
    },
  },
  {
    name: 'set_range',
    description: 'Change the data window the whole IDE is looking at.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', enum: [7, 30, 90] } },
      required: ['days'],
    },
  },
  {
    name: 'reopen_decision',
    description: 'Local undo: move a previously approved decision from the Ledger back to PROBLEMS as an open card the user can approve or dismiss again. Nothing touches ad platforms. Use when the user asks to undo, revert, or reopen a decision.',
    input_schema: {
      type: 'object',
      properties: { match: { type: 'string', description: 'substring of the decision text to identify it; omit to reopen the most recent decision' } },
      required: [],
    },
  },
  {
    name: 'render_view',
    description: 'Render a chart or table NATIVELY in the terminal instead of describing numbers in prose. Use whenever the user asks to compare, chart, visualize, trend, or break down data. Every value must come from (or be arithmetic on) the provided data. Prefer this over long bullet lists of numbers.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bar', 'line', 'table'] },
        title: { type: 'string' },
        bars: { type: 'array', description: 'for type=bar', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' }, text: { type: 'string', description: 'formatted value shown at bar end, e.g. "$8,136" or "4.17x"' } }, required: ['label', 'value'] } },
        line: { type: 'object', description: 'for type=line', properties: { labels: { type: 'array', items: { type: 'string' } }, series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } }, required: ['name', 'values'] } } }, required: ['labels', 'series'] },
        table: { type: 'object', description: 'for type=table', properties: { head: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } }, required: ['head', 'rows'] },
      },
      required: ['type', 'title'],
    },
  },
  {
    name: 'query_data',
    description: 'Query the client\'s live database (their tenant only — enforced by row-level security). Use when the provided context JSON cannot answer the question: individual orders, customer fields, zip codes, ad-group/ad level stats, date ranges outside the loaded window, etc. Returns raw rows. Prefer the context JSON when it already has the answer — it is pre-aggregated and faster.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'one of the tables in your SCHEMA' },
        select: { type: 'array', items: { type: 'string' }, description: 'columns to return; omit for all. Keep narrow — big rows waste your context.' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'] },
              value: { description: 'string/number; array for op=in; use ISO timestamps for created_at' },
            },
            required: ['column', 'op'],
          },
        },
        order: { type: 'object', properties: { column: { type: 'string' }, ascending: { type: 'boolean' } } },
        limit: { type: 'integer', description: 'max rows (server caps at 200)' },
      },
      required: ['table'],
    },
  },
  {
    name: 'draft_finding',
    description: 'Draft a NEW action card into PROBLEMS for the user to approve or dismiss. Use when the user asks you to propose or queue something. You draft — the human decides. Base the title/why on real numbers from the data.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        why: { type: 'string', description: 'the evidence and math, from the provided data only' },
        severity: { type: 'string', enum: ['high', 'medium'] },
        impact_monthly: { type: 'number', description: 'estimated $/month impact; omit if unknown' },
      },
      required: ['title', 'why'],
    },
  },
]

// Mission Control ask bar: grounded Q&A over the exact metrics the page is
// showing. The client sends a compact JSON context (same numbers as the KPI
// strip) + the session history, so answers cite real rows and context carries
// across turns — no tools needed for v1.
export async function POST(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { question, context, history } = await request.json()
  if (!question || !context) {
    return NextResponse.json({ error: 'question and context required' }, { status: 400 })
  }
  // The asking human must reach this client; queries then run as the CLIENT'S
  // agent identity (decision 1a/1b: agent scoped to the client, asker audited).
  const clientId = context.clientId || context.client_id
  if (!clientId || !(await userCanAccessClient(user.id, clientId))) {
    return NextResponse.json({ error: 'no access to this client' }, { status: 403 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const system = [
    `You are the Mission Control analyst for ${context.client || 'this ecom client'} inside the ConversionHero dashboard.`,
    `Answer questions using ONLY the JSON data provided in the first user message. Never invent numbers, campaigns, or dates. If the data can't answer the question, say exactly what's missing.`,
    `Key definitions you must respect: True ROAS = (UTM-attributed revenue − real BOM COGS) ÷ ad spend, so breakeven is 1.00x. The top-level true_roas_paid_only divides PAID contribution by spend — organic revenue never inflates it. COGS comes from the client's bill of materials, not estimates.`,
    `Style: lead with the direct answer and the number. 2-5 short sentences, then bullet lines only when comparing items. No markdown emphasis (no asterisks). Round dollars to whole numbers. When you reference a figure, it must appear in (or be arithmetic on) the provided data.`,
    `If the user asks what to DO, give one concrete recommendation with the math behind it — and when appropriate, draft it as a card with the draft_finding tool so it lands in PROBLEMS for their approval.`,
    `TOOLS: you have UI-only tools (open_tab, set_range, reopen_decision, draft_finding, render_view). They are executed by the dashboard in front of the user, instantly. They move things around INSIDE the IDE only — they can never pause campaigns, change budgets, or touch any ad platform, and you must never claim otherwise. Approving is always the human's move: you may draft cards and reopen decisions, never approve them. Use a tool when the user's request is an action ("reopen that", "show me orders", "draft a card for X"); answer in text when it's a question. After calling a tool, one short sentence confirming what you did is enough.`,
    `QUERYING: you also have query_data — live read access to this client's database, scoped to their tenant by row-level security. Use it when the context JSON can't answer (customer-level fields, zip codes, ad-group/ad stats, other date windows). You get at most ${MAX_QUERIES_PER_ASK} queries per question, so plan them; select only the columns you need. Numbers you cite may come from the context JSON OR from query results — never from anywhere else. SCHEMA (table(columns…)):\n${agentSchemaPrompt()}`,
  ].join(' ')

  const messages = [
    { role: 'user', content: `DATA (range ${context.range?.start} → ${context.range?.end}):\n${JSON.stringify(context, null, 1)}` },
    { role: 'assistant', content: 'Understood. I have the data and will answer only from it.' },
  ]
  for (const turn of (history || []).slice(-6)) {
    messages.push({ role: 'user', content: turn.q })
    messages.push({ role: 'assistant', content: turn.a })
  }
  messages.push({ role: 'user', content: question })

  try {
    // Tool loop: query_data executes server-side AS THE AGENT IDENTITY
    // (RLS-scoped session — a bad query reads at most this tenant); UI tools
    // are acked immediately and shipped to the dashboard to run client-side.
    const actions = []
    const texts = []
    let queriesUsed = 0
    let agentDb = null
    let response
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system,
        tools: TOOLS,
        messages,
      })
      texts.push(...response.content.filter(b => b.type === 'text').map(b => b.text))
      const toolUses = response.content.filter(b => b.type === 'tool_use')
      if (!toolUses.length) break

      const results = []
      for (const tu of toolUses) {
        if (tu.name === 'query_data') {
          let result
          if (queriesUsed >= MAX_QUERIES_PER_ASK) {
            result = { error: `query budget exhausted (${MAX_QUERIES_PER_ASK}/question) — answer with what you have` }
          } else {
            queriesUsed++
            try {
              agentDb = agentDb || await getAgentDb(clientId)
              result = await runAgentQuery(agentDb, clientId, tu.input)
            } catch (e) {
              result = { error: e.message }
            }
          }
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
        } else {
          // UI-only tool: hand to the dashboard, ack so the loop can continue.
          actions.push({ name: tu.name, input: tu.input })
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'done — executed in the UI.' })
        }
      }
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: results })
      if (response.stop_reason !== 'tool_use') break
    }
    const answer = texts.join('\n').trim()
    return NextResponse.json({ answer, actions, usage: response?.usage, queries: queriesUsed })
  } catch (e) {
    console.error('[mission/ask]', e)
    return NextResponse.json({ error: e.message || 'ask failed' }, { status: 500 })
  }
}
