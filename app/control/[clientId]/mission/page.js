'use client'

// The Business IDE — VS Code's shape, adapted for running an ecom company.
// Explorer (left) = the client's surfaces as a tree. Tabs (top) = open views.
// Panel (lower third) = TERMINAL (the mission session) + PROBLEMS (the queue).
// Status bar = live KPIs. One persistent session survives tab switches and
// knows which view you're looking at. Approvals still log locally — no
// platform writes in this build.

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchMissionData, computeMission, askContext, rangeDays } from '../../../../lib/mission/data'
import { buildFindings } from '../../../../lib/mission/watchers'
import { MANUAL } from '../../../../lib/mission/manual'
import { deriveChannel } from '../../../../components/EcomControlCenter'

const money = (n) => '$' + Math.round(n || 0).toLocaleString()
let turnSeq = 0
const tid = () => 'turn-' + (++turnSeq)

const PALETTE_CMDS = [
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

// The Explorer tree — every leaf is a view backed by live data
const TREE = [
  { section: 'WORKSPACE', items: [
    { id: 'overview', icon: '📊', label: 'Overview' },
  ]},
  { section: 'CAMPAIGNS', items: [
    { id: 'google', icon: '🔍', label: 'Google Ads' },
    { id: 'meta', icon: '📘', label: 'Meta Ads' },
  ]},
  { section: 'REVENUE', items: [
    { id: 'orders', icon: '🛍', label: 'Orders' },
    { id: 'klaviyo', icon: '✉️', label: 'Klaviyo' },
  ]},
  { section: 'DOCS', items: [
    { id: 'manual', icon: '📖', label: 'Manual' },
    { id: 'ledger', icon: '🧾', label: 'Ledger' },
    { id: 'policies', icon: '🛡', label: 'Policies' },
  ]},
]
const VIEW_TITLES = { overview: 'Overview', google: 'Google Ads', meta: 'Meta Ads', orders: 'Orders', klaviyo: 'Klaviyo', manual: 'Manual', ledger: 'Ledger', policies: 'Policies' }

export default function BusinessIDE() {
  const { clientId } = useParams()
  const [rangeN, setRangeN] = useState(30)
  const [data, setData] = useState(null)
  const [turns, setTurns] = useState([])
  const [selId, setSelId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [palOpen, setPalOpen] = useState(false)
  const [palQ, setPalQ] = useState('')
  const [tabs, setTabs] = useState(['overview'])
  const [activeTab, setActiveTab] = useState('overview')
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState('terminal') // 'terminal' | 'problems'
  const [sideOpen, setSideOpen] = useState(true)
  const inputRef = useRef(null)
  const endRef = useRef(null)
  const histRef = useRef([])
  const bootedRef = useRef(false)

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

  const push = useCallback((turn) => setTurns(t => [...t, { id: tid(), ...turn }]), [])
  const patch = useCallback((id, up) => setTurns(t => t.map(x => x.id === id ? { ...x, ...(typeof up === 'function' ? up(x) : up) } : x)), [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, panelOpen, panelTab])

  /* ── tabs ── */
  const openTab = useCallback((id) => {
    setTabs(t => t.includes(id) ? t : [...t, id])
    setActiveTab(id)
  }, [])
  const closeTab = useCallback((id) => {
    setTabs(t => {
      const next = t.filter(x => x !== id)
      if (next.length === 0) return ['overview']
      return next
    })
    setActiveTab(a => a === id ? (tabs.filter(x => x !== id)[0] || 'overview') : a)
  }, [tabs])

  /* ── data load + boot ── */
  useEffect(() => {
    let alive = true
    bootedRef.current = false
    setTurns([]); setSelId(null)
    push({ kind: 'sys', text: `loading ${rangeN}d of ${clientId} — orders, campaigns, BOM margins…` })
    fetchMissionData(clientId, range.start, range.end)
      .then(d => { if (alive) setData(d) })
      .catch(e => push({ kind: 'sys', text: 'load failed: ' + e.message }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range.start, range.end])

  useEffect(() => {
    if (!m || !data || bootedRef.current) return
    bootedRef.current = true
    const dismissed = new Set(policies.map(p => p.findingId))
    const findings = buildFindings(m).filter(f => !dismissed.has(f.id))
    setTurns([{ id: tid(), kind: 'sys', text: `session start · ${data.clientName} · ${rangeN}d — ${m.orders} orders, ${m.campaigns.length} campaigns, ${m.hasCogs ? 'BOM margins live (' + (m.margin * 100).toFixed(1) + '%)' : 'no BOM data'} · the terminal follows you across tabs and knows what you're looking at.` }])
    let firstId = null
    for (const f of findings) {
      const id = tid()
      if (!firstId) firstId = id
      setTurns(t => [...t, { id, kind: 'finding', f, status: 'open' }])
    }
    setSelId(firstId)
    setTurns(t => [...t, { id: tid(), kind: 'sys', text: (findings.length ? `${findings.length} in PROBLEMS · y approves the selected card · j/k moves.` : 'no problems — every live campaign clears breakeven.') + ' press ? for the manual · ctrl+\` toggles this panel.' }])
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
      push({ kind: 'decision', text: `APPROVED ${t.f.action.ledger}${t.f.impactMonthly > 0 ? ` — ~${money(t.f.impactMonthly)}/mo est.` : ''} · logged (no platform write in this build).` })
      const next = openTurns.find(x => x.id !== t.id)
      if (next) setSelId(next.id)
    }, 1100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, push, openTurns])

  const startTeach = useCallback((t) => { if (t.status === 'open') patch(t.id, { status: 'teaching' }) }, [patch])
  const saveTeach = useCallback((t, reason) => {
    const why = (reason || '').trim() || 'no reason given'
    patch(t.id, { status: 'taught', reason: why })
    setPolicies(p => { const next = [{ findingId: t.f.id, reason: why, when: new Date().toISOString() }, ...p]; localStorage.setItem(lsKey('policies'), JSON.stringify(next)); return next })
    push({ kind: 'decision', text: `TAUGHT “${why}” — standing rule saved. /policies (or the Policies doc) lists everything.` })
    const next = openTurns.find(x => x.id !== t.id)
    if (next) setSelId(next.id)
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, push, openTurns])

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.dataset?.teach === '1') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalOpen(o => !o); setPalQ(''); return }
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); setPanelOpen(o => !o); return }
      if (e.key === 'Escape') { setPalOpen(false); inputRef.current?.focus(); return }
      const typing = (e.target.tagName === 'INPUT' && e.target.value !== '')
      if (!typing && !palOpen && e.key === '?') { e.preventDefault(); openTab('manual'); return }
      if (typing || palOpen) return
      const idx = openTurns.findIndex(t => t.id === selId)
      if (e.key === 'j') { e.preventDefault(); const n = openTurns[Math.min(openTurns.length - 1, Math.max(0, idx + 1))]; if (n) setSelId(n.id) }
      else if (e.key === 'k') { e.preventDefault(); const n = openTurns[Math.max(0, idx - 1)]; if (n) setSelId(n.id) }
      else if (e.key === 'y') { e.preventDefault(); const t = openTurns[idx]; if (t) approve(t) }
      else if (e.key === 'n') { e.preventDefault(); const t = openTurns[idx]; if (t) startTeach(t) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openTurns, selId, approve, startTeach, palOpen, openTab])

  /* ── ask + slash commands ── */
  const ask = useCallback(async (raw) => {
    const q = raw.trim()
    if (!q || busy || !m) return
    setPanelOpen(true); setPanelTab('terminal')
    push({ kind: 'you', text: q })
    const lower = q.toLowerCase()

    const KNOWN = ['/pause', '/scale', '/forecast', '/campaigns', '/ledger', '/policies', '/range', '/clear', '/help', '/manual']
    if (lower.startsWith('/')) {
      const cmd = lower.split(/\s+/)[0]
      if (!KNOWN.includes(cmd)) {
        const guess = KNOWN.map(k => { let s = 0; while (s < Math.min(k.length, cmd.length) && k[s] === cmd[s]) s++; return [k, s] }).sort((a, b) => b[1] - a[1])[0]
        push({ kind: 'sys', text: `unknown command ${cmd}${guess && guess[1] >= 3 ? ` — did you mean ${guess[0]}?` : ''} · /help lists everything` })
        return
      }
    }

    if (lower === '/clear') { histRef.current = []; bootedRef.current = false; setData(d => ({ ...d })); return }
    if (lower === '/manual') { openTab('manual'); push({ kind: 'sys', text: 'opened the Manual tab.' }); return }
    if (lower.startsWith('/range')) {
      const n = Number(lower.split(/\s+/)[1])
      if ([7, 30, 90].includes(n)) setRangeN(n); else push({ kind: 'sys', text: 'usage: /range 7 | 30 | 90' })
      return
    }
    if (lower === '/help') { push({ kind: 'sys', text: PALETTE_CMDS.map(([c, d]) => `${c} — ${d}`).join('\n') }); return }
    if (lower === '/ledger') { openTab('ledger'); push({ kind: 'sys', text: `opened the Ledger tab — ${ledger.length} decisions.` }); return }
    if (lower === '/policies') { openTab('policies'); push({ kind: 'sys', text: `opened the Policies tab — ${policies.length} standing rules.` }); return }
    if (lower === '/campaigns') {
      const rows = m.campaigns.filter(c => c.spend > 0)
      push({ kind: 'agent', text: `True ROAS per campaign (breakeven 1.00x on real BOM margin) · ${rangeN}d:`,
        bars: rows.map(c => ({ label: `${c.campaign_name}${c.stale ? ' (stale)' : ''}`, value: c.trueRoas ?? 0, color: c.trueRoas == null ? '#5a6377' : c.trueRoas >= 1.5 ? '#3fd68f' : c.trueRoas >= 1 ? '#e8b45a' : '#f4747f', text: c.trueRoas != null ? c.trueRoas.toFixed(2) + 'x' : '—' })) })
      return
    }
    if (lower === '/forecast') {
      const perDay = m.netProfit / m.days
      const base = perDay * 30
      const openImpact = openTurns.reduce((s, t) => s + (t.f.impactMonthly || 0), 0)
      push({ kind: 'agent',
        text: `Naive 30-day projection from the last ${m.days} days' run-rate (${money(perDay)}/day net): ${money(base)}. Clearing PROBLEMS adds an estimated ${money(openImpact)}/mo. This is arithmetic, not a model — a real forecast lands with the cron watcher.`,
        bars: [
          { label: 'do nothing', value: base, color: '#5a6377', text: money(base) },
          { label: 'clear the queue', value: base + openImpact, color: '#3fd68f', text: money(base + openImpact) },
        ] })
      return
    }
    if (lower === '/pause' || lower === '/scale') {
      const pool = m.campaigns.filter(c => c.status === 'ENABLED' && !c.stale && c.spend >= 200 && c.trueRoas != null && c.days >= 4)
      const c = lower === '/pause'
        ? pool.filter(x => x.trueRoas < 1 && x.chOrders > 0).sort((a, b) => a.trueRoas - b.trueRoas)[0]
        : pool.filter(x => x.trueRoas >= 1.5 && x.spend >= 500 && x.chOrders >= 5).sort((a, b) => b.trueRoas - a.trueRoas)[0]
      if (!c) { push({ kind: 'sys', text: lower === '/pause' ? 'nothing to pause — no enabled campaign is below 1.00x breakeven with attributed orders.' : 'no clear scale candidate — nothing enabled is ≥1.5x with real volume.' }); return }
      const dupe = turns.find(t => t.kind === 'finding' && t.status === 'open' &&
        (t.f.action?.campaign_id === c.campaign_id || t.f.id.endsWith(`-${c.campaign_id}`)) &&
        (lower === '/pause' ? /pause|noattr|bleed/.test(t.f.id) : /scale/.test(t.f.id)))
      if (dupe) { setSelId(dupe.id); push({ kind: 'sys', text: `already in PROBLEMS — selected the existing card for ${c.campaign_name}.` }); return }
      const f = lower === '/pause' ? {
        id: `cmd-pause-${c.campaign_id}`, severity: 'high', icon: '🚨',
        title: `Pause ${c.campaign_name} (${c.platform}) — below margin breakeven`,
        why: `True ROAS ${c.trueRoas.toFixed(2)}x on ${money(c.spend)} spend. At ${money(c.spendPerDay)}/day this loses ~${money(c.spendPerDay * (1 - c.trueRoas))}/day of contribution.`,
        impactMonthly: c.spendPerDay * 30 * (1 - c.trueRoas), confidence: c.days >= 5 ? 'high' : 'medium',
        evidence: [`${c.days} days`, `${c.chOrders} attributed orders`],
        action: { ledger: `Pause ${c.campaign_name} on ${c.platform}`, campaign_id: c.campaign_id },
      } : {
        id: `cmd-scale-${c.campaign_id}`, severity: 'medium', icon: '📈',
        title: `Scale ${c.campaign_name} (${c.platform}) +20% (${money(c.spendPerDay)} → ${money(c.spendPerDay * 1.2)}/day)`,
        why: `True ROAS ${c.trueRoas.toFixed(2)}x — each added $1 returns $${c.trueRoas.toFixed(2)} contribution after BOM COGS, before scaling decay. Revert point saved.`,
        impactMonthly: c.spendPerDay * 0.2 * 30 * (c.trueRoas - 1) * 0.7, confidence: 'medium',
        evidence: [`${c.chOrders} attributed orders`, `${money(c.spend)} over ${c.days} days`],
        action: { ledger: `Scale ${c.campaign_name} +20%`, campaign_id: c.campaign_id },
      }
      const id = tid()
      setTurns(t => [...t, { id, kind: 'finding', f, status: 'open' }])
      setSelId(id)
      return
    }

    // free text → Claude, grounded + aware of the active tab
    setBusy(true)
    const agentId = tid()
    setTurns(t => [...t, { id: agentId, kind: 'agent', pending: true, text: '' }])
    try {
      const ctx = { ...askContext(data.clientName, m, range), active_view: VIEW_TITLES[activeTab] || activeTab }
      const res = await fetch('/api/mission/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context: ctx, history: histRef.current }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'ask failed')
      histRef.current = [...histRef.current, { q, a: json.answer }].slice(-6)
      patch(agentId, { pending: false, text: json.answer })
    } catch (e) {
      patch(agentId, { pending: false, text: '', error: e.message })
    } finally { setBusy(false); inputRef.current?.focus() }
  }, [busy, m, data, range, rangeN, ledger, policies, openTurns, turns, activeTab, push, patch, openTab])

  const palItems = PALETTE_CMDS.filter(([c, d]) => (c + d).includes(palQ.toLowerCase()))
  const problems = openTurns

  return (
    <div className="ide">
      <style>{CSS}</style>

      <div className="ide-cols">
        {/* ── Explorer ── */}
        {sideOpen && (
          <div className="explorer">
            <div className="exp-head">
              <span>{data?.clientName || clientId}</span>
              <span className="exp-badge">ECOM</span>
            </div>
            {TREE.map(sec => (
              <div key={sec.section}>
                <div className="exp-sec">{sec.section}</div>
                {sec.items.map(it => (
                  <div key={it.id} className={`exp-item ${activeTab === it.id ? 'on' : ''}`} onClick={() => openTab(it.id)}>
                    <span className="exp-ic">{it.icon}</span>{it.label}
                    {it.id === 'ledger' && ledger.length > 0 && <span className="exp-n">{ledger.length}</span>}
                    {it.id === 'policies' && policies.length > 0 && <span className="exp-n">{policies.length}</span>}
                  </div>
                ))}
              </div>
            ))}
            <div className="exp-sec">PANEL</div>
            <div className={`exp-item ${panelOpen && panelTab === 'problems' ? 'on' : ''}`} onClick={() => { setPanelOpen(true); setPanelTab('problems') }}>
              <span className="exp-ic">⚠️</span>Problems
              {problems.length > 0 && <span className="exp-n warn">{problems.length}</span>}
            </div>
            <div className={`exp-item ${panelOpen && panelTab === 'terminal' ? 'on' : ''}`} onClick={() => { setPanelOpen(true); setPanelTab('terminal'); inputRef.current?.focus() }}>
              <span className="exp-ic">▸</span>Terminal
            </div>
          </div>
        )}

        {/* ── Right column: tabs / view / panel ── */}
        <div className="main">
          <div className="tabbar">
            <button className="burger" onClick={() => setSideOpen(o => !o)} title="Toggle explorer">☰</button>
            {tabs.map(id => (
              <div key={id} className={`tab ${activeTab === id ? 'on' : ''}`} onClick={() => setActiveTab(id)}>
                {VIEW_TITLES[id]}
                {tabs.length > 1 && <span className="tab-x" onClick={e => { e.stopPropagation(); closeTab(id) }}>×</span>}
              </div>
            ))}
          </div>

          <div className="view">
            {!m ? <p className="loading">reading {rangeN} days of orders, campaigns, and BOM costs…</p> : (
              <>
                {activeTab === 'overview' && <OverviewView m={m} />}
                {activeTab === 'google' && <CampaignView m={m} platform="Google" />}
                {activeTab === 'meta' && <CampaignView m={m} platform="Meta" />}
                {activeTab === 'orders' && <OrdersView data={data} />}
                {activeTab === 'klaviyo' && <KlaviyoView m={m} />}
                {activeTab === 'manual' && <div className="man-body wide"><Markdown text={MANUAL} /></div>}
                {activeTab === 'ledger' && <LedgerView ledger={ledger} />}
                {activeTab === 'policies' && <PoliciesView policies={policies} />}
              </>
            )}
          </div>

          {/* ── Panel: terminal + problems ── */}
          {panelOpen && (
            <div className="panel">
              <div className="panel-tabs">
                <span className={panelTab === 'terminal' ? 'on' : ''} onClick={() => { setPanelTab('terminal'); inputRef.current?.focus() }}>TERMINAL</span>
                <span className={panelTab === 'problems' ? 'on' : ''} onClick={() => setPanelTab('problems')}>PROBLEMS{problems.length ? ` (${problems.length})` : ''}</span>
                <span className="panel-x" onClick={() => setPanelOpen(false)} title="ctrl+`">▾</span>
              </div>

              {panelTab === 'terminal' && (
                <>
                  <div className="stream">
                    {turns.map(t => <Turn key={t.id} t={t} selected={t.id === selId} onSelect={() => setSelId(t.id)} onApprove={() => approve(t)} onTeach={() => startTeach(t)} onSaveTeach={(r) => saveTeach(t, r)} />)}
                    <div ref={endRef} />
                  </div>
                  <div className="prompt">
                    <span className="ps">❯</span>
                    <input ref={inputRef} disabled={busy} placeholder={busy ? 'thinking…' : `ask about ${VIEW_TITLES[activeTab]?.toLowerCase() || 'anything'} · / commands · answers use this page's numbers`}
                      onKeyDown={e => { if (e.key === 'Enter') { const v = e.currentTarget.value; e.currentTarget.value = ''; ask(v) } }}
                      autoComplete="off" spellCheck="false" />
                  </div>
                </>
              )}

              {panelTab === 'problems' && (
                <div className="stream">
                  {problems.length === 0 && <p className="loading">no problems — every live campaign clears breakeven. the watcher re-checks on load and range change.</p>}
                  {problems.map(t => <Turn key={t.id} t={t} selected={t.id === selId} onSelect={() => setSelId(t.id)} onApprove={() => approve(t)} onTeach={() => startTeach(t)} onSaveTeach={(r) => saveTeach(t, r)} bare />)}
                </div>
              )}
            </div>
          )}

          {/* ── Status bar ── */}
          <div className="statusbar">
            <div className="seg"><span className="pulse" /><b>{data?.clientName?.toLowerCase() || clientId}</b></div>
            <div className="seg sel-range">
              <select value={rangeN} onChange={e => setRangeN(Number(e.target.value))}>
                <option value={7}>7d</option><option value={30}>30d</option><option value={90}>90d</option>
              </select>
            </div>
            {m && <>
              <div className="seg"><span className="dim">net</span><b className={m.netProfit >= 0 ? 'good' : 'bad'}>{money(m.netProfit)}</b></div>
              <div className="seg"><span className="dim">tROAS</span><b className="good">{m.trueRoas != null ? m.trueRoas.toFixed(2) + 'x' : '—'}</b></div>
              <div className="seg"><span className="dim">spend</span><b className="warn">{money(m.adSpend)}</b></div>
              <div className="seg"><span className="dim">margin</span><b>{m.hasCogs ? (m.margin * 100).toFixed(1) + '%' : '—'}</b></div>
              <div className="seg probs" onClick={() => { setPanelOpen(true); setPanelTab('problems') }}>
                <span className="dim">⚠</span><b className={problems.length ? 'warn' : 'good'}>{problems.length}</b>
              </div>
            </>}
            <div className="spacer" />
            <div className="seg last">
              <span className="kbd">⌘K</span><span className="kbd">ctrl+`</span><span className="kbd">j/k</span><span className="kbd">y</span><span className="kbd">n</span>
              <button className="helpbtn" onClick={() => openTab('manual')}>?</button>
            </div>
          </div>
        </div>
      </div>

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

/* ══════════ Views (tab contents) ══════════ */

function OverviewView({ m }) {
  const max = m.byChannel[0]?.revenue || 1
  const CH = { Meta: '#0866FF', Google: '#e8eaf2', Direct: '#fb7185', Klaviyo: '#f8a5a5', Shop: '#5a31f4' }
  return (
    <div className="v-pad">
      <div className="kpis">
        {[['Gross Revenue', money(m.revenue), ''], ['COGS (BOM)', m.hasCogs ? money(m.cogs) : '—', 'warn'], ['Ad Spend', money(m.adSpend), 'warn'],
          ['Net Profit', m.hasCogs ? money(m.netProfit) : '—', m.netProfit >= 0 ? 'good' : 'bad'], ['True ROAS', m.trueRoas != null ? m.trueRoas.toFixed(2) + 'x' : '—', 'good'], ['Orders', String(m.orders), '']].map(([l, v, c]) => (
          <div key={l} className="kpi"><p className="kl">{l}</p><p className={`kv ${c}`}>{v}</p></div>
        ))}
      </div>
      <h4 className="v-h">Revenue by channel</h4>
      {m.byChannel.map(c => (
        <div key={c.name} className="brow wide">
          <span className="bl">{c.name}</span>
          <div className="btrack"><i style={{ width: `${(c.revenue / max) * 100}%`, background: CH[c.name] || '#7a8bb5' }} /></div>
          <span className="bv">{money(c.revenue)}</span>
          <span className="bnote">{c.orders} orders{m.hasCogs ? ` · ${money(c.revenue - c.cogs)} margin` : ''}</span>
        </div>
      ))}
      <h4 className="v-h">Daily</h4>
      <Spark daily={m.daily} />
    </div>
  )
}

function Spark({ daily }) {
  if (!daily?.length) return <p className="loading">no daily data in range.</p>
  const max = Math.max(...daily.map(d => d.revenue), 1)
  return (
    <div className="spark">
      {daily.map(d => (
        <div key={d.date} className="sp-col" title={`${d.date} · ${money(d.revenue)} rev · ${d.orders} orders · ${money(d.spend)} spend`}>
          <i style={{ height: `${Math.max(2, d.revenue / max * 100)}%` }} />
        </div>
      ))}
    </div>
  )
}

function CampaignView({ m, platform }) {
  const rows = m.campaigns.filter(c => c.platform === platform)
  if (!rows.length) return <p className="loading v-pad">no {platform} campaigns in range.</p>
  return (
    <div className="v-pad">
      <table className="vtable">
        <thead><tr><th>Campaign</th><th>Status</th><th className="num">Spend</th><th className="num">$/day</th><th className="num">Clicks</th><th className="num">Orders (CH)</th><th className="num">Attr. Rev</th><th className="num">True ROAS</th></tr></thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.campaign_id}>
              <td className="tname">{c.campaign_name}</td>
              <td>{c.stale ? <span className="pill dead">stale</span> : c.status === 'ENABLED' ? <span className="pill ok">enabled</span> : <span className="pill dead">paused</span>}</td>
              <td className="num">{money(c.spend)}</td>
              <td className="num">{money(c.spendPerDay)}</td>
              <td className="num">{c.clicks.toLocaleString()}</td>
              <td className="num">{c.chOrders}</td>
              <td className="num">{money(c.chRevenue)}</td>
              <td className={`num strong ${c.trueRoas == null ? '' : c.trueRoas >= 1 ? 'good' : 'bad'}`}>{c.trueRoas != null ? c.trueRoas.toFixed(2) + 'x' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="v-note">True ROAS = (UTM-attributed revenue − BOM COGS) ÷ spend · breakeven 1.00x · ask the terminal about any row.</p>
    </div>
  )
}

function OrdersView({ data }) {
  const rows = (data?.orders || []).slice(0, 100)
  return (
    <div className="v-pad">
      <table className="vtable">
        <thead><tr><th>Order</th><th>Date</th><th>Channel</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.lead_id}>
              <td className="tname">{o.shopify_data?.order_name || o.lead_id}</td>
              <td>{new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
              <td>{deriveChannel(o)}</td>
              <td className="num strong">{money(o.sale_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data?.orders || []).length > 100 && <p className="v-note">showing latest 100 of {data.orders.length}.</p>}
    </div>
  )
}

function KlaviyoView({ m }) {
  const k = m.byChannel.find(c => c.name === 'Klaviyo')
  const share = m.revenue > 0 ? ((k?.revenue || 0) / m.revenue * 100).toFixed(1) : '0'
  return (
    <div className="v-pad">
      <div className="kpis three">
        <div className="kpi"><p className="kl">Klaviyo Revenue (UTM-verified)</p><p className="kv">{money(k?.revenue || 0)}</p></div>
        <div className="kpi"><p className="kl">Orders</p><p className="kv">{k?.orders || 0}</p></div>
        <div className="kpi"><p className="kl">Share of Revenue</p><p className={`kv ${Number(share) < 10 ? 'warn' : 'good'}`}>{share}%</p></div>
      </div>
      <p className="v-note">Healthy ecom runs email/SMS at 15–30% of revenue. The full campaign/flow board (Klaviyo&apos;s own attribution alongside first-party) lands here when klaviyo_daily is wired into the mission data layer — it&apos;s on the dashboard today.</p>
    </div>
  )
}

function LedgerView({ ledger }) {
  if (!ledger.length) return <p className="loading v-pad">no decisions yet — approve something in PROBLEMS with y.</p>
  return (
    <div className="v-pad">
      <table className="vtable">
        <thead><tr><th>Decision</th><th>When</th><th className="num">Est. impact</th><th>Status</th></tr></thead>
        <tbody>
          {ledger.map((r, i) => (
            <tr key={i}>
              <td className="tname">{r.what}</td>
              <td>{new Date(r.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
              <td className="num good">{r.impact > 0 ? '+' + money(r.impact) + '/mo' : '—'}</td>
              <td className="v-dim">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="v-note">local log in this build — measured (not estimated) impact per decision lands with the cron watcher + DB ledger.</p>
    </div>
  )
}

function PoliciesView({ policies }) {
  if (!policies.length) return <p className="loading v-pad">no standing rules yet — dismiss a finding with n and say why.</p>
  return (
    <div className="v-pad">
      <table className="vtable">
        <thead><tr><th>Rule</th><th>Taught</th></tr></thead>
        <tbody>
          {policies.map((p, i) => (
            <tr key={i}><td className="tname">{p.reason}</td><td>{new Date(p.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="v-note">the watcher checks these before proposing. taught rules suppress their finding for good — delete support comes with the DB version.</p>
    </div>
  )
}

/* ══════════ Terminal turns (same grammar as before) ══════════ */

function Turn({ t, selected, onSelect, onApprove, onTeach, onSaveTeach, bare }) {
  if (t.kind === 'sys') return bare ? null : (
    <div className="turn"><div className="gutter"><div className="glyph dimc">·</div><div className="body"><div className="txt dim pre">{t.text}</div></div></div></div>
  )
  if (t.kind === 'you') return bare ? null : (
    <div className="turn"><div className="gutter"><div className="glyph goodc">❯</div><div className="body"><div className="meta"><span className="who">you</span></div><div className="txt strong">{t.text}</div></div></div></div>
  )
  if (t.kind === 'decision') return bare ? null : (
    <div className="turn"><div className="gutter"><div className="glyph purpc">▸</div><div className="body"><div className="meta"><span className="who">ledger</span></div><div className="txt dim">{t.text}</div></div></div></div>
  )
  if (t.kind === 'agent') return bare ? null : (
    <div className="turn"><div className="gutter"><div className="glyph bluec">◆</div><div className="body">
      <div className="meta"><span className="who">agent</span></div>
      {t.pending && <div className="thinkline"><span className="spin" />reading orders · campaigns · BOM margins…</div>}
      {t.error && <div className="txt badc">error: {t.error}</div>}
      {t.text && <div className="txt pre">{t.text}</div>}
      {t.bars && <Bars rows={t.bars} />}
    </div></div></div>
  )
  if (t.kind === 'finding') {
    const f = t.f
    const card = (
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
        {t.status === 'executing' && <div className="actrow"><span className="exec"><span className="spin" />logging decision…</span></div>}
        {t.status === 'teaching' && (
          <div className="actrow">
            <input data-teach="1" autoFocus placeholder="why is this wrong? (enter saves a standing rule)" className="teach"
              onKeyDown={e => { if (e.key === 'Enter') onSaveTeach(e.currentTarget.value) }} />
          </div>
        )}
        {t.status === 'taught' && <div className="actrow"><span className="dim">policy learned: “{t.reason}”</span></div>}
        {t.status === 'done' && <div className="actrow"><span className="goodc" style={{ fontWeight: 700 }}>✓ logged to ledger</span></div>}
      </div>
    )
    if (bare) return <div className="turn">{card}</div>
    return (
      <div className="turn"><div className="gutter"><div className="glyph bluec">◆</div><div className="body">
        <div className="meta"><span className="who">watcher · finding</span></div>{card}
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

function Markdown({ text }) {
  const inline = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p)
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

/* ══════════ IDE CSS ══════════ */
const CSS = `
.ide{--bg:#0b0e14;--panel:#11151f;--panel2:#161b28;--line:rgba(255,255,255,.07);--txt:#dbe1ee;--dim:#8a93a8;--faint:#5a6377;--green:#3fd68f;--red:#f4747f;--amber:#e8b45a;--blue:#6ea8fe;--purple:#a78bfa;
  position:fixed;inset:0;top:var(--mt-top,57px);z-index:30;background:var(--bg);color:var(--txt);font:13px/1.5 "SF Mono",ui-monospace,Menlo,Consolas,monospace;}
.ide-cols{display:flex;height:100%;}
.ide .dim{color:var(--faint);} .ide .good{color:var(--green);} .ide .warn{color:var(--amber);} .ide .bad,.ide .badc{color:var(--red);}
.ide .goodc{color:var(--green);} .ide .bluec{color:var(--blue);} .ide .purpc{color:var(--purple);} .ide .dimc{color:var(--faint);}
.ide .strong{font-weight:700;}

/* explorer */
.ide .explorer{width:218px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;padding-bottom:20px;}
.ide .exp-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;font-weight:800;font-size:12.5px;border-bottom:1px solid var(--line);}
.ide .exp-badge{font-size:9px;font-weight:800;color:var(--green);background:rgba(63,214,143,.12);border-radius:4px;padding:1px 6px;}
.ide .exp-sec{font-size:9.5px;font-weight:800;letter-spacing:.09em;color:var(--faint);padding:14px 14px 4px;}
.ide .exp-item{display:flex;align-items:center;gap:8px;padding:5px 14px;font-size:12.5px;color:var(--dim);cursor:pointer;border-left:2px solid transparent;}
.ide .exp-item:hover{color:var(--txt);background:rgba(255,255,255,.02);}
.ide .exp-item.on{color:var(--txt);background:rgba(110,168,254,.07);border-left-color:var(--blue);}
.ide .exp-ic{width:16px;text-align:center;font-size:11px;}
.ide .exp-n{margin-left:auto;font-size:10px;color:var(--faint);background:var(--panel2);border-radius:99px;padding:0 6px;}
.ide .exp-n.warn{color:var(--amber);background:rgba(232,180,90,.12);font-weight:800;}

/* main column */
.ide .main{flex:1;display:flex;flex-direction:column;min-width:0;}
.ide .tabbar{display:flex;align-items:stretch;background:var(--panel);border-bottom:1px solid var(--line);height:34px;flex-shrink:0;overflow-x:auto;}
.ide .burger{background:none;border:none;color:var(--faint);font:inherit;padding:0 12px;cursor:pointer;border-right:1px solid var(--line);}
.ide .burger:hover{color:var(--txt);}
.ide .tab{display:flex;align-items:center;gap:7px;padding:0 14px;font-size:12px;color:var(--dim);border-right:1px solid var(--line);cursor:pointer;white-space:nowrap;}
.ide .tab.on{color:var(--txt);background:var(--bg);box-shadow:inset 0 2px 0 var(--blue);}
.ide .tab-x{color:var(--faint);font-size:13px;} .ide .tab-x:hover{color:var(--txt);}
.ide .view{flex:1;overflow-y:auto;min-height:0;}
.ide .loading{color:var(--faint);font-size:12.5px;padding:18px;}
.ide .v-pad{padding:18px 22px 26px;}
.ide .v-h{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:20px 0 8px;}
.ide .v-note{color:var(--faint);font-size:11px;margin-top:12px;}
.ide .v-dim{color:var(--faint);font-size:11px;}

/* kpis */
.ide .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;}
.ide .kpis.three{grid-template-columns:repeat(3,1fr);}
.ide .kpi{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:10px 13px;}
.ide .kl{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);}
.ide .kv{font-size:18px;font-weight:800;margin-top:2px;}

