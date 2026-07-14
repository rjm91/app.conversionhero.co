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
    description: 'Create OR update a prospect\'s service-agreement draft and open the Agreement Builder for the human to review and SEND. It never sends, emails, or invoices. It can edit EVERY part of the draft: structured fields (package, billing, price, term, fees, rev share), the scope of work (customScope), the payment options the client chooses between (paymentOptions), the email wrapper (emailSubject, emailMessage, emailCc), and — when the user explicitly asks to edit the contract prose itself — the full terms text (emailTerms). PREFER STRUCTURED FIELDS: the contract text normally regenerates from the fields, so scope rewrites go in customScope, price/term changes in their fields. Reach for emailTerms ONLY when the request is genuinely about the contract wording and maps to no field; you must pass the COMPLETE revised document (it replaces the whole text, and freezes it — it stops regenerating from fields until the human resets it). Base the revision on workspace.viewing_agreement.effective_terms. To UPDATE an existing draft, pass the existing lead_id (or matching company/email) and ONLY the field(s) you are changing — all other fields are preserved (passing packageId would change the package, so omit it unless you intend to change it).',
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
        revStart: { type: 'string', description: 'Revenue-share start date, YYYY-MM-DD.' },
        termCustom: { type: 'string', description: 'Custom term text when term is "Custom…".' },
        notes: { type: 'string' },
        paymentOptions: {
          type: 'array',
          description: 'The "choose how to pay" options in the email — REPLACES the whole list, so when editing one option, pass ALL options (current ones are in workspace.viewing_agreement.draft.paymentOptions). Notes should state the term length, e.g. "$3,000/mo, billed monthly (90 days)".',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Keep the existing id when editing an option; omit for a new one.' },
              label: { type: 'string', description: 'e.g. "Pay monthly", "Pay upfront".' },
              amount: { type: 'number', description: 'Amount invoiced NOW if the client picks this option. Must be > 0.' },
              note: { type: 'string', description: 'One-line note under the label.' },
            },
            required: ['label', 'amount'],
          },
        },
        emailSubject: { type: 'string', description: 'Subject line of the agreement email.' },
        emailMessage: { type: 'string', description: 'The personal message at the top of the agreement email (plain text).' },
        emailCc: { type: 'string', description: 'Comma-separated CC list for the agreement email.' },
        emailTerms: { type: 'string', description: 'The COMPLETE contract/terms text — only when the user explicitly asks to edit the contract prose and no structured field expresses it. Revise from workspace.viewing_agreement.effective_terms; passing this freezes the terms (they stop regenerating from fields).' },
      },
    },
  },
  {
    name: 'open_agreement',
    description: 'Open an existing prospect\'s Agreement Builder (to review or continue a draft). Use when the user names a prospect already in the pipeline and wants to open their agreement without changing it.',
    input_schema: { type: 'object', properties: { lead_id: { type: 'string' } }, required: ['lead_id'] },
  },
  {
    name: 'rename_session',
    description: 'Rename the CURRENT terminal conversation (the chat the user is in) — this only re-titles the chat thread in the History list, nothing else. Use when the user asks to rename/title/call this chat something. Provide a short title (a few words).',
    input_schema: { type: 'object', properties: { title: { type: 'string', description: 'The new short title for this conversation.' } }, required: ['title'] },
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
    `WORKSPACE AWARENESS: context.workspace tells you what the user is looking at RIGHT NOW — workspace.active_tab (the focused tab), workspace.open_tabs, and workspace.viewing_agreement (when they're on an agreement builder: the prospect's lead_id, company, contact, the CURRENT draft fields in .draft, and the full contract text in .effective_terms with .terms_are_generated saying whether it's auto-generated or hand-edited). When the user says "this", "this agreement", "this draft", "this client", or asks something with no subject, resolve it to workspace.viewing_agreement (or the active tab) — do NOT ask which one they mean, and NEVER ask them to paste draft or contract text you already have in viewing_agreement. Only ask for clarification if workspace genuinely doesn't identify the subject.`,
    `TOOLS AVAILABLE PER TAB: everywhere — open_view (Schema/Fleet/Leads/Agreements), open_agreement (open a prospect's builder tab), draft_agreement (create/update a draft), rename_session. On an agreement builder tab, draft_agreement with viewing_agreement.lead_id is how you edit THE draft on screen; changes appear live in that tab. The Schema/Fleet/Leads/Agreements views are read-only browsers — there are no other tools for them, so if asked to change something those views show (e.g. client data, metrics), say the terminal can't edit that and point to where it lives. If asked "what can you do here", answer from this list for the active tab.`,
    `Style: lead with the direct answer. 2-5 short sentences, bullets only when listing. No markdown emphasis (no asterisks). Round dollars to whole numbers.`,
    `AGREEMENTS — CREATING: when the user asks to create/draft/prepare a NEW agreement, call draft_agreement with everything you can infer (company, contact, email, package, billing, term). Default packageId to "growth" and billing to "monthly" only for a genuinely new agreement. If they named a package, map it (Pilot/Starter/Growth/Pro/Custom).`,
    `AGREEMENTS — UPDATING: when the user asks to change something on an EXISTING prospect's agreement (it's in the pipeline context with a lead_id and has_agreement), call draft_agreement with that lead_id and ONLY the field(s) you are changing. Do NOT include packageId/billing unless you intend to change them — including them overwrites the existing package. To rewrite/clean up/simplify the SCOPE OF WORK, put the improved wording in customScope; the contract's Services section regenerates from it.`,
    `CONTRACT TEXT — FIELDS FIRST, PROSE WHEN ASKED: the terms document normally regenerates from the structured fields, so route edits through fields whenever one expresses the request (scope wording → customScope; price/term/fees/rev share → their fields) and tell the user the terms regenerate. When the user explicitly asks to change the contract wording itself (add a section, reword a clause) and no field maps, you CAN edit it: read workspace.viewing_agreement.effective_terms (the exact text as it stands), apply the requested change, and pass the COMPLETE revised document as emailTerms. Warn in your reply that hand-edited terms stop regenerating from fields until reset in the builder. Never pass emailTerms together with customScope in one call unless you have already folded the new scope into the terms text yourself.`,
    `HONESTY — this is critical: only claim what a tool ACTUALLY did. After a tool runs, the dashboard returns a result; describe exactly that (which fields changed, or that nothing changed). Never say "done, I dropped it in" or "I updated the scope" unless the tool call carried that field and it actually changed. If you are handing the user text to paste rather than applying it, say exactly that. Overclaiming a change you did not make is worse than doing nothing.`,
    `PACKAGES (for reference; the builder owns exact pricing): ${PACKAGES.filter(p => p.price).map(p => `${p.name} $${p.price}/mo (${p.videos} videos)`).join(', ')}, plus Custom.`,
    `RENAMING THIS CHAT: if the user asks to rename/title this conversation, call rename_session with a short title. It only re-titles the thread in the History list. Confirm the new title in one short sentence.`,
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
  const runTools = (content) => {
    const toolUses = content.filter(b => b.type === 'tool_use')
    if (!toolUses.length) return false
    const results = []
    for (const tu of toolUses) {
      // All agency tools are UI-executed by the page (create/patch lead,
      // navigate). Hand them off; the page validates + runs them.
      actions.push({ name: tu.name, input: tu.input })
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'handed to the dashboard to execute.' })
    }
    messages.push({ role: 'assistant', content })
    messages.push({ role: 'user', content: results })
    return true
  }
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const finalTurn = round === MAX_TOOL_ROUNDS - 1
      if (finalTurn) messages.push({ role: 'user', content: 'Give your final answer now — no more tool calls.' })
      response = await client.messages.create({
        model: MODEL, max_tokens: 8000, thinking: { type: 'adaptive' }, system, tools: TOOLS,
        ...(finalTurn ? { tool_choice: { type: 'none' } } : {}), messages,
      })
      texts.push(...response.content.filter(b => b.type === 'text').map(b => b.text))
      if (!runTools(response.content)) break
    }

    // STRUCTURAL HONESTY GUARD: if the reply asserts it changed the agreement
    // but no draft_agreement tool actually ran, force a correction — the model
    // must either apply the change for real or retract the claim. Prevents the
    // "Done, I updated the scope" lie when nothing was saved.
    let answer = texts.join('\n\n').trim()
    const claimedChange = /\b(updated|changed|revised|rewrote|swapped|adjusted|reworded|simplified|cleaned up|dropped (it|this|that) in|added .*(to|into) (the|your)|i'?ve (updated|changed|added|revised|set)|now (leads|reads|includes)|done[.,!])\b/i.test(answer)
      && /\b(scope|agreement|draft|package|term|contract|deliverable)\b/i.test(answer)
    if (claimedChange && !actions.some(a => a.name === 'draft_agreement')) {
      messages.push({ role: 'assistant', content: answer })
      messages.push({ role: 'user', content: 'STOP. Your reply says you changed the agreement, but you did NOT call draft_agreement, so nothing was saved — the draft is unchanged. Do ONE of these now: (a) call draft_agreement with the lead_id from the context and the exact field(s) you described (e.g. customScope), so the change is actually applied; or (b) if you cannot or should not apply it, rewrite your reply to state clearly that you have NOT made the change and ask whether to apply it. Do not claim any change you did not make.' })
      const fix = await client.messages.create({
        model: MODEL, max_tokens: 6000, thinking: { type: 'adaptive' }, system, tools: TOOLS, messages,
      })
      const fixText = fix.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n').trim()
      const applied = runTools(fix.content)
      answer = fixText || (applied ? 'Applied the change.' : answer)
    }

    return NextResponse.json({ answer: answer || 'Done.', actions })
  } catch (e) {
    return NextResponse.json({ error: e.message || 'agent error' }, { status: 500 })
  }
}
