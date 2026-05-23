import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AssemblyAI } from 'assemblyai'
import { Innertube } from 'youtubei.js'

// Allow longer execution for audio download + transcription
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
    const yt = await Innertube.create({ retrieve_player: false })
    const info = await yt.getInfo(videoId)

    const videoTitle = info.basic_info?.title || url
    const durationSec = info.basic_info?.duration || null

    // Try to get captions via InnerTube API (fast, free)
    let transcript = null
    try {
      const transcriptInfo = await info.getTranscript()
      const txBody = transcriptInfo?.transcript?.content?.body
      if (txBody?.initial_segments?.length) {
        const lines = txBody.initial_segments.map(seg => {
          const startMs = Number(seg.start_ms || 0)
          const text = seg.snippet?.text || ''
          return `[${formatMs(startMs)}] ${text}`
        })
        transcript = lines.join('\n')
      }
    } catch {
      // Captions not available via InnerTube
    }

    if (transcript) {
      const { data: row, error: dbErr } = await supabase
        .from('agency_transcriptions')
        .insert({
          title: videoTitle,
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

    // No captions — download audio and transcribe via AssemblyAI (synchronous)
    const ytFull = await Innertube.create()
    const fullInfo = await ytFull.getInfo(videoId)

    const stream = await fullInfo.download({ type: 'audio', quality: 'best' })
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    const client = getAssemblyClient()
    const audioUrl = await client.files.upload(buffer)
    const result = await client.transcripts.transcribe({ audio_url: audioUrl })

    if (result.status === 'error') {
      const { data: row } = await supabase.from('agency_transcriptions').insert({
        title: videoTitle,
        source_type: 'youtube',
        source_url: url,
        status: 'error',
        error_message: result.error || 'Transcription failed',
        assemblyai_id: result.id,
        duration_seconds: durationSec,
      }).select('id').single()
      return NextResponse.json({ id: row?.id, status: 'error', error: result.error }, { status: 500 })
    }

    const formattedTranscript = formatAssemblyTranscript(result)

    const { data: row, error: dbErr } = await supabase
      .from('agency_transcriptions')
      .insert({
        title: videoTitle,
        source_type: 'youtube',
        source_url: url,
        status: 'completed',
        transcript: formattedTranscript,
        duration_seconds: result.audio_duration ? Math.round(result.audio_duration) : durationSec,
        assemblyai_id: result.id,
      })
      .select('id')
      .single()

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
    return NextResponse.json({ id: row.id, status: 'completed' })

  } catch (err) {
    return NextResponse.json({
      error: `Failed to process video: ${err.message}`
    }, { status: 400 })
  }
}

// ── File upload handler (synchronous) ──
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
