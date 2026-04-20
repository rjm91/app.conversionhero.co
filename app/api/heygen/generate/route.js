import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { generateVideo } from '../../../../lib/heygen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { avatarId, voiceId, script, testMode, speed, emotion, aspectRatio, bgColor } = await request.json()
  if (!avatarId || !voiceId || !script) {
    return NextResponse.json({ error: 'avatarId, voiceId, and script are required' }, { status: 400 })
  }

  try {
    const result = await generateVideo({
      avatarId, voiceId, script,
      testMode: testMode !== false,
      speed, emotion, aspectRatio, bgColor,
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
