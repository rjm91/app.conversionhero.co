'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

function fmtDuration(sec) {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function StatusBadge({ status }) {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.pending}`}>
      {status === 'processing' && (
        <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {status}
    </span>
  )
}

export default function TranscriptionsPage() {
  const [tab, setTab] = useState('youtube') // 'youtube' | 'upload'
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [transcriptions, setTranscriptions] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const pollRef = useRef(null)

  const fetchAll = useCallback(async () => {
    const res = await fetch('/api/transcriptions')
    if (res.ok) {
      const data = await res.json()
      setTranscriptions(data)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll for in-progress transcriptions
  useEffect(() => {
    const hasProcessing = transcriptions.some(t => t.status === 'processing')
    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(fetchAll, 3000)
    } else if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [transcriptions, fetchAll])

  async function handleYouTube(e) {
    e.preventDefault()
    if (!url.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/transcriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start transcription')
      setUrl('')
      fetchAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFileUpload(file) {
    if (!file || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/transcriptions', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start transcription')
      fetchAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    await fetch(`/api/transcriptions/${id}`, { method: 'DELETE' })
    if (selected?.id === id) setSelected(null)
    fetchAll()
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileUpload(file)
  }

  function copyTranscript(text) {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transcriber</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Transcribe YouTube videos or uploaded audio/video files</p>
      </div>

      {/* Input area */}
      <div className="bg-white dark:bg-[#1a1f3e] rounded-xl border border-gray-200 dark:border-white/10 p-6 mb-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 dark:bg-white/5 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('youtube')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === 'youtube'
                ? 'bg-white dark:bg-[#252b4a] text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
                <path fill="#fff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              YouTube URL
            </span>
          </button>
          <button
            onClick={() => setTab('upload')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === 'upload'
                ? 'bg-white dark:bg-[#252b4a] text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload File
            </span>
          </button>
        </div>

        {/* YouTube tab */}
        {tab === 'youtube' && (
          <form onSubmit={handleYouTube} className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Paste a YouTube URL..."
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={submitting || !url.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting...
                </>
              ) : 'Transcribe'}
            </button>
          </form>
        )}

        {/* Upload tab */}
        {tab === 'upload' && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition ${
              dragOver
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*,.mp4,.mov,.m4a,.mp3,.wav,.webm"
              onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]) }}
              className="hidden"
            />
            <svg className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600 dark:text-gray-400 font-medium">
              {submitting ? 'Uploading...' : 'Drop a video or audio file here, or click to browse'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">MP4, MOV, M4A, MP3, WAV, WebM</p>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Selected transcript detail */}
      {selected && (
        <div className="bg-white dark:bg-[#1a1f3e] rounded-xl border border-gray-200 dark:border-white/10 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selected.title || 'Untitled'}</h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <StatusBadge status={selected.status} />
                {selected.duration_seconds && <span>{fmtDuration(selected.duration_seconds)}</span>}
                <span>{fmtDate(selected.created_at)}</span>
                {selected.source_type === 'youtube' && selected.source_url && (
                  <a href={selected.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600">
                    View source
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selected.transcript && (
                <button
                  onClick={() => copyTranscript(selected.transcript)}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-gray-300 rounded-lg transition flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              )}
              <button
                onClick={() => setSelected(null)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Close
              </button>
            </div>
          </div>

          {selected.status === 'processing' && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <svg className="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-blue-700 dark:text-blue-300 font-medium">Transcribing... this may take a few minutes</span>
            </div>
          )}

          {selected.status === 'error' && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
              {selected.error_message || 'Transcription failed'}
            </div>
          )}

          {selected.transcript && (
            <div className="mt-2 bg-gray-50 dark:bg-white/5 rounded-lg p-4 max-h-[500px] overflow-y-auto">
              <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
                {selected.transcript}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Past transcriptions list */}
      <div className="bg-white dark:bg-[#1a1f3e] rounded-xl border border-gray-200 dark:border-white/10">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Past Transcriptions</h2>
        </div>

        {transcriptions.length === 0 ? (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p>No transcriptions yet. Paste a YouTube URL or upload a file to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-white/5">
            {transcriptions.map(t => (
              <div
                key={t.id}
                onClick={() => {
                  // Refresh the selected item with latest data
                  const fresh = transcriptions.find(x => x.id === t.id)
                  setSelected(fresh || t)
                }}
                className={`px-6 py-4 flex items-center justify-between cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/5 ${
                  selected?.id === t.id ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    t.source_type === 'youtube'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  }`}>
                    {t.source_type === 'youtube' ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
                        <path fill="#fff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.title || 'Untitled'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {fmtDate(t.created_at)}
                      {t.duration_seconds ? ` \u00b7 ${fmtDuration(t.duration_seconds)}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={t.status} />
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(t.id) }}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition rounded"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
