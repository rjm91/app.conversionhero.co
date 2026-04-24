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
    <div className="p-6">

      <div className="flex items-center justify-between mb-4">
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
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 w-1/2">Video</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Visibility</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Views</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Comments</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Likes</th>
                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
              {videos.map(v => (
                <tr key={v.videoId} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition group">

                  {/* Thumbnail + title */}
                  <td className="px-4 py-3">
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                      <div className="relative flex-shrink-0 w-28 aspect-video bg-gray-100 dark:bg-white/5 rounded overflow-hidden">
                        {v.thumbnail && (
                          <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                        )}
                        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-semibold px-1 py-0.5 rounded">
                          {v.duration}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition line-clamp-2 leading-snug">
                        {v.title}
                      </p>
                    </a>
                  </td>

                  {/* Visibility */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${VISIBILITY[v.visibility] || VISIBILITY.private}`}>
                      {v.visibility}
                    </span>
                  </td>

                  {/* Views */}
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    {fmtViews(v.views)}
                  </td>

                  {/* Comments */}
                  <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-400 tabular-nums">
                    {v.comments}
                  </td>

                  {/* Likes */}
                  <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-400 tabular-nums">
                    {v.likes > 0 ? fmtViews(v.likes) : '—'}
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-sm text-right text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {fmtDate(v.publishedAt)}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
