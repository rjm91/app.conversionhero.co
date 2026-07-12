import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { isAgencyUser } from '../../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'claude-opus-4-8'
const MAX_TOOL_ROUNDS = 6

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// The packages the agreement builder knows (kept in sync with the builder's
// PACKAGES). The agent picks a packageId; the builder owns pricing/line items.
const PACKAGES = [
  { id: 'pilot', name: 'Pilot', price: 1000, videos: 8 },
  { id: 'starter', name: 'Starter', price: 1550, videos: 13 },
  { id: 'growth', name: 'Growth', price: 2450, videos: 21 },
  { id: 'pro', name: 'Pro', price: 3750, videos: 34 },
  { id: 'custom', name: 'Custom', price: null, videos: null },
]

// UI-only + draft tools. NONE of these send an agreement, email a customer, or
// create an invoice — sending is always the human's explicit click in the
// builder. draft_agreement only writes a DRAFT and opens it for review.
const TOOLS = [
  {
    name: 'open_view',
    description: 'Switch the agency IDE to a view.',
    input_schema: { type: 'object', properties: { view: { type: 'string', enum: ['fleet', 'leads', 'agreements'] } }, required: ['view'] },
  },
  {
    name: 'draft_agreement',
    description: 'Draft a service agreement for a prospect and open the Agreement Builder prefilled for the human to review and SEND. This does NOT send anything, email anyone, or create an invoice — it only saves a draft the human then reviews. Use when the user asks to create/draft/prepare/start an agreement. If the prospect already exists in the pipeline you may pass their lead_id; otherwise pass their contact details and a new lead is created.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'Existing agency_leads id, if this prospect is already in the pipeline. Omit for a brand-new prospect.' },
        company: { type: 'string' },
        contact: { type: 'string', description: 'Full contact name.' },
        email: { type: 'string' },
        phone: { type: 'string' },
        legalName: { type: 'string', description: 'Legal entity name for the agreement, if different from company.' },
        address: { type: 'string' },
        packageId: { type: 'string', enum: ['pilot', 'starter', 'growth', 'pro', 'custom'] },
        billing: { type: 'string', enum: ['monthly', 'quarterly', 'annual'] },
        customName: { type: 'string' },
        customScope: { type: 'string', description: 'Scope description when packageId is custom.' },
        customPrice: { type: 'number', description: 'Monthly price when packageId is custom.' },
        term: { type: 'string', description: 'Commitment term, e.g. "4 months", "Month-to-month".' },
        setupFee: { type: 'number' },
        adOn: { type: 'boolean', description: 'Ad management add-on enabled.' },
        adPct: { type: 'number' },
        revOn: { type: 'boolean', description: 'Revenue share enabled.' },
        revPct: { type: 'number' },
        notes: { type: 'string' },
      },
    },
  },
  {
    name: 'open_agreement',
    description: 'Open an existing prospect\'s Agreement Builder (to review or continue a draft). Use when the user names a prospect already in the pipeline and wants to open their agreement without changing it.',
    input_schema: { type: 'object', properties: { lead_id: { type: 'string' } }, required: ['lead_id'] },
  },
]

export async function POST(request) {
  const { question, context, history } = await request.json().catch(() => ({}))
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })

  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyUser(prof?.role)) return NextResponse.json({ error: 'Agency users only' }, { status: 403 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const system = [
    `You are the agency operations analyst inside ConversionHero's fullscreen "mission" IDE — the agency cockpit, not a single client. You help the ConversionHero team run the agency: the client fleet, the sales pipeline (leads), and service agreements.`,
    `Answer from the JSON context provided (fleet rollups + recent leads). Never invent numbers, names, or dates. If the data can't answer, say what's missing.`,
    `Style: lead with the direct answer. 2-5 short sentences, bullets only when listing. No markdown emphasis (no asterisks). Round dollars to whole numbers.`,
    `AGREEMENTS: when the user asks to create/draft/prepare an agreement for someone, call draft_agreement with everything you can infer (company, contact, email, package, billing, term). Default packageId to "growth" and billing to "monthly" unless they say otherwise. This tool only DRAFTS and opens the builder — it never sends, emails, or invoices; the human reviews and clicks Send. Say so plainly: confirm you drafted it and that they should review and send. If they gave you a package by name, map it (Pilot/Starter/Growth/Pro/Custom). If key info is missing (no email for a brand-new prospect), draft what you can and note what to fill in.`,
    `PACKAGES (for reference; the builder owns exact pricing): ${PACKAGES.filter(p => p.price).map(p => `${p.name} $${p.price}/mo (${p.videos} videos)`).join(', ')}, plus Custom.`,
    `TOOLS run in front of the user instantly and only move things inside the IDE or save a draft. Approving/sending is always the human's move — never claim you sent an agreement or emailed anyone. Use a tool when the request is an action; answer in text when it's a question.`,
  ].join(' ')

  const messages = [
    { role: 'user', content: `AGENCY CONTEXT:\n${JSON.stringify(context || {}, null, 1)}` },
    { role: 'assistant', content: 'Understood. I have the agency context and will answer only from it.' },
  ]
  for (const turn of (history || []).slice(-6)) {
    messages.push({ role: 'user', content: turn.q })
    messages.push({ role: 'assistant', content: turn.a })
  }
  messages.push({ role: 'user', content: question })

  const actions = []
  const texts = []
  let response = null
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const finalTurn = round === MAX_TOOL_ROUNDS - 1
      if (finalTurn) messages.push({ role: 'user', content: 'Give your final answer now — no more tool calls.' })
      response = await client.messages.create({
        model: MODEL, max_tokens: 8000, thinking: { type: 'adaptive' }, system, tools: TOOLS,
        ...(finalTurn ? { tool_choice: { type: 'none' } } : {}), messages,
      })
      texts.push(...response.content.filter(b => b.type === 'text').map(b => b.text))
      const toolUses = response.content.filter(b => b.type === 'tool_use')
      if (!toolUses.length) break
      const results = []
      for (const tu of toolUses) {
        // All agency tools are UI-executed by the page (create/patch lead,
        // navigate). Hand them off; the page validates + runs them.
        actions.push({ name: tu.name, input: tu.input })
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'handed to the dashboard to execute.' })
      }
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: results })
    }
  } catch (e) {
    return NextResponse.json({ error: e.message || 'agent error' }, { status: 500 })
  }

  return NextResponse.json({ answer: texts.join('\n\n').trim() || 'Done.', actions })
}
