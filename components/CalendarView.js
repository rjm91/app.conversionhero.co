'use client'

import { useEffect, useMemo, useState } from 'react'

export const STATUS_STYLES = {
  scheduled:  { label: 'Scheduled',   dot: 'bg-blue-500',   pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  published:  { label: 'Published',   dot: 'bg-green-500',  pill: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
  filming:    { label: 'Filming',     dot: 'bg-amber-500',  pill: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  editing:    { label: 'Editing',     dot: 'bg-purple-500', pill: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400' },
  overdue:    { label: 'Overdue',     dot: 'bg-red-500',    pill: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  live:       { label: 'Live',        dot: 'bg-emerald-500',pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  paused:     { label: 'Paused',      dot: 'bg-gray-400',   pill: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400' },
}

const TYPE_STYLES = {
  video:       { label: 'Video',       accent: 'border-l-blue-500' },
  ad_campaign: { label: 'Ad campaign', accent: 'border-l-pink-500' },
}

// Deterministic color per client (for agency-wide view)
const CLIENT_COLORS = [
  'bg-blue-500', 'bg-pink-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-purple-500', 'bg-rose-500', 'bg-teal-500', 'bg-indigo-500',
]
function colorForClient(clientId = '') {
  let h = 0
  for (let i = 0; i < clientId.length; i++) h = (h * 31 + clientId.charCodeAt(i)) >>> 0
  return CLIENT_COLORS[h % CLIENT_COLORS.length]
}

function ymd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function monthLabel(date) {
  return date.toLocaleString('default', { month: 'long', year: 'numeric' })
}

export default function CalendarView({ clientId = null, title = 'Content Calendar', subtitle = '' }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [clients, setClients] = useState([])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const firstOffset = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const from = ymd(new Date(year, month, 1))
  const to   = ymd(new Date(year, month + 1, 0))

  async function loadEvents() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from, to })
      if (clientId) params.set('clientId', clientId)
      const res = await fetch(`/api/calendar-events?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setEvents(data.events || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadEvents() /* eslint-disable-next-line */ }, [cursor, clientId])

  useEffect(() => {
    if (!clientId) {
      fetch('/api/clients').then(r => r.ok ? r.json() : { clients: [] }).then(d => setClients(d.clients || []))
    }
  }, [clientId])

  const eventsByDay = useMemo(() => {
    const map = {}
    for (const e of events) {
      const key = e.scheduled_date
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [events])

  const counts = useMemo(() => events.reduce((acc, e) => (acc[e.status] = (acc[e.status] || 0) + 1, acc), {}), [events])

  const cells = []
  for (let i = 0; i < firstOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const todayYmd = ymd(new Date())
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  function prevMonth() { setCursor(new Date(year, month - 1, 1)) }
  function nextMonth() { setCursor(new Date(year, month + 1, 1)) }
  function jumpToday() { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)) }

  async function handleStatusChange(id, status) {
    await fetch('/api/calendar-events', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setSelected(null)
    loadEvents()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this event?')) return
    await fetch(`/api/calendar-events?id=${id}`, { method: 'DELETE' })
    setSelected(null)
    loadEvents()
  }

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          {subtitle && <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">‹</button>
          <button onClick={jumpToday} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">Today</button>
          <span className="text-sm font-medium text-gray-900 dark:text-white w-36 text-center">{monthLabel(cursor)}</span>
          <button onClick={nextMonth} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">›</button>
          <div className="mx-2 h-6 w-px bg-gray-200 dark:bg-white/10" />
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg"
          >
            + New Event
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(STATUS_STYLES).map(([key, s]) => (
          <div key={key} className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${s.pill}`}>
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            {s.label}
            <span className="opacity-60">· {counts[key] || 0}</span>
          </div>
        ))}
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-700 dark:text-red-400">{error}</div>}

      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
          {weekdays.map(w => (
            <div key={w} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[8rem]">
          {cells.map((d, i) => {
            const dateObj = d ? new Date(year, month, d) : null
            const key = d ? ymd(dateObj) : null
            const dayEvents = key ? (eventsByDay[key] || []) : []
            const isToday = key === todayYmd
            return (
              <div
                key={i}
                className={`border-r border-b border-gray-100 dark:border-white/5 p-2 overflow-hidden ${!d ? 'bg-gray-50/50 dark:bg-white/[0.01]' : ''}`}
              >
                {d && (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${
                        isToday ? 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]' : 'text-gray-500 dark:text-gray-400'
                      }`}>{d}</span>
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map(e => {
                        const s = STATUS_STYLES[e.status] || STATUS_STYLES.scheduled
                        const t = TYPE_STYLES[e.type] || TYPE_STYLES.video
                        const showClient = !clientId
                        return (
                          <button
                            key={e.id}
                            onClick={() => setSelected(e)}
                            className={`w-full text-left px-1.5 py-1 rounded text-[11px] leading-tight truncate border-l-2 ${t.accent} ${s.pill} hover:opacity-80`}
                            title={e.title}
                          >
                            {showClient && e.client?.client_name && (
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${colorForClient(e.client_id)} mr-1 align-middle`} />
                            )}
                            {e.title}
                          </button>
                        )
                      })}
                      {dayEvents.length > 3 && <p className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 3} more</p>}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {loading && <p className="text-xs text-gray-400 mt-4">Loading…</p>}

      {selected && (
        <DetailDrawer
          event={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          showClient={!clientId}
        />
      )}

      {showCreate && (
        <CreateModal
          defaultClientId={clientId || ''}
          clients={clients}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadEvents() }}
        />
      )}
    </div>
  )
}

