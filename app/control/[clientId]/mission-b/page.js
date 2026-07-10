'use client'

// Mission B — the app's data architecture, made legible.
// Every public table is a dark node; PRIMARY KEYS and FOREIGN-KEY links GLOW.
// The whole surface is muted except the keys — so a human (and the way the
// agent traverses the data) reads instantly: tables relate through their ids,
// hanging off the client_id / agency_id tenant spine. Read-only: it fetches a
// parsed snapshot of db/schema.md and draws it. No database writes.

import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ── cluster palette + labels (mirrors domainOf() in the API route) ── */
const CLUSTER = {
  client:  { label: 'Tenant data',    color: '#6ea8fe', note: 'client_* — the tenant spine' },
  agency:  { label: 'Agency root',    color: '#3fd68f', note: 'white-label root (agency_*)' },
  funnel:  { label: 'Funnels',        color: '#e8b45a', note: 'landing / funnel graph' },
  mission: { label: 'Agent brain',    color: '#a78bfa', note: 'findings · decisions · policies' },
  billing: { label: 'Auth & billing', color: '#5ad1e8', note: 'profiles · tokens · money' },
  system:  { label: 'System',         color: '#8a93a8', note: 'projects · roadmap · activity' },
}
const CLUSTER_ORDER = ['agency', 'billing', 'funnel', 'client', 'mission', 'system']
const clusterColor = (d) => (CLUSTER[d] || CLUSTER.system).color

/* ── card geometry (kept in JS so we can anchor edges without measuring DOM) ── */
const CARD_W = 222
const HEAD_H = 30
const ROW_H = 19
const LIST_TOP = 6
const FOOT_H = 17
const SLOT_H = 158
const cardH = (keyN, hasMore) => HEAD_H + LIST_TOP + keyN * ROW_H + (hasMore ? FOOT_H : 0) + 8
const rowCY = (i) => HEAD_H + LIST_TOP + i * ROW_H + ROW_H / 2
const isSpine = (n) => n === 'client_id' || n === 'agency_id'

/* ── deterministic clustered-grid layout (draggable afterwards) ── */
function autoLayout(tables) {
  const byDom = {}
  for (const t of tables) (byDom[t.domain] ||= []).push(t)
  const pos = {}
  const GAPX = 40, CGAP = 92, MAXW = 2400
  let cx = 0, cy = 0, rowMaxH = 0
  for (const dom of CLUSTER_ORDER) {
    const list = byDom[dom]
    if (!list) continue
    const cols = Math.min(dom === 'client' ? 5 : 3, Math.max(1, Math.ceil(Math.sqrt(list.length))))
    const rows = Math.ceil(list.length / cols)
    const blockW = cols * (CARD_W + GAPX)
    const blockH = rows * SLOT_H
    if (cx > 0 && cx + blockW > MAXW) { cx = 0; cy += rowMaxH + CGAP; rowMaxH = 0 }
    list.forEach((t, i) => {
      const c = i % cols, r = Math.floor(i / cols)
      pos[t.name] = { x: cx + c * (CARD_W + GAPX), y: cy + r * SLOT_H }
    })
    cx += blockW + CGAP
    rowMaxH = Math.max(rowMaxH, blockH)
  }
  return pos
}

function fitView(pos, tables, heights, vw, vh) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  for (const t of tables) {
    const p = pos[t.name]; if (!p) continue
    minx = Math.min(minx, p.x); miny = Math.min(miny, p.y)
    maxx = Math.max(maxx, p.x + CARD_W); maxy = Math.max(maxy, p.y + (heights[t.name] || 120))
  }
  if (!isFinite(minx)) return { x: 0, y: 0, k: 0.7 }
  const w = maxx - minx, h = maxy - miny
  const k = Math.max(0.14, Math.min(vw / (w + 140), vh / (h + 140), 1))
  return { x: (vw - w * k) / 2 - minx * k, y: (vh - h * k) / 2 - miny * k, k }
}

