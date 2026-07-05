import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'claude-opus-4-8'

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

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const system = [
    `You are the Mission Control analyst for ${context.client || 'this ecom client'} inside the ConversionHero dashboard.`,
    `Answer questions using ONLY the JSON data provided in the first user message. Never invent numbers, campaigns, or dates. If the data can't answer the question, say exactly what's missing.`,
    `Key definitions you must respect: True ROAS = (UTM-attributed revenue − real BOM COGS) ÷ ad spend, so breakeven is 1.00x. The top-level true_roas_paid_only divides PAID contribution by spend — organic revenue never inflates it. COGS comes from the client's bill of materials, not estimates.`,
    `Style: lead with the direct answer and the number. 2-5 short sentences, then bullet lines only when comparing items. No markdown emphasis (no asterisks). Round dollars to whole numbers. When you reference a figure, it must appear in (or be arithmetic on) the provided data.`,
    `If the user asks what to DO, give one concrete recommendation with the math behind it — and when appropriate, draft it as a card with the draft_finding tool so it lands in PROBLEMS for their approval.`,
    `TOOLS: you have UI-only tools (open_tab, set_range, reopen_decision, draft_finding, render_view). They are executed by the dashboard in front of the user, instantly. They move things around INSIDE the IDE only — they can never pause campaigns, change budgets, or touch any ad platform, and you must never claim otherwise. Approving is always the human's move: you may draft cards and reopen decisions, never approve them. Use a tool when the user's request is an action ("reopen that", "show me orders", "draft a card for X"); answer in text when it's a question. After calling a tool, one short sentence confirming what you did is enough.`,
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
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system,
      tools: TOOLS,
      messages,
    })
    const answer = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    // Tool calls come back as actions for the CLIENT to execute (UI-only).
    // Single pass, no tool loop — these are fire-and-forget UI commands.
    const actions = response.content.filter(b => b.type === 'tool_use').map(b => ({ name: b.name, input: b.input }))
    return NextResponse.json({ answer, actions, usage: response.usage })
  } catch (e) {
    console.error('[mission/ask]', e)
    return NextResponse.json({ error: e.message || 'ask failed' }, { status: 500 })
  }
}