function DetailDrawer({ event, onClose, onStatusChange, onDelete, showClient }) {
  const s = STATUS_STYLES[event.status] || STATUS_STYLES.scheduled
  const t = TYPE_STYLES[event.type] || TYPE_STYLES.video
  return (
    <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="absolute right-0 top-0 bottom-0 w-96 bg-white dark:bg-[#171B33] border-l border-gray-100 dark:border-white/10 shadow-2xl p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${s.pill}`}>{s.label}</span>
            <span className="text-[10px] text-gray-400">· {t.label}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{event.title}</h3>
        <p className="text-xs text-gray-400 mb-5">
          {new Date(event.scheduled_date + 'T00:00:00').toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {event.platform && <> · {event.platform}</>}
        </p>
        <dl className="space-y-3 text-sm">
          {showClient && (
            <div className="flex justify-between">
              <dt className="text-gray-400">Client</dt>
              <dd className="text-gray-700 dark:text-gray-200">{event.client?.client_name || event.client_id}</dd>
            </div>
          )}
          {event.notes && (
            <div>
              <dt className="text-gray-400 mb-1">Notes</dt>
              <dd className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap text-xs bg-gray-50 dark:bg-white/[0.02] rounded-lg p-2">{event.notes}</dd>
            </div>
          )}
        </dl>
        <div className="mt-6">
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">Change status</label>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(STATUS_STYLES).map(([key, sty]) => (
              <button
                key={key}
                onClick={() => onStatusChange(event.id, key)}
                disabled={event.status === key}
                className={`px-2 py-1.5 text-[11px] rounded-lg border transition ${
                  event.status === key
                    ? `${sty.pill} border-transparent cursor-default`
                    : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300'
                }`}
              >
                {sty.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => onDelete(event.id)}
          className="mt-6 w-full px-3 py-2 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/5"
        >
          Delete event
        </button>
      </div>
    </div>
  )
}

function CreateModal({ defaultClientId, clients, onClose, onCreated }) {
  const [clientId, setClientId] = useState(defaultClientId)
  const [type, setType] = useState('video')
  const [title, setTitle] = useState('')
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState('scheduled')
  const [platform, setPlatform] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/calendar-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, type, title, scheduledDate, status, platform, notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onCreated(data.event)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit}
        className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/10 w-full max-w-lg p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">New Calendar Event</h3>
        <div className="space-y-3 text-sm">
          {!defaultClientId && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Client</label>
              <select required value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white">
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.client_name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white">
                <option value="video">Video</option>
                <option value="ad_campaign">Ad campaign</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white">
                {Object.entries(STATUS_STYLES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Title</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 3 signs your AC is dying"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Scheduled date</label>
              <input required type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Platform (optional)</label>
              <input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="YouTube Short"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Notes (optional)</label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white resize-none" />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancel</button>
          <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
            {submitting ? 'Saving…' : 'Create event'}
          </button>
        </div>
      </form>
    </div>
  )
}
