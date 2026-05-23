import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AssemblyAI } from 'assemblyai'
import { Innertube } from 'youtubei.js'

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

// Extract YouTube video ID from various URL formats
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

    // Try to get captions via InnerTube API
    let transcript = null
    try {
      const transcriptInfo = await info.getTranscript()
      const body = transcriptInfo?.transcript?.content?.body
      if (body?.initial_segments?.length) {
        const lines = body.initial_segments.map(seg => {
          const startMs = Number(seg.start_ms || 0)
          const text = seg.snippet?.text || ''
          return `[${formatMs(startMs)}] ${text}`
        })
        transcript = lines.join('\n')
      }
    } catch {
      // Captions not available via InnerTube either
    }

    if (transcript) {
      // Save completed transcription directly
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

    // No captions available — download audio and send to AssemblyAI
    // Create DB record first (will process in background)
    const { data: row, error: dbErr } = await supabase
      .from('agency_transcriptions')
      .insert({
        title: videoTitle,
        source_type: 'youtube',
        source_url: url,
        status: 'processing',
        duration_seconds: durationSec,
      })
      .select('id')
      .single()

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

    // Download audio and transcribe via AssemblyAI in background
    transcribeYouTubeAudio(row.id, yt, videoId).catch(err => {
      console.error('YouTube audio transcription error:', err)
    })

    return NextResponse.json({ id: row.id, status: 'processing' })

  } catch (err) {
    return NextResponse.json({
      error: `Failed to process video: ${err.message}`
    }, { status: 400 })
  }
}

// Download YouTube audio and transcribe via AssemblyAI
async function transcribeYouTubeAudio(recordId, yt, videoId) {
  try {
    const info = await yt.getInfo(videoId)

    // Choose best audio-only format
    const format = info.chooseFormat({ type: 'audio', quality: 'best' })
    if (!format) throw new Error('No audio format available for this video')

    // Download audio as buffer
    const stream = await info.download({ type: 'audio', quality: 'best' })
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    // Upload to AssemblyAI and transcribe
    const client = getAssemblyClient()
    const audioUrl = await client.files.upload(buffer)
    const transcript = await client.transcripts.transcribe({ audio_url: audioUrl })

    if (transcript.status === 'error') {
      await supabase.from('agency_transcriptions').update({
        status: 'error',
        error_message: transcript.error || 'Transcription failed',
        assemblyai_id: transcript.id,
        updated_at: new Date().toISOString(),
      }).eq('id', recordId)
      return
    }

    // Format transcript with timestamps
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

    await supabase.from('agency_transcriptions').update({
      status: 'completed',
      transcript: lines.length ? lines.join('\n') : transcript.text,
      duration_seconds: transcript.audio_duration ? Math.round(transcript.audio_duration) : null,
      assemblyai_id: transcript.id,
      updated_at: new Date().toISOString(),
    }).eq('id', recordId)

  } catch (err) {
    await supabase.from('agency_transcriptions').update({
      status: 'error',
      error_message: err.message || 'Unknown error',
      updated_at: new Date().toISOString(),
    }).eq('id', recordId)
  }
}

// ── File upload handler ──
async function handleFileUpload(req) {
  const formData = await req.formData()
  const file = formData.get('file')
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const title = file.name.replace(/\.[^.]+$/, '')

  const { data: row, error: dbErr } = await supabase
    .from('agency_transcriptions')
    .insert({
      title,
      source_type: 'upload',
      file_name: file.name,
      status: 'processing',
    })
    .select('id')
    .single()
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  const buffer = Buffer.from(await file.arrayBuffer())
  transcribeFile(row.id, buffer).catch(err => console.error('Transcription error:', err))

  return NextResponse.json({ id: row.id, status: 'processing' })
}

// File upload transcription via AssemblyAI
async function transcribeFile(recordId, buffer) {
  const client = getAssemblyClient()

  try {
    const audioUrl = await client.files.upload(buffer)
    const transcript = await client.transcripts.transcribe({ audio_url: audioUrl })

    if (transcript.status === 'error') {
      await supabase.from('agency_transcriptions').update({
        status: 'error',
        error_message: transcript.error || 'Transcription failed',
        assemblyai_id: transcript.id,
        updated_at: new Date().toISOString(),
      }).eq('id', recordId)
      return
    }

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

    await supabase.from('agency_transcriptions').update({
      status: 'completed',
      transcript: lines.length ? lines.join('\n') : transcript.text,
      duration_seconds: transcript.audio_duration ? Math.round(transcript.audio_duration) : null,
      assemblyai_id: transcript.id,
      updated_at: new Date().toISOString(),
    }).eq('id', recordId)

  } catch (err) {
    await supabase.from('agency_transcriptions').update({
      status: 'error',
      error_message: err.message || 'Unknown error',
      updated_at: new Date().toISOString(),
    }).eq('id', recordId)
  }
}
