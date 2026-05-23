import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AssemblyAI } from 'assemblyai'
import { YoutubeTranscript } from 'youtube-transcript'

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
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
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
    // ── File upload → AssemblyAI ──
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const title = file.name.replace(/\.[^.]+$/, '')

    // Create DB record
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

    // Upload to AssemblyAI and transcribe in background
    const buffer = Buffer.from(await file.arrayBuffer())
    transcribeFile(row.id, buffer).catch(err => console.error('Transcription error:', err))

    return NextResponse.json({ id: row.id, status: 'processing' })

  } else {
    // ── YouTube URL → pull captions directly ──
    const body = await req.json()
    const url = body.url?.trim()
    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })

    const videoId = extractVideoId(url)
    if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })

    try {
      // Fetch YouTube captions (auto-generated or manual)
      const segments = await YoutubeTranscript.fetchTranscript(videoId)

      if (!segments?.length) {
        return NextResponse.json({ error: 'No captions available for this video' }, { status: 400 })
      }

      // Format transcript with timestamps
      const lines = segments.map(seg => {
        const ts = formatSec(seg.offset / 1000)
        return `[${ts}] ${seg.text}`
      })
      const transcript = lines.join('\n')

      // Calculate duration from last segment
      const lastSeg = segments[segments.length - 1]
      const durationSec = Math.round((lastSeg.offset + (lastSeg.duration || 0)) / 1000)

      // Fetch video title via oEmbed (no API key needed)
      let title = url
      try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
        if (oembed.ok) {
          const info = await oembed.json()
          title = info.title || url
        }
      } catch { /* use URL as title */ }

      // Save completed transcription
      const { data: row, error: dbErr } = await supabase
        .from('agency_transcriptions')
        .insert({
          title,
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

    } catch (err) {
      return NextResponse.json({
        error: `Failed to get transcript: ${err.message}. This video may not have captions available.`
      }, { status: 400 })
    }
  }
}

// File upload transcription via AssemblyAI (runs in background)
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
