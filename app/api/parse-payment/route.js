export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { isAgencyAdmin } from '../../../lib/roles'

const METHODS = ['Zelle', 'Venmo', 'Cash', 'Check', 'Wire', 'PayPal', 'Other']

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}
async function requireAgencyAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyAdmin(profile?.role)) return { error: 'Forbidden', status: 403 }
  return { ok: true }
}

export async function POST(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { transcript, clients } = await request.json()
  if (!transcript) return NextResponse.json({ error: 'transcript required' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  const clientList = (clients || []).map(c => `${c.client_id}: ${c.client_name}`).join('\n')

  const prompt = `You extract a payment from a spoken transcript. Today is ${today}.

Clients (id: name):
${clientList}

Transcript: "${transcript}"

Return ONLY a JSON object, no prose, with these keys:
- clientId: the matching client's id from the list (best fuzzy match on the spoken name), or null if unclear
- amount: number (no currency symbol), or null
- method: one of ${JSON.stringify(METHODS)} (best match; "Other" if none fits)
- date: YYYY-MM-DD (resolve "today"/"yesterday"/weekdays relative to ${today}; default ${today})
- memo: a short note if mentioned, else ""`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content?.find(b => b.type === 'text')?.text || ''
    const json = text.match(/\{[\s\S]*\}/)
    if (!json) return NextResponse.json({ error: 'Could not parse', transcript }, { status: 200 })
    const parsed = JSON.parse(json[0])
    if (!METHODS.includes(parsed.method)) parsed.method = 'Other'
    return NextResponse.json({ ...parsed, transcript })
  } catch (e) {
    return NextResponse.json({ error: e.message, transcript }, { status: 200 })
  }
}
