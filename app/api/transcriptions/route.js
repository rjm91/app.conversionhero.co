import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AssemblyAI } from 'assemblyai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

function getAssemblyClient() {
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!key) throw new Error('ASSEMBLYAI_API_KEY not set')
  return new AssemblyAI({ apiKey: key })
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

  let sourceType, sourceUrl, fileName, title, audioUrl

  if (contentType.includes('multipart/form-data')) {
    // File upload
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    sourceType = 'upload'
    fileName = file.name
    title = file.name.replace(/\.[^.]+$/, '')

    // Upload file to AssemblyAI
    const client = getAssemblyClient()
    const buffer = Buffer.from(await file.arrayBuffer())
    audioUrl = await client.files.upload(buffer)
  } else {
    // JSON body — YouTube URL
    const body = await req.json()
    const url = body.url?.trim()
    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })

    sourceType = 'youtube'
    sourceUrl = url
    title = body.title || url

    // AssemblyAI can't directly fetch YouTube — we need to extract audio URL
    // Use a lightweight approach: youtube-dl compatible URL extraction
    // For now, use AssemblyAI's built-in support if available, otherwise extract via yt-dlp
    audioUrl = url
  }

  // Create DB record
  const { data: row, error: dbErr } = await supabase
    .from('agency_transcriptions')
    .insert({
      title,
      source_type: sourceType,
      source_url: sourceUrl,
      file_name: fileName,
      status: 'processing',
    })
    .select('id')
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Start transcription (don't await — let it process)
  transcribeAsync(row.id, audioUrl, sourceType).catch(err => {
    console.error('Transcription error:', err)
  })

  return NextResponse.json({ id: row.id, status: 'processing' })
}

async function transcribeAsync(recordId, audioUrl, sourceType) {
  const client = getAssemblyClient()

  try {
    // For YouTube URLs, we need to get the actual audio stream
    let finalUrl = audioUrl
    if (sourceType === 'youtube') {
      // Use yt-dlp to extract audio URL (must be installed on system)
      // Fallback: try direct URL with AssemblyAI
      const { execSync } = await import('child_process')
      try {
        finalUrl = execSync(
          `yt-dlp -f bestaudio --get-url "${audioUrl}"`,
          { timeout: 30000, encoding: 'utf-8' }
        ).trim()
      } catch {
        // If yt-dlp not available, try the URL directly (works for some services)
        finalUrl = audioUrl
      }
    }

    const transcript = await client.transcripts.transcribe({
      audio_url: finalUrl,
    })

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
        // Break lines roughly every 10 words
        if (currentLine.length >= 10) {
          const ts = formatMs(lineStart)
          lines.push(`[${ts}] ${currentLine.join(' ')}`)
          currentLine = []
          lineStart = word.end
        }
      }
      if (currentLine.length) {
        lines.push(`[${formatMs(lineStart)}] ${currentLine.join(' ')}`)
      }
    }

    const formattedTranscript = lines.length ? lines.join('\n') : transcript.text

    await supabase.from('agency_transcriptions').update({
      status: 'completed',
      transcript: formattedTranscript,
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

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
