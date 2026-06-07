'use client'

import { useState, useRef, useLayoutEffect } from 'react'
import { parseDate, isEvent, PLAN_TYPE_META, fmtTime } from './PlanGantt'

/* ─── Zoom levels ─── */
const LEVELS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
]
const MOF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MOS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DWF = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DW1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/* ─── Date helpers ─── */
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function startOfWeek(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); r.setDate(r.getDate() - r.getDay()); return r }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function midnight(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }
function parseMin(t) { if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m }

/* Does a plan row occupy this calendar day? Stays span [start, end); events are single-day. */
function coversDay(s, day) {
  const start = midnight(parseDate(s.start_date))
  if (isEvent(s)) return sameDay(start, day)
  const endExcl = midnight(parseDate(s.end_date || s.start_date))
  const d = midnight(day)
  return d >= start && (d < endExcl || sameDay(d, start))
}
function isTimed(s) { return isEvent(s) && parseMin(s.start_time) != null }
function chipLabel(s) {
  const meta = PLAN_TYPE_META[s.type] || PLAN_TYPE_META.stay
  const t = isEvent(s) ? fmtTime(s.start_time) : ''
  return `${meta.emoji} ${s.name}${t ? ' · ' + t : ''}`
}

/* ─── Main ─── */
export default function PlanCalendar({ stays = [], today = new Date(), onSelect }) {
  const [zoomIdx, setZoomIdx] = useState(1)   // default Week
  const [cursor, setCursor] = useState(() => midnight(today))   // open on the current week/day
  const level = LEVELS[zoomIdx]

  function step(dir) {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    switch (level.key) {
      case 'day': setCursor(addDays(cursor, dir)); break
      case 'week': setCursor(addDays(cursor, 7 * dir)); break
      case 'month': setCursor(new Date(y, m + dir, 1)); break
      case 'quarter': setCursor(new Date(y, m + 3 * dir, 1)); break
      case 'year': default: setCursor(new Date(y + dir, m, 1)); break
    }
  }
  function zoomToDay(d) { setCursor(midnight(d)); setZoomIdx(0) }

  function label() {
    const y = cursor.getFullYear()
    switch (level.key) {
      case 'day': return `${DWF[cursor.getDay()]}, ${MOS[cursor.getMonth()]} ${cursor.getDate()} ${y}`
      case 'week': {
        const a = startOfWeek(cursor), b = addDays(a, 6)
        return `${MOS[a.getMonth()]} ${a.getDate()} – ${a.getMonth() === b.getMonth() ? b.getDate() : MOS[b.getMonth()] + ' ' + b.getDate()}, ${b.getFullYear()}`
      }
      case 'month': return `${MOF[cursor.getMonth()]} ${y}`
      case 'quarter': return `Q${Math.floor(cursor.getMonth() / 3) + 1} ${y}`
      case 'year': default: return `${y}`
    }
  }

  return (
    <div className="text-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <button onClick={() => step(-1)} className="w-8 h-8 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white grid place-items-center">‹</button>
          <h2 className="text-[15px] font-bold min-w-[160px] text-center">{label()}</h2>
          <button onClick={() => step(1)} className="w-8 h-8 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white grid place-items-center">›</button>
          <button onClick={() => setCursor(midnight(today))}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white text-xs font-semibold">Today</button>
        </div>
        <div className="flex bg-[#171B33] border border-white/5 rounded-lg p-0.5 gap-0.5">
          {LEVELS.map((l, i) => (
            <button key={l.key} onClick={() => setZoomIdx(i)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold ${i === zoomIdx ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>{l.label}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="bg-[#111528] border border-white/5 rounded-xl overflow-hidden">
        {level.key === 'day' && <TimeGrid stays={stays} days={[cursor]} today={today} onSelect={onSelect} />}
        {level.key === 'week' && <TimeGrid stays={stays} days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))} today={today} onSelect={onSelect} />}
        {level.key === 'month' && <MonthGrid stays={stays} year={cursor.getFullYear()} month={cursor.getMonth()} today={today} onSelect={onSelect} />}
        {level.key === 'quarter' && (
          <div className="grid grid-cols-3 gap-3 p-3">
            {[0, 1, 2].map(k => { const m = Math.floor(cursor.getMonth() / 3) * 3 + k; return <MiniMonth key={k} stays={stays} year={cursor.getFullYear()} month={m} today={today} onPickDay={zoomToDay} /> })}
          </div>
        )}
        {level.key === 'year' && (
          <div className="grid grid-cols-4 gap-3 p-3">
            {Array.from({ length: 12 }, (_, m) => <MiniMonth key={m} stays={stays} year={cursor.getFullYear()} month={m} today={today} onPickDay={zoomToDay} />)}
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-gray-500 text-right">Click an item for details · use Day/Week for times</p>
    </div>
  )
}

/* ─── Day / Week: hour grid + all-day band ─── */
const HOUR_H = 44

function TimeGrid({ stays, days, today, onSelect }) {
  const scrollRef = useRef(null)
  const todayVisible = days.some(d => sameDay(d, today))
  const nowTop = (today.getHours() * 60 + today.getMinutes()) / 60 * HOUR_H
  // Open scrolled to the current time (a little above), else to ~7am
  useLayoutEffect(() => {
    if (!scrollRef.current) return
    const target = (todayVisible ? nowTop : 7 * HOUR_H) - 120
    scrollRef.current.scrollTop = Math.max(0, target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // All-day items (stays + untimed events) packed into lanes across the visible days
  const ndays = days.length
  const allDay = stays.filter(s => !isTimed(s) && days.some(d => coversDay(s, d)))
  const lanes = []
  ;[...allDay].sort((a, b) => parseDate(a.start_date) - parseDate(b.start_date)).forEach(s => {
    let cs = days.findIndex(d => coversDay(s, d))
    let ce = cs
    for (let i = cs; i < ndays; i++) if (coversDay(s, days[i])) ce = i
    let placed = false
    for (const lane of lanes) {
      if (cs > lane[lane.length - 1]._ce) { lane.push({ s, _cs: cs, _ce: ce }); placed = true; break }
    }
    if (!placed) lanes.push([{ s, _cs: cs, _ce: ce }])
  })

  const hours = Array.from({ length: 24 }, (_, h) => h)

  return (
    <div>
      {/* Day column headers */}
      <div className="flex border-b border-white/10">
        <div className="w-14 flex-shrink-0 border-r border-white/5" />
        {days.map((d, i) => {
          const isToday = sameDay(d, today)
          return (
            <div key={i} className="flex-1 text-center py-2 border-r border-white/5 last:border-r-0">
              <div className="text-[10px] font-bold text-gray-500 uppercase">{DWF[d.getDay()]}</div>
              <div className={`text-sm font-bold ${isToday ? 'text-white' : 'text-gray-300'}`}>
                {isToday ? <span className="inline-grid place-items-center w-6 h-6 rounded-full bg-blue-600">{d.getDate()}</span> : d.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* All-day band */}
      {lanes.length > 0 && (
        <div className="flex border-b border-white/10 bg-white/[0.015]">
          <div className="w-14 flex-shrink-0 border-r border-white/5 flex items-center justify-center text-[9px] font-bold text-gray-500 uppercase">All-day</div>
          <div className="flex-1 relative py-1" style={{ height: lanes.length * 24 + 4 }}>
            {lanes.map((lane, li) => lane.map(({ s, _cs, _ce }) => (
              <div key={s.id} data-bar onClick={() => onSelect && onSelect(s)} title={chipLabel(s)}
                className="absolute rounded-md px-2 flex items-center text-[11px] font-bold text-white cursor-pointer overflow-hidden whitespace-nowrap shadow-sm hover:brightness-110"
                style={{
                  left: `calc(${(_cs / ndays) * 100}% + 2px)`,
                  width: `calc(${((_ce - _cs + 1) / ndays) * 100}% - 4px)`,
                  top: li * 24 + 2, height: 20,
                  background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)`,
                }}>
                {isEvent(s) ? chipLabel(s) : s.name}
              </div>
            )))}
          </div>
        </div>
      )}

      {/* Hour grid */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 460 }}>
        <div className="flex relative" style={{ height: 24 * HOUR_H }}>
          {/* hour gutter */}
          <div className="w-14 flex-shrink-0 border-r border-white/5">
            {hours.map(h => (
              <div key={h} className="relative" style={{ height: HOUR_H }}>
                <span className="absolute -top-1.5 right-1.5 text-[10px] text-gray-500">{h === 0 ? '' : fmtTime(`${h}:00`)}</span>
              </div>
            ))}
          </div>
          {/* day columns */}
          {days.map((d, i) => {
            const dayEvents = layoutDay(stays.filter(s => isTimed(s) && sameDay(midnight(parseDate(s.start_date)), midnight(d))))
            return (
              <div key={i} className="flex-1 relative border-r border-white/5 last:border-r-0">
                {/* hour lines */}
                {hours.map(h => <div key={h} className="border-b border-white/5" style={{ height: HOUR_H }} />)}
                {/* events */}
                {dayEvents.map(e => {
                  const meta = PLAN_TYPE_META[e.type] || PLAN_TYPE_META.event
                  const top = e._min / 60 * HOUR_H
                  const h = Math.max(22, (55 / 60) * HOUR_H)
                  const w = 100 / e._ncols
                  return (
                    <div key={e.id} data-bar onClick={() => onSelect && onSelect(e)} title={chipLabel(e)}
                      className="absolute rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white cursor-pointer overflow-hidden shadow-sm hover:brightness-110 z-[2]"
                      style={{
                        top, height: h,
                        left: `calc(${e._col * w}% + 1px)`, width: `calc(${w}% - 2px)`,
                        background: `linear-gradient(135deg, ${e.color}, ${e.color}bb)`,
                      }}>
                      <div className="leading-tight truncate">{meta.emoji} {e.name}</div>
                      <div className="leading-tight opacity-90 text-[10px]">{fmtTime(e.start_time)}</div>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {/* now marker — label on the time axis + line across the day(s) */}
          {todayVisible && (
            <>
              <div className="absolute z-[5] flex items-center justify-end pr-1" style={{ top: nowTop - 7, left: 0, width: 56 }}>
                <span className="px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-bold leading-none">now</span>
              </div>
              <div className="absolute z-[5] w-2 h-2 rounded-full bg-red-500" style={{ top: nowTop - 3, left: 50 }} />
              <div className="absolute z-[5] h-0.5 bg-red-500" style={{ top: nowTop, left: 56, right: 0 }} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* Pack a single day's timed events into overlap groups → side-by-side columns */
function layoutDay(evts) {
  const BLOCK = 55
  const sorted = evts.map(e => ({ ...e, _min: parseMin(e.start_time) })).sort((a, b) => a._min - b._min)
  const out = []
  let i = 0
  while (i < sorted.length) {
    const group = [sorted[i]]
    let groupEnd = sorted[i]._min + BLOCK, j = i + 1
    while (j < sorted.length && sorted[j]._min < groupEnd) { group.push(sorted[j]); groupEnd = Math.max(groupEnd, sorted[j]._min + BLOCK); j++ }
    const colEnds = []
    group.forEach(e => {
      let c = colEnds.findIndex(end => e._min >= end)
      if (c === -1) { c = colEnds.length; colEnds.push(e._min + BLOCK) } else colEnds[c] = e._min + BLOCK
      e._col = c
    })
    group.forEach(e => { e._ncols = colEnds.length; out.push(e) })
    i = j
  }
  return out
}

/* ─── Month: full grid with chips + spanning stay bars ─── */
function MonthGrid({ stays, year, month, today, onSelect }) {
  const gridStart = startOfWeek(new Date(year, month, 1))
  const weeks = []
  let d = new Date(gridStart)
  for (let w = 0; w < 6; w++) { const row = []; for (let i = 0; i < 7; i++) { row.push(new Date(d)); d = addDays(d, 1) } weeks.push(row) }

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-white/10">
        {DWF.map(dn => <div key={dn} className="text-center py-1.5 text-[10px] font-bold text-gray-500 uppercase border-r border-white/5 last:border-r-0">{dn}</div>)}
      </div>
      {weeks.map((row, wi) => {
        // stays spanning this week → bars
        const bars = []
        ;[...stays].filter(s => !isEvent(s)).sort((a, b) => parseDate(a.start_date) - parseDate(b.start_date)).forEach(s => {
          let cs = row.findIndex(day => coversDay(s, day))
          if (cs === -1) return
          let ce = cs
          for (let i = cs; i < 7; i++) if (coversDay(s, row[i])) ce = i
          let placed = false
          for (const lane of bars) { if (cs > lane[lane.length - 1]._ce) { lane.push({ s, _cs: cs, _ce: ce }); placed = true; break } }
          if (!placed) bars.push([{ s, _cs: cs, _ce: ce }])
        })
        const barsH = bars.length * 20
        return (
          <div key={wi} className="relative border-b border-white/5 last:border-b-0" style={{ minHeight: 96 }}>
            {/* day cells */}
            <div className="grid grid-cols-7 h-full">
              {row.map((day, di) => {
                const inMonth = day.getMonth() === month
                const isToday = sameDay(day, today)
                const dayEvents = stays.filter(s => isEvent(s) && sameDay(midnight(parseDate(s.start_date)), midnight(day)))
                  .sort((a, b) => (parseMin(a.start_time) ?? 9999) - (parseMin(b.start_time) ?? 9999))
                return (
                  <div key={di} className="relative border-r border-white/5 last:border-r-0 px-1" style={{ paddingTop: barsH + 24 }}>
                    {/* event chips */}
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map(e => {
                        const meta = PLAN_TYPE_META[e.type] || PLAN_TYPE_META.event
                        return (
                          <div key={e.id} data-bar onClick={() => onSelect && onSelect(e)} title={chipLabel(e)}
                            className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold text-white cursor-pointer overflow-hidden whitespace-nowrap hover:brightness-110"
                            style={{ background: `${e.color}cc` }}>
                            <span className="leading-none">{meta.emoji}</span>
                            <span className="truncate">{fmtTime(e.start_time)} {e.name}</span>
                          </div>
                        )
                      })}
                      {dayEvents.length > 3 && <div className="text-[9px] text-gray-500 px-1">+{dayEvents.length - 3} more</div>}
                    </div>
                    {/* day number (absolute, top-right) */}
                    <div className={`absolute top-1 right-1.5 text-[11px] font-bold ${isToday ? 'bg-blue-600 text-white w-5 h-5 rounded-full grid place-items-center' : inMonth ? 'text-gray-300' : 'text-gray-600'}`}>{day.getDate()}</div>
                  </div>
                )
              })}
            </div>
            {/* spanning stay bars overlay */}
            <div className="absolute left-0 right-0 pointer-events-none" style={{ top: 22 }}>
              {bars.map((lane, li) => lane.map(({ s, _cs, _ce }) => (
                <div key={s.id} data-bar onClick={() => onSelect && onSelect(s)} title={s.name}
                  className="absolute rounded px-1.5 flex items-center text-[10px] font-bold text-white cursor-pointer pointer-events-auto overflow-hidden whitespace-nowrap hover:brightness-110"
                  style={{
                    left: `calc(${(_cs / 7) * 100}% + 2px)`,
                    width: `calc(${((_ce - _cs + 1) / 7) * 100}% - 4px)`,
                    top: li * 20, height: 18,
                    background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)`,
                  }}>
                  {s.name}
                </div>
              )))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Mini month for Quarter / Year (dots, click a day to zoom in) ─── */
function MiniMonth({ stays, year, month, today, onPickDay }) {
  const gridStart = startOfWeek(new Date(year, month, 1))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  return (
    <div className="bg-[#0f1326] border border-white/5 rounded-lg p-2">
      <div className="text-center text-xs font-bold text-gray-300 mb-1">{MOF[month]}</div>
      <div className="grid grid-cols-7 gap-px">
        {DW1.map((dn, i) => <div key={i} className="text-center text-[8px] text-gray-600">{dn}</div>)}
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === month
          const isToday = sameDay(day, today)
          const items = stays.filter(s => coversDay(s, day))
          const dot = items[0]
          return (
            <button key={i} onClick={() => onPickDay(day)}
              className={`relative h-6 rounded grid place-items-center text-[9px] hover:bg-white/10 ${inMonth ? 'text-gray-300' : 'text-gray-700'}`}>
              <span className={isToday ? 'bg-blue-600 text-white w-4 h-4 rounded-full grid place-items-center' : ''}>{day.getDate()}</span>
              {dot && <span className="absolute bottom-0.5 w-1 h-1 rounded-full" style={{ background: dot.color }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
