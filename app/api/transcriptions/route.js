import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AssemblyAI } from 'assemblyai'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

function getAssemblyClient() {
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!key) throw new Error('ASSEMBLYAI_API_KEY not set')
  return new AssemblyAI({ apiKey: key })
}

function formatSec(totalSec) {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatMs(ms) {
  return formatSec(Math.floor(ms / 1000))
}

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function formatAssemblyTranscript(transcript) {
  const lines = []
  if (transcript.words?.length) {
    let currentLine = []
    let lineStart = transcript.words[0].start
    for (const word of transcript.words) {
      currentLine.push(word.text)
      if (currentLine.length >= 10) {
        lines.push(`[${formatMs(lineStart)}] ${currentLine.join(' ')}`)
        currentLine = []
        lineStart = word.end
      }
    }
    if (currentLine.length) {
      lines.push(`[${formatMs(lineStart)}] ${currentLine.join(' ')}`)
    }
  }
  return lines.length ? lines.join('\n') : transcript.text
}

// ── Fetch YouTube captions by scraping the watch page ──
async function fetchYouTubeCaptions(videoId) {
  // Fetch the YouTube watch page with consent cookie to bypass cookie walls
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const res = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=PENDING+999; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgJnZpwY',
    },
  })

  if (!res.ok) throw new Error(`YouTube returned ${res.status}`)

  const html = await res.text()

  // Extract video title
  const titleMatch = html.match(/<title>(.+?)<\/title>/)
  let title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : null

  // Extract ytInitialPlayerResponse — use brace-matching for reliable JSON extraction
  const marker = 'ytInitialPlayerResponse'
  const markerIdx = html.indexOf(marker)
  if (markerIdx === -1) throw new Error('Could not find player response in page')

  const jsonStart = html.indexOf('{', markerIdx)
  if (jsonStart === -1) throw new Error('Could not find player response JSON')

  // Find the matching closing brace by counting depth
  let depth = 0
  let jsonEnd = jsonStart
  for (let i = jsonStart; i < html.length && i < jsonStart + 500000; i++) {
    if (html[i] === '{') depth++
    else if (html[i] === '}') {
      depth--
      if (depth === 0) { jsonEnd = i; break }
    }
  }

  let player
  try {
    player = JSON.parse(html.substring(jsonStart, jsonEnd + 1))
  } catch {
    // Fallback: try regex approach
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/)
    if (!playerMatch) throw new Error('Could not parse player response')
    player = JSON.parse(playerMatch[1])
  }

  // Get video title from player response if not found in HTML
  if (!title) {
    title = player?.videoDetails?.title || null
  }

  // Get duration
  const durationSec = player?.videoDetails?.lengthSeconds
    ? parseInt(player.videoDetails.lengthSeconds, 10)
    : null

  // Find caption tracks
  const captions = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!captions?.length) {
    return { title, durationSec, transcript: null }
  }

  // Prefer English, then auto-generated English, then first available
  let captionTrack = captions.find(c => c.languageCode === 'en' && !c.kind)
    || captions.find(c => c.languageCode === 'en')
    || captions[0]

  if (!captionTrack?.baseUrl) {
    return { title, durationSec, transcript: null }
  }

  // Fetch the caption XML
  const captionUrl = captionTrack.baseUrl + '&fmt=json3'
  const captionRes = await fetch(captionUrl)
  if (!captionRes.ok) throw new Error(`Caption fetch failed: ${captionRes.status}`)

  const captionData = await captionRes.json()

  if (!captionData?.events?.length) {
    return { title, durationSec, transcript: null }
  }

  // Format caption events into timestamped transcript
  const lines = []
  for (const event of captionData.events) {
    if (!event.segs) continue
    const text = event.segs.map(s => s.utf8 || '').join('').trim()
    if (!text || text === '\n') continue
    const startSec = (event.tStartMs || 0) / 1000
    lines.push(`[${formatSec(startSec)}] ${text}`)
  }

  return {
    title,
    durationSec,
    transcript: lines.length ? lines.join('\n') : null,
  }
}

// GET — list all transcriptions
export async function GET() {
  const { data, error } = await supabase
    .from('agency_transcriptions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — start a new transcription
export async function POST(req) {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    return handleFileUpload(req)
  } else {
    return handleYouTube(req)
  }
}

// ── YouTube URL handler ──
async function handleYouTube(req) {
  const body = await req.json()
  const url = body.url?.trim()
  if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })

  const videoId = extractVideoId(url)
  if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })

  try {
    const { title, durationSec, transcript } = await fetchYouTubeCaptions(videoId)

    if (transcript) {
      const { data: row, error: dbErr } = await supabase
        .from('agency_transcriptions')
        .insert({
          title: title || url,
          source_type: 'youtube',
          source_url: url,
          status: 'completed',
          transcript,
          duration_seconds: durationSec,
        })
        .select('id')
        .single()

      if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
      return NextResponse.json({ id: row.id, status: 'completed' })
    }

    // No captions found — tell user to upload
    return NextResponse.json({
      error: 'No captions available for this video. Please download the video and use the Upload tab for speech-to-text transcription.'
    }, { status: 400 })

  } catch (err) {
    const msg = err.message || ''
    return NextResponse.json({
      error: `Failed to process video: ${msg}`
    }, { status: 400 })
  }
}

// ── File upload handler (synchronous via AssemblyAI) ──
async function handleFileUpload(req) {
  const formData = await req.formData()
  const file = formData.get('file')
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const title = file.name.replace(/\.[^.]+$/, '')
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const client = getAssemblyClient()
    const audioUrl = await client.files.upload(buffer)
    const result = await client.transcripts.transcribe({ audio_url: audioUrl })

    if (result.status === 'error') {
      const { data: row } = await supabase.from('agency_transcriptions').insert({
        title,
        source_type: 'upload',
        file_name: file.name,
        status: 'error',
        error_message: result.error || 'Transcription failed',
        assemblyai_id: result.id,
      }).select('id').single()
      return NextResponse.json({ id: row?.id, status: 'error', error: result.error }, { status: 500 })
    }

    const formattedTranscript = formatAssemblyTranscript(result)

    const { data: row, error: dbErr } = await supabase
      .from('agency_transcriptions')
      .insert({
        title,
        source_type: 'upload',
        file_name: file.name,
        status: 'completed',
        transcript: formattedTranscript,
        duration_seconds: result.audio_duration ? Math.round(result.audio_duration) : null,
        assemblyai_id: result.id,
      })
      .select('id')
      .single()

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
    return NextResponse.json({ id: row.id, status: 'completed' })

  } catch (err) {
    return NextResponse.json({ error: err.message || 'Transcription failed' }, { status: 500 })
  }
}
