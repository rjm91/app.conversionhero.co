import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AssemblyAI } from 'assemblyai'
import ytdl from '@distube/ytdl-core'

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

  let sourceType, sourceUrl, fileName, title, audioUrl, videoTitle

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

    // Extract audio URL and video info using ytdl-core
    try {
      const info = await ytdl.getInfo(url)
      videoTitle = info.videoDetails.title
      title = videoTitle

      // Get audio-only format
      const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
      if (!audioFormat?.url) {
        // Fallback: get any format with audio
        const anyAudio = info.formats.find(f => f.hasAudio && f.url)
        if (!anyAudio) throw new Error('No audio stream found for this video')
        audioUrl = anyAudio.url
      } else {
        audioUrl = audioFormat.url
      }
    } catch (err) {
      return NextResponse.json({ error: `Failed to extract audio: ${err.message}` }, { status: 400 })
    }
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
  transcribeAsync(row.id, audioUrl).catch(err => {
    console.error('Transcription error:', err)
  })

  return NextResponse.json({ id: row.id, status: 'processing' })
}

async function transcribeAsync(recordId, audioUrl) {
  const client = getAssemblyClient()

  try {
    const transcript = await client.transcripts.transcribe({
      audio_url: audioUrl,
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
