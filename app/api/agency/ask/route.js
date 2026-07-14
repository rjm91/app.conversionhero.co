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
    description: 'Create OR update a prospect\'s service-agreement draft (structured fields only) and open the Agreement Builder for the human to review and SEND. It never sends, emails, or invoices. IMPORTANT: it edits STRUCTURED fields — package, billing, price, term, and the human-readable customScope. The builder GENERATES the legal contract text from these fields; you do NOT and cannot hand-write the contract/terms prose. To improve the "scope of work" wording, set customScope to the improved text — the terms regenerate from it. To UPDATE an existing draft (e.g. "clean up the scope for Acme"), pass the existing lead_id (or matching company/email) and ONLY the field(s) you are changing — all other fields are preserved (passing packageId would change the package, so omit it unless you intend to change it). If nothing about the request maps to these structured fields, say so instead of calling the tool.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'Existing agency_leads id — REQUIRED when updating a prospect already in the pipeline (from the context). Omit only for a brand-new prospect.' },
        company: { type: 'string' },
        contact: { type: 'string', description: 'Full contact name.' },
        email: { type: 'string' },
        phone: { type: 'string' },
        legalName: { type: 'string', description: 'Legal entity name for the agreement, if different from company.' },
        address: { type: 'string' },
        packageId: { type: 'string', enum: ['pilot', 'starter', 'growth', 'pro', 'custom'], description: 'Only include when creating a new agreement or deliberately changing the package. Omit when updating other fields, or you will change the package.' },
        billing: { type: 'string', enum: ['monthly', 'quarterly', 'annual'] },
        customName: { type: 'string', description: 'Display name of a custom package.' },
        customScope: { type: 'string', description: 'The human-readable scope of work. This is the field to set when asked to clean up / rewrite / simplify the scope. The contract\'s Services section is generated from it.' },
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
    `AGREEMENTS — CREATING: when the user asks to create/draft/prepare a NEW agreement, call draft_agreement with everything you can infer (company, contact, email, package, billing, term). Default packageId to "growth" and billing to "monthly" only for a genuinely new agreement. If they named a package, map it (Pilot/Starter/Growth/Pro/Custom).`,
    `AGREEMENTS — UPDATING: when the user asks to change something on an EXISTING prospect's agreement (it's in the pipeline context with a lead_id and has_agreement), call draft_agreement with that lead_id and ONLY the field(s) you are changing. Do NOT include packageId/billing unless you intend to change them — including them overwrites the existing package. To rewrite/clean up/simplify the SCOPE OF WORK, put the improved wording in customScope; the contract's Services section regenerates from it.`,
    `THE CONTRACT TEXT IS GENERATED, NOT AUTHORED BY YOU: the legal/terms prose in the builder is produced from the structured fields. You cannot directly rewrite that prose, and there is no tool to do so. If the user asks you to reword the raw contract/terms text itself, edit the underlying structured field (usually customScope) instead, and tell them the terms will regenerate from it — or, if it doesn't map to a field, say plainly that they can edit that text directly in the builder. Never imply you rewrote contract language that you cannot touch.`,
    `HONESTY — this is critical: only claim what a tool ACTUALLY did. After a tool runs, the dashboard returns a result; describe exactly that (which fields changed, or that nothing changed). Never say "done, I dropped it in" or "I updated the scope" unless the tool call carried that field and it actually changed. If you are handing the user text to paste rather than applying it, say exactly that. Overclaiming a change you did not make is worse than doing nothing.`,
    `PACKAGES (for reference; the builder owns exact pricing): ${PACKAGES.filter(p => p.price).map(p => `${p.name} $${p.price}/mo (${p.videos} videos)`).join(', ')}, plus Custom.`,
    `TOOLS run in front of the user instantly and only move things inside the IDE or save a draft. Approving/sending is always the human's move — never claim you sent an agreement or emailed anyone. Use a tool when the request is an action; answer in text when it's a question. After a tool call, a single short sentence stating exactly what changed is enough.`,
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
