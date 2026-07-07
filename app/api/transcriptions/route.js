import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AssemblyAI } from 'assemblyai'
import { fetch as undiciFetch, ProxyAgent } from 'undici'

// YouTube bot-walls datacenter IPs (Vercel's included). When YOUTUBE_PROXY_URL
// is set (e.g. a rotating residential proxy), all YouTube traffic goes
// through it; locally a residential IP works without one.
const ytDispatcher = process.env.YOUTUBE_PROXY_URL ? new ProxyAgent(process.env.YOUTUBE_PROXY_URL) : null
const ytFetch = (url, init = {}) =>
  ytDispatcher ? undiciFetch(url, { ...init, dispatcher: ytDispatcher }) : fetch(url, init)

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

// Group timed cues into readable paragraph blocks (~30s / ~500 chars each):
// a timestamp header line, then flowing prose. Much easier to read and to
// paste into an LLM than one line per caption cue.
function formatCueBlocks(cues) {
  const blocks = []
  let cur = null
  for (const c of cues) {
    const text = (c.text || '').trim()
    if (!text) continue
    if (!cur || c.startMs - cur.startMs >= 30000 || cur.text.length >= 500) {
      if (cur) blocks.push(cur)
      cur = { startMs: c.startMs, text }
    } else {
      cur.text += ' ' + text
    }
  }
  if (cur) blocks.push(cur)
  return blocks.length
    ? blocks.map(b => `${formatMs(b.startMs)}\n${b.text}`).join('\n\n')
    : null
}

function formatAssemblyTranscript(transcript) {
  if (transcript.words?.length) {
    const formatted = formatCueBlocks(transcript.words.map(w => ({ startMs: w.start, text: w.text })))
    if (formatted) return formatted
  }
  return transcript.text
}

// ── Fetch YouTube captions via the InnerTube API ──
// The watch-page caption URLs now require a proof-of-origin token and return
// empty 200s, which is why the old scraping approach silently died. Instead,
// query the InnerTube /player endpoint whose caption URLs still work without
// a token. YouTube gates each InnerTube client differently (and gates
// datacenter IPs like Vercel's harder than residential ones), so try several
// clients, then fall back to the transcript-panel endpoint (get_transcript),
// which is gated separately from /player.
const PLAYER_CLIENTS = [
  {
    label: 'ANDROID',
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en', gl: 'US' },
  },
  {
    label: 'IOS',
    ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    client: { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', hl: 'en', gl: 'US' },
  },
  {
    label: 'WEB_EMBEDDED',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    client: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '1.20250310.01.00', hl: 'en', gl: 'US' },
    thirdParty: { embedUrl: 'https://www.google.com' },
  },
]

function pickTrack(tracks) {
  // Prefer human English captions, then auto-generated English, then first available
  return tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
    || tracks.find(t => t.languageCode === 'en')
    || tracks[0]
}

async function fetchYouTubeCaptions(videoId) {
  let title = null
  let durationSec = null
  let lastReason = null

  for (const c of PLAYER_CLIENTS) {
    try {
      const res = await ytFetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua },
        body: JSON.stringify({
          context: { client: c.client, ...(c.thirdParty ? { thirdParty: c.thirdParty } : {}) },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      })
      if (!res.ok) { lastReason = `YouTube player API returned ${res.status}`; continue }
      const player = await res.json()

      const playability = player?.playabilityStatus
      if (playability?.status && playability.status !== 'OK') {
        lastReason = playability.reason || `Video unavailable (${playability.status})`
        continue
      }

      title = title || player?.videoDetails?.title || null
      durationSec = durationSec || (player?.videoDetails?.lengthSeconds
        ? parseInt(player.videoDetails.lengthSeconds, 10)
        : null)

      const track = pickTrack(player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [])
      if (!track?.baseUrl) continue

      const capRes = await ytFetch(track.baseUrl, { cache: 'no-store', headers: { 'User-Agent': c.ua } })
      if (!capRes.ok) { lastReason = `Caption fetch failed: ${capRes.status}`; continue }
      const transcript = parseCaptionBody(await capRes.text())
      if (transcript) return { title, durationSec, transcript }
    } catch (err) {
      lastReason = err.message
    }
  }

  // Genuinely captionless video → transcript null (caller shows Upload hint);
  // blocked/gated video → surface the reason.
  if (lastReason) throw new Error(lastReason)
  return { title, durationSec, transcript: null }
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

// Caption bodies come back as timedtext XML (<p t="ms" d="ms">text</p>),
// occasionally as json3 events. Handle both, group into paragraph blocks.
function parseCaptionBody(body) {
  const cues = []
  try {
    const events = JSON.parse(body)?.events || []
    for (const e of events) {
      if (!e.segs) continue
      const text = e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ')
      cues.push({ startMs: e.tStartMs || 0, text })
    }
  } catch {
    const re = /<p t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
    let m
    while ((m = re.exec(body))) {
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\n/g, ' ')
      cues.push({ startMs: Number(m[1]), text })
    }
  }
  return formatCueBlocks(cues)
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
