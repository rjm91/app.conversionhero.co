'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../../lib/supabase'

export default function AvatarPage() {
  const { clientId } = useParams()
  const [avatars, setAvatars] = useState([])
  const [voices, setVoices] = useState([])
  const [loadingLists, setLoadingLists] = useState(true)
  const [listError, setListError] = useState(null)

  const [scripts, setScripts] = useState([])
  const [selectedScriptId, setSelectedScriptId] = useState('')
  const [voiceSearch, setVoiceSearch] = useState('')
  const [playingVoiceId, setPlayingVoiceId] = useState(null)
  const audioRef = useRef(null)

  const [avatarId, setAvatarId] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [script, setScript] = useState('')
  const [testMode, setTestMode] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [speed, setSpeed] = useState(1.0)
  const [emotion, setEmotion] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [bgColor, setBgColor] = useState('')

  const [generating, setGenerating] = useState(false)
  const [currentRecordId, setCurrentRecordId] = useState(null)
  const [currentHeygenId, setCurrentHeygenId] = useState(null)
  const [status, setStatus] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [genError, setGenError] = useState(null)
  const pollRef = useRef(null)

  const [history, setHistory] = useState([])

  const [previewing, setPreviewing] = useState(false)
  const [previewStatus, setPreviewStatus] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const previewPollRef = useRef(null)

  function snippet(text, maxChars = 160) {
    const t = (text || '').trim()
    if (!t) return ''
    const firstSentence = t.split(/(?<=[.!?])\s+/)[0]
    if (firstSentence.length <= maxChars) return firstSentence
    return t.slice(0, maxChars)
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreviewError(null)
    setPreviewUrl(null)
    setPreviewStatus('submitting')
    try {
      const previewScript = snippet(script)
      if (!previewScript) throw new Error('Add some script text first')
      const res = await fetch('/api/heygen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarId, voiceId, script: previewScript,
          testMode: true, speed, emotion, aspectRatio, bgColor,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')
      const heygenId = data.video_id || data.data?.video_id
      if (!heygenId) throw new Error('No video_id returned')
      setPreviewStatus('processing')
      pollPreview(heygenId)
    } catch (e) {
      setPreviewError(e.message)
      setPreviewStatus('error')
      setPreviewing(false)
    }
  }

  function pollPreview(heygenId) {
    clearInterval(previewPollRef.current)
    previewPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/heygen/status/${heygenId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Status failed')
        setPreviewStatus(data.status)
        if (data.status === 'completed') {
          setPreviewUrl(data.video_url || data.video_url_caption || null)
          clearInterval(previewPollRef.current)
          setPreviewing(false)
        } else if (data.status === 'failed') {
          setPreviewError(data.error?.message || 'Preview render failed')
          clearInterval(previewPollRef.current)
          setPreviewing(false)
        }
      } catch (e) {
        setPreviewError(e.message)
        clearInterval(previewPollRef.current)
        setPreviewing(false)
      }
    }, 4000)
  }

  useEffect(() => {
    async function load() {
      try {
        const [aRes, vRes] = await Promise.all([
          fetch('/api/heygen/avatars').then(r => r.json()),
          fetch('/api/heygen/voices').then(r => r.json()),
        ])
        if (aRes.error) throw new Error(aRes.error)
        if (vRes.error) throw new Error(vRes.error)
        setAvatars(aRes.avatars || [])
        setVoices(vRes.voices || [])
      } catch (e) {
        setListError(e.message)
      } finally {
        setLoadingLists(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    async function loadScripts() {
      const { data } = await supabase
        .from('client_video_scripts')
        .select('id, vscript_title, script_body')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      setScripts(data || [])
    }
    if (clientId) loadScripts()
  }, [clientId])

  async function loadHistory() {
    if (!clientId) return
    const res = await fetch(`/api/avatar-videos?clientId=${clientId}`)
    const data = await res.json()
    if (!data.error) setHistory(data.videos || [])
    const stillProcessing = (data.videos || []).filter(v => v.status === 'processing' && v.heygen_video_id)
    stillProcessing.forEach(v => resumePoll(v.id, v.heygen_video_id))
  }

  useEffect(() => { loadHistory() }, [clientId])

  function pickScript(id) {
    setSelectedScriptId(id)
    const s = scripts.find(x => x.id === id)
    if (s) setScript(s.script_body || '')
  }

  async function patchRecord(id, patch) {
    await fetch('/api/avatar-videos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenError(null)
    setVideoUrl(null)
    setStatus('submitting')
    try {
      const genRes = await fetch('/api/heygen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId, voiceId, script, testMode, speed, emotion, aspectRatio, bgColor }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error || 'Generation failed')
      const heygenId = genData.video_id || genData.data?.video_id
      if (!heygenId) throw new Error('No video_id returned')

      const avatarName = avatars.find(a => (a.avatar_id || a.id) === avatarId)?.avatar_name || ''
      const saveRes = await fetch('/api/avatar-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, heygenVideoId: heygenId, avatarId, avatarName,
          voiceId, script, testMode,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) throw new Error(saveData.error || 'Save failed')

      setCurrentRecordId(saveData.video.id)
      setCurrentHeygenId(heygenId)
      setStatus('processing')
      loadHistory()
      pollStatus(saveData.video.id, heygenId)
    } catch (e) {
      setGenError(e.message)
      setStatus('error')
      setGenerating(false)
    }
  }

  function resumePoll(recordId, heygenId) {
    pollStatus(recordId, heygenId)
  }

  function pollStatus(recordId, heygenId) {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/heygen/status/${heygenId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Status failed')
        setStatus(data.status)
        if (data.status === 'completed') {
          const url = data.video_url || data.video_url_caption || null
          const thumb = data.thumbnail_url || null
          setVideoUrl(url)
          await patchRecord(recordId, { status: 'completed', videoUrl: url, thumbnailUrl: thumb })
          clearInterval(pollRef.current)
          setGenerating(false)
          loadHistory()
        } else if (data.status === 'failed') {
          const err = data.error?.message || 'Generation failed on HeyGen'
          setGenError(err)
          await patchRecord(recordId, { status: 'failed', error: err })
          clearInterval(pollRef.current)
          setGenerating(false)
          loadHistory()
        }
      } catch (e) {
        setGenError(e.message)
        clearInterval(pollRef.current)
        setGenerating(false)
      }
    }, 4000)
  }

  useEffect(() => () => {
    clearInterval(pollRef.current)
    clearInterval(previewPollRef.current)
    if (audioRef.current) audioRef.current.pause()
  }, [])

  const missingForPreview = []
  if (!avatarId) missingForPreview.push('avatar')
  if (!voiceId) missingForPreview.push('voice')
  if (!script.trim()) missingForPreview.push('script')
  const canPreview = missingForPreview.length === 0 && !previewing && !generating

  const canGenerate = avatarId && voiceId && script.trim().length > 0 && !generating

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Avatar Studio</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Generate AI avatar videos from your scripts. Powered by HeyGen.
        </p>
      </div>

      {listError && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-700 dark:text-red-400">
          Couldn't load HeyGen data: {listError}. Make sure <code>HEYGEN_API_KEY</code> is set in <code>.env.local</code>.
        </div>
      )}

      {loadingLists ? (
        <p className="text-sm text-gray-400">Loading avatars and voices…</p>
      ) : (
        <div className="space-y-6">
          <section className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Avatar</h3>
            {avatars.length === 0 ? (
              <p className="text-sm text-gray-400">No avatars available.</p>
            ) : (
              <div className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
                {avatars.slice(0, 40).map(a => {
                  const id = a.avatar_id || a.id
                  const name = a.avatar_name || a.name || id
                  const preview = a.preview_image_url || a.preview_image || a.image_url
                  const active = avatarId === id
                  return (
                    <button
                      key={id}
                      onClick={() => setAvatarId(id)}
                      className={`text-left rounded-lg border p-2 transition ${
                        active
                          ? 'border-blue-500 bg-blue-500/5'
                          : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      {preview ? (
                        <img src={preview} alt={name} className="w-full aspect-square object-cover rounded" />
                      ) : (
                        <div className="w-full aspect-square rounded bg-gray-100 dark:bg-white/5" />
                      )}
                      <p className="text-xs mt-2 truncate text-gray-700 dark:text-gray-300">{name}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Voice</h3>
              <input
                type="text"
                value={voiceSearch}
                onChange={e => setVoiceSearch(e.target.value)}
                placeholder="Search by name, language, gender…"
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-white/5 rounded-lg border border-gray-100 dark:border-white/5">
              {voices
                .filter(v => {
                  if (!voiceSearch.trim()) return true
                  const q = voiceSearch.toLowerCase()
                  return [v.name, v.language, v.gender, v.voice_id, v.id].some(x => (x || '').toString().toLowerCase().includes(q))
                })
                .slice(0, 200)
                .map(v => {
                  const id = v.voice_id || v.id
                  const preview = v.preview_audio || v.sample || v.preview_audio_url
                  const active = voiceId === id
                  const playing = playingVoiceId === id
                  return (
                    <div
                      key={id}
                      onClick={() => setVoiceId(id)}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition ${
                        active ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (!preview) return
                          if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
                          if (playing) { setPlayingVoiceId(null); return }
                          const a = new Audio(preview)
                          audioRef.current = a
                          a.play()
                          setPlayingVoiceId(id)
                          a.onended = () => setPlayingVoiceId(null)
                        }}
                        disabled={!preview}
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs transition ${
                          preview
                            ? (playing ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20')
                            : 'bg-gray-50 dark:bg-white/5 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        }`}
                        title={preview ? 'Preview voice' : 'No preview available'}
                      >
                        {playing ? '■' : '▶'}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${active ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                          {v.name || id}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {[v.language, v.gender, v.accent].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {active && <span className="text-xs text-blue-600 dark:text-blue-400">Selected</span>}
                    </div>
                  )
                })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {voices.length} voices available. Click ▶ to preview, then click the row to select.
            </p>
          </section>

          <section className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Script</h3>
              {scripts.length > 0 && (
                <select
                  value={selectedScriptId}
                  onChange={e => pickScript(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400"
                >
                  <option value="">Load from existing script…</option>
                  {scripts.map(s => <option key={s.id} value={s.id}>{s.vscript_title}</option>)}
                </select>
              )}
            </div>
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              rows={8}
              placeholder="Paste or type the script the avatar will speak..."
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-2">{script.length} characters</p>
          </section>

          <section className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="w-full flex items-center justify-between p-6 text-left"
            >
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Advanced</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Speed {speed.toFixed(2)}× · {emotion || 'default tone'} · {aspectRatio} · {bgColor || 'no bg override'}
                </p>
              </div>
              <span className="text-gray-400 text-sm">{showAdvanced ? '▴' : '▾'}</span>
            </button>

            {showAdvanced && (
              <div className="px-6 pb-6 space-y-5 border-t border-gray-100 dark:border-white/5 pt-5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Voice speed</label>
                    <span className="text-xs text-gray-600 dark:text-gray-300 font-mono">{speed.toFixed(2)}×</span>
                  </div>
                  <input
                    type="range" min="0.5" max="1.5" step="0.05"
                    value={speed} onChange={e => setSpeed(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>0.5× (slow)</span><span>1.0× (normal)</span><span>1.5× (fast)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Emotion (supported voices only)</label>
                  <select
                    value={emotion} onChange={e => setEmotion(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Default (no emotion override)</option>
                    <option value="Excited">Excited</option>
                    <option value="Friendly">Friendly</option>
                    <option value="Serious">Serious</option>
                    <option value="Soothing">Soothing</option>
                    <option value="Broadcaster">Broadcaster</option>
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">Not all voices support emotion tags. If unsupported, HeyGen ignores this.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Aspect ratio</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { val: '16:9', label: 'Landscape', sub: '1280 × 720' },
                      { val: '9:16', label: 'Vertical',  sub: '720 × 1280' },
                      { val: '1:1',  label: 'Square',    sub: '720 × 720'  },
                    ].map(opt => (
                      <button
                        key={opt.val}
                        onClick={() => setAspectRatio(opt.val)}
                        className={`p-3 rounded-lg border text-left transition ${
                          aspectRatio === opt.val
                            ? 'border-blue-500 bg-blue-500/5'
                            : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                        }`}
                      >
                        <p className={`text-xs font-semibold ${aspectRatio === opt.val ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>{opt.val}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{opt.label} · {opt.sub}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">Preview these settings</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Renders a short test clip (first sentence, ~20–30s) with your current avatar, voice, speed, and emotion.
                      </p>
                    </div>
                    <button
                      onClick={handlePreview}
                      disabled={!canPreview}
                      className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex-shrink-0"
                    >
                      {previewing ? 'Rendering…' : '▶ Preview'}
                    </button>
                  </div>
                  {!canPreview && missingForPreview.length > 0 && !previewing && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      Select {missingForPreview.join(' + ')} above to enable preview.
                    </p>
                  )}
                  {previewStatus && !previewUrl && !previewError && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-2">Status: {previewStatus}</p>
                  )}
                  {previewError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">{previewError}</p>
                  )}
                  {previewUrl && (
                    <video src={previewUrl} controls autoPlay className="w-full mt-3 rounded-lg bg-black" />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Background color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={bgColor || '#ffffff'}
                      onChange={e => setBgColor(e.target.value)}
                      className="w-12 h-10 rounded border border-gray-200 dark:border-white/10 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={bgColor}
                      onChange={e => setBgColor(e.target.value)}
                      placeholder="#ffffff (leave blank for avatar default)"
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {bgColor && (
                      <button
                        onClick={() => setBgColor('')}
                        className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-6">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} />
                Test mode (watermarked, doesn't consume paid credits)
              </label>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-white/10 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition"
              >
                {generating ? 'Generating…' : 'Generate Video'}
              </button>
            </div>

            {status && (
              <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-400">
                Status: <span className="font-mono">{status}</span>
                {currentHeygenId && <> · id: <span className="font-mono">{currentHeygenId}</span></>}
              </div>
            )}
            {genError && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-700 dark:text-red-400">
                {genError}
              </div>
            )}
            {videoUrl && (
              <div className="mt-4">
                <video src={videoUrl} controls className="w-full rounded-lg bg-black" />
                <a href={videoUrl} download className="text-xs text-blue-500 hover:underline mt-2 inline-block">
                  Download MP4 ↓
                </a>
              </div>
            )}
          </section>

          {history.length > 0 && (
            <section className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">History</h3>
              <div className="grid grid-cols-3 gap-4">
                {history.map(h => (
                  <div key={h.id} className="rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
                    {h.video_url ? (
                      <video src={h.video_url} poster={h.thumbnail_url || undefined} controls className="w-full aspect-video bg-black" />
                    ) : (
                      <div className="w-full aspect-video bg-gray-100 dark:bg-white/5 flex items-center justify-center text-xs text-gray-400">
                        {h.status}
                      </div>
                    )}
                    <div className="p-3 text-xs">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{h.avatar_name || 'Avatar video'}</p>
                      <p className="text-gray-400 mt-1 truncate">{h.script?.slice(0, 60)}{h.script?.length > 60 ? '…' : ''}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          h.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          h.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {h.status}
                        </span>
                        <span className="text-gray-400">{new Date(h.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
