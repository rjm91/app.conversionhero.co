import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function GET(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const { data, error } = await admin()
    .from('client_avatar_videos')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ videos: data || [] })
}

export async function POST(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const payload = {
    client_id: body.clientId,
    user_id: user.id,
    heygen_video_id: body.heygenVideoId,
    avatar_id: body.avatarId,
    avatar_name: body.avatarName,
    voice_id: body.voiceId,
    script: body.script,
    status: 'processing',
    test_mode: body.testMode !== false,
  }
  const { data, error } = await admin().from('client_avatar_videos').insert([payload]).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ video: data })
}

export async function PATCH(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, videoUrl, thumbnailUrl, error: errMsg } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch = { updated_at: new Date().toISOString() }
  if (status) patch.status = status
  if (videoUrl !== undefined) patch.video_url = videoUrl
  if (thumbnailUrl !== undefined) patch.thumbnail_url = thumbnailUrl
  if (errMsg !== undefined) patch.error = errMsg

  const { data, error } = await admin().from('client_avatar_videos').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ video: data })
}
