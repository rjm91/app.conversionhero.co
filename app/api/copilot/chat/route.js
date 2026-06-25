import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { COPILOT_TOOL_DEFINITIONS, runCopilotTool, isCopilotTool } from '../../../../lib/agent/copilot-tools'
import { isAgencyUser } from '../../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'claude-opus-4-8'
const MAX_TOOL_LOOPS = 6

export async function POST(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // On-the-side build: agency users only for now.
  const role = user.user_metadata?.role || ''
  if (!isAgencyUser(role)) {
    // fall back to profiles table if role isn't on the JWT
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!isAgencyUser(profile?.role)) {
      return NextResponse.json({ error: 'Agency access required' }, { status: 403 })
    }
  }

  const { messages, clientId } = await request.json()
  if (!Array.isArray(messages)) return NextResponse.json({ error: 'messages required' }, { status: 400 })
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)

  const systemPrompt = [
    `You are the ecom Copilot — an AI CMO embedded in the ConversionHero dashboard, operating the account for client_id="${clientId}".`,
    `The current user is ${user.email}. Today is ${todayISO}; the current month starts ${monthStart}. Use these for "this month", "today", etc.`,
    `Your objective function is first-party, contribution-MARGIN-aware ROAS (contribution ÷ ad spend) — NOT platform-reported ROAS. Always reason in terms of margin, not vanity revenue ÷ spend.`,
    `CRITICAL DATA RULE: Call a tool before reporting ANY number or fact. Never invent or recall figures from training. Every number in your answer must come from a tool result in this conversation. If you lack the data, say so plainly.`,
    `COGS DISCLOSURE: The margin tools compute contribution from an ASSUMED gross-margin % (they return it in \`assumptions\`). Whenever you report a margin or margin-aware ROAS figure, disclose the assumption in one short clause, e.g. "(assuming 60% gross margin)". Real per-product COGS is not wired up yet.`,
    `Be concise and direct — lead with the answer. Default to 1-4 sentences or a short list. Do not use markdown bold/italic asterisks; the UI renders them literally.`,
    `When you report structured data (a ranking, a breakdown, a list of orders), keep the prose short — the dashboard renders the full table beside the chat, so summarize the takeaway rather than re-listing every row.`,
  ].join(' ')

  const conversation = [...messages]
  const toolData = [] // structured results, surfaced to the canvas

  try {
    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        tools: COPILOT_TOOL_DEFINITIONS,
        messages: conversation,
      })

      const toolUses = response.content.filter(b => b.type === 'tool_use')
      if (toolUses.length === 0) {
        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
        return NextResponse.json({ text, toolData, stopReason: response.stop_reason })
      }

      // Preserve full content (incl. thinking blocks) when continuing the loop.
      conversation.push({ role: 'assistant', content: response.content })

      const toolResults = await Promise.all(
        toolUses.map(async tu => {
          const result = await runCopilotTool({ name: tu.name, input: tu.input, user })
          if (isCopilotTool(tu.name) && !result.error) {
            toolData.push({ tool: tu.name, input: tu.input, result })
          }
          return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) }
        })
      )
      conversation.push({ role: 'user', content: toolResults })
    }

    return NextResponse.json({ text: 'I hit the tool-loop limit before finishing — try narrowing the question.', toolData, stopReason: 'max_loops' })
  } catch (err) {
    console.error('copilot/chat error:', err)
    return NextResponse.json({ error: err.message || 'Copilot error' }, { status: 500 })
  }
}
