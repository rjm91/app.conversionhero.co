'use client'

import { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react'
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
function dayDiff(a, b) { return Math.round((midnight(b) - midnight(a)) / 86400000) }
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
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/* The date window (and label) the KPI strip should total over, per zoom level */
function rangeFor(levelKey, cursor, viewDate) {
  const y = cursor.getFullYear(), m = cursor.getMonth()
  let start, end, label
  switch (levelKey) {
    case 'day': start = midnight(viewDate); end = start; label = `${MOS[start.getMonth()]} ${start.getDate()}`; break
    case 'week': {
      start = midnight(viewDate); end = addDays(start, 6)
      label = `${MOS[start.getMonth()]} ${start.getDate()}–${start.getMonth() === end.getMonth() ? end.getDate() : MOS[end.getMonth()] + ' ' + end.getDate()}`
      break
    }
    case 'month': start = new Date(y, m, 1); end = new Date(y, m + 1, 0); label = `${MOF[m]} ${y}`; break
    case 'quarter': { const qs = Math.floor(m / 3) * 3; start = new Date(y, qs, 1); end = new Date(y, qs + 3, 0); label = `Q${Math.floor(m / 3) + 1} ${y}`; break }
    default: start = new Date(y, 0, 1); end = new Date(y, 11, 31); label = `${y}`
  }
  return { startStr: ymd(start), endStr: ymd(end), days: dayDiff(start, end) + 1, label }
}
function chipLabel(s) {
  const meta = PLAN_TYPE_META[s.type] || PLAN_TYPE_META.stay
  const t = isEvent(s) ? fmtTime(s.start_time) : ''
  return `${meta.emoji} ${s.name}${t ? ' · ' + t : ''}`
}

/* ─── Main ─── */
export default function PlanCalendar({ stays = [], today = new Date(), onSelect, onRangeChange, onRangePick }) {
  const [zoomIdx, setZoomIdx] = useState(1)        // default Week
  const [cursor, setCursor] = useState(() => midnight(today))   // month/quarter/year nav
  const [viewDate, setViewDate] = useState(() => midnight(today)) // label while scrolling day/week
  const [rangeAnchor, setRangeAnchor] = useState(null) // first click of a quarter/year range pick
  const [hoverDay, setHoverDay] = useState(null)       // live end of the range preview
  const level = LEVELS[zoomIdx]
  const isScroll = level.key === 'day' || level.key === 'week'
  const isMini = level.key === 'quarter' || level.key === 'year'
  const timeApi = useRef(null)

  // Report the active period so the KPI strip can total over what's in view
  useEffect(() => {
    if (onRangeChange) onRangeChange(rangeFor(level.key, cursor, viewDate))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.key, cursor, viewDate])

  function step(dir) {
    if (isScroll) { timeApi.current?.scrollByDays((level.key === 'day' ? 1 : 7) * dir); return }
    const y = cursor.getFullYear(), m = cursor.getMonth()
    if (level.key === 'month') setCursor(new Date(y, m + dir, 1))
    else if (level.key === 'quarter') setCursor(new Date(y, m + 3 * dir, 1))
    else setCursor(new Date(y + dir, m, 1))
  }
  function goToday() { if (isScroll) timeApi.current?.scrollToNow(); else setCursor(midnight(today)) }
  function zoomToDay(d) { setCursor(midnight(d)); setViewDate(midnight(d)); setZoomIdx(0) }

  function clearRange() { setRangeAnchor(null); setHoverDay(null) }
  // Mini-month click: first click anchors a range, second completes it; same day twice zooms in
  function pickDay(d) {
    if (!onRangePick) { zoomToDay(d); return }
    const day = midnight(d)
    if (!rangeAnchor) { setRangeAnchor(day); setHoverDay(day); return }
    if (sameDay(rangeAnchor, day)) { clearRange(); zoomToDay(day); return }
    const [a, b] = rangeAnchor <= day ? [rangeAnchor, day] : [day, rangeAnchor]
    clearRange()
    onRangePick(ymd(a), ymd(b))
  }

  // Esc cancels an in-progress range pick; leaving quarter/year drops it
  useEffect(() => {
    if (!rangeAnchor) return
    function onKey(e) { if (e.key === 'Escape') clearRange() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rangeAnchor])
  useEffect(() => { if (!isMini) clearRange() }, [isMini])

  function label() {
    if (isScroll) return `${MOF[viewDate.getMonth()]} ${viewDate.getFullYear()}`
    const y = cursor.getFullYear()
    if (level.key === 'month') return `${MOF[cursor.getMonth()]} ${y}`
    if (level.key === 'quarter') return `Q${Math.floor(cursor.getMonth() / 3) + 1} ${y}`
    return `${y}`
  }

  return (
    <div className="text-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <button onClick={() => step(-1)} className="w-8 h-8 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white grid place-items-center">‹</button>
          <h2 className="text-[15px] font-bold min-w-[150px] text-center">{label()}</h2>
          <button onClick={() => step(1)} className="w-8 h-8 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white grid place-items-center">›</button>
          <button onClick={goToday}
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
        {isScroll && <TimeGrid stays={stays} today={today} onSelect={onSelect} dayW={level.key === 'day' ? 340 : 132} apiRef={timeApi} onVisibleChange={setViewDate} />}
        {level.key === 'month' && <MonthGrid stays={stays} year={cursor.getFullYear()} month={cursor.getMonth()} today={today} onSelect={onSelect} />}
        {level.key === 'quarter' && (
          <div className="grid grid-cols-3 gap-3 p-3">
            {[0, 1, 2].map(k => { const m = Math.floor(cursor.getMonth() / 3) * 3 + k; return <MiniMonth key={k} stays={stays} year={cursor.getFullYear()} month={m} today={today} onPickDay={pickDay} onHoverDay={rangeAnchor ? setHoverDay : null} rangeAnchor={rangeAnchor} hoverDay={hoverDay} /> })}
          </div>
        )}
        {level.key === 'year' && (
          <div className="grid grid-cols-4 gap-3 p-3">
            {Array.from({ length: 12 }, (_, m) => <MiniMonth key={m} stays={stays} year={cursor.getFullYear()} month={m} today={today} onPickDay={pickDay} onHoverDay={rangeAnchor ? setHoverDay : null} rangeAnchor={rangeAnchor} hoverDay={hoverDay} />)}
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-gray-500 text-right">
        {isScroll ? '↔ drag or scroll to move through time · click an item for details'
          : !isMini || !onRangePick ? 'Click a day to zoom in · click an item for details'
          : rangeAnchor ? <span className="text-blue-400">Click an end date to plan a stay · same day again zooms in · Esc cancels</span>
          : 'Click a day to start a range · same day twice to zoom in · click an item for details'}
      </p>
    </div>
  )
}

/* ─── Day / Week: horizontally + vertically scrollable hour grid ─── */
const HOUR_H = 44
const GUTTER_W = 56
const HEADER_H = 48
const ALLDAY_LANE_H = 22

function TimeGrid({ stays, today, onSelect, dayW, apiRef, onVisibleChange }) {
  const scrollRef = useRef(null)

  // Date range: pad around today and the data so there's always room to scroll
  let minD = midnight(today), maxD = midnight(today)
  stays.forEach(s => {
    const a = midnight(parseDate(s.start_date))
    const b = midnight(parseDate(s.end_date || s.start_date))
    if (a < minD) minD = a
    if (b > maxD) maxD = b
  })
  const rangeStart = addDays(startOfWeek(minD), -7)
  const rangeEnd = addDays(maxD, 28)
  const ndays = Math.min(400, dayDiff(rangeStart, rangeEnd) + 1)
  const days = Array.from({ length: ndays }, (_, i) => addDays(rangeStart, i))
  const todayIdx = dayDiff(rangeStart, today)
  const todayInRange = todayIdx >= 0 && todayIdx < ndays
  const nowTop = (today.getHours() * 60 + today.getMinutes()) / 60 * HOUR_H
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const contentW = ndays * dayW

  // All-day items packed into lanes across the whole range
  const allDay = stays.filter(s => !isTimed(s))
  const lanes = []
  ;[...allDay].sort((a, b) => parseDate(a.start_date) - parseDate(b.start_date)).forEach(s => {
    let cs = days.findIndex(d => coversDay(s, d))
    if (cs === -1) return
    let ce = cs
    for (let i = cs; i < ndays; i++) if (coversDay(s, days[i])) ce = i
    let placed = false
    for (const lane of lanes) { if (cs > lane[lane.length - 1]._ce) { lane.push({ s, _cs: cs, _ce: ce }); placed = true; break } }
    if (!placed) lanes.push([{ s, _cs: cs, _ce: ce }])
  })
  const allDayH = Math.max(ALLDAY_LANE_H, lanes.length * ALLDAY_LANE_H) + 6

  // Imperative scroll API for the toolbar
  function scrollToNow() {
    const el = scrollRef.current; if (!el) return
    el.scrollTo({ left: Math.max(0, todayIdx * dayW - dayW), top: Math.max(0, nowTop - 120), behavior: 'smooth' })
  }
  function scrollByDays(n) {
    const el = scrollRef.current; if (!el) return
    el.scrollBy({ left: n * dayW, behavior: 'smooth' })
  }
  if (apiRef) apiRef.current = { scrollToNow, scrollByDays }

  // Initial position: today + current time
  useLayoutEffect(() => {
    const el = scrollRef.current; if (!el) return
    el.scrollLeft = Math.max(0, (todayInRange ? todayIdx : 0) * dayW - dayW)
    el.scrollTop = Math.max(0, nowTop - 120)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayW])

  // Report the left-most visible day for the toolbar label (throttled via rAF)
  const rafRef = useRef(0)
  const onScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = scrollRef.current; if (!el || !onVisibleChange) return
      const idx = Math.round(el.scrollLeft / dayW)
      const d = addDays(rangeStart, Math.min(ndays - 1, Math.max(0, idx)))
      onVisibleChange(midnight(d))
    })
  }, [dayW, ndays]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drag-to-pan (both axes), ignoring clicks that start on an item
  const drag = useRef({ down: false, x: 0, y: 0, l: 0, t: 0 })
  function onDown(e) {
    if (e.target.closest('[data-bar]')) return
    drag.current = { down: true, x: e.pageX, y: e.pageY, l: scrollRef.current.scrollLeft, t: scrollRef.current.scrollTop }
  }
  function onMove(e) {
    if (!drag.current.down) return
    scrollRef.current.scrollLeft = drag.current.l - (e.pageX - drag.current.x)
    scrollRef.current.scrollTop = drag.current.t - (e.pageY - drag.current.y)
  }
  function onUp() { drag.current.down = false }

  return (
    <div ref={scrollRef} onScroll={onScroll} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      className="overflow-auto select-none cursor-grab active:cursor-grabbing" style={{ maxHeight: 520 }}>
      <div style={{ width: GUTTER_W + contentW, position: 'relative' }}>

        {/* Header row (sticky top) */}
        <div className="flex sticky top-0 z-20">
          <div className="sticky left-0 z-30 bg-[#111528] border-r border-b border-white/10 flex-shrink-0" style={{ width: GUTTER_W, height: HEADER_H }} />
          <div className="flex bg-[#111528] border-b border-white/10" style={{ height: HEADER_H }}>
            {days.map((d, i) => {
              const isToday = sameDay(d, today)
              const weekStart = d.getDay() === 0
              return (
                <div key={i} className={`text-center flex flex-col justify-center border-r border-white/5 ${weekStart ? 'border-l border-white/10' : ''}`} style={{ width: dayW }}>
                  <div className="text-[10px] font-bold text-gray-500 uppercase leading-none">{DWF[d.getDay()]} {MOS[d.getMonth()]}</div>
                  <div className={`text-sm font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-300'}`}>
                    {isToday ? <span className="inline-grid place-items-center w-6 h-6 rounded-full bg-blue-600">{d.getDate()}</span> : d.getDate()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* All-day band (sticky under header) */}
        <div className="flex sticky z-10" style={{ top: HEADER_H }}>
          <div className="sticky left-0 z-20 bg-[#111528] border-r border-b border-white/10 flex-shrink-0 grid place-items-center text-[9px] font-bold text-gray-500 uppercase" style={{ width: GUTTER_W, height: allDayH }}>All-day</div>
          <div className="relative bg-white/[0.015] border-b border-white/10" style={{ width: contentW, height: allDayH }}>
            {lanes.map((lane, li) => lane.map(({ s, _cs, _ce }) => (
              <div key={s.id} data-bar onClick={() => onSelect && onSelect(s)} title={chipLabel(s)}
                className="absolute rounded-md px-2 flex items-center text-[11px] font-bold text-white cursor-pointer overflow-hidden whitespace-nowrap shadow-sm hover:brightness-110"
                style={{ left: _cs * dayW + 2, width: (_ce - _cs + 1) * dayW - 4, top: li * ALLDAY_LANE_H + 3, height: ALLDAY_LANE_H - 4, background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)` }}>
                {isEvent(s) ? chipLabel(s) : s.name}
              </div>
            )))}
          </div>
        </div>

        {/* Hour grid */}
        <div className="flex">
          {/* hour gutter (sticky left) */}
          <div className="sticky left-0 z-10 bg-[#111528] border-r border-white/5 flex-shrink-0 relative" style={{ width: GUTTER_W, height: 24 * HOUR_H }}>
            {hours.map(h => (
              <div key={h} className="absolute right-1.5 text-[10px] text-gray-500" style={{ top: h * HOUR_H - 6 }}>{h === 0 ? '' : fmtTime(`${h}:00`)}</div>
            ))}
            {todayInRange && (
              <span className="absolute right-1 px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-bold leading-none z-10" style={{ top: nowTop - 7 }}>now</span>
            )}
          </div>

          {/* columns canvas */}
          <div className="relative" style={{ width: contentW, height: 24 * HOUR_H }}>
            {/* hour lines (full width) */}
            {hours.map(h => <div key={h} className="absolute left-0 right-0 border-t border-white/5" style={{ top: h * HOUR_H }} />)}
            {/* day separators + weekend shading */}
            {days.map((d, i) => {
              const we = d.getDay() === 0 || d.getDay() === 6
              return <div key={i} className={`absolute top-0 bottom-0 border-r border-white/5 ${d.getDay() === 0 ? 'border-l border-white/10' : ''} ${we ? 'bg-white/[0.012]' : ''}`} style={{ left: i * dayW, width: dayW }} />
            })}
            {/* now line */}
            {todayInRange && (
              <>
                <div className="absolute h-px bg-red-500/30 z-[3]" style={{ top: nowTop, left: 0, right: 0 }} />
                <div className="absolute h-0.5 bg-red-500 z-[4]" style={{ top: nowTop, left: todayIdx * dayW, width: dayW }} />
                <div className="absolute w-2 h-2 rounded-full bg-red-500 z-[4]" style={{ top: nowTop - 3, left: todayIdx * dayW - 1 }} />
              </>
            )}
            {/* timed events */}
            {days.map((d, i) => {
              const dayEvents = layoutDay(stays.filter(s => isTimed(s) && sameDay(midnight(parseDate(s.start_date)), midnight(d))))
              return dayEvents.map(e => {
                const meta = PLAN_TYPE_META[e.type] || PLAN_TYPE_META.event
                const top = e._min / 60 * HOUR_H
                const h = Math.max(22, (55 / 60) * HOUR_H)
                const colW = dayW / e._ncols
                return (
                  <div key={e.id} data-bar onClick={() => onSelect && onSelect(e)} title={chipLabel(e)}
                    className="absolute rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white cursor-pointer overflow-hidden shadow-sm hover:brightness-110 z-[2]"
                    style={{ top, height: h, left: i * dayW + e._col * colW + 1, width: colW - 2, background: `linear-gradient(135deg, ${e.color}, ${e.color}bb)` }}>
                    <div className="leading-tight truncate">{meta.emoji} {e.name}</div>
                    <div className="leading-tight opacity-90 text-[10px]">{fmtTime(e.start_time)}</div>
                  </div>
                )
              })
            })}
          </div>
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
            <div className="grid grid-cols-7 h-full">
              {row.map((day, di) => {
                const inMonth = day.getMonth() === month
                const isToday = sameDay(day, today)
                const dayEvents = stays.filter(s => isEvent(s) && sameDay(midnight(parseDate(s.start_date)), midnight(day)))
                  .sort((a, b) => (parseMin(a.start_time) ?? 9999) - (parseMin(b.start_time) ?? 9999))
                return (
                  <div key={di} className="relative border-r border-white/5 last:border-r-0 px-1" style={{ paddingTop: barsH + 24 }}>
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
                    <div className={`absolute top-1 right-1.5 text-[11px] font-bold ${isToday ? 'bg-blue-600 text-white w-5 h-5 rounded-full grid place-items-center' : inMonth ? 'text-gray-300' : 'text-gray-600'}`}>{day.getDate()}</div>
                  </div>
                )
              })}
            </div>
            <div className="absolute left-0 right-0 pointer-events-none" style={{ top: 22 }}>
              {bars.map((lane, li) => lane.map(({ s, _cs, _ce }) => (
                <div key={s.id} data-bar onClick={() => onSelect && onSelect(s)} title={s.name}
                  className="absolute rounded px-1.5 flex items-center text-[10px] font-bold text-white cursor-pointer pointer-events-auto overflow-hidden whitespace-nowrap hover:brightness-110"
                  style={{ left: `calc(${(_cs / 7) * 100}% + 2px)`, width: `calc(${((_ce - _cs + 1) / 7) * 100}% - 4px)`, top: li * 20, height: 18, background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)` }}>
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

/* ─── Mini month for Quarter / Year (dots, range pick, click a day to zoom in) ─── */
function MiniMonth({ stays, year, month, today, onPickDay, onHoverDay, rangeAnchor, hoverDay }) {
  const gridStart = startOfWeek(new Date(year, month, 1))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  // Live range preview: anchor → hovered day, either direction
  const lo = rangeAnchor && hoverDay ? (rangeAnchor <= hoverDay ? rangeAnchor : hoverDay) : rangeAnchor
  const hi = rangeAnchor && hoverDay ? (rangeAnchor <= hoverDay ? hoverDay : rangeAnchor) : rangeAnchor
  return (
    <div className="bg-[#0f1326] border border-white/5 rounded-lg p-2">
      <div className="text-center text-xs font-bold text-gray-300 mb-1">{MOF[month]}</div>
      <div className="grid grid-cols-7 gap-px">
        {DW1.map((dn, i) => <div key={i} className="text-center text-[8px] text-gray-600">{dn}</div>)}
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === month
          const isToday = sameDay(day, today)
          const dot = stays.find(s => coversDay(s, day))
          const inRange = inMonth && lo && day >= lo && day <= hi
          const isEdge = inRange && (sameDay(day, lo) || sameDay(day, hi))
          return (
            <button key={i} onClick={() => onPickDay(day)} onMouseEnter={onHoverDay ? () => onHoverDay(day) : undefined}
              className={`relative h-6 grid place-items-center text-[9px] ${
                isEdge ? 'rounded bg-blue-600 text-white font-bold'
                : inRange ? 'rounded-none bg-blue-600/25 text-blue-100'
                : `rounded hover:bg-white/10 ${inMonth ? 'text-gray-300' : 'text-gray-700'}`}`}>
              <span className={isToday && !inRange ? 'bg-blue-600 text-white w-4 h-4 rounded-full grid place-items-center' : ''}>{day.getDate()}</span>
              {dot && <span className="absolute bottom-0.5 w-1 h-1 rounded-full" style={{ background: dot.color }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
