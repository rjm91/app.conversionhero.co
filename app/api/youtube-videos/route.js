import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const YT = 'https://www.googleapis.com/youtube/v3'

function parseDuration(iso) {
  const m = (iso || 'PT0S').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  const h = parseInt(m?.[1] || 0)
  const min = parseInt(m?.[2] || 0)
  const s = parseInt(m?.[3] || 0)
  return h > 0
    ? `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${min}:${String(s).padStart(2, '0')}`
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')

  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 })

  // Look up channel ID from client table
  const { data: client } = await db()
    .from('client')
    .select('youtube_channel_id')
    .eq('client_id', clientId)
    .single()

  const channelId = client?.youtube_channel_id
  if (!channelId) return NextResponse.json({ videos: [], channelId: null })

  // 1. Get channel info + uploads playlist ID
  const chanRes = await fetch(
    `${YT}/channels?id=${channelId}&part=contentDetails,snippet&key=${apiKey}`
  )
  const chanData = await chanRes.json()
  if (!chanData.items?.length) return NextResponse.json({ videos: [], channelId })

  const channel = chanData.items[0]
  const uploadsId = channel.contentDetails.relatedPlaylists.uploads
  const channelName = channel.snippet.title

  // 2. Get playlist items (up to 50 most recent)
  const plRes = await fetch(
    `${YT}/playlistItems?playlistId=${uploadsId}&part=snippet,contentDetails&maxResults=50&key=${apiKey}`
  )
  const plData = await plRes.json()
  const items = plData.items || []
  if (!items.length) return NextResponse.json({ videos: [], channelId, channelName })

  // 3. Batch fetch video details (duration, stats, privacy)
  const videoIds = items.map(i => i.contentDetails.videoId).join(',')
  const vidRes = await fetch(
    `${YT}/videos?id=${videoIds}&part=contentDetails,statistics,status&key=${apiKey}`
  )
  const vidData = await vidRes.json()
  const vidMap = {}
  for (const v of (vidData.items || [])) vidMap[v.id] = v

  const videos = items.map(item => {
    const videoId = item.contentDetails.videoId
    const detail = vidMap[videoId] || {}
    const snippet = item.snippet
    return {
      videoId,
      title:       snippet.title,
      thumbnail:   snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
      publishedAt: snippet.publishedAt,
      duration:    parseDuration(detail.contentDetails?.duration),
      views:       parseInt(detail.statistics?.viewCount  || 0),
      likes:       parseInt(detail.statistics?.likeCount  || 0),
      comments:    parseInt(detail.statistics?.commentCount || 0),
      visibility:  detail.status?.privacyStatus || 'unknown',
      url:         `https://www.youtube.com/watch?v=${videoId}`,
    }
  })

  return NextResponse.json({ videos, channelId, channelName })
}
