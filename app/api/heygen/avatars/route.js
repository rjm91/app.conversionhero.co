import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { listAvatars } from '../../../../lib/heygen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const avatars = await listAvatars()
    return NextResponse.json({ avatars })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
