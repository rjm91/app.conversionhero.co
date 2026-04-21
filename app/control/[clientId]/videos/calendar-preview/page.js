'use client'

import { useState } from 'react'

const STATUS_STYLES = {
  published:  { label: 'Published',  dot: 'bg-green-500',  pill: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
  scheduled:  { label: 'Scheduled',  dot: 'bg-blue-500',   pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  filming:    { label: 'Filming',    dot: 'bg-amber-500',  pill: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  editing:    { label: 'Editing',    dot: 'bg-purple-500', pill: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400' },
  overdue:    { label: 'Overdue',    dot: 'bg-red-500',    pill: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  campaign:   { label: 'Ad campaign',dot: 'bg-pink-500',   pill: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400' },
}

// Fake April 2026 schedule for this mockup
const EVENTS = [
  { day: 1,  type: 'published', title: '3 signs your AC is dying',           platform: 'YouTube Short' },
  { day: 2,  type: 'campaign',  title: 'Spring Tune-up · $2,450 budget',     platform: 'YouTube Ads' },
  { day: 3,  type: 'published', title: 'Why your bill spiked',               platform: 'YouTube Short' },
  { day: 6,  type: 'published', title: 'Free vs paid tune-up',               platform: 'YouTube Short' },
  { day: 8,  type: 'overdue',   title: 'Heat pump myths',                    platform: 'YouTube Short' },
  { day: 9,  type: 'editing',   title: 'Customer testimonial · Melody H.',   platform: 'YouTube Short' },
  { day: 10, type: 'published', title: 'Meet the Synergy crew',              platform: 'YouTube Short' },
  { day: 13, type: 'filming',   title: 'Inside a real install',              platform: 'YouTube Short' },
  { day: 14, type: 'scheduled', title: 'Spring promo launch',                platform: 'YouTube Short' },
  { day: 15, type: 'campaign',  title: 'Retargeting warm leads',             platform: 'YouTube Ads' },
  { day: 16, type: 'scheduled', title: 'Thermostat 101',                     platform: 'YouTube Short' },
  { day: 17, type: 'scheduled', title: 'Why we use Trane',                   platform: 'YouTube Short' },
  { day: 20, type: 'scheduled', title: 'Customer testimonial · Jason L.',    platform: 'YouTube Short' },
  { day: 21, type: 'scheduled', title: 'Financing options explained',        platform: 'YouTube Short' },
  { day: 22, type: 'scheduled', title: 'Behind the scenes: dispatch',        platform: 'YouTube Short' },
  { day: 23, type: 'scheduled', title: 'Avatar: FAQ #1',                     platform: 'YouTube Short' },
  { day: 24, type: 'scheduled', title: 'Avatar: FAQ #2',                     platform: 'YouTube Short' },
  { day: 27, type: 'scheduled', title: 'Emergency service promo',            platform: 'YouTube Short' },
  { day: 28, type: 'scheduled', title: 'Owner intro video',                  platform: 'YouTube Short' },
  { day: 29, type: 'scheduled', title: 'May preview',                        platform: 'YouTube Short' },
  { day: 30, type: 'campaign',  title: 'May campaign kickoff',               platform: 'YouTube Ads' },
]

export default function CalendarPreview() {
  // April 2026: starts Wednesday, 30 days
  const monthLabel = 'April 2026'
  const firstDayOffset = 3 // Sun=0, so Wed=3
  const daysInMonth = 30
  const cells = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const eventsFor = day => EVENTS.filter(e => e.day === day)
  const [selected, setSelected] = useState(null)

  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const counts = EVENTS.reduce((acc, e) => (acc[e.type] = (acc[e.type] || 0) + 1, acc), {})

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
          Mockup
        </span>
        <p className="text-xs text-gray-400">Static preview with fake data. Not wired up.</p>
      </div>

      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Content Calendar</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            All videos and ad campaigns for Synergy Home · Growth Plan (21 videos/mo)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">‹</button>
          <span className="text-sm font-medium text-gray-900 dark:text-white w-32 text-center">{monthLabel}</span>
          <button className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">›</button>
          <div className="mx-2 h-6 w-px bg-gray-200 dark:bg-white/10" />
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden text-xs">
            <button className="px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900">Month</button>
            <button className="px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5">Week</button>
            <button className="px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5">List</button>
          </div>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(STATUS_STYLES).map(([key, s]) => (
          <div key={key} className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${s.pill}`}>
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            {s.label}
            <span className="opacity-60">· {counts[key] || 0}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
          {weekdays.map(w => (
            <div key={w} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[7.5rem]">
          {cells.map((day, i) => {
            const isToday = day === 20 // pretend today is the 20th
            const events = day ? eventsFor(day) : []
            return (
              <div
                key={i}
                className={`border-r border-b border-gray-100 dark:border-white/5 p-2 overflow-hidden ${
                  !day ? 'bg-gray-50/50 dark:bg-white/[0.01]' : ''
                }`}
              >
                {day && (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {day}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {events.slice(0, 3).map((e, j) => {
                        const s = STATUS_STYLES[e.type]
                        return (
                          <button
                            key={j}
                            onClick={() => setSelected(e)}
                            className={`w-full text-left px-1.5 py-1 rounded text-[11px] leading-tight truncate ${s.pill} hover:opacity-80`}
                            title={e.title}
                          >
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot} mr-1 align-middle`} />
                            {e.title}
                          </button>
                        )
                      })}
                      {events.length > 3 && (
                        <p className="text-[10px] text-gray-400 px-1">+{events.length - 3} more</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="absolute right-0 top-0 bottom-0 w-96 bg-white dark:bg-[#171B33] border-l border-gray-100 dark:border-white/10 shadow-2xl p-6 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLES[selected.type].pill}`}>
                {STATUS_STYLES[selected.type].label}
              </span>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">×</button>
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{selected.title}</h3>
            <p className="text-xs text-gray-400 mb-5">{selected.platform} · April {selected.day}, 2026</p>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Client</dt>
                <dd className="text-gray-700 dark:text-gray-200">Synergy Home</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Script</dt>
                <dd className="text-blue-500 hover:underline cursor-pointer">View script →</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Assigned</dt>
                <dd className="text-gray-700 dark:text-gray-200">Ryan M.</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Thumbnail</dt>
                <dd className="text-gray-700 dark:text-gray-200">Not uploaded</dd>
              </div>
            </dl>

            <div className="mt-6 flex gap-2">
              <button className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">Mark published</button>
              <button className="px-3 py-2 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/5">Reschedule</button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Click any event to preview the detail side panel. Navigation, drag-to-reschedule,
        and week/list views are not functional in this mockup.
      </p>
    </div>
  )
}