/* view tables */
.ide .vtable{width:100%;border-collapse:collapse;font-size:12.5px;}
.ide .vtable th{text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);padding:7px 10px;border-bottom:1px solid var(--line);font-weight:700;}
.ide .vtable td{padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);color:var(--dim);}
.ide .vtable .tname{color:var(--txt);font-weight:600;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .vtable th.num,.ide .vtable td.num{text-align:right;font-variant-numeric:tabular-nums;}
.ide .pill{font-size:9.5px;font-weight:800;border-radius:99px;padding:1px 8px;}
.ide .pill.ok{background:rgba(63,214,143,.12);color:var(--green);}
.ide .pill.dead{background:rgba(255,255,255,.07);color:var(--faint);}

/* daily spark */
.ide .spark{display:flex;align-items:flex-end;gap:2px;height:90px;max-width:900px;}
.ide .sp-col{flex:1;height:100%;display:flex;align-items:flex-end;}
.ide .sp-col i{display:block;width:100%;background:rgba(110,168,254,.55);border-radius:2px 2px 0 0;min-height:2px;}
.ide .sp-col:hover i{background:var(--blue);}

/* panel */
.ide .panel{height:34vh;min-height:180px;border-top:1px solid var(--line);background:var(--bg);display:flex;flex-direction:column;flex-shrink:0;}
.ide .panel-tabs{display:flex;gap:2px;align-items:center;background:var(--panel);border-bottom:1px solid var(--line);padding:0 10px;height:30px;font-size:10.5px;font-weight:800;letter-spacing:.06em;flex-shrink:0;}
.ide .panel-tabs span{padding:0 10px;color:var(--faint);cursor:pointer;line-height:30px;}
.ide .panel-tabs span.on{color:var(--txt);box-shadow:inset 0 -2px 0 var(--blue);}
.ide .panel-x{margin-left:auto;}
.ide .stream{flex:1;overflow-y:auto;padding:12px 16px;}
.ide .turn{margin-bottom:11px;animation:ideup .15s ease;}
@keyframes ideup{from{opacity:0;transform:translateY(3px);}to{opacity:1;transform:none;}}
.ide .gutter{display:flex;gap:9px;}
.ide .glyph{width:20px;flex-shrink:0;text-align:center;font-weight:700;}
.ide .body{flex:1;min-width:0;}
.ide .meta{font-size:10px;color:var(--faint);margin-bottom:1px;}
.ide .who{font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
.ide .txt{color:var(--txt);font-size:12.5px;} .ide .txt.dim{color:var(--dim);}
.ide .pre{white-space:pre-wrap;}
.ide .thinkline{color:var(--faint);font-size:11px;display:flex;gap:7px;align-items:center;}
.ide .spin{width:8px;height:8px;border-radius:50%;border:2px solid var(--blue);border-top-color:transparent;animation:iderot .6s linear infinite;display:inline-block;flex-shrink:0;}
@keyframes iderot{to{transform:rotate(360deg);}}

/* finding cards */
.ide .card{border:1px solid var(--line);border-left:3px solid var(--amber);border-radius:7px;background:var(--panel);margin-top:3px;}
.ide .card.hot{border-left-color:var(--red);}
.ide .card.sel{border-color:var(--blue);border-left-color:var(--blue);box-shadow:0 0 0 1px rgba(110,168,254,.25);}
.ide .card.done{opacity:.55;border-left-color:var(--green);}
.ide .card.killed{opacity:.45;border-left-color:var(--faint);}
.ide .card-h{display:flex;gap:8px;align-items:baseline;padding:8px 12px 0;}
.ide .card-h .t{font-weight:700;font-size:12.5px;flex:1;}
.ide .sev{font-size:9px;font-weight:800;letter-spacing:.06em;padding:1px 7px;border-radius:99px;flex-shrink:0;}
.ide .sev.shot{background:rgba(244,116,127,.13);color:var(--red);}
.ide .sev.swarm{background:rgba(232,180,90,.13);color:var(--amber);}
.ide .sev.sok{background:rgba(63,214,143,.13);color:var(--green);}
.ide .sev.sdead{background:rgba(255,255,255,.07);color:var(--faint);}
.ide .why{padding:4px 12px 0;color:var(--dim);font-size:12px;line-height:1.5;}
.ide .evrow{display:flex;gap:11px;padding:6px 12px 8px;font-size:10.5px;color:var(--faint);flex-wrap:wrap;}
.ide .evrow .imp{color:var(--green);font-weight:700;}
.ide .actrow{display:flex;gap:8px;align-items:center;border-top:1px dashed var(--line);padding:7px 12px;font-size:11px;color:var(--faint);flex-wrap:wrap;}
.ide .exec{color:var(--blue);display:flex;gap:7px;align-items:center;}
.ide .kbd{font-size:10px;color:var(--faint);border:1px solid var(--line);border-radius:4px;padding:1px 5px;background:var(--panel2);}
.ide .kbd.act{cursor:pointer;} .ide .kbd.act:hover{color:var(--txt);border-color:var(--dim);}
.ide .teach{flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:11px;padding:5px 9px;outline:none;}
.ide .teach:focus{border-color:rgba(110,168,254,.5);}

/* bars */
.ide .bars{margin:7px 0 2px;max-width:620px;}
.ide .brow{display:flex;align-items:center;gap:9px;margin:3px 0;font-size:12px;}
.ide .brow.wide{max-width:900px;}
.ide .brow .bl{width:190px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;flex-shrink:0;}
.ide .brow .btrack{flex:1;height:9px;background:var(--panel2);border-radius:3px;overflow:hidden;}
.ide .brow .btrack i{display:block;height:100%;border-radius:3px;}
.ide .brow .bv{width:80px;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;}
.ide .brow .bnote{width:200px;font-size:10.5px;color:var(--faint);text-align:right;flex-shrink:0;}

/* prompt */
.ide .prompt{display:flex;gap:9px;align-items:center;border-top:1px solid var(--line);background:var(--panel);padding:8px 14px;flex-shrink:0;}
.ide .ps{color:var(--green);font-weight:800;}
.ide .prompt input{flex:1;background:transparent;border:none;outline:none;color:var(--txt);font:inherit;}

/* status bar */
.ide .statusbar{display:flex;align-items:center;border-top:1px solid var(--line);background:var(--panel);padding:0 10px;height:30px;font-size:11px;flex-shrink:0;overflow-x:auto;white-space:nowrap;}
.ide .seg{padding:0 10px;border-right:1px solid var(--line);display:flex;gap:6px;align-items:center;height:100%;}
.ide .seg.last{border-right:none;gap:6px;}
.ide .seg.probs{cursor:pointer;}
.ide .sel-range select{background:var(--panel2);border:1px solid var(--line);color:var(--txt);font:inherit;font-size:11px;border-radius:5px;padding:1px 5px;outline:none;cursor:pointer;}
.ide .pulse{width:6px;height:6px;border-radius:50%;background:var(--green);animation:idepu 2s infinite;}
@keyframes idepu{50%{opacity:.3;}}
.ide .spacer{flex:1;}
.ide .helpbtn{width:20px;height:20px;border-radius:5px;border:1px solid var(--line);background:var(--panel2);color:var(--dim);font:inherit;font-size:11px;font-weight:800;cursor:pointer;}
.ide .helpbtn:hover{color:var(--txt);}

/* manual in a tab */
.ide .man-body.wide{max-width:760px;padding:6px 26px 30px;font-size:12.5px;line-height:1.65;color:var(--dim);}
.ide .man-body h3{color:var(--txt);font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin:18px 0 6px;}
.ide .man-body p{margin:7px 0;}
.ide .man-body ul{margin:7px 0 7px 18px;}
.ide .man-body li{margin:4px 0;}
.ide .man-body b{color:var(--txt);}

/* palette */
.ide .palette{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;z-index:70;}
.ide .pal{width:520px;max-width:92vw;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6);}
.ide .pal input{width:100%;background:var(--panel2);border:none;outline:none;color:var(--txt);font:inherit;padding:13px 16px;border-bottom:1px solid var(--line);}
.ide .pal .it{padding:10px 16px;display:flex;gap:10px;align-items:baseline;cursor:pointer;font-size:12.5px;}
.ide .pal .it:hover{background:rgba(110,168,254,.08);}
.ide .pal .it .d{color:var(--faint);font-size:11px;margin-left:auto;}
.ide ::-webkit-scrollbar{width:10px;height:10px;} .ide ::-webkit-scrollbar-thumb{background:var(--panel2);border-radius:5px;}
`
