'use client'

import { useState, useRef, useMemo, useLayoutEffect } from 'react'

/* Zoom levels, ordered zoomed-OUT -> zoomed-IN; value = px per day */
const LEVELS = [
  { key: 'year', label: 'Year', cw: 4 },
  { key: 'quarter', label: 'Quarter', cw: 13 },
  { key: 'month', label: 'Month', cw: 40 },
  { key: 'week', label: 'Week', cw: 110 },
  { key: 'day', label: 'Day', cw: 280 },
]
const MOF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MOS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DWF = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function parseDate(s) {
  if (s instanceof Date) return s
  const [y, m, a] = String(s).split('-').map(Number)
  return new Date(y, m - 1, a)
}
export function nights(s) {
  return Math.max(1, Math.round((parseDate(s.end_date) - parseDate(s.start_date)) / 86400000))
}
export function catTotal(s) {
  const c = s.categories || {}
  return Object.values(c).reduce((a, b) => a + (Number(b) || 0), 0)
}
export function money(n) { return '$' + Math.round(n).toLocaleString() }
function daysBetween(a, b) { return Math.round((b - a) / 86400000) }
function addDays(dt, n) { const r = new Date(dt); r.setDate(r.getDate() + n); return r }
function sameDay(a, b) { return a.toDateString() === b.toDateString() }

