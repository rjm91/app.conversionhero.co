'use client'

import { useEffect, useState } from 'react'

const EVENT_META = {
  login:                     { label: 'Login',              cls: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  logout:                    { label: 'Logout',             cls: 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400' },
  password_reset_requested:  { label: 'Password Reset',     cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' },
  password_updated:          { label: 'Password Updated',   cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
}

function fmt(ts) {
  const d = new Date(ts)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (sec < 60)   return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

export default function ActivityPage() {
  const [activity, setActivity] = useState([])
  const [loading, setLoading]   = useState(true)
  const [eventFilter, setEventFilter] = useState('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/user-activity?limit=200')
    const json = await res.json()
    setActivity(json.activity || [])
    setLoading(false)
  }

  const events = ['all', ...Array.from(new Set(activity.map(a => a.event)))]
  const filtered = eventFilter === 'all' ? activity : activity.filter(a => a.event === eventFilter)

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Log</h1>
          <p className="text-sm text-gray-400 mt-0.5">User events across the platform.</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* Event filter pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        {events.map(e => (
          <button key={e} onClick={() => setEventFilter(e)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${eventFilter === e ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/15'}`}>
            {e === 'all' ? 'All events' : (EVENT_META[e]?.label || e)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
        {loading ? (
          <p className="p-8 text-sm text-gray-400 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-sm text-gray-400 text-center">No activity yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">Event</th>
                <th className="text-left px-5 py-3 font-medium">User</th>
                <th className="text-left px-5 py-3 font-medium">IP</th>
                <th className="text-left px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {filtered.map(row => {
                const meta = EVENT_META[row.event]
                return (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/3 transition">
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${meta?.cls || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                        {meta?.label || row.event}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300">{row.email || <span className="text-gray-400">—</span>}</td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{row.ip || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-gray-700 dark:text-gray-300">{fmt(row.created_at)}</span>
                      <span className="text-gray-400 text-xs ml-2">{timeAgo(row.created_at)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 text-right">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</p>
      )}
    </div>
  )
}