export default function MissionBGraph() {
  const { clientId } = useParams()
  const router = useRouter()

  const [model, setModel] = useState(null)   // { tables, edges, counts }
  const [err, setErr] = useState(null)
  const [pos, setPos] = useState({})         // name -> {x,y}
  const [view, setView] = useState({ x: 0, y: 0, k: 0.72 })
  const [focus, setFocus] = useState(null)   // focused table name
  const [hoverEdge, setHoverEdge] = useState(null)
  const [sideOpen, setSideOpen] = useState(true)
  const [sideW, setSideW] = useState(238)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelH, setPanelH] = useState(190)
  const [lines, setLines] = useState([{ who: 'sys', t: 'schema graph ready — click a table, or type /help' }])
  const [qpOpen, setQpOpen] = useState(false)
  const [qpQ, setQpQ] = useState('')

  const vpRef = useRef(null)
  const drag = useRef(null)          // active drag descriptor
  const didFit = useRef(false)
  const termInput = useRef(null)

  /* ── load the parsed schema ── */
  useEffect(() => {
    let alive = true
    fetch('/api/mission-b/schema', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!alive) return; if (d.error) setErr(d.error); else setModel(d) })
      .catch(e => alive && setErr(String(e)))
    return () => { alive = false }
  }, [])

  /* ── derived per-table geometry + adjacency ── */
  const meta = useMemo(() => {
    if (!model) return null
    const byName = {}, keyCols = {}, keyIdx = {}, heights = {}
    for (const t of model.tables) {
      byName[t.name] = t
      const kc = t.columns.filter(c => c.key)
      keyCols[t.name] = kc
      const idx = {}; kc.forEach((c, i) => { idx[c.name] = i })
      keyIdx[t.name] = idx
      heights[t.name] = cardH(kc.length, t.columns.length > kc.length)
    }
    const inbound = {}, outbound = {}
    model.edges.forEach((e, i) => {
      e._i = i
      ;(outbound[e.from] ||= []).push(e)
      ;(inbound[e.to] ||= []).push(e)
    })
    return { byName, keyCols, keyIdx, heights, inbound, outbound }
  }, [model])

  /* ── first-load layout: saved positions win, else auto-layout, then fit ── */
  useEffect(() => {
    if (!model || !meta) return
    const saved = {}
    for (const t of model.tables) {
      try {
        const raw = localStorage.getItem(`mb_pos_${t.name}`)
        if (raw) { const p = JSON.parse(raw); if (p && typeof p.x === 'number') saved[t.name] = p }
      } catch { /* ignore */ }
    }
    const base = autoLayout(model.tables)
    setPos({ ...base, ...saved })
  }, [model, meta])

  useEffect(() => {
    if (didFit.current || !model || !meta || !Object.keys(pos).length || !vpRef.current) return
    const r = vpRef.current.getBoundingClientRect()
    setView(fitView(pos, model.tables, meta.heights, r.width, r.height))
    didFit.current = true
  }, [pos, model, meta])

  /* ── related sets for focus / hover highlighting ── */
  const related = useMemo(() => {
    if (!model) return null
    const t = focus
    if (!t && hoverEdge == null) return null
    const nodes = new Set(), edges = new Set()
    if (t) {
      nodes.add(t)
      model.edges.forEach((e, i) => {
        if (e.from === t || e.to === t) { edges.add(i); nodes.add(e.from); nodes.add(e.to) }
      })
    }
    if (hoverEdge != null && model.edges[hoverEdge]) {
      const e = model.edges[hoverEdge]
      edges.add(hoverEdge); nodes.add(e.from); nodes.add(e.to)
    }
    return { nodes, edges }
  }, [focus, hoverEdge, model])

  // keep a live ref of positions for the mouseup save (avoids stale closure)
  const posRef = useRef(pos)
  useEffect(() => { posRef.current = pos }, [pos])

  /* ── focus a table, optionally centering it in the viewport ── */
  const focusTable = useCallback((name, center) => {
    setFocus(name)
    if (center && meta && vpRef.current) {
      const p = posRef.current[name]
      if (p) {
        const r = vpRef.current.getBoundingClientRect()
        const cxw = p.x + CARD_W / 2, cyw = p.y + (meta.heights[name] || 120) / 2
        setView(v => ({ ...v, x: r.width / 2 - cxw * v.k, y: r.height / 2 - cyw * v.k }))
      }
    }
  }, [meta])

  /* ── pan / zoom / drag ── */
  useEffect(() => {
    const el = vpRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      setView(v => {
        const k = Math.max(0.12, Math.min(2.4, v.k * (e.deltaY < 0 ? 1.12 : 0.893)))
        const wx = (mx - v.x) / v.k, wy = (my - v.y) / v.k
        return { k, x: mx - wx * k, y: my - wy * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const move = (e) => {
      const d = drag.current
      if (!d) return
      e.preventDefault()
      if (d.type === 'node') {
        const dx = (e.clientX - d.sx) / view.k, dy = (e.clientY - d.sy) / view.k
        setPos(p => ({ ...p, [d.name]: { x: d.ox + dx, y: d.oy + dy } }))
        d.moved = d.moved || Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3
      } else if (d.type === 'pan') {
        setView(v => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }))
      } else if (d.type === 'side') {
        setSideW(Math.min(420, Math.max(170, e.clientX)))
      } else if (d.type === 'panel') {
        setPanelH(Math.min(window.innerHeight - 240, Math.max(110, window.innerHeight - e.clientY - 30)))
      }
    }
    const up = () => {
      const d = drag.current
      if (d?.type === 'node') {
        if (d.moved) { try { localStorage.setItem(`mb_pos_${d.name}`, JSON.stringify(posRef.current[d.name])) } catch { /* quota */ } }
        else focusTable(d.name)   // a click, not a drag
        document.body.style.cursor = ''
      } else if (d?.type === 'pan') { document.body.style.cursor = '' }
      drag.current = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [view.k]) // eslint-disable-line react-hooks/exhaustive-deps

  const startNodeDrag = (name) => (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const p = pos[name] || { x: 0, y: 0 }
    drag.current = { type: 'node', name, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false }
  }
  const startPan = (e) => {
    if (e.button !== 0) return
    drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
    document.body.style.cursor = 'grabbing'
  }
  const startResize = (type) => (e) => {
    e.preventDefault()
    drag.current = { type }
    document.body.style.userSelect = 'none'
  }

  const log = (who, t) => setLines(l => [...l.slice(-40), { who, t }])
  const fitAll = useCallback(() => {
    if (!model || !meta || !vpRef.current) return
    const r = vpRef.current.getBoundingClientRect()
    setView(fitView(posRef.current, model.tables, meta.heights, r.width, r.height))
  }, [model, meta])

  const resetLayout = useCallback(() => {
    if (!model || !meta) return
    for (const t of model.tables) { try { localStorage.removeItem(`mb_pos_${t.name}`) } catch { /* ignore */ } }
    const base = autoLayout(model.tables)
    setPos(base)
    requestAnimationFrame(() => { const r = vpRef.current?.getBoundingClientRect(); if (r) setView(fitView(base, model.tables, meta.heights, r.width, r.height)) })
  }, [model, meta])

  /* ── terminal commands (chrome polish) ── */
  const runCmd = (raw) => {
    const s = raw.trim()
    if (!s) return
    log('you', s)
    const [cmd, ...rest] = s.split(/\s+/)
    const arg = rest.join(' ').toLowerCase()
    if (cmd === '/help') return log('sys', '/focus <table> · /find <q> · /fit · /reset · /clear · /clusters')
    if (cmd === '/clear') return setLines([])
    if (cmd === '/fit') { fitAll(); return log('sys', 'fit to view') }
    if (cmd === '/reset') { setFocus(null); return log('sys', 'focus cleared') }
    if (cmd === '/clusters') return log('sys', CLUSTER_ORDER.map(d => `${d}(${model?.tables.filter(t => t.domain === d).length || 0})`).join('  '))
    if (cmd === '/focus' || cmd === '/find') {
      const hit = model?.tables.find(t => t.name === arg) || model?.tables.find(t => t.name.includes(arg))
      if (hit) { focusTable(hit.name, true); return log('sys', `→ ${hit.name}`) }
      return log('sys', `no table matches "${arg}"`)
    }
    log('sys', `unknown command: ${cmd}`)
  }

  /* ── keyboard: ⌘P quick-open, Esc clears ── */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'k')) { e.preventDefault(); setQpOpen(o => !o); setQpQ('') }
      else if (e.key === 'Escape') { setQpOpen(false); setFocus(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ── grouped table index for the explorer ── */
  const grouped = useMemo(() => {
    if (!model) return []
    return CLUSTER_ORDER
      .map(d => ({ dom: d, tables: model.tables.filter(t => t.domain === d).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter(g => g.tables.length)
  }, [model])

  const focusT = focus && meta ? meta.byName[focus] : null

  /* ── world bounds for the svg canvas ── */
  const bounds = useMemo(() => {
    let maxx = 1000, maxy = 800
    if (meta) for (const n in pos) { maxx = Math.max(maxx, pos[n].x + CARD_W); maxy = Math.max(maxy, pos[n].y + (meta.heights[n] || 120)) }
    return { w: maxx + 400, h: maxy + 400 }
  }, [pos, meta])

  return (
    <div className="ide">
      <style>{CSS}</style>
      <div className="ide-cols">

        {/* ── Explorer: table index by domain + legend ── */}
        {sideOpen && (
          <div className="explorer" style={{ width: sideW }}>
            <div className="exp-head"><span>SCHEMA</span><span className="exp-badge">{model?.counts.tables || 0} TABLES</span></div>
            {grouped.map(g => (
              <div key={g.dom}>
                <div className="exp-sec" style={{ color: clusterColor(g.dom) }}>
                  <span className="dot" style={{ background: clusterColor(g.dom) }} />{CLUSTER[g.dom].label}<span className="exp-secn">{g.tables.length}</span>
                </div>
                {g.tables.map(t => (
                  <div key={t.name} className={`exp-item ${focus === t.name ? 'on' : ''}`} onClick={() => focusTable(t.name, true)}
                    style={focus === t.name ? { borderLeftColor: clusterColor(g.dom) } : undefined}>
                    <span className="exp-ic" style={{ color: clusterColor(g.dom) }}>▸</span>
                    <span className="exp-trunc">{t.name}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="exp-sec">LEGEND</div>
            <div className="legend">
              <div className="lg-row"><span className="lg-pk">PK</span> primary key <span className="lg-dim">— glows</span></div>
              <div className="lg-row"><span className="lg-fk">FK</span> foreign key <span className="lg-dim">— glowing link</span></div>
              <div className="lg-row"><svg width="34" height="10"><line x1="1" y1="5" x2="33" y2="5" className="lg-line" /></svg> solid = enforced FK</div>
              <div className="lg-row"><svg width="34" height="10"><line x1="1" y1="5" x2="33" y2="5" className="lg-line dash" /></svg> dashed = logical id</div>
              <div className="lg-row lg-spine"><b>client_id · agency_id</b> — the tenant spine most tables hang off of.</div>
            </div>
          </div>
        )}
        {sideOpen && <div className="resize-h" onMouseDown={startResize('side')} title="resize" />}

        {/* ── Main: toolbar + canvas + terminal + status ── */}
        <div className="main">
          <div className="tabbar">
            <button className="burger" onClick={() => setSideOpen(o => !o)} title="Toggle explorer">☰</button>
            <div className="tab on">schema.graph</div>
            <div className="tab-spacer" />
            <div className="toolbtns">
              <button onClick={() => setView(v => ({ ...v, k: Math.min(2.4, v.k * 1.2) }))} title="Zoom in">＋</button>
              <button onClick={() => setView(v => ({ ...v, k: Math.max(0.12, v.k * 0.83) }))} title="Zoom out">－</button>
              <button onClick={fitAll} title="Fit">⤢</button>
              <button onClick={resetLayout} title="Reset layout">↺</button>
            </div>
          </div>

          <div className="view-row">
            <div className={`gviewport ${focus ? 'has-focus' : ''}`} ref={vpRef} onMouseDown={startPan}>
              {err && <div className="loading">failed to load schema: {err}</div>}
              {!model && !err && <div className="loading">parsing db/schema.md…</div>}

              {model && meta && (
                <div className="gworld" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.k})` }}>
                  <svg className="gedges" width={bounds.w} height={bounds.h}>
                    <defs>
                      <filter id="mbglow" x="-40%" y="-40%" width="180%" height="180%">
                        <feGaussianBlur stdDeviation="2.4" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    {model.edges.map((e, i) => {
                      const sp = pos[e.from], tp = pos[e.to]
                      if (!sp || !tp) return null
                      const si = meta.keyIdx[e.from]?.[e.col] ?? 0
                      const ti = meta.keyIdx[e.to]?.[e.toCol] ?? 0
                      const self = e.from === e.to
                      const sCenter = sp.x + CARD_W / 2, tCenter = tp.x + CARD_W / 2
                      const exitRight = self ? true : tCenter >= sCenter
                      const sx = sp.x + (exitRight ? CARD_W : 0), sy = sp.y + rowCY(si)
                      const entryRight = self ? true : sCenter > tCenter
                      const tx = tp.x + (entryRight ? CARD_W : 0), ty = tp.y + rowCY(ti)
                      const off = self ? 46 : Math.max(42, Math.min(200, Math.abs(tx - sx) * 0.5))
                      const c1 = sx + (exitRight ? off : -off), c2 = tx + (entryRight ? off : -off)
                      const d = `M${sx},${sy} C${c1},${sy} ${c2},${ty} ${tx},${ty}`
                      const active = related?.edges.has(i)
                      const dim = related && !active
                      const col = clusterColor(meta.byName[e.from]?.domain)
                      return (
                        <path key={i} d={d} className={`edge ${e.kind} ${active ? 'active' : ''} ${dim ? 'dim' : ''}`}
                          style={{ stroke: col, filter: active ? 'url(#mbglow)' : undefined }}
                          onMouseEnter={() => setHoverEdge(i)} onMouseLeave={() => setHoverEdge(h => h === i ? null : h)} />
                      )
                    })}
                  </svg>

                  {model.tables.map(t => {
                    const p = pos[t.name]; if (!p) return null
                    const kc = meta.keyCols[t.name]
                    const more = t.columns.length - kc.length
                    const col = clusterColor(t.domain)
                    const isFocus = focus === t.name
                    const isRel = related?.nodes.has(t.name)
                    const dim = related && !isRel
                    return (
                      <div key={t.name} className={`gnode ${isFocus ? 'focus' : ''} ${isRel && !isFocus ? 'rel' : ''} ${dim ? 'dim' : ''}`}
                        style={{ left: p.x, top: p.y, width: CARD_W, '--c': col, borderColor: isFocus ? col : undefined }}
                        onMouseDown={startNodeDrag(t.name)}>
                        <div className="gn-head" style={{ background: `linear-gradient(90deg, ${col}22, transparent)` }}>
                          <span className="gn-dot" style={{ background: col }} />
                          <span className="gn-name">{t.name}</span>
                        </div>
                        <div className="gn-keys">
                          {kc.map(c => {
                            const pk = c.key.includes('PK'), fk = c.key.includes('FK')
                            const glow = (isFocus || isRel) && pk
                            return (
                              <div key={c.name} className={`gn-key ${pk ? 'pk' : ''} ${fk ? 'fk' : ''} ${isSpine(c.name) ? 'spine' : ''} ${glow ? 'glow' : ''}`}
                                style={glow ? { '--c': col } : undefined}>
                                <span className="gn-kn">{c.name}</span>
                                <span className="gn-tag">{c.key.replace('+', '·')}</span>
                              </div>
                            )
                          })}
                        </div>
                        {more > 0 && <div className="gn-more">+{more} column{more > 1 ? 's' : ''}</div>}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* focus detail panel */}
              {focusT && meta && (
                <div className="detail">
                  <div className="dt-head">
                    <span className="dt-dot" style={{ background: clusterColor(focusT.domain) }} />
                    <span className="dt-name">{focusT.name}</span>
                    <span className="dt-dom" style={{ color: clusterColor(focusT.domain) }}>{CLUSTER[focusT.domain].label}</span>
                    <button className="dt-x" onClick={() => setFocus(null)}>✕</button>
                  </div>

                  <div className="dt-sec">PRIMARY KEY</div>
                  <div className="dt-keys">
                    {focusT.columns.filter(c => c.key.includes('PK')).map(c => (
                      <span key={c.name} className="dt-pk">{c.name}</span>
                    ))}
                    {!focusT.columns.some(c => c.key.includes('PK')) && <span className="dt-none">none</span>}
                  </div>

                  <div className="dt-sec">REFERENCES ↗ <span className="dt-cnt">{(meta.outbound[focusT.name] || []).length}</span></div>
                  {(meta.outbound[focusT.name] || []).length === 0 && <div className="dt-none pad">no outbound keys</div>}
                  {(meta.outbound[focusT.name] || []).map((e, i) => (
                    <div key={i} className="dt-rel" onClick={() => focusTable(e.to, true)}>
                      <span className="dt-col">{e.col}</span><span className="dt-arrow">→</span>
                      <span className="dt-to">{e.to}<span className="dt-tocol">.{e.toCol}</span></span>
                      {e.kind === 'logical' && <span className="dt-log">logical</span>}
                    </div>
                  ))}

                  <div className="dt-sec">REFERENCED BY ↙ <span className="dt-cnt">{(meta.inbound[focusT.name] || []).length}</span></div>
                  {(meta.inbound[focusT.name] || []).length === 0 && <div className="dt-none pad">nothing points here</div>}
                  {(meta.inbound[focusT.name] || []).map((e, i) => (
                    <div key={i} className="dt-rel" onClick={() => focusTable(e.from, true)}>
                      <span className="dt-to">{e.from}<span className="dt-tocol">.{e.col}</span></span>
                      <span className="dt-arrow">→</span><span className="dt-col">{e.toCol}</span>
                      {e.kind === 'logical' && <span className="dt-log">logical</span>}
                    </div>
                  ))}

                  <div className="dt-sec">ALL COLUMNS <span className="dt-cnt">{focusT.columns.length}</span></div>
                  <div className="dt-cols">
                    {focusT.columns.map(c => (
                      <div key={c.name} className={`dt-c ${c.key ? 'keyed' : ''}`}>
                        <span className="dt-cn">{c.name}</span>
                        <span className="dt-ct">{c.type}</span>
                        {c.key && <span className={`dt-ck ${c.key.includes('PK') ? 'pk' : 'fk'}`}>{c.key.replace('+', '·')}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* hint */}
              {model && <div className="ghint">scroll = zoom · drag bg = pan · drag card = move · ⌘P find</div>}
            </div>
          </div>

          {/* ── terminal ── */}
          {panelOpen && (
            <div className="panel" style={{ height: panelH }}>
              <div className="resize-v" onMouseDown={startResize('panel')} title="resize" />
              <div className="panel-tabs">
                <span className="on">TERMINAL</span>
                <span className="panel-x" onClick={() => setPanelOpen(false)}>▾</span>
              </div>
              <div className="stream">
                {lines.map((l, i) => (
                  <div key={i} className="tline"><span className={`tw ${l.who}`}>{l.who === 'you' ? '❯' : l.who === 'sys' ? '·' : '✦'}</span><span className="tt">{l.t}</span></div>
                ))}
              </div>
              <div className="prompt-wrap">
                <div className="prompt">
                  <span className="ps">❯</span>
                  <input ref={termInput} placeholder="/focus <table> · /find · /fit · /reset · /help" autoComplete="off" spellCheck="false"
                    onKeyDown={e => { if (e.key === 'Enter') { runCmd(e.currentTarget.value); e.currentTarget.value = '' } }} />
                </div>
              </div>
            </div>
          )}

          {/* ── status bar ── */}
          <div className="statusbar">
            <div className="seg"><span className="pulse" /><b>schema graph</b></div>
            <div className="seg"><span className="dim">tables</span><b>{model?.counts.tables ?? '—'}</b></div>
            <div className="seg"><span className="dim">fk edges</span><b className="bluec">{model?.counts.fk ?? '—'}</b></div>
            <div className="seg"><span className="dim">logical</span><b className="purpc">{model?.counts.logical ?? '—'}</b></div>
            <div className="seg"><span className="dim">zoom</span><b>{Math.round(view.k * 100)}%</b></div>
            {focus && <div className="seg"><span className="dim">focus</span><b style={{ color: clusterColor(focusT?.domain) }}>{focus}</b></div>}
            <div className="spacer" />
            <div className="seg last">
              {!panelOpen && <button className="helpbtn" onClick={() => setPanelOpen(true)} title="terminal">▸_</button>}
              <span className="kbd">⌘P find</span>
              <button className="helpbtn" onClick={() => router.push(`/control/${clientId}/mission`)} title="P&L terminal">P&amp;L ↗</button>
            </div>
          </div>
        </div>
      </div>

      {/* ⌘P quick-open — jump-focus any table */}
      {qpOpen && model && (
        <div className="palette" onClick={e => { if (e.target.classList.contains('palette')) setQpOpen(false) }}>
          <div className="pal">
            <input autoFocus value={qpQ} onChange={e => setQpQ(e.target.value)} placeholder="jump to a table…"
              onKeyDown={e => {
                if (e.key === 'Escape') setQpOpen(false)
                if (e.key === 'Enter') {
                  const hit = model.tables.filter(t => t.name.includes(qpQ.toLowerCase()))[0]
                  if (hit) { setQpOpen(false); focusTable(hit.name, true) }
                }
              }} />
            {model.tables.filter(t => t.name.includes(qpQ.toLowerCase())).slice(0, 12).map(t => (
              <div key={t.name} className="it" onClick={() => { setQpOpen(false); focusTable(t.name, true) }}>
                <span className="dot" style={{ background: clusterColor(t.domain) }} />
                <b className="qp-label">{t.name}</b><span className="d">{CLUSTER[t.domain].label}</span>
              </div>
            ))}
            {!model.tables.some(t => t.name.includes(qpQ.toLowerCase())) && <div className="it"><span className="d">no matches</span></div>}
          </div>
        </div>
      )}
    </div>
  )
}

const CSS = `
.ide{--bg:#0b0e14;--panel:#11151f;--panel2:#161b28;--line:rgba(255,255,255,.07);--txt:#dbe1ee;--dim:#8a93a8;--faint:#5a6377;--green:#3fd68f;--red:#f4747f;--amber:#e8b45a;--blue:#6ea8fe;--purple:#a78bfa;
  position:fixed;inset:0;top:var(--mt-top,57px);z-index:30;background:var(--bg);color:var(--txt);font:13px/1.5 "SF Mono",ui-monospace,Menlo,Consolas,monospace;}
.ide-cols{display:flex;height:100%;}
.ide .dim{color:var(--faint);} .ide .good{color:var(--green);} .ide .warn{color:var(--amber);} .ide .bad{color:var(--red);}
.ide .bluec{color:var(--blue);} .ide .purpc{color:var(--purple);}
.ide .loading{color:var(--faint);font-size:12.5px;padding:24px;}

/* explorer */
.ide .explorer{flex-shrink:0;background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;padding-bottom:24px;}
.ide .resize-h{width:5px;margin:0 -2px;flex-shrink:0;cursor:col-resize;z-index:5;position:relative;}
.ide .resize-h:hover,.ide .resize-h:active{background:rgba(110,168,254,.45);}
.ide .resize-v{height:5px;margin-bottom:-2px;cursor:row-resize;z-index:5;position:relative;flex-shrink:0;}
.ide .resize-v:hover,.ide .resize-v:active{background:rgba(110,168,254,.45);}
.ide .exp-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;font-weight:800;font-size:12px;letter-spacing:.06em;border-bottom:1px solid var(--line);}
.ide .exp-badge{font-size:9px;font-weight:800;color:var(--blue);background:rgba(110,168,254,.12);border-radius:4px;padding:1px 6px;}
.ide .exp-sec{display:flex;align-items:center;gap:7px;font-size:9.5px;font-weight:800;letter-spacing:.09em;color:var(--faint);padding:14px 14px 4px;text-transform:uppercase;}
.ide .exp-sec .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;box-shadow:0 0 6px currentColor;}
.ide .exp-secn{margin-left:auto;color:var(--faint);font-size:9px;background:var(--panel2);border-radius:99px;padding:0 6px;}
.ide .exp-item{display:flex;align-items:center;gap:7px;padding:3.5px 14px;font-size:12px;color:var(--dim);cursor:pointer;border-left:2px solid transparent;}
.ide .exp-item:hover{color:var(--txt);background:rgba(255,255,255,.02);}
.ide .exp-item.on{color:var(--txt);background:rgba(110,168,254,.07);}
.ide .exp-ic{width:10px;text-align:center;font-size:9px;flex-shrink:0;}
.ide .exp-trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .legend{padding:6px 14px 0;font-size:11px;color:var(--dim);display:flex;flex-direction:column;gap:7px;}
.ide .legend .lg-row{display:flex;align-items:center;gap:7px;}
.ide .lg-dim{color:var(--faint);}
.ide .lg-pk{font-size:9px;font-weight:800;color:var(--amber);background:rgba(232,180,90,.14);border-radius:4px;padding:1px 5px;box-shadow:0 0 8px rgba(232,180,90,.5);}
.ide .lg-fk{font-size:9px;font-weight:800;color:var(--blue);background:rgba(110,168,254,.14);border-radius:4px;padding:1px 5px;}
.ide .lg-line{stroke:var(--blue);stroke-width:2;filter:drop-shadow(0 0 3px var(--blue));}
.ide .lg-line.dash{stroke:var(--purple);stroke-dasharray:3 3;filter:drop-shadow(0 0 3px var(--purple));}
.ide .lg-spine{display:block;line-height:1.5;color:var(--faint);margin-top:2px;}
.ide .lg-spine b{color:var(--blue);}

/* main column */
.ide .main{flex:1;display:flex;flex-direction:column;min-width:0;}
.ide .tabbar{display:flex;align-items:stretch;background:var(--panel);border-bottom:1px solid var(--line);height:34px;flex-shrink:0;}
.ide .burger{background:none;border:none;color:var(--faint);font:inherit;padding:0 12px;cursor:pointer;border-right:1px solid var(--line);}
.ide .burger:hover{color:var(--txt);}
.ide .tab{display:flex;align-items:center;gap:7px;padding:0 14px;font-size:12px;color:var(--dim);border-right:1px solid var(--line);}
.ide .tab.on{color:var(--txt);background:var(--bg);box-shadow:inset 0 2px 0 var(--blue);}
.ide .tab-spacer{flex:1;}
.ide .toolbtns{display:flex;align-items:center;gap:2px;padding:0 8px;}
.ide .toolbtns button{width:26px;height:24px;border:1px solid var(--line);background:var(--panel2);color:var(--dim);border-radius:6px;font:inherit;font-size:13px;cursor:pointer;}
.ide .toolbtns button:hover{color:var(--txt);border-color:var(--dim);}
.ide .view-row{flex:1;display:flex;min-height:0;position:relative;}

/* canvas */
.ide .gviewport{flex:1;position:relative;overflow:hidden;background:
  radial-gradient(circle at 1px 1px, rgba(255,255,255,.045) 1px, transparent 0) 0 0/26px 26px,
  var(--bg);cursor:grab;}
.ide .gviewport:active{cursor:grabbing;}
.ide .gworld{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;}
.ide .gedges{position:absolute;top:0;left:0;overflow:visible;pointer-events:none;}
.ide .edge{fill:none;stroke-width:1.4;opacity:.32;transition:opacity .15s;pointer-events:stroke;cursor:pointer;}
.ide .edge.logical{stroke-dasharray:4 4;opacity:.22;}
.ide .edge:hover{opacity:.9;}
.ide .edge.active{opacity:1;stroke-width:2;}
.ide .edge.dim{opacity:.06;}

/* node card */
.ide .gnode{position:absolute;background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden;cursor:grab;user-select:none;
  box-shadow:0 2px 10px rgba(0,0,0,.35);transition:opacity .15s,box-shadow .15s,border-color .15s;}
.ide .gnode:active{cursor:grabbing;}
.ide .gnode:hover{border-color:var(--dim);}
.ide .gnode.rel{border-color:var(--c);box-shadow:0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent),0 2px 12px rgba(0,0,0,.4);}
.ide .gnode.focus{box-shadow:0 0 0 1px var(--c),0 0 26px color-mix(in srgb, var(--c) 45%, transparent),0 6px 22px rgba(0,0,0,.5);z-index:6;}
.ide .gnode.dim{opacity:.28;}
.ide .gn-head{display:flex;align-items:center;gap:7px;height:${HEAD_H}px;padding:0 10px;border-bottom:1px solid var(--line);}
.ide .gn-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;box-shadow:0 0 7px currentColor;}
.ide .gn-name{font-weight:700;font-size:12px;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .gn-keys{padding:${LIST_TOP}px 0 0;}
.ide .gn-key{display:flex;align-items:center;gap:6px;height:${ROW_H}px;padding:0 10px;font-size:11px;}
.ide .gn-kn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dim);}
.ide .gn-tag{margin-left:auto;font-size:8.5px;font-weight:800;letter-spacing:.04em;padding:0 4px;border-radius:3px;color:var(--faint);background:var(--panel2);}
.ide .gn-key.pk .gn-kn{color:var(--amber);font-weight:700;}
.ide .gn-key.pk .gn-tag{color:var(--amber);background:rgba(232,180,90,.14);box-shadow:0 0 7px rgba(232,180,90,.28);}
.ide .gn-key.fk .gn-kn{color:var(--blue);}
.ide .gn-key.fk .gn-tag{color:var(--blue);background:rgba(110,168,254,.14);}
.ide .gn-key.spine .gn-kn{color:var(--blue);font-weight:700;}
.ide .gn-key.spine .gn-tag{color:var(--blue);background:rgba(110,168,254,.16);}
.ide .gn-key.glow .gn-tag{box-shadow:0 0 10px var(--c);}
.ide .gn-key.pk.glow .gn-kn{text-shadow:0 0 9px rgba(232,180,90,.7);}
.ide .gn-more{font-size:10px;color:var(--faint);padding:3px 10px 6px;border-top:1px solid rgba(255,255,255,.04);}

.ide .ghint{position:absolute;left:12px;bottom:10px;font-size:10.5px;color:var(--faint);background:rgba(11,14,20,.72);border:1px solid var(--line);border-radius:6px;padding:3px 9px;pointer-events:none;}

/* detail panel */
.ide .detail{position:absolute;top:10px;right:10px;bottom:10px;width:308px;background:var(--panel);border:1px solid var(--line);border-radius:11px;overflow-y:auto;box-shadow:0 18px 50px rgba(0,0,0,.55);z-index:20;padding-bottom:14px;}
.ide .dt-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel);z-index:2;}
.ide .dt-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;box-shadow:0 0 8px currentColor;}
.ide .dt-name{font-weight:800;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .dt-dom{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-left:auto;white-space:nowrap;}
.ide .dt-x{background:none;border:none;color:var(--faint);cursor:pointer;font:inherit;font-size:13px;padding:0 2px;}
.ide .dt-x:hover{color:var(--txt);}
.ide .dt-sec{font-size:9px;font-weight:800;letter-spacing:.08em;color:var(--faint);padding:14px 14px 5px;display:flex;align-items:center;gap:6px;}
.ide .dt-cnt{background:var(--panel2);border-radius:99px;padding:0 6px;font-size:9px;}
.ide .dt-keys{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px;}
.ide .dt-pk{font-size:11px;font-weight:700;color:var(--amber);background:rgba(232,180,90,.13);border-radius:5px;padding:2px 8px;box-shadow:0 0 10px rgba(232,180,90,.32);}
.ide .dt-none{color:var(--faint);font-size:11px;}
.ide .dt-none.pad{padding:0 14px;}
.ide .dt-rel{display:flex;align-items:center;gap:6px;padding:4px 14px;font-size:11.5px;cursor:pointer;}
.ide .dt-rel:hover{background:rgba(110,168,254,.07);}
.ide .dt-col{color:var(--blue);font-weight:600;}
.ide .dt-arrow{color:var(--faint);}
.ide .dt-to{color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .dt-tocol{color:var(--faint);}
.ide .dt-log{margin-left:auto;font-size:8.5px;font-weight:800;color:var(--purple);background:rgba(167,139,250,.14);border-radius:3px;padding:0 5px;text-transform:uppercase;}
.ide .dt-cols{padding:0 14px;display:flex;flex-direction:column;gap:1px;}
.ide .dt-c{display:flex;align-items:baseline;gap:8px;font-size:11px;padding:2px 0;border-top:1px solid rgba(255,255,255,.03);}
.ide .dt-c.keyed .dt-cn{color:var(--txt);font-weight:600;}
.ide .dt-cn{color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;}
.ide .dt-ct{color:var(--faint);font-size:10px;margin-left:auto;white-space:nowrap;}
.ide .dt-ck{font-size:8.5px;font-weight:800;border-radius:3px;padding:0 4px;flex-shrink:0;}
.ide .dt-ck.pk{color:var(--amber);background:rgba(232,180,90,.14);}
.ide .dt-ck.fk{color:var(--blue);background:rgba(110,168,254,.14);}

/* panel / terminal */
.ide .panel{border-top:1px solid var(--line);background:var(--bg);display:flex;flex-direction:column;flex-shrink:0;position:relative;}
.ide .panel-tabs{display:flex;gap:2px;align-items:center;background:var(--panel);border-bottom:1px solid var(--line);padding:0 10px;height:28px;font-size:10.5px;font-weight:800;letter-spacing:.06em;flex-shrink:0;}
.ide .panel-tabs span{padding:0 10px;color:var(--faint);cursor:pointer;line-height:28px;}
.ide .panel-tabs span.on{color:var(--txt);box-shadow:inset 0 -2px 0 var(--blue);}
.ide .panel-x{margin-left:auto;}
.ide .stream{flex:1;overflow-y:auto;padding:9px 14px;}
.ide .tline{display:flex;gap:9px;font-size:12px;margin-bottom:3px;}
.ide .tw{width:12px;flex-shrink:0;text-align:center;}
.ide .tw.you{color:var(--green);} .ide .tw.sys{color:var(--faint);} .ide .tw.agent{color:var(--purple);}
.ide .tt{color:var(--dim);white-space:pre-wrap;}
.ide .tw.you+.tt{color:var(--txt);}
.ide .prompt-wrap{margin:2px 12px 6px;flex-shrink:0;}
.ide .prompt{display:flex;gap:9px;align-items:center;border-top:1px solid rgba(255,255,255,.26);border-bottom:1px solid rgba(255,255,255,.26);background:var(--bg);padding:8px 4px;}
.ide .prompt:focus-within{border-color:rgba(255,255,255,.45);}
.ide .ps{color:var(--green);font-weight:800;}
.ide .prompt input{flex:1;background:transparent;border:none;outline:none;color:var(--txt);font:inherit;caret-color:var(--txt);}

/* status bar */
.ide .statusbar{display:flex;align-items:center;border-top:1px solid var(--line);background:var(--panel);padding:0 10px;height:30px;font-size:11px;flex-shrink:0;overflow-x:auto;white-space:nowrap;}
.ide .seg{padding:0 10px;border-right:1px solid var(--line);display:flex;gap:6px;align-items:center;height:100%;}
.ide .seg.last{border-right:none;gap:8px;}
.ide .pulse{width:6px;height:6px;border-radius:50%;background:var(--green);animation:idepu 2s infinite;}
@keyframes idepu{50%{opacity:.3;}}
.ide .spacer{flex:1;}
.ide .kbd{font-size:10px;color:var(--faint);border:1px solid var(--line);border-radius:4px;padding:1px 5px;background:var(--panel2);}
.ide .helpbtn{border:1px solid var(--line);background:var(--panel2);color:var(--dim);font:inherit;font-size:10px;font-weight:800;cursor:pointer;border-radius:5px;padding:2px 7px;}
.ide .helpbtn:hover{color:var(--txt);}

/* palette */
.ide .palette{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;z-index:70;}
.ide .pal{width:520px;max-width:92vw;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6);}
.ide .pal input{width:100%;background:var(--panel2);border:none;outline:none;color:var(--txt);font:inherit;padding:13px 16px;border-bottom:1px solid var(--line);}
.ide .pal .it{padding:9px 16px;display:flex;gap:9px;align-items:center;cursor:pointer;font-size:12.5px;}
.ide .pal .it:hover{background:rgba(110,168,254,.08);}
.ide .pal .it .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;box-shadow:0 0 6px currentColor;}
.ide .pal .it .qp-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .pal .it .d{color:var(--faint);font-size:11px;margin-left:auto;}
.ide ::-webkit-scrollbar{width:10px;height:10px;} .ide ::-webkit-scrollbar-thumb{background:var(--panel2);border-radius:5px;}
`
