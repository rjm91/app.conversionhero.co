'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'

function fmtViews(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const VISIBILITY = {
  public:   'bg-green-500/10 text-green-600 dark:text-green-400',
  unlisted: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  private:  'bg-gray-500/10 text-gray-500 dark:text-gray-400',
}

export default function VideosPage() {
  const { clientId } = useParams()
  const [videos,      setVideos]      = useState([])
  const [channelName, setChannelName] = useState('')
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [noChannel,   setNoChannel]   = useState(false)

  useEffect(() => {
    fetch(`/api/youtube-videos?clientId=${clientId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error)      { setError(data.error); return }
        if (!data.channelId) { setNoChannel(true); return }
        setVideos(data.videos || [])
        setChannelName(data.channelName || '')
      })
      .catch(() => setError('Failed to load videos'))
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return (
    <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500 pt-20">Loading videos…</div>
  )

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-100 dark:border-red-500/20 p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    </div>
  )

  if (noChannel) return (
    <div className="p-8">
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-10 text-center">
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">No YouTube channel linked</p>
        <p className="text-xs text-gray-400 mt-1">
          Add <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 font-mono text-[11px]">youtube_channel_id</code> to this client in Supabase.
        </p>
      </div>
    </div>
  )

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{channelName}</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{videos.length} videos</p>
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-10 text-center">
          <p className="text-sm text-gray-400">No videos on this channel yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {videos.map(v => (
            <a
              key={v.videoId}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden hover:shadow-md dark:hover:brightness-110 transition-all group"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-gray-100 dark:bg-white/5">
                {v.thumbnail && (
                  <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                )}
                <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  {v.duration}
                </span>
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition leading-snug mb-2">
                  {v.title}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                    <span>{fmtViews(v.views)} views</span>
                    <span>·</span>
                    <span>{fmtDate(v.publishedAt)}</span>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${VISIBILITY[v.visibility] || VISIBILITY.private}`}>
                    {v.visibility}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
