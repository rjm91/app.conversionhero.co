const BASE = 'https://api.heygen.com'

function apiKey() {
  const key = process.env.HEYGEN_API_KEY
  if (!key) throw new Error('HEYGEN_API_KEY not set')
  return key
}

async function heygen(path, { method = 'GET', body, version = 'v2' } = {}) {
  const url = `${BASE}/${version}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'X-Api-Key': apiKey(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `HeyGen ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

export async function listAvatars() {
  const data = await heygen('/avatars')
  return data?.data?.avatars || []
}

export async function listVoices() {
  const data = await heygen('/voices')
  return data?.data?.voices || []
}

export async function generateVideo({
  avatarId,
  voiceId,
  script,
  avatarStyle = 'normal',
  testMode = true,
  speed = 1.0,
  emotion,
  aspectRatio = '16:9',
  bgColor,
}) {
  const dims = {
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720,  height: 1280 },
    '1:1':  { width: 720,  height: 720 },
  }[aspectRatio] || { width: 1280, height: 720 }

  const voice = { type: 'text', input_text: script, voice_id: voiceId }
  if (speed && speed !== 1.0) voice.speed = speed
  if (emotion) voice.emotion = emotion

  const videoInput = {
    character: { type: 'avatar', avatar_id: avatarId, avatar_style: avatarStyle },
    voice,
  }
  if (bgColor) videoInput.background = { type: 'color', value: bgColor }

  const body = {
    video_inputs: [videoInput],
    dimension: dims,
    test: testMode,
  }
  const data = await heygen('/video/generate', { method: 'POST', body })
  return data?.data || data
}

export async function getVideoStatus(videoId) {
  const url = `${BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`
  const res = await fetch(url, { headers: { 'X-Api-Key': apiKey() }, cache: 'no-store' })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || `HeyGen ${res.status}`)
  return json?.data || json
}
