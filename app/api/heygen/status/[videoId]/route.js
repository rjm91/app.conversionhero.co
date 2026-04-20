import { NextResponse } from 'next/server'
import { createClient } from '../../../../../lib/supabase-server'
import { getVideoStatus } from '../../../../../lib/heygen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request, { params }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const status = await getVideoStatus(params.videoId)
    return NextResponse.json(status)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
