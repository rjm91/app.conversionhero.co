import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { applyProposal } from '../../../../lib/agent/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, clientId, scriptId, fields } = await request.json()
  if (!action || !clientId) {
    return NextResponse.json({ error: 'action and clientId required' }, { status: 400 })
  }

  try {
    const result = await applyProposal({ action, clientId, scriptId, fields, user })
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  } catch (err) {
    console.error('agent/apply error:', err)
    return NextResponse.json({ error: err.message || 'Apply error' }, { status: 500 })
  }
}
