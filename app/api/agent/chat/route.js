import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { TOOL_DEFINITIONS, runTool, isProposalTool } from '../../../../lib/agent/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'claude-sonnet-4-5'
const MAX_TOOL_LOOPS = 5

export async function POST(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, clientId, pageContext } = await request.json()
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = [
    `You are the ConversionAgent assistant — an AI agent embedded in an agency dashboard for ConversionHero.`,
    `The current user is ${user.email}.`,
    clientId ? `The user is currently viewing client_id="${clientId}".` : '',
    pageContext ? `The user is on the "${pageContext}" page.` : '',
    `When the user asks about a client without specifying which one, assume they mean the current client (${clientId || 'none'}).`,
    `Use tools to look up real data — never invent numbers. If a tool returns an error, explain it plainly.`,
    `For ANY change to data (creating or updating scripts), use the propose* tools. These do NOT write to the database — they show the user a card with Accept/Reject. Never claim you have created or updated something; say "I've drafted a proposal — review it above."`,
    `CRITICAL: When the user asks for a revision, edit, tweak, or different version (e.g. "make it shorter", "change the tone", "try again", "remove X"), IMMEDIATELY call propose* again with the full updated content. Do NOT ask them to reject the old proposal first — the UI handles multiple proposals fine, the user will pick the one they like. Do NOT describe the changes in prose without calling the tool. Every requested change = call the tool right now.`,
    `Before proposing an update, call listScripts and (if you need the body) getScript so you target the correct row.`,
    `Be concise. Default to 1-3 sentences unless the user asks for detail.`,
    `Do not use markdown emphasis — never wrap text in **double asterisks** or *single asterisks*. The UI renders them as literal characters, not bold or italic. Use plain text. Asterisks are fine only when they appear naturally in content (e.g. footnotes, multiplication).`,
    `When answering questions about data (counts, statuses, breakdowns, lists), always respond in structured format — not prose sentences. Format rules:
- Lead with the client name and a colon (e.g. "Synergy Home has:")
- Use a bulleted list, one item per line
- Group by status/category when the data has natural groupings
- Put the number first, then the label (e.g. "- 2 New Leads")
- Only fall back to a sentence if there's exactly one value to report
Examples:

User: "How many leads do we have?"
You:
Synergy Home has:
- 2 New Leads
- 2 Appt Set
- 1 Sale

User: "What's the status of our scripts?"
You:
Synergy Home has 5 scripts:
- 3 Approved
- 1 In Review
- 1 Draft

User: "How many assets?"
You: Synergy Home has 12 assets.`,
  ].filter(Boolean).join(' ')

  const conversation = [...messages]
  const proposals = []

  try {
    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS,
        messages: conversation,
      })

      const toolUses = response.content.filter(b => b.type === 'tool_use')
      if (toolUses.length === 0) {
        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
        return NextResponse.json({ text, proposals, stopReason: response.stop_reason })
      }

      conversation.push({ role: 'assistant', content: response.content })

      const toolResults = await Promise.all(
        toolUses.map(async tu => {
          const result = await runTool({ name: tu.name, input: tu.input, user })
          if (isProposalTool(tu.name) && !result.error) proposals.push(result)
          return {
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(result),
          }
        })
      )
      conversation.push({ role: 'user', content: toolResults })
    }

    return NextResponse.json({ text: 'Reached tool-loop limit without a final answer.', proposals, stopReason: 'max_loops' })
  } catch (err) {
    console.error('agent/chat error:', err)
    return NextResponse.json({ error: err.message || 'Agent error' }, { status: 500 })
  }
}
