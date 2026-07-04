import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'claude-opus-4-8'

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
    `If the user asks what to DO, give one concrete recommendation with the math behind it, and note it lands in the Action Queue for approval — you never execute anything.`,
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
      messages,
    })
    const answer = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    return NextResponse.json({ answer, usage: response.usage })
  } catch (e) {
    console.error('[mission/ask]', e)
    return NextResponse.json({ error: e.message || 'ask failed' }, { status: 500 })
  }
}