export default function PlanGantt({ stays = [], year, today = new Date(), onSelect, compact = false }) {
  const yr = year || (stays.length ? parseDate(stays[0].start_date).getFullYear() : today.getFullYear())
  const RANGE_START = useMemo(() => new Date(yr, 0, 1), [yr])
  const RANGE_END = useMemo(() => new Date(yr, 11, 31), [yr])
  const totalDays = daysBetween(RANGE_START, RANGE_END) + 1

  const [zoomIdx, setZoomIdx] = useState(2)        // start at Month
  const [cursor, setCursor] = useState(() => {
    if (stays.length) { const d0 = parseDate(stays[0].start_date); return new Date(d0.getFullYear(), d0.getMonth(), 1) }
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const scrollRef = useRef(null)
  const firstRef = useRef(true)
  const level = LEVELS[zoomIdx]
  const cw = level.cw
  const laneH = compact ? 46 : 56

  /* pack non-overlapping stays into lanes (rows) */
  const lanes = useMemo(() => {
    const ls = []
    ;[...stays].sort((a, b) => parseDate(a.start_date) - parseDate(b.start_date)).forEach(s => {
      let placed = false
      for (const lane of ls) {
        if (parseDate(s.start_date) >= parseDate(lane[lane.length - 1].end_date)) { lane.push(s); placed = true; break }
      }
      if (!placed) ls.push([s])
    })
    return ls
  }, [stays])

  function periodBounds(c = cursor, lv = level) {
    const y = c.getFullYear(), m = c.getMonth()
    switch (lv.key) {
      case 'year': return [new Date(y, 0, 1), new Date(y, 11, 31)]
      case 'quarter': { const qs = Math.floor(m / 3) * 3; return [new Date(y, qs, 1), new Date(y, qs + 3, 0)] }
      case 'month': return [new Date(y, m, 1), new Date(y, m + 1, 0)]
      case 'week': { const ws = addDays(c, -c.getDay()); return [ws, addDays(ws, 6)] }
      case 'day': default: return [new Date(c), new Date(c)]
    }
  }
  function periodLabel() {
    const [a, b] = periodBounds(); const y = cursor.getFullYear()
    switch (level.key) {
      case 'year': return '' + y
      case 'quarter': return 'Q' + (Math.floor(cursor.getMonth() / 3) + 1) + ' ' + y
      case 'month': return MOF[cursor.getMonth()] + ' ' + y
      case 'week': return MOS[a.getMonth()] + ' ' + a.getDate() + ' – ' + (a.getMonth() === b.getMonth() ? b.getDate() : MOS[b.getMonth()] + ' ' + b.getDate())
      case 'day': default: return DWF[cursor.getDay()] + ', ' + MOS[cursor.getMonth()] + ' ' + cursor.getDate()
    }
  }

  /* keep the timeline scrolled to whatever period the cursor points at */
  useLayoutEffect(() => {
    const [start] = periodBounds()
    const left = daysBetween(RANGE_START, start) * cw
    scrollRef.current?.scrollTo({ left: Math.max(left - 8, 0), behavior: firstRef.current ? 'auto' : 'smooth' })
    firstRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomIdx, cursor, cw])

  function step(dir) {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    switch (level.key) {
      case 'year': setCursor(new Date(y + dir, m, 1)); break
      case 'quarter': setCursor(new Date(y, m + 3 * dir, 1)); break
      case 'month': setCursor(new Date(y, m + dir, 1)); break
      case 'week': setCursor(addDays(cursor, 7 * dir)); break
      case 'day': default: setCursor(addDays(cursor, dir)); break
    }
  }
  function setZoom(idx) { setZoomIdx(Math.max(0, Math.min(LEVELS.length - 1, idx))) }

  /* drag-to-pan */
  const drag = useRef({ down: false, x: 0, left: 0 })
  function onDown(e) {
    if (e.target.closest('[data-bar]')) return
    drag.current = { down: true, x: e.pageX, left: scrollRef.current.scrollLeft }
  }
  function onMove(e) {
    if (!drag.current.down) return
    scrollRef.current.scrollLeft = drag.current.left - (e.pageX - drag.current.x)
  }
  function onUp() { drag.current.down = false }

  /* summary for the period in view */
  const [a, b] = periodBounds()
  const inView = stays.filter(s => parseDate(s.start_date) <= b && parseDate(s.end_date) > a)
  const spend = inView.reduce((acc, s) => acc + catTotal(s), 0)
  const nts = inView.reduce((acc, s) => acc + nights(s), 0)

  const dense = cw >= 28
  const showDOW = cw >= 34
  const fullDOW = cw >= 90

  /* axis + grid cells */
  const cells = []
  for (let i = 0; i < totalDays; i++) {
    const dt = addDays(RANGE_START, i)
    const we = dt.getDay() === 0 || dt.getDay() === 6
    const isToday = sameDay(dt, today)
    const labelNum = dense || (cw >= 8 && (dt.getDay() === 1 || dt.getDate() === 1))
    cells.push({ dt, we, isToday, labelNum })
  }

  /* month band segments */
  const segs = []
  let cur = new Date(RANGE_START)
  while (cur <= RANGE_END) {
    const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
    const segEnd = mEnd > RANGE_END ? RANGE_END : mEnd
    segs.push({ label: MOS[cur.getMonth()] + ' ' + cur.getFullYear(), w: (daysBetween(cur, segEnd) + 1) * cw })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  const canvasW = totalDays * cw
  const todayLeft = daysBetween(RANGE_START, today) * cw + cw / 2
  const todayIn = today >= RANGE_START && today <= RANGE_END

  return (
    <div className="text-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <button onClick={() => step(-1)} className="w-8 h-8 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white grid place-items-center">‹</button>
          <h2 className="text-[15px] font-bold min-w-[150px] text-center">{periodLabel()}</h2>
          <button onClick={() => step(1)} className="w-8 h-8 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white grid place-items-center">›</button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white text-xs font-semibold">Today</button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setZoom(zoomIdx - 1)} disabled={zoomIdx <= 0}
              className="w-8 h-8 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white grid place-items-center text-lg font-bold disabled:opacity-30">−</button>
            <span className="text-xs font-bold text-gray-400 w-[52px] text-center">{level.label}</span>
            <button onClick={() => setZoom(zoomIdx + 1)} disabled={zoomIdx >= LEVELS.length - 1}
              className="w-8 h-8 rounded-lg border border-white/10 bg-[#171B33] text-gray-400 hover:text-white grid place-items-center text-lg font-bold disabled:opacity-30">+</button>
          </div>
          <div className="flex bg-[#171B33] border border-white/5 rounded-lg p-0.5 gap-0.5">
            {LEVELS.map((l, i) => (
              <button key={l.key} onClick={() => setZoom(i)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${i === zoomIdx ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>{l.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Gantt frame */}
      <div className="bg-[#111528] border border-white/5 rounded-xl overflow-hidden">
        <div ref={scrollRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          className="overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing">
          <div style={{ width: canvasW, position: 'relative' }}>
            {/* month band */}
            <div className="flex h-[30px] border-b border-white/10">
              {segs.map((s, i) => (
                <div key={i} style={{ width: s.w }} className="border-r border-white/10 flex items-center px-3 text-[11px] font-bold text-gray-400 uppercase tracking-wide overflow-hidden whitespace-nowrap">{s.label}</div>
              ))}
            </div>
            {/* day axis */}
            <div className="flex h-[38px] border-b border-white/5">
              {cells.map((c, i) => (
                <div key={i} style={{ width: cw }}
                  className={`border-r border-white/5 flex flex-col items-center justify-center gap-px ${c.we ? 'bg-white/[0.015]' : ''}`}>
                  {c.labelNum && (
                    c.isToday
                      ? <div className="text-[11px] font-bold bg-blue-600 text-white w-5 h-5 rounded-full grid place-items-center">{c.dt.getDate()}</div>
                      : <div className="text-xs font-bold text-gray-300">{c.dt.getDate()}</div>
                  )}
                  {showDOW && <div className="text-[9px] text-gray-500 uppercase">{fullDOW ? DWF[c.dt.getDay()] : DW[c.dt.getDay()]}</div>}
                </div>
              ))}
            </div>
            {/* lanes */}
            <div style={{ position: 'relative' }}>
              {/* grid lines */}
              <div className="absolute inset-0 flex z-0">
                {cells.map((c, i) => (
                  <div key={i} style={{ width: cw }} className={`border-r border-white/5 ${c.we ? 'bg-white/[0.015]' : ''}`} />
                ))}
              </div>
              {todayIn && <div className="absolute top-0 bottom-0 w-0.5 bg-blue-500 opacity-60 z-[3]" style={{ left: todayLeft }} />}
              {lanes.length === 0 && (
                <div className="relative z-[2] px-5 text-sm text-gray-500" style={{ height: laneH, display: 'grid', alignItems: 'center' }}>
                  No stays yet.
                </div>
              )}
              {lanes.map((lane, li) => (
                <div key={li} style={{ position: 'relative', height: laneH }}>
                  {lane.map(s => {
                    const left = daysBetween(RANGE_START, parseDate(s.start_date)) * cw
                    const w = nights(s) * cw
                    const n = nights(s)
                    const flightLeft = s.flight_date ? daysBetween(RANGE_START, parseDate(s.flight_date)) * cw : null
                    return (
                      <div key={s.id}>
                        <div data-bar onClick={() => onSelect && onSelect(s)}
                          className="absolute rounded-lg px-3 flex flex-col justify-center cursor-pointer overflow-hidden z-[2] shadow-md hover:brightness-110"
                          style={{ left, width: w, top: 8, height: laneH - 16, background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)` }}>
                          <div className="text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis">{s.name}</div>
                          {cw >= 11 && <div className="text-[10px] opacity-90 whitespace-nowrap">{money(catTotal(s))} · {money(catTotal(s) / n)}/day</div>}
                        </div>
                        {flightLeft != null && (
                          <div className="absolute z-[3] text-sm" style={{ left: flightLeft, top: 14, transform: 'translateX(-50%)' }}>✈️</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* footer summary */}
        {!compact && (
          <div className="flex gap-7 px-5 py-3.5 border-t border-white/5">
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">In View · {periodLabel()}</div>
              <div className="text-[17px] font-extrabold text-green-400 mt-0.5">{money(spend)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Nights</div>
              <div className="text-[17px] font-extrabold mt-0.5">{nts}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Avg / Day</div>
              <div className="text-[17px] font-extrabold text-indigo-400 mt-0.5">{nts ? money(spend / nts) : '$0'}</div>
            </div>
            <div className="ml-auto self-center text-[11px] text-gray-500">↔ drag or scroll · click a bar for details</div>
          </div>
        )}
      </div>
    </div>
  )
}
