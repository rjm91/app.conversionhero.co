'use client'

// Mission Terminal — the session IS the app.
// One scrollback: watcher findings, your questions, Claude's answers, and
// your decisions are all turns. Keyboard does everything (j/k/y/n, ⌘K, /cmds).
// Real ShieldTech data via lib/mission; answers via /api/mission/ask.
// Approvals log locally (ledger) — no ad-platform writes in this version.

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchMissionData, computeMission, askContext, rangeDays } from '../../../../lib/mission/data'
import { buildFindings } from '../../../../lib/mission/watchers'
import { MANUAL } from '../../../../lib/mission/manual'

const money = (n) => '$' + Math.round(n || 0).toLocaleString()
let turnSeq = 0
const tid = () => 'turn-' + (++turnSeq)

const PALETTE = [
  ['/pause', 'draft a pause for the worst margin bleeder'],
  ['/scale', 'draft a budget test on the best winner'],
  ['/forecast', '30-day projection with queue scenarios'],
  ['/campaigns', 'true ROAS per campaign'],
  ['/ledger', 'decision history'],
  ['/policies', 'rules you have taught'],
  ['/range 7|30|90', 'change the data window'],
  ['/manual', 'how all of this works'],
  ['/clear', 'reset the session'],
]

export default function MissionTerminal() {
  const { clientId } = useParams()
  const [rangeN, setRangeN] = useState(30)
  const [data, setData] = useState(null)
  const [turns, setTurns] = useState([])
  const [selId, setSelId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [palOpen, setPalOpen] = useState(false)
  const [palQ, setPalQ] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const inputRef = useRef(null)
  const endRef = useRef(null)
  const histRef = useRef([])
  const bootedRef = useRef(false)

  // local ledger + taught policies (same keys as the card view — continuity)
  const lsKey = (k) => `mission_${k}_${clientId}`
  const [ledger, setLedger] = useState([])
  const [policies, setPolicies] = useState([])
  useEffect(() => {
    try {
      setLedger(JSON.parse(localStorage.getItem(lsKey('ledger')) || '[]'))
      setPolicies(JSON.parse(localStorage.getItem(lsKey('policies')) || '[]'))
    } catch { /* fresh */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const range = useMemo(() => rangeDays(rangeN), [rangeN])
  const m = useMemo(() => data ? computeMission(data) : null, [data])

  const push = useCallback((turn) => {
    setTurns(t => [...t, { id: tid(), ...turn }])
  }, [])
  const patch = useCallback((id, up) => {
    setTurns(t => t.map(x => x.id === id ? { ...x, ...(typeof up === 'function' ? up(x) : up) } : x))
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns])

  /* ── data load + boot sequence ── */
  useEffect(() => {
    let alive = true
    bootedRef.current = false
    setTurns([]); setSelId(null)
    push({ kind: 'sys', text: `loading ${rangeN}d of ${clientId} — orders, campaigns, BOM margins…` })
    fetchMissionData(clientId, range.start, range.end).then(d => {
      if (!alive) return
      setData(d)
    }).catch(e => push({ kind: 'sys', text: 'load failed: ' + e.message }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range.start, range.end])

  useEffect(() => {
    if (!m || !data || bootedRef.current) return
    bootedRef.current = true
    const dismissed = new Set(policies.map(p => p.findingId))
    const findings = buildFindings(m).filter(f => !dismissed.has(f.id))
    setTurns([{ id: tid(), kind: 'sys', text: `session start · ${data.clientName} · ${rangeN}d loaded — ${m.orders} orders, ${m.campaigns.length} campaigns, ${m.hasCogs ? 'BOM margins live (' + (m.margin * 100).toFixed(1) + '%)' : 'no BOM data'} · this scrollback is the app: findings, answers, and decisions are all turns.` }])
    let firstId = null
    for (const f of findings) {
      const id = tid()
      if (!firstId) firstId = id
      setTurns(t => [...t, { id, kind: 'finding', f, status: 'open' }])
    }
    setSelId(firstId)
    setTurns(t => [...t, { id: tid(), kind: 'sys', text: (findings.length ? `${findings.length} in queue · y approves the selected card · j/k moves · or ask something — try /forecast.` : 'queue is clear — every live campaign clears breakeven. Ask me anything, or /campaigns for the board.') + ' new here? press ? for the manual.' }])
    inputRef.current?.focus()
  }, [m, data, policies, rangeN])

  /* ── decisions ── */
  const findingTurns = turns.filter(t => t.kind === 'finding')
  const openTurns = findingTurns.filter(t => t.status === 'open')

  const approve = useCallback((t) => {
    if (t.status !== 'open') return
    patch(t.id, { status: 'executing' })
    setTimeout(() => {
      patch(t.id, { status: 'done' })
      const row = { when: new Date().toISOString(), what: t.f.action.ledger, impact: Math.round(t.f.impactMonthly), status: 'approved — logged only (no platform write yet)' }
      setLedger(l => { const next = [row, ...l]; localStorage.setItem(lsKey('ledger'), JSON.stringify(next)); return next })
      push({ kind: 'decision', text: `APPROVED ${t.f.action.ledger}${t.f.impactMonthly > 0 ? ` — ~${money(t.f.impactMonthly)}/mo est.` : ''} · logged to the ledger (no platform write in this build). This line is the audit trail.` })
      const next = openTurns.find(x => x.id !== t.id)
      if (next) setSelId(next.id)
    }, 1100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, push, openTurns])

  const startTeach = useCallback((t) => {
    if (t.status !== 'open') return
    patch(t.id, { status: 'teaching' })
  }, [patch])

  const saveTeach = useCallback((t, reason) => {
    const why = (reason || '').trim() || 'no reason given'
    patch(t.id, { status: 'taught', reason: why })
    setPolicies(p => { const next = [{ findingId: t.f.id, reason: why, when: new Date().toISOString() }, ...p]; localStorage.setItem(lsKey('policies'), JSON.stringify(next)); return next })
    push({ kind: 'decision', text: `TAUGHT “${why}” — standing rule saved; the watcher won't re-propose this. /policies lists everything you've taught.` })
    const next = openTurns.find(x => x.id !== t.id)
    if (next) setSelId(next.id)
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, push, openTurns])

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (e) => {
      const inTeach = e.target.dataset?.teach === '1'
      if (inTeach) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalOpen(o => !o); setPalQ(''); return }
      if (e.key === 'Escape') { setPalOpen(false); setManualOpen(false); inputRef.current?.focus(); return }
      const typing = e.target === inputRef.current && inputRef.current.value !== ''
      if (!typing && !palOpen && e.key === '?') { e.preventDefault(); setManualOpen(o => !o); return }
      if (typing || palOpen || manualOpen) return
      const idx = openTurns.findIndex(t => t.id === selId)
      if (e.key === 'j') { e.preventDefault(); const n = openTurns[Math.min(openTurns.length - 1, Math.max(0, idx + 1))]; if (n) setSelId(n.id) }
      else if (e.key === 'k') { e.preventDefault(); const n = openTurns[Math.max(0, idx - 1)]; if (n) setSelId(n.id) }
      else if (e.key === 'y') { e.preventDefault(); const t = openTurns[idx]; if (t) approve(t) }
      else if (e.key === 'n') { e.preventDefault(); const t = openTurns[idx]; if (t) startTeach(t) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openTurns, selId, approve, startTeach, palOpen, manualOpen])

  /* ── ask + slash commands ── */
  const ask = useCallback(async (raw) => {
    const q = raw.trim()
    if (!q || busy || !m) return
    push({ kind: 'you', text: q })
    const lower = q.toLowerCase()

    // Slash inputs are ALWAYS local — a typo like /forcase should get a
    // correction, never be sent to the LLM as a question.
    const KNOWN = ['/pause', '/scale', '/forecast', '/campaigns', '/ledger', '/policies', '/range', '/clear', '/help', '/manual']
    if (lower.startsWith('/')) {
      const cmd = lower.split(/\s+/)[0]
      if (!KNOWN.includes(cmd)) {
        const guess = KNOWN
          .map(k => { let s = 0; while (s < Math.min(k.length, cmd.length) && k[s] === cmd[s]) s++; return [k, s] })
          .sort((a, b) => b[1] - a[1])[0]
        push({ kind: 'sys', text: `unknown command ${cmd}${guess && guess[1] >= 3 ? ` — did you mean ${guess[0]}?` : ''} · /help lists everything` })
        return
      }
    }

    // local commands
    if (lower === '/clear') { histRef.current = []; bootedRef.current = false; setData(d => ({ ...d })); return }
    if (lower.startsWith('/range')) {
      const n = Number(lower.split(/\s+/)[1])
      if ([7, 30, 90].includes(n)) { setRangeN(n) } else { push({ kind: 'sys', text: 'usage: /range 7 | 30 | 90' }) }
      return
    }
    if (lower === '/help') { push({ kind: 'sys', text: PALETTE.map(([c, d]) => `${c} — ${d}`).join('\n') }); return }
    if (lower === '/manual') { setManualOpen(true); return }
    if (lower === '/ledger') {
      push({
        kind: 'agent', text: ledger.length ? 'The ▸ lines above are the live trail. Everything logged:' : 'No decisions logged yet — approve something with y.',
        table: ledger.length ? { head: ['decision', 'when', 'est. impact'], rows: ledger.slice(0, 15).map(r => [r.what, new Date(r.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), r.impact > 0 ? '+' + money(r.impact) + '/mo' : '—']) } : null,
      })
      return
    }
    if (lower === '/policies') {
      push({
        kind: 'agent', text: policies.length ? 'Standing rules, checked before every proposal:' : 'No taught policies yet — dismiss a finding with n and give a reason.',
        table: policies.length ? { head: ['rule', 'taught'], rows: policies.slice(0, 15).map(p => [p.reason, new Date(p.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })]) } : null,
      })
      return
    }
    if (lower === '/campaigns') {
      const rows = m.campaigns.filter(c => c.spend > 0)
      push({
        kind: 'agent', text: `True ROAS per campaign (breakeven 1.00x on real BOM margin) · ${rangeN}d:`,
        bars: rows.map(c => ({ label: `${c.campaign_name}${c.stale ? ' (stale)' : ''}`, value: c.trueRoas ?? 0, color: c.trueRoas == null ? '#5a6377' : c.trueRoas >= 1.5 ? '#3fd68f' : c.trueRoas >= 1 ? '#e8b45a' : '#f4747f', text: c.trueRoas != null ? c.trueRoas.toFixed(2) + 'x' : '—' })),
      })
      return
    }
    if (lower === '/forecast') {
      const perDay = m.netProfit / m.days
      const base = perDay * 30
      const openImpact = openTurns.reduce((s, t) => s + (t.f.impactMonthly || 0), 0)
      push({
        kind: 'agent',
        text: `Naive 30-day projection from the last ${m.days} days' run-rate (${money(perDay)}/day net): ${money(base)}. Clearing the queue adds an estimated ${money(openImpact)}/mo. This is arithmetic, not a model — a real seasonal forecast is on the roadmap.`,
        bars: [
          { label: 'do nothing', value: base, color: '#5a6377', text: money(base) },
          { label: 'clear the queue', value: base + openImpact, color: '#3fd68f', text: money(base + openImpact) },
        ],
      })
      return
    }
    if (lower === '/pause' || lower === '/scale') {
      // Same guards as the watcher: ≥4 days of data, and pause targets need
      // attributed orders (0-attribution reads as 0.00x but may be tracking).
      const pool = m.campaigns.filter(c => c.status === 'ENABLED' && !c.stale && c.spend >= 200 && c.trueRoas != null && c.days >= 4)
      const c = lower === '/pause'
        ? pool.filter(x => x.trueRoas < 1 && x.chOrders > 0).sort((a, b) => a.trueRoas - b.trueRoas)[0]
        : pool.filter(x => x.trueRoas >= 1.5 && x.spend >= 500 && x.chOrders >= 5).sort((a, b) => b.trueRoas - a.trueRoas)[0]
      if (!c) { push({ kind: 'sys', text: lower === '/pause' ? 'nothing to pause — no enabled campaign is below 1.00x breakeven right now.' : 'no clear scale candidate — nothing enabled is ≥1.5x with meaningful volume (≥$500 spend, ≥5 attributed orders).' }); return }
      // Dedupe: if this campaign already has an open card (watcher- or
      // command-drafted), select it instead of stacking a duplicate.
      const dupe = turns.find(t => t.kind === 'finding' && t.status === 'open' &&
        (t.f.action?.campaign_id === c.campaign_id || t.f.id.endsWith(`-${c.campaign_id}`)) &&
        (lower === '/pause' ? /pause|noattr|bleed/.test(t.f.id) : /scale/.test(t.f.id)))
      if (dupe) {
        setSelId(dupe.id)
        push({ kind: 'sys', text: `already in the queue — selected the existing card for ${c.campaign_name}. y approves it.` })
        return
      }
      const f = lower === '/pause' ? {
        id: `cmd-pause-${c.campaign_id}`, severity: 'high', icon: '🚨',
        title: `Pause ${c.campaign_name} (${c.platform}) — below margin breakeven`,
        why: `True ROAS ${c.trueRoas.toFixed(2)}x on ${money(c.spend)} spend. At ${money(c.spendPerDay)}/day this loses ~${money(c.spendPerDay * (1 - c.trueRoas))}/day of contribution.`,
        impactMonthly: c.spendPerDay * 30 * (1 - c.trueRoas), confidence: c.days >= 5 ? 'high' : 'medium',
        evidence: [`${c.days} days`, `${c.chOrders} attributed orders`],
        action: { ledger: `Pause ${c.campaign_name} on ${c.platform}` },
      } : {
        id: `cmd-scale-${c.campaign_id}`, severity: 'medium', icon: '📈',
        title: `Scale ${c.campaign_name} (${c.platform}) +20% (${money(c.spendPerDay)} → ${money(c.spendPerDay * 1.2)}/day)`,
        why: `True ROAS ${c.trueRoas.toFixed(2)}x — each added $1 returns $${c.trueRoas.toFixed(2)} contribution after BOM COGS, before scaling decay. Revert point saved.`,
        impactMonthly: c.spendPerDay * 0.2 * 30 * (c.trueRoas - 1) * 0.7, confidence: 'medium',
        evidence: [`${c.chOrders} attributed orders`, `${money(c.spend)} over ${c.days} days`],
        action: { ledger: `Scale ${c.campaign_name} +20%` },
      }
      const id = tid()
      setTurns(t => [...t, { id, kind: 'finding', f, status: 'open' }])
      setSelId(id)
      return
    }

    // everything else → real Claude, grounded in this page's numbers
    setBusy(true)
    const agentId = tid()
    setTurns(t => [...t, { id: agentId, kind: 'agent', pending: true, text: '' }])
    try {
      const res = await fetch('/api/mission/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context: askContext(data.clientName, m, range), history: histRef.current }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'ask failed')
      histRef.current = [...histRef.current, { q, a: json.answer }].slice(-6)
      patch(agentId, { pending: false, text: json.answer })
    } catch (e) {
      patch(agentId, { pending: false, text: '', error: e.message })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }, [busy, m, data, range, rangeN, ledger, policies, openTurns, turns, push, patch])

  const palItems = PALETTE.filter(([c, d]) => (c + d).includes(palQ.toLowerCase()))

  return (
    <div className="mt-root">
      <style>{CSS}</style>

      {/* status bar */}
      <div className="statusbar">
        <div className="seg"><span className="pulse" /><b>{data?.clientName?.toLowerCase() || clientId}</b><span className="dim">· mission</span></div>
        <div className="seg"><span className="dim">range</span><b>{rangeN}d</b></div>
        {m && <>
          <div className="seg"><span className="dim">net</span><b className={m.netProfit >= 0 ? 'good' : 'bad'}>{money(m.netProfit)}</b></div>
          <div className="seg"><span className="dim">tROAS</span><b className="good">{m.trueRoas != null ? m.trueRoas.toFixed(2) + 'x' : '—'}</b></div>
          <div className="seg"><span className="dim">spend</span><b className="warn">{money(m.adSpend)}</b></div>
          <div className="seg"><span className="dim">margin</span><b>{m.hasCogs ? (m.margin * 100).toFixed(1) + '%' : '—'}</b></div>
          <div className="seg"><span className="dim">queue</span><b className={openTurns.length ? 'warn' : 'good'}>{openTurns.length}</b></div>
        </>}
        <div className="spacer" />
        <div className="seg last">
          <span className="kbd">⌘K</span><span className="dim">cmds</span><span className="kbd">j/k</span><span className="dim">sel</span><span className="kbd">y</span><span className="dim">approve</span><span className="kbd">n</span><span className="dim">teach</span>
          <button className="helpbtn" title="How this works (?)" onClick={() => setManualOpen(true)}>?</button>
        </div>
      </div>

      {/* stream */}
      <div className="stream">
        {turns.map(t => <Turn key={t.id} t={t} selected={t.id === selId} onSelect={() => setSelId(t.id)} onApprove={() => approve(t)} onTeach={() => startTeach(t)} onSaveTeach={(r) => saveTeach(t, r)} />)}
        <div ref={endRef} />
      </div>

      {/* prompt */}
      <div className="promptwrap">
        <div className="prompt">
          <span className="ps">❯</span>
          <input ref={inputRef} disabled={busy} placeholder={busy ? 'thinking…' : 'ask anything · / for commands · answers use exactly the numbers above'}
            onKeyDown={e => { if (e.key === 'Enter') { const v = e.currentTarget.value; e.currentTarget.value = ''; ask(v) } }}
            autoComplete="off" spellCheck="false" />
        </div>
        <div className="hintline">
          {PALETTE.slice(0, 6).map(([c, d]) => <span key={c}><b>{c}</b> {d.split(' ').slice(0, 3).join(' ')}</span>)}
        </div>
      </div>

      {/* manual (?) */}
      {manualOpen && (
        <div className="palette" onClick={e => { if (e.target.classList.contains('palette')) { setManualOpen(false); inputRef.current?.focus() } }}>
          <div className="manual">
            <div className="man-h">
              <b>Mission Control — how this works</b>
              <button className="man-x" onClick={() => { setManualOpen(false); inputRef.current?.focus() }}>esc ✕</button>
            </div>
            <div className="man-body"><Markdown text={MANUAL} /></div>
          </div>
        </div>
      )}

      {/* ⌘K palette */}
      {palOpen && (
        <div className="palette" onClick={e => { if (e.target.classList.contains('palette')) setPalOpen(false) }}>
          <div className="pal">
            <input autoFocus value={palQ} onChange={e => setPalQ(e.target.value)} placeholder="type a command…"
              onKeyDown={e => {
                if (e.key === 'Escape') setPalOpen(false)
                if (e.key === 'Enter' && palItems[0]) { setPalOpen(false); ask(palItems[0][0].split(' ')[0]) }
              }} />
            {palItems.map(([c, d]) => (
              <div key={c} className="it" onClick={() => { setPalOpen(false); ask(c.split(' ')[0]) }}><b>{c}</b><span className="d">{d}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── a single turn ── */
function Turn({ t, selected, onSelect, onApprove, onTeach, onSaveTeach }) {
  if (t.kind === 'sys') return (
    <div className="turn"><div className="gutter"><div className="glyph dimc">·</div><div className="body"><div className="txt dim pre">{t.text}</div></div></div></div>
  )
  if (t.kind === 'you') return (
    <div className="turn"><div className="gutter"><div className="glyph goodc">❯</div><div className="body"><div className="meta"><span className="who">you</span></div><div className="txt strong">{t.text}</div></div></div></div>
  )
  if (t.kind === 'decision') return (
    <div className="turn"><div className="gutter"><div className="glyph purpc">▸</div><div className="body"><div className="meta"><span className="who">ledger</span></div><div className="txt dim">{t.text}</div></div></div></div>
  )
  if (t.kind === 'agent') return (
    <div className="turn"><div className="gutter"><div className="glyph bluec">◆</div><div className="body">
      <div className="meta"><span className="who">agent</span></div>
      {t.pending && <div className="thinkline"><span className="spin" />reading orders · campaigns · BOM margins…</div>}
      {t.error && <div className="txt badc">error: {t.error}</div>}
      {t.text && <div className="txt pre">{t.text}</div>}
      {t.bars && <Bars rows={t.bars} />}
      {t.table && <DataTable head={t.table.head} rows={t.table.rows} />}
    </div></div></div>
  )
  if (t.kind === 'finding') {
    const f = t.f
    return (
      <div className="turn"><div className="gutter"><div className="glyph bluec">◆</div><div className="body">
        <div className="meta"><span className="who">watcher · finding</span></div>
        <div className={`card ${f.severity === 'high' ? 'hot' : ''} ${selected && t.status === 'open' ? 'sel' : ''} ${t.status === 'done' ? 'done' : ''} ${t.status === 'taught' ? 'killed' : ''}`} onClick={onSelect}>
          <div className="card-h"><span className="t">{f.icon} {f.title}</span>
            {t.status === 'open' && <span className={`sev ${f.severity === 'high' ? 'shot' : 'swarm'}`}>{f.severity === 'high' ? 'NEEDS YOU' : 'REVIEW'}</span>}
            {t.status === 'executing' && <span className="sev sok">EXECUTING</span>}
            {t.status === 'done' && <span className="sev sok">LOGGED</span>}
            {t.status === 'taught' && <span className="sev sdead">TAUGHT</span>}
          </div>
          <div className="why">{f.why}</div>
          <div className="evrow">
            {f.impactMonthly > 0 && <span className="imp">~{money(f.impactMonthly)}/mo</span>}
            <span>confidence {f.confidence}</span>
            {f.evidence.map((e, i) => <span key={i}>· {e}</span>)}
          </div>
          {t.status === 'open' && (
            <div className="actrow">
              <span className="kbd act" onClick={e => { e.stopPropagation(); onApprove() }}>y</span> approve (logs only)
              <span className="kbd act" onClick={e => { e.stopPropagation(); onTeach() }}>n</span> dismiss+teach
            </div>
          )}
          {t.status === 'executing' && <div className="actrow"><span className="exec"><span className="spin" />logging decision · rollback noted…</span></div>}
          {t.status === 'teaching' && (
            <div className="actrow">
              <input data-teach="1" autoFocus placeholder="why is this wrong? (enter saves it as a standing rule)" className="teach"
                onKeyDown={e => { if (e.key === 'Enter') onSaveTeach(e.currentTarget.value) }} />
            </div>
          )}
          {t.status === 'taught' && <div className="actrow"><span className="dim">policy learned: “{t.reason}” · won&apos;t re-propose</span></div>}
          {t.status === 'done' && <div className="actrow"><span className="goodc" style={{ fontWeight: 700 }}>✓ logged to ledger · no platform write in this build</span></div>}
        </div>
      </div></div></div>
    )
  }
  return null
}

function Bars({ rows }) {
  const max = Math.max(...rows.map(r => r.value), 0.001)
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div key={i} className="brow">
          <span className="bl">{r.label}</span>
          <div className="btrack"><i style={{ width: `${Math.max(3, r.value / max * 100)}%`, background: r.color }} /></div>
          <span className="bv" style={{ color: r.color }}>{r.text}</span>
        </div>
      ))}
    </div>
  )
}

/* Minimal markdown for the manual: ## headings, - bullets, **bold**, paragraphs */
function Markdown({ text }) {
  const inline = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p)
  const blocks = []
  let para = [], list = null
  const flush = () => {
    if (list) { blocks.push(<ul key={blocks.length}>{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>); list = null }
    if (para.length) { blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>); para = [] }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('## ')) { flush(); blocks.push(<h3 key={blocks.length}>{line.slice(3)}</h3>) }
    else if (/^\s*[-\d]+[.)]?\s/.test(line) && (line.trim().startsWith('- ') || /^\d/.test(line.trim()))) {
      if (para.length) flush()
      if (!list) list = []
      list.push(line.trim().replace(/^-\s|^\d+[.)]\s/, ''))
    }
    else if (line.trim() === '') flush()
    else if (list) list[list.length - 1] += ' ' + line.trim()
    else para.push(line.trim())
  }
  flush()
  return <div>{blocks}</div>
}

function DataTable({ head, rows }) {
  return (
    <div className="datatable"><table>
      <thead><tr>{head.map((h, i) => <th key={i} style={i > 0 ? { textAlign: 'right' } : undefined}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j > 0 ? 'num' : ''}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  )
}

/* Terminal CSS — scoped under .mt-root, escapes the app's light styling */
const CSS = `
.mt-root{--bg:#0b0e14;--panel:#11151f;--panel2:#161b28;--line:rgba(255,255,255,.07);--txt:#dbe1ee;--dim:#8a93a8;--faint:#5a6377;--green:#3fd68f;--red:#f4747f;--amber:#e8b45a;--blue:#6ea8fe;--purple:#a78bfa;
  position:fixed;inset:0;top:var(--mt-top,57px);z-index:30;display:flex;flex-direction:column;background:var(--bg);color:var(--txt);font:13.5px/1.55 "SF Mono",ui-monospace,Menlo,Consolas,monospace;}
.mt-root .statusbar{display:flex;align-items:center;border-bottom:1px solid var(--line);background:var(--panel);padding:0 14px;height:38px;font-size:12px;flex-shrink:0;overflow-x:auto;white-space:nowrap;}
.mt-root .seg{padding:0 12px;border-right:1px solid var(--line);display:flex;gap:6px;align-items:center;height:100%;}
.mt-root .seg.last{border-right:none;gap:8px;}
.mt-root .seg:first-child{padding-left:0;}
.mt-root .dim{color:var(--faint);} .mt-root .good{color:var(--green);} .mt-root .warn{color:var(--amber);} .mt-root .bad,.mt-root .badc{color:var(--red);}
.mt-root .goodc{color:var(--green);} .mt-root .bluec{color:var(--blue);} .mt-root .purpc{color:var(--purple);} .mt-root .dimc{color:var(--faint);}
.mt-root .pulse{width:6px;height:6px;border-radius:50%;background:var(--green);animation:mtpu 2s infinite;}
@keyframes mtpu{50%{opacity:.3;}}
.mt-root .spacer{flex:1;}
.mt-root .kbd{font-size:10.5px;color:var(--faint);border:1px solid var(--line);border-radius:4px;padding:1px 5px;background:var(--panel2);}
.mt-root .kbd.act{cursor:pointer;} .mt-root .kbd.act:hover{color:var(--txt);border-color:var(--dim);}
.mt-root .stream{flex:1;overflow-y:auto;padding:18px clamp(14px,7vw,160px) 30px;}
.mt-root .turn{margin-bottom:13px;animation:mtup .18s ease;}
@keyframes mtup{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
.mt-root .gutter{display:flex;gap:10px;}
.mt-root .glyph{width:22px;flex-shrink:0;text-align:center;font-weight:700;padding-top:1px;}
.mt-root .body{flex:1;min-width:0;}
.mt-root .meta{font-size:10.5px;color:var(--faint);margin-bottom:2px;}
.mt-root .who{font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
.mt-root .txt{color:var(--txt);} .mt-root .txt.dim{color:var(--dim);} .mt-root .txt.strong{font-weight:600;}
.mt-root .pre{white-space:pre-wrap;}
.mt-root .thinkline{color:var(--faint);font-size:11.5px;display:flex;gap:8px;align-items:center;}
.mt-root .spin{width:9px;height:9px;border-radius:50%;border:2px solid var(--blue);border-top-color:transparent;animation:mtrot .6s linear infinite;display:inline-block;flex-shrink:0;}
@keyframes mtrot{to{transform:rotate(360deg);}}
.mt-root .card{border:1px solid var(--line);border-left:3px solid var(--amber);border-radius:8px;background:var(--panel);margin-top:4px;cursor:default;}
.mt-root .card.hot{border-left-color:var(--red);}
.mt-root .card.sel{border-color:var(--blue);border-left-color:var(--blue);box-shadow:0 0 0 1px rgba(110,168,254,.25);}
.mt-root .card.done{opacity:.55;border-left-color:var(--green);}
.mt-root .card.killed{opacity:.45;border-left-color:var(--faint);}
.mt-root .card-h{display:flex;gap:8px;align-items:baseline;padding:9px 13px 0;}
.mt-root .card-h .t{font-weight:700;font-size:13px;flex:1;}
.mt-root .sev{font-size:9.5px;font-weight:800;letter-spacing:.06em;padding:1px 7px;border-radius:99px;flex-shrink:0;}
.mt-root .sev.shot{background:rgba(244,116,127,.13);color:var(--red);}
.mt-root .sev.swarm{background:rgba(232,180,90,.13);color:var(--amber);}
.mt-root .sev.sok{background:rgba(63,214,143,.13);color:var(--green);}
.mt-root .sev.sdead{background:rgba(255,255,255,.07);color:var(--faint);}
.mt-root .why{padding:5px 13px 0;color:var(--dim);font-size:12.5px;line-height:1.55;}
.mt-root .evrow{display:flex;gap:12px;padding:7px 13px 9px;font-size:11px;color:var(--faint);flex-wrap:wrap;}
.mt-root .evrow .imp{color:var(--green);font-weight:700;}
.mt-root .actrow{display:flex;gap:8px;align-items:center;border-top:1px dashed var(--line);padding:8px 13px;font-size:11.5px;color:var(--faint);flex-wrap:wrap;}
.mt-root .exec{color:var(--blue);display:flex;gap:7px;align-items:center;}
.mt-root .teach{flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:11.5px;padding:5px 9px;outline:none;}
.mt-root .teach:focus{border-color:rgba(110,168,254,.5);}
.mt-root .bars{margin:8px 0 2px;max-width:640px;}
.mt-root .brow{display:flex;align-items:center;gap:9px;margin:3px 0;font-size:12px;}
.mt-root .brow .bl{width:200px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;flex-shrink:0;}
.mt-root .brow .btrack{flex:1;height:9px;background:var(--panel2);border-radius:3px;overflow:hidden;}
.mt-root .brow .btrack i{display:block;height:100%;border-radius:3px;}
.mt-root .brow .bv{width:80px;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;}
.mt-root .datatable{margin:8px 0 2px;border:1px solid var(--line);border-radius:7px;overflow:hidden;font-size:12px;max-width:640px;}
.mt-root .datatable table{width:100%;border-collapse:collapse;}
.mt-root .datatable th{text-align:left;color:var(--faint);font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:6px 11px;background:var(--panel2);font-weight:700;}
.mt-root .datatable td{padding:5.5px 11px;border-top:1px solid var(--line);color:var(--dim);}
.mt-root .datatable td:first-child{color:var(--txt);font-weight:600;}
.mt-root .datatable td.num{text-align:right;font-variant-numeric:tabular-nums;}
.mt-root .promptwrap{border-top:1px solid var(--line);background:var(--panel);padding:10px 14px 12px;flex-shrink:0;}
.mt-root .prompt{display:flex;gap:10px;align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px 13px;}
.mt-root .prompt:focus-within{border-color:rgba(110,168,254,.5);}
.mt-root .ps{color:var(--green);font-weight:800;}
.mt-root .prompt input{flex:1;background:transparent;border:none;outline:none;color:var(--txt);font:inherit;}
.mt-root .hintline{display:flex;gap:14px;margin-top:7px;font-size:10.5px;color:var(--faint);flex-wrap:wrap;}
.mt-root .hintline b{color:var(--dim);font-weight:700;}
.mt-root .palette{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;z-index:70;}
.mt-root .pal{width:520px;max-width:92vw;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6);}
.mt-root .pal input{width:100%;background:var(--panel2);border:none;outline:none;color:var(--txt);font:inherit;padding:13px 16px;border-bottom:1px solid var(--line);}
.mt-root .pal .it{padding:10px 16px;display:flex;gap:10px;align-items:baseline;cursor:pointer;font-size:12.5px;}
.mt-root .pal .it:hover{background:rgba(110,168,254,.08);}
.mt-root .pal .it .d{color:var(--faint);font-size:11px;margin-left:auto;}
.mt-root .helpbtn{width:22px;height:22px;border-radius:6px;border:1px solid var(--line);background:var(--panel2);color:var(--dim);font:inherit;font-weight:800;cursor:pointer;margin-left:4px;}
.mt-root .helpbtn:hover{color:var(--txt);border-color:var(--dim);}
.mt-root .manual{width:680px;max-width:94vw;max-height:78vh;background:var(--panel);border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.6);}
.mt-root .man-h{display:flex;align-items:center;justify-content:space-between;padding:13px 18px;border-bottom:1px solid var(--line);font-size:13px;}
.mt-root .man-x{background:none;border:none;color:var(--faint);font:inherit;font-size:11px;cursor:pointer;}
.mt-root .man-x:hover{color:var(--txt);}
.mt-root .man-body{overflow-y:auto;padding:6px 22px 22px;font-size:12.5px;line-height:1.65;color:var(--dim);}
.mt-root .man-body h3{color:var(--txt);font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin:18px 0 6px;}
.mt-root .man-body p{margin:7px 0;}
.mt-root .man-body ul{margin:7px 0 7px 18px;}
.mt-root .man-body li{margin:4px 0;}
.mt-root .man-body b{color:var(--txt);}
.mt-root ::-webkit-scrollbar{width:10px;} .mt-root ::-webkit-scrollbar-thumb{background:var(--panel2);border-radius:5px;}
`
