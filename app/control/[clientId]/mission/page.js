'use client'

// The Business IDE — VS Code's shape, adapted for running an ecom company.
// Explorer (left) = the client's surfaces as a tree. Tabs (top) = open views.
// Panel (lower third) = TERMINAL (the mission session) + PROBLEMS (the queue).
// Status bar = live KPIs. One persistent session survives tab switches and
// knows which view you're looking at. Approvals still log locally — no
// platform writes in this build.

import { useParams, useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchMissionData, computeMission, askContext, resolveRange, RANGE_PRESETS, rowToFinding } from '../../../../lib/mission/data'
import { MANUAL } from '../../../../lib/mission/manual'
import { buildCsv, docCounts } from '../../../../lib/google-ads-csv'
import { supabase } from '../../../../lib/supabase'
import { deriveChannel } from '../../../../lib/channels'

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
  ['/range 7|30|90|this_month|…', 'change the date window'],
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
  { section: 'BUILD', items: [
    { id: 'campaign', icon: '🎯', label: 'Campaign Builder' },
  ]},
  { section: 'RECORDS', items: [
    { id: 'pnl_history', icon: '📒', label: 'Daily P&L History' },
  ]},
  { section: 'DOCS', items: [
    { id: 'manual', icon: '📖', label: 'Manual' },
    { id: 'ledger', icon: '🧾', label: 'Ledger' },
    { id: 'policies', icon: '🛡', label: 'Policies' },
    { id: 'memory', icon: '🧠', label: 'Memory' },
  ]},
]
const VIEW_TITLES = { overview: 'Overview', google: 'Google Ads', meta: 'Meta Ads', orders: 'Orders', klaviyo: 'Klaviyo', campaign: 'Campaign Builder', pnl_history: 'Daily P&L History', manual: 'Manual', ledger: 'Ledger', policies: 'Policies', memory: 'Memory' }

// APPS — the rest of the control center, reachable without leaving the IDE
// chrome. These navigate to the classic pages (the old nav is gone on /mission).
const APPS = [
  { key: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { key: 'command-hub', icon: '🕹', label: 'Command Hub', only: 'ch069' },
  { key: 'projection', icon: '📽', label: 'Projection', only: 'ch069' },
  { key: 'paid-ads', icon: '📣', label: 'Paid Ads' },
  { key: 'funnels', icon: '🧲', label: 'Funnels' },
  { key: 'videos', icon: '🎬', label: 'Videos' },
  { key: 'contacts', icon: '👥', label: 'Customers' },
  { key: 'calendar', icon: '📅', label: 'Calendar' },
  { key: 'manufacturing', icon: '🏭', label: 'Manufacturing' },
  { key: 'company', icon: '🏢', label: 'Company' },
  { key: 'automations', icon: '⚡', label: 'Automations' },
  { key: 'billing', icon: '💳', label: 'Billing' },
]

export default function BusinessIDE() {
  const { clientId } = useParams()
  const router = useRouter()
  const apps = useMemo(() => APPS.filter(a => !a.only || a.only === clientId), [clientId])
  const [rangeKey, setRangeKey] = useState('30d')
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [data, setData] = useState(null)
  const [turns, setTurns] = useState([])
  const [selId, setSelId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [palOpen, setPalOpen] = useState(false)
  const [palQ, setPalQ] = useState('')
  const [tabs, setTabs] = useState(['overview'])
  const [activeTab, setActiveTab] = useState('overview')
  const [splitTab, setSplitTab] = useState(null)   // second editor pane (or null)
  const [splitPct, setSplitPct] = useState(45)     // right pane width %
  const [qpOpen, setQpOpen] = useState(false)      // ⌘P quick-open
  const [qpQ, setQpQ] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState('terminal') // 'terminal' | 'problems'
  const [sideOpen, setSideOpen] = useState(true)
  // Resizable panes — drag the dividers like a real IDE; sizes persist.
  const [sideW, setSideW] = useState(218)
  const [panelH, setPanelH] = useState(300)
  const dragRef = useRef(null) // {type:'side'|'panel'}
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem('ide_sideW')); if (w >= 140 && w <= 480) setSideW(w)
      const h = Number(localStorage.getItem('ide_panelH')); if (h >= 120 && h <= window.innerHeight - 220) setPanelH(h)
      else setPanelH(Math.round(window.innerHeight * 0.34))
      const sp = Number(localStorage.getItem('ide_splitPct')); if (sp >= 20 && sp <= 70) setSplitPct(sp)
    } catch { /* defaults */ }
  }, [])
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      if (d.type === 'side') {
        const w = Math.min(480, Math.max(140, e.clientX))
        setSideW(w); localStorage.setItem('ide_sideW', String(w))
      } else if (d.type === 'vsplit') {
        const pct = Math.min(70, Math.max(20, (window.innerWidth - e.clientX) / window.innerWidth * 100))
        setSplitPct(pct); localStorage.setItem('ide_splitPct', String(Math.round(pct)))
      } else {
        const h = Math.min(window.innerHeight - 220, Math.max(120, window.innerHeight - e.clientY - 30))
        setPanelH(h); localStorage.setItem('ide_panelH', String(h))
      }
    }
    const up = () => {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [])
  const startDrag = (type) => (e) => {
    e.preventDefault()
    dragRef.current = { type }
    document.body.style.cursor = type === 'panel' ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const inputRef = useRef(null)
  const endRef = useRef(null)
  const histRef = useRef([])
  const bootedRef = useRef(false)

  // Server-backed state: findings (PROBLEMS), decisions (Ledger), taught
  // policies — all live in Supabase now, refreshed by the daily cron watcher
  // AND on every page load (refresh=1 re-runs the watcher server-side).
  const [srvFindings, setSrvFindings] = useState(null) // null = loading
  const [ledger, setLedger] = useState([])
  const [policies, setPolicies] = useState([])
  const [leversMode, setLeversMode] = useState('dry_run')
  const [viewer, setViewer] = useState(null) // { role, queries } — who the asker is here
  const [memories, setMemories] = useState([]) // agent's durable memory for this client

  // Pinned views — any agent-rendered chart/table saved as a "file" in the
  // explorer. Local to this browser (specs are snapshots; re-ask re-runs).
  const [pins, setPins] = useState([])
  useEffect(() => {
    try { setPins(JSON.parse(localStorage.getItem(`ide_pins_${clientId}`) || '[]')) } catch { /* fresh */ }
  }, [clientId])
  const savePins = (next) => { setPins(next); localStorage.setItem(`ide_pins_${clientId}`, JSON.stringify(next)) }

  // Campaign Builder sheet — a Google Ads doc the agent drafts via build_campaign
  // and the user exports as a Google Ads Editor CSV. Local + persisted per client.
  const [campaignDoc, setCampaignDoc] = useState({ campaigns: [] })
  useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem(`ide_campaigns_${clientId}`) || 'null'); if (d?.campaigns) setCampaignDoc(d) } catch { /* fresh */ }
  }, [clientId])
  const saveCampaignDoc = useCallback((next) => {
    setCampaignDoc(next)
    try { localStorage.setItem(`ide_campaigns_${clientId}`, JSON.stringify(next)) } catch { /* quota */ }
  }, [clientId])

  // Meta (Facebook/Instagram) campaigns — different object model from Google
  // (objective → ad set → creative, no keywords). Own doc + persistence.
  const [metaDoc, setMetaDoc] = useState({ campaigns: [] })
  useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem(`ide_meta_${clientId}`) || 'null'); if (d?.campaigns) setMetaDoc(d) } catch { /* fresh */ }
  }, [clientId])
  const saveMetaDoc = useCallback((next) => {
    setMetaDoc(next)
    try { localStorage.setItem(`ide_meta_${clientId}`, JSON.stringify(next)) } catch { /* quota */ }
  }, [clientId])

  const range = useMemo(() => resolveRange(rangeKey, customRange.start, customRange.end), [rangeKey, customRange])
  const rangeN = range.days      // day count — server lookback + drill sub-notes
  const rangeLabel = range.label // human label — user-facing "This Month", etc.
  // Numeric-day → preset-key helper for the /range command and the agent tool.
  const daysToKey = (n) => ({ 7: '7d', 14: '14d', 30: '30d', 90: '90d' })[n]
  // Cost-per-label override: edited inline, saved to client settings, applied
  // to the P&L immediately (no reload) by injecting into computeMission.
  const [labelOverride, setLabelOverride] = useState(null)
  const m = useMemo(() => {
    if (!data) return null
    const costPerLabel = labelOverride != null ? labelOverride : data.pnlConfig?.costPerLabel
    return computeMission({ ...data, pnlConfig: { ...data.pnlConfig, costPerLabel } })
  }, [data, labelOverride])
  const isAgencyRole = viewer?.role?.startsWith('agency')
  const saveCostPerLabel = useCallback(async (v) => {
    const val = Math.max(0, Number(v) || 0)
    setLabelOverride(val) // optimistic — P&L updates instantly
    try {
      await fetch('/api/client-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, settings: { cost_per_label: val } }) })
    } catch { /* stays applied locally; next load re-reads */ }
  }, [clientId])

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

  // Chart drill-down — clicking a point/bar in an agent-rendered chart opens
  // the Orders tab pre-filtered to that label (channel, date, order #…).
  const [ordersQ, setOrdersQ] = useState('')
  const drill = useCallback((label) => {
    setOrdersQ(String(label ?? '').trim())
    openTab('orders')
  }, [openTab])

  /* ── data load + boot ── */
  useEffect(() => {
    let alive = true
    bootedRef.current = false
    setTurns([]); setSelId(null); setSrvFindings(null)
    push({ kind: 'sys', text: `loading ${rangeLabel} of ${clientId} — orders, campaigns, BOM margins · running the watcher server-side…` })
    fetchMissionData(clientId, range.start, range.end)
      .then(d => { if (alive) setData(d) })
      .catch(e => push({ kind: 'sys', text: 'load failed: ' + e.message }))
    fetch(`/api/mission/state?client_id=${clientId}&refresh=1&days=${Math.min(90, rangeN)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(s => {
        if (!alive) return
        setSrvFindings(s.findings || [])
        setLedger(s.decisions || [])
        setPolicies(s.policies || [])
        setLeversMode(s.levers_mode || 'dry_run')
        setViewer(s.viewer || null)
        setMemories(s.memories || [])
        if (s.refreshError) push({ kind: 'sys', text: 'watcher refresh hiccup (showing last-known state): ' + s.refreshError })
      })
      .catch(e => { if (alive) { setSrvFindings([]); push({ kind: 'sys', text: 'state load failed: ' + e.message }) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range.start, range.end])

  useEffect(() => {
    if (!m || !data || srvFindings === null || bootedRef.current) return
    bootedRef.current = true
    const findings = srvFindings.map(rowToFinding)
    setTurns([{ id: tid(), kind: 'sys', text: `session start · ${data.clientName} · ${rangeLabel} — ${m.orders} orders, ${m.campaigns.length} campaigns, ${m.hasCogs ? 'BOM margins live (' + (m.margin * 100).toFixed(1) + '%)' : 'no BOM data'} · levers: ${leversMode} · findings + decisions now persist in the database (cron watcher runs daily).` }])
    let firstId = null
    for (const f of findings) {
      const id = tid()
      if (!firstId) firstId = id
      setTurns(t => [...t, { id, kind: 'finding', f, status: 'open' }])
    }
    setSelId(firstId)
    setTurns(t => [...t, { id: tid(), kind: 'sys', text: (findings.length ? `${findings.length} in PROBLEMS · y approves the selected card · j/k moves.` : 'no problems — every live campaign clears breakeven.') + ' press ? for the manual · ctrl+\` toggles this panel.' }])
    inputRef.current?.focus()
  }, [m, data, srvFindings, rangeN, rangeLabel, leversMode])

  /* ── decisions ── */
  const findingTurns = turns.filter(t => t.kind === 'finding')
  const openTurns = findingTurns.filter(t => t.status === 'open')

  const decide = useCallback(async (payload) => {
    const res = await fetch('/api/mission/decide', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, ...payload }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'decide failed')
    return json
  }, [clientId])

  const approve = useCallback(async (t) => {
    if (t.status !== 'open') return
    patch(t.id, { status: 'executing' })
    try {
      const json = await decide({ action: 'approve', finding_key: t.f.id })
      patch(t.id, { status: 'done' })
      setLedger(l => [json.decision, ...l])
      const ex = json.execution || {}
      const exNote = ex.executed
        ? `LIVE — executed on ${ex.platform} (rollback info recorded)`
        : ex.request ? `dry run — exact ${ex.platform} request built & recorded, NOT sent`
        : ex.note || 'logged'
      push({ kind: 'decision', text: `APPROVED ${json.decision.what}${t.f.impactMonthly > 0 ? ` — ~${money(t.f.impactMonthly)}/mo est.` : ''} · ${exNote} · measured impact lands in ~7 days.` })
      const next = openTurns.find(x => x.id !== t.id)
      if (next) setSelId(next.id)
    } catch (e) {
      patch(t.id, { status: 'open' })
      push({ kind: 'sys', text: 'approve failed: ' + e.message })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, push, openTurns, decide])

  // Undo: revert a ledger decision — the finding reopens in PROBLEMS.
  const undoDecision = useCallback(async (row) => {
    if (!row || row.status === 'reverted') return false
    try {
      const json = await decide({ action: 'undo', decision_id: row.id })
      setLedger(l => l.map(x => x.id === row.id ? { ...x, status: 'reverted' } : x))
      const f = rowToFinding(json.finding)
      const id = tid()
      setTurns(t => [...t, { id, kind: 'finding', f, status: 'open' },
        { id: tid(), kind: 'decision', text: `REVERTED “${row.what}” — reopened in PROBLEMS.${row.execution?.executed ? ' ⚠ the lever ran LIVE on the platform — reversing that is manual; rollback details are stored on the decision.' : ''}` }])
      setSelId(id)
      setPanelOpen(true)
      return true
    } catch (e) {
      push({ kind: 'sys', text: 'undo failed: ' + e.message })
      return false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decide, push])

  const startTeach = useCallback((t) => { if (t.status === 'open') patch(t.id, { status: 'teaching' }) }, [patch])
  const saveTeach = useCallback(async (t, reason) => {
    const why = (reason || '').trim() || 'no reason given'
    patch(t.id, { status: 'taught', reason: why })
    try {
      const json = await decide({ action: 'dismiss', finding_key: t.f.id, reason: why })
      setPolicies(p => [json.policy, ...p])
      push({ kind: 'decision', text: `TAUGHT “${why}” — standing rule saved to the database; the watcher (including the nightly cron) checks it before proposing.` })
    } catch (e) {
      patch(t.id, { status: 'open' })
      push({ kind: 'sys', text: 'teach failed: ' + e.message })
    }
    const next = openTurns.find(x => x.id !== t.id)
    if (next) setSelId(next.id)
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, push, openTurns, decide])

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.dataset?.teach === '1') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalOpen(o => !o); setPalQ(''); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); setQpOpen(o => !o); setQpQ(''); return }
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); setPanelOpen(o => !o); return }
      if (e.key === 'Escape') { setPalOpen(false); setQpOpen(false); inputRef.current?.focus(); return }
      const typing = (e.target.tagName === 'INPUT' && e.target.value !== '')
      if (!typing && !palOpen && !qpOpen && e.key === '?') { e.preventDefault(); openTab('manual'); return }
      if (typing || palOpen || qpOpen) return
      const idx = openTurns.findIndex(t => t.id === selId)
      if (e.key === 'j') { e.preventDefault(); const n = openTurns[Math.min(openTurns.length - 1, Math.max(0, idx + 1))]; if (n) setSelId(n.id) }
      else if (e.key === 'k') { e.preventDefault(); const n = openTurns[Math.max(0, idx - 1)]; if (n) setSelId(n.id) }
      else if (e.key === 'y') { e.preventDefault(); const t = openTurns[idx]; if (t) approve(t) }
      else if (e.key === 'n') { e.preventDefault(); const t = openTurns[idx]; if (t) startTeach(t) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openTurns, selId, approve, startTeach, palOpen, qpOpen, openTab])

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
      const arg = lower.split(/\s+/)[1] || ''
      const key = daysToKey(Number(arg)) || (RANGE_PRESETS.some(p => p[0] === arg) ? arg : null)
      if (key) setRangeKey(key); else push({ kind: 'sys', text: `usage: /range <days: 7|14|30|90> or <preset: ${RANGE_PRESETS.map(p => p[0]).join(' | ')}>` })
      return
    }
    if (lower === '/help') { push({ kind: 'sys', text: PALETTE_CMDS.map(([c, d]) => `${c} — ${d}`).join('\n') }); return }
    if (lower === '/ledger') { openTab('ledger'); push({ kind: 'sys', text: `opened the Ledger tab — ${ledger.length} decisions.` }); return }
    if (lower === '/policies') { openTab('policies'); push({ kind: 'sys', text: `opened the Policies tab — ${policies.length} standing rules.` }); return }
    if (lower === '/campaigns') {
      const rows = m.campaigns.filter(c => c.spend > 0)
      push({ kind: 'agent', text: `True ROAS per campaign (breakeven 1.00x on real BOM margin) · ${rangeLabel}:`,
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
        action: { kind: 'pause_campaign', ledger: `Pause ${c.campaign_name} on ${c.platform}`, platform: c.platform, campaign_id: c.campaign_id },
      } : {
        id: `cmd-scale-${c.campaign_id}`, severity: 'medium', icon: '📈',
        title: `Scale ${c.campaign_name} (${c.platform}) +20% (${money(c.spendPerDay)} → ${money(c.spendPerDay * 1.2)}/day)`,
        why: `True ROAS ${c.trueRoas.toFixed(2)}x — each added $1 returns $${c.trueRoas.toFixed(2)} contribution after BOM COGS, before scaling decay. Revert point saved.`,
        impactMonthly: c.spendPerDay * 0.2 * 30 * (c.trueRoas - 1) * 0.7, confidence: 'medium',
        evidence: [`${c.chOrders} attributed orders`, `${money(c.spend)} over ${c.days} days`],
        action: { kind: 'scale_campaign', ledger: `Scale ${c.campaign_name} +20%`, platform: c.platform, campaign_id: c.campaign_id },
      }
      try {
        await decide({ action: 'draft', finding: f })  // persist so approve/undo work server-side
        const id = tid()
        setTurns(t => [...t, { id, kind: 'finding', f, status: 'open' }])
        setSelId(id)
      } catch (e) { push({ kind: 'sys', text: 'draft failed: ' + e.message }) }
      return
    }

    // free text → Claude, grounded + aware of the active tab, ledger, and queue
    setBusy(true)
    const agentId = tid()
    setTurns(t => [...t, { id: agentId, kind: 'agent', pending: true, text: '' }])
    try {
      const ctx = {
        ...askContext(data.clientName, m, range),
        clientId,
        active_view: VIEW_TITLES[activeTab] || activeTab,
        open_problems: openTurns.map(t => t.f.title),
        recent_decisions: ledger.slice(0, 10).map((r, i) => ({ index: i, decision: r.what, when: (r.approved_at || '').slice(0, 10), status: r.status, measured_delta_monthly: r.measured?.delta_monthly ?? null })),
        taught_policies: policies.slice(0, 10).map(p => p.reason),
      }
      const res = await fetch('/api/mission/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context: ctx, history: histRef.current }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'ask failed')
      histRef.current = [...histRef.current, { q, a: json.answer || '[took a UI action]' }].slice(-6)
      patch(agentId, { pending: false, text: json.answer })

      // Execute the agent's UI-only actions, narrating each as a sys turn.
      for (const a of (json.actions || [])) {
        if (a.name === 'open_tab' && VIEW_TITLES[a.input?.view]) {
          openTab(a.input.view)
          push({ kind: 'sys', text: `agent action · opened the ${VIEW_TITLES[a.input.view]} tab` })
        } else if (a.name === 'set_range' && (daysToKey(a.input?.days) || RANGE_PRESETS.some(p => p[0] === a.input?.preset))) {
          const key = a.input?.preset && RANGE_PRESETS.some(p => p[0] === a.input.preset) ? a.input.preset : daysToKey(a.input.days)
          push({ kind: 'sys', text: `agent action · switching range to ${(RANGE_PRESETS.find(p => p[0] === key) || [])[1] || key}` })
          setRangeKey(key)
        } else if (a.name === 'reopen_decision') {
          const match = (a.input?.match || '').toLowerCase()
          const pool = ledger.filter(r => r.status !== 'reverted')
          const row = match ? pool.find(r => r.what.toLowerCase().includes(match)) : pool[0]
          if (!row) push({ kind: 'sys', text: `agent action · couldn't find an active ledger decision${match ? ` matching “${a.input?.match}”` : ''}` })
          else if (await undoDecision(row)) push({ kind: 'sys', text: `agent action · reopened “${row.what}” into PROBLEMS` })
        } else if (a.name === 'draft_finding' && a.input?.title && a.input?.why) {
          const f = {
            id: `agent-${tid()}`, severity: a.input.severity === 'high' ? 'high' : 'medium', icon: '🤖',
            title: a.input.title, why: a.input.why,
            impactMonthly: Number(a.input.impact_monthly) || 0, confidence: 'medium',
            evidence: ['drafted by the agent in this session'],
            action: { ledger: a.input.title },
          }
          try {
            await decide({ action: 'draft', finding: f })
            const id = tid()
            setTurns(t => [...t, { id, kind: 'finding', f, status: 'open' }])
            setSelId(id)
            push({ kind: 'sys', text: `agent action · drafted “${a.input.title}” into PROBLEMS (saved) — y approves, n dismisses` })
          } catch (e) { push({ kind: 'sys', text: 'agent draft failed: ' + e.message }) }
        } else if (a.name === 'render_view' && a.input?.type && a.input?.title) {
          setTurns(t => [...t, { id: tid(), kind: 'render', spec: a.input, question: q }])
        } else if (a.name === 'build_campaign' && Array.isArray(a.input?.campaigns)) {
          // Normalize the agent's shape → the CSV doc shape (headlines/
          // descriptions arrive as string[], the builder wants [{text}]).
          const norm = a.input.campaigns.map(c => ({
            name: c.name || 'Untitled campaign',
            status: c.status || 'Paused',
            bidStrategy: c.bidStrategy || 'Maximize conversions',
            adGroups: (c.adGroups || []).map(g => ({
              name: g.name || 'Ad group',
              keywords: (g.keywords || []).map(k => ({ text: k.text, matchType: k.matchType || 'Broad' })),
              ads: (g.ads || []).map(ad => ({
                adType: 'Responsive search ad',
                headlines: (ad.headlines || []).map(h => ({ text: typeof h === 'string' ? h : h?.text })),
                descriptions: (ad.descriptions || []).map(d => ({ text: typeof d === 'string' ? d : d?.text })),
                path1: ad.path1 || '', path2: ad.path2 || '', finalUrl: ad.finalUrl || '',
              })),
            })),
          }))
          saveCampaignDoc({ campaigns: [...campaignDoc.campaigns, ...norm] })
          openTab('campaign')
          const c = docCounts({ campaigns: norm })
          push({ kind: 'sys', text: `agent action · drafted ${c.campaigns} Google campaign${c.campaigns !== 1 ? 's' : ''} (${c.adGroups} ad groups · ${c.keywords} keywords · ${c.ads} ads) into the Campaign Builder — review, then export the Google Ads Editor CSV.` })
        } else if (a.name === 'build_meta_campaign' && Array.isArray(a.input?.campaigns)) {
          const norm = a.input.campaigns.map(c => ({
            name: c.name || 'Untitled campaign', objective: c.objective || 'OUTCOME_SALES',
            status: c.status || 'Paused', dailyBudget: Number(c.dailyBudget) || null,
            adSets: (c.adSets || []).map(s => ({
              name: s.name || 'Ad set', optimizationGoal: s.optimizationGoal || 'OFFSITE_CONVERSIONS',
              audience: s.audience || {}, placements: s.placements || 'Automatic',
              ads: (s.ads || []).map(ad => ({
                name: ad.name || 'Ad', primaryText: ad.primaryText || '', headline: ad.headline || '',
                description: ad.description || '', finalUrl: ad.finalUrl || '', creativeNote: ad.creativeNote || '',
              })),
            })),
          }))
          saveMetaDoc({ campaigns: [...metaDoc.campaigns, ...norm] })
          openTab('campaign')
          const nSets = norm.reduce((n, c) => n + (c.adSets || []).length, 0)
          const nAds = norm.reduce((n, c) => n + (c.adSets || []).reduce((m, s) => m + (s.ads || []).length, 0), 0)
          push({ kind: 'sys', text: `agent action · drafted ${norm.length} Meta campaign${norm.length !== 1 ? 's' : ''} (${nSets} ad sets · ${nAds} ads) into the Campaign Builder — review the audience + copy; pushing to Meta comes once ads_management is authed.` })
        } else if (a.name === 'remember' && a.input?.content) {
          // Already saved server-side; reflect it locally + note it.
          setMemories(prev => [{ id: 'local-' + tid(), content: a.input.content, kind: a.input.kind || 'insight', source: a.input.source || null, created_at: new Date().toISOString() }, ...prev])
          push({ kind: 'sys', text: `agent action · remembered “${a.input.content}” — it's in the Memory tab now.` })
        } else {
          push({ kind: 'sys', text: `agent action · ${a.name} — unknown or invalid input, skipped` })
        }
      }
    } catch (e) {
      patch(agentId, { pending: false, text: '', error: e.message })
    } finally { setBusy(false); inputRef.current?.focus() }
  }, [busy, m, data, range, rangeLabel, ledger, policies, openTurns, turns, activeTab, push, patch, openTab, undoDecision, decide, clientId, campaignDoc, saveCampaignDoc, metaDoc, saveMetaDoc])

  const pinView = useCallback((spec, question) => {
    const id = 'p' + Date.now().toString(36)
    savePins([...pins, { id, title: spec.title || 'Pinned view', spec, question, when: new Date().toISOString() }])
    openTab('pin:' + id)
    push({ kind: 'sys', text: `pinned “${spec.title}” — it's a file in the explorer now (PINNED section).` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, openTab, push])
  const unpin = useCallback((id) => {
    savePins(pins.filter(p => p.id !== id))
    closeTab('pin:' + id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, closeTab])
  const tabTitle = useCallback((id) => {
    if (id.startsWith('pin:')) return '📌 ' + (pins.find(p => 'pin:' + p.id === id)?.title || 'Pinned').slice(0, 24)
    return VIEW_TITLES[id] || id
  }, [pins])

  const palItems = PALETTE_CMDS.filter(([c, d]) => (c + d).includes(palQ.toLowerCase()))
  const problems = openTurns

  return (
    <div className="ide">
      <style>{CSS}</style>

      <div className="ide-cols">
        {/* ── Explorer ── */}
        {sideOpen && (
          <div className="explorer" style={{ width: sideW }}>
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
            {pins.length > 0 && <>
              <div className="exp-sec">PINNED</div>
              {pins.map(p => (
                <div key={p.id} className={`exp-item ${activeTab === 'pin:' + p.id ? 'on' : ''}`} onClick={() => openTab('pin:' + p.id)}>
                  <span className="exp-ic">📌</span><span className="exp-trunc">{p.title}</span>
                </div>
              ))}
            </>}
            <div className="exp-sec">APPS</div>
            {apps.map(a => (
              <div key={a.key} className="exp-item" onClick={() => router.push(`/control/${clientId}/${a.key}`)}>
                <span className="exp-ic">{a.icon}</span>{a.label}
                <span className="exp-n">↗</span>
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

        {sideOpen && <div className="resize-h" onMouseDown={startDrag('side')} title="drag to resize" />}

        {/* ── Right column: tabs / view / panel ── */}
        <div className="main">
          <div className="tabbar">
            <button className="burger" onClick={() => setSideOpen(o => !o)} title="Toggle explorer">☰</button>
            {tabs.map(id => (
              <div key={id} className={`tab ${activeTab === id ? 'on' : ''}`} onClick={() => setActiveTab(id)}>
                {tabTitle(id)}
                {tabs.length > 1 && <span className="tab-x" onClick={e => { e.stopPropagation(); closeTab(id) }}>×</span>}
              </div>
            ))}
            <div className="tab-spacer" />
            <button className={`burger ${splitTab ? 'on-btn' : ''}`} title="split editor (side by side)"
              onClick={() => setSplitTab(s => s ? null : (tabs.find(t => t !== activeTab) || activeTab))}>⫿</button>
          </div>

          <div className={`view-row ${splitTab ? 'issplit' : ''}`}>
            <div className="view" style={splitTab ? { width: `${100 - splitPct}%` } : undefined}>
              <ViewBody id={activeTab} m={m} data={data} rangeN={rangeN} rangeLabel={rangeLabel} ledger={ledger} policies={policies} pins={pins}
                ordersQ={ordersQ} setOrdersQ={setOrdersQ} onDrill={drill}
                campaignDoc={campaignDoc} onSaveCampaigns={saveCampaignDoc} metaDoc={metaDoc} onSaveMeta={saveMetaDoc} clientName={data?.clientName || clientId} memories={memories} canEditLabel={isAgencyRole} onSaveLabel={saveCostPerLabel}
                onUndo={undoDecision} onUnpin={unpin} onReask={(q) => { setPanelOpen(true); setPanelTab('terminal'); ask(q) }} />
            </div>
            {splitTab && <>
              <div className="resize-h" onMouseDown={startDrag('vsplit')} title="drag to resize" />
              <div className="view split" style={{ width: `${splitPct}%` }}>
                <div className="split-head">
                  <select value={splitTab} onChange={e => setSplitTab(e.target.value)}>
                    {tabs.map(id => <option key={id} value={id}>{tabTitle(id)}</option>)}
                  </select>
                  <button className="tt-btn" onClick={() => setSplitTab(null)}>✕</button>
                </div>
                <ViewBody id={splitTab} m={m} data={data} rangeN={rangeN} rangeLabel={rangeLabel} ledger={ledger} policies={policies} pins={pins}
                  ordersQ={ordersQ} setOrdersQ={setOrdersQ} onDrill={drill}
                  campaignDoc={campaignDoc} onSaveCampaigns={saveCampaignDoc} metaDoc={metaDoc} onSaveMeta={saveMetaDoc} clientName={data?.clientName || clientId} memories={memories} canEditLabel={isAgencyRole} onSaveLabel={saveCostPerLabel}
                  onUndo={undoDecision} onUnpin={unpin} onReask={(q) => { setPanelOpen(true); setPanelTab('terminal'); ask(q) }} />
              </div>
            </>}
          </div>

          {/* ── Panel: terminal + problems ── */}
          {panelOpen && (
            <div className="panel" style={{ height: panelH }}>
              <div className="resize-v" onMouseDown={startDrag('panel')} title="drag to resize" />
              <div className="panel-tabs">
                <span className={panelTab === 'terminal' ? 'on' : ''} onClick={() => { setPanelTab('terminal'); inputRef.current?.focus() }}>TERMINAL</span>
                <span className={panelTab === 'problems' ? 'on' : ''} onClick={() => setPanelTab('problems')}>PROBLEMS{problems.length ? ` (${problems.length})` : ''}</span>
                <span className="panel-x" onClick={() => setPanelOpen(false)} title="ctrl+`">▾</span>
              </div>

              {panelTab === 'terminal' && (
                <>
                  <div className="stream">
                    {turns.map(t => <Turn key={t.id} t={t} selected={t.id === selId} onSelect={() => setSelId(t.id)} onApprove={() => approve(t)} onTeach={() => startTeach(t)} onSaveTeach={(r) => saveTeach(t, r)} onPin={() => pinView(t.spec, t.question)} onDrill={drill} />)}
                    <div ref={endRef} />
                  </div>
                  <div className="prompt-wrap">
                    <div className="prompt">
                      <span className="ps">❯</span>
                      <input ref={inputRef} disabled={busy} placeholder={busy ? 'thinking…' : `ask about ${VIEW_TITLES[activeTab]?.toLowerCase() || 'anything'} · / commands · answers use this page's numbers`}
                        onKeyDown={e => { if (e.key === 'Enter') { const v = e.currentTarget.value; e.currentTarget.value = ''; ask(v) } }}
                        autoComplete="off" spellCheck="false" />
                    </div>
                    <div className="prompt-hint">
                      <span className={`ph-mode ${leversMode === 'live' ? 'bad' : leversMode === 'dry_run' ? 'warn' : 'dim'}`}>▶▶ levers {leversMode}</span>
                      <span className="dim"> {leversMode === 'live' ? '(executes with rollback)' : leversMode === 'dry_run' ? '(drafts only — approvals stay yours)' : '(log only)'}</span>
                      <span className="dim"> · agent </span><span className="ph-agent">{(data?.clientName || clientId).toLowerCase()}</span>
                      {viewer && <>
                        <span className="dim"> · you: {viewer.role.replace(/_/g, ' ')} (</span>
                        <span className={viewer.queries ? 'ph-q-on' : 'dim'}>{viewer.queries ? 'queries on' : 'queries off'}</span>
                        <span className="dim">)</span>
                      </>}
                      <span className="dim"> · ⌘K commands · ? manual</span>
                    </div>
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
              <select value={rangeKey} onChange={e => setRangeKey(e.target.value)} title="date window">
                {RANGE_PRESETS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              {rangeKey === 'custom' && (
                <span className="custom-range">
                  <input type="date" value={customRange.start} max={customRange.end || undefined}
                    onChange={e => setCustomRange(r => ({ ...r, start: e.target.value }))} />
                  <span className="dim">→</span>
                  <input type="date" value={customRange.end} min={customRange.start || undefined}
                    onChange={e => setCustomRange(r => ({ ...r, end: e.target.value }))} />
                </span>
              )}
            </div>
            {m && <>
              <div className="seg"><span className="dim">net</span><b className={m.netProfit >= 0 ? 'good' : 'bad'}>{money(m.netProfit)}</b></div>
              <div className="seg"><span className="dim">tROAS</span><b className="good">{m.trueRoas != null ? m.trueRoas.toFixed(2) + 'x' : '—'}</b></div>
              <div className="seg"><span className="dim">spend</span><b className="warn">{money(m.adSpend)}</b></div>
              <div className="seg"><span className="dim">margin</span><b>{m.hasCogs ? (m.margin * 100).toFixed(1) + '%' : '—'}</b></div>
              <div className="seg probs" onClick={() => { setPanelOpen(true); setPanelTab('problems') }}>
                <span className="dim">⚠</span><b className={problems.length ? 'warn' : 'good'}>{problems.length}</b>
              </div>
              <div className="seg" title="MISSION_LEVERS — off: log only · dry_run: builds platform requests, never sends · live: executes with rollback">
                <span className="dim">levers</span><b className={leversMode === 'live' ? 'bad' : leversMode === 'dry_run' ? 'warn' : 'dim'}>{leversMode}</b>
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

      {/* ⌘P quick-open — fuzzy jump to any view, pin, or campaign */}
      {qpOpen && (() => {
        const items = [
          ...Object.entries(VIEW_TITLES).map(([id, t]) => ({ key: 'v' + id, label: t, sub: 'view', run: () => openTab(id) })),
          ...pins.map(p => ({ key: 'p' + p.id, label: '📌 ' + p.title, sub: 'pinned', run: () => openTab('pin:' + p.id) })),
          ...(m ? m.campaigns.map(c => ({ key: 'c' + c.platform + c.campaign_id, label: c.campaign_name, sub: `${c.platform} · ${c.trueRoas != null ? c.trueRoas.toFixed(2) + 'x' : '—'}`, run: () => openTab(c.platform === 'Google' ? 'google' : 'meta') })) : []),
          ...apps.map(a => ({ key: 'a' + a.key, label: a.icon + ' ' + a.label, sub: 'app ↗', run: () => router.push(`/control/${clientId}/${a.key}`) })),
        ].filter(it => (it.label + ' ' + it.sub).toLowerCase().includes(qpQ.toLowerCase())).slice(0, 12)
        return (
          <div className="palette" onClick={e => { if (e.target.classList.contains('palette')) setQpOpen(false) }}>
            <div className="pal">
              <input autoFocus value={qpQ} onChange={e => setQpQ(e.target.value)} placeholder="jump to a view, pin, or campaign…"
                onKeyDown={e => {
                  if (e.key === 'Escape') setQpOpen(false)
                  if (e.key === 'Enter' && items[0]) { setQpOpen(false); items[0].run() }
                }} />
              {items.map(it => (
                <div key={it.key} className="it" onClick={() => { setQpOpen(false); it.run() }}>
                  <b className="qp-label">{it.label}</b><span className="d">{it.sub}</span>
                </div>
              ))}
              {!items.length && <div className="it"><span className="d">no matches</span></div>}
            </div>
          </div>
        )
      })()}

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

/* ══════════ ViewBody — renders any tab id (used by both editor panes) ══════════ */
/* ══════════ P&L History — browse the client_daily_pnl RECORD; trace to source ══════════ */
function PnlHistoryView() {
  const { clientId } = useParams()
  const [rows, setRows] = useState(null)
  const [openDate, setOpenDate] = useState(null)
  const [src, setSrc] = useState({}) // date → { loading, orders }

  useEffect(() => {
    let alive = true
    supabase.from('client_daily_pnl')
      .select('date, gross_sales:metrics->grossSales, discounts:metrics->discounts, net_sales, total_orders, new_orders:metrics->nOrders, meta_spend:metrics->metaSpend, google_spend:metrics->googleSpend, cogs, gross_profit, source_refs, computed_at')
      .eq('client_id', clientId).order('date', { ascending: false }).limit(120)
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [clientId])

  const drill = async (row) => {
    if (openDate === row.date) { setOpenDate(null); return }
    setOpenDate(row.date)
    const ids = row.source_refs?.order_ids || []
    if (src[row.date] || !ids.length) return
    setSrc(s => ({ ...s, [row.date]: { loading: true } }))
    // Trace: the order IDs stored on the day → the actual client_orders rows.
    const { data } = await supabase.from('client_orders')
      .select('order_id, created_at, sale_amount, email, shopify_data->>order_name, shopify_data->>fulfillment_status')
      .eq('client_id', clientId).in('order_id', ids.slice(0, 200)).order('created_at', { ascending: true })
    setSrc(s => ({ ...s, [row.date]: { loading: false, orders: data || [] } }))
  }

  const $ = (n) => n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString()
  if (!rows) return <p className="loading v-pad">loading the P&amp;L record…</p>
  if (!rows.length) return <p className="loading v-pad">No snapshots yet — the nightly cron writes them, or backfill via /api/mission/pnl-snapshot.</p>

  // Full-word headers, each with a hover description. `num` right-aligns +
  // makes the column sort numerically; `s` on a cell is the sortable primitive.
  const columns = [
    { label: 'Date', desc: "Calendar day in the client's business timezone" },
    { label: 'Gross Sales', num: true, desc: 'Sales before discounts and refunds' },
    { label: 'Discounts', num: true, desc: 'Total discounts applied that day' },
    { label: 'Net Sales', num: true, desc: 'Gross sales minus discounts and refunds' },
    { label: 'Total Orders', num: true, desc: 'Orders placed that day' },
    { label: 'New Orders', num: true, desc: 'Orders from first-time customers' },
    { label: 'Meta Spend', num: true, desc: 'Meta (Facebook / Instagram) ad spend' },
    { label: 'Google Spend', num: true, desc: 'Google Ads spend' },
    { label: 'COGS', num: true, desc: 'Cost of goods sold, from BOM / SKU costs' },
    { label: 'Gross Profit', num: true, desc: 'Net sales minus COGS, ad spend, and shipping labels' },
  ]
  const tableRows = rows.map(r => {
    const cells = [
      { v: r.date, s: r.date, cls: 'mono' },
      { v: $(r.gross_sales), s: Number(r.gross_sales) || 0, cls: 'num' },
      { v: '-' + $(r.discounts), s: Number(r.discounts) || 0, cls: 'num warn' },
      { v: $(r.net_sales), s: Number(r.net_sales) || 0, cls: 'num strong' },
      { v: r.total_orders, s: Number(r.total_orders) || 0, cls: 'num' },
      { v: r.new_orders ?? '—', s: Number(r.new_orders) || 0, cls: 'num dim' },
      { v: $(r.meta_spend), s: Number(r.meta_spend) || 0, cls: 'num warn' },
      { v: $(r.google_spend), s: Number(r.google_spend) || 0, cls: 'num warn' },
      { v: $(r.cogs), s: Number(r.cogs) || 0, cls: 'num bad' },
      { v: $(r.gross_profit), s: Number(r.gross_profit) || 0, cls: 'num good strong' },
    ]
    cells.__rec = r // carry the record so the row stays clickable after a sort
    return cells
  })

  const renderExpanded = (r) => (
    <div className="rec-src">
      <div className="rec-src-h">{(r.source_refs?.order_ids || []).length} source orders · locked {String(r.computed_at).slice(0, 10)}</div>
      {src[r.date]?.loading ? <div className="v-dim">tracing…</div>
        : (src[r.date]?.orders || []).map(o => (
          <div key={o.order_id} className="rec-o">
            <span className="rec-o-name">{o.order_name || o.order_id}</span>
            <span className="v-dim">{String(o.created_at).slice(0, 10)}</span>
            <span className="v-dim">{o.email}</span>
            <span className={`rec-o-f ${o.fulfillment_status === 'FULFILLED' ? 'good' : 'dim'}`}>{o.fulfillment_status || '—'}</span>
            <span className="rec-o-amt">{$(o.sale_amount)}</span>
          </div>
        ))}
    </div>
  )

  return (
    <div className="v-pad">
      <h4 className="v-h" style={{ marginTop: 0 }}>Daily P&amp;L History — the record</h4>
      <p className="v-note" style={{ marginTop: 0 }}>Each row is a locked daily snapshot from client_daily_pnl. Hover a header for what it means, drag a column border to resize, and click a day to trace it to the exact orders behind it (source_refs → client_orders).</p>
      <ResizableTable id="pnl_history" columns={columns} rows={tableRows}
        onRowClick={drill} expandedKey={openDate} rowKeyOf={(r) => r.date} renderExpanded={renderExpanded} />
    </div>
  )
}

/* ══════════ Memory — the agent's durable, client-visible knowledge ══════════ */
function MemoryView({ memories, clientName, onReask }) {
  const KIND = { preference: '❤', context: '🗓', external: '🌐', decision: '⚖', insight: '💡' }
  const fmt = (d) => { try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch { return '' } }
  return (
    <div className="v-pad">
      <h4 className="v-h" style={{ marginTop: 0 }}>Memory</h4>
      <p className="v-note" style={{ marginTop: 0 }}>What the agent knows about {clientName} beyond the raw data — preferences, context, external facts, decision rationale. Metrics are never memorized (always queried fresh). Tell the agent “remember that…” to add one.</p>
      {!memories?.length ? (
        <p className="loading" style={{ padding: '8px 0' }}>Nothing remembered yet. As you work with the agent it will save durable facts here — or say “remember that we hate video ads / Q4 is our peak / the supplier raised prices in June.”</p>
      ) : (
        <div className="mem-list">
          {memories.map(m => (
            <div key={m.id} className="mem-row">
              <span className="mem-kind" title={m.kind}>{KIND[m.kind] || '•'}</span>
              <div className="mem-body">
                <div className="mem-content">{m.content}</div>
                <div className="mem-meta">{m.kind}{m.source ? ` · ${m.source}` : ''} · {fmt(m.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════ Campaign Builder — Google (CSV) + Meta (API push) ══════════ */
function CampaignSheetView({ doc, onSave, metaDoc, onSaveMeta, clientName, onReask }) {
  const google = doc?.campaigns || []
  const meta = metaDoc?.campaigns || []
  if (!google.length && !meta.length) return (
    <div className="v-pad">
      <h4 className="v-h">Campaign Builder</h4>
      <p className="loading" style={{ padding: '8px 0' }}>No campaigns drafted yet. Ask the agent in the terminal — “build a Google search campaign for our top product” or “build a Meta prospecting campaign” — and it fills a sheet here. Google exports as a Google Ads Editor CSV; Meta pushes via API (paused) once authed.</p>
      <div className="cb-actions">
        <button className="tt-btn" onClick={() => onReask?.('build a Google Ads Search campaign for this client’s best-selling product, grounded in the order data')}>✦ draft a Google campaign</button>
        <button className="tt-btn" onClick={() => onReask?.('build a Meta prospecting campaign for this client’s best-selling product, grounded in the order data')}>✦ draft a Meta campaign</button>
      </div>
    </div>
  )
  return (
    <div className="v-pad">
      {!!google.length && <GoogleCampaigns campaigns={google} onSave={onSave} clientName={clientName} />}
      {!!meta.length && <MetaCampaigns campaigns={meta} onSave={onSaveMeta} />}
    </div>
  )
}

function GoogleCampaigns({ campaigns, onSave, clientName }) {
  const counts = docCounts({ campaigns })
  const slug = String(clientName || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const download = (someDoc, filename) => {
    const blob = new Blob([buildCsv(someDoc)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }
  const cs = (n) => String(n || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
  return (
    <div className="cb-platform">
      <div className="cb-head">
        <div>
          <h4 className="v-h" style={{ margin: 0 }}>🔍 Google Ads</h4>
          <span className="v-dim">{counts.campaigns} campaigns · {counts.adGroups} ad groups · {counts.keywords} keywords · {counts.ads} ads · export → Google Ads Editor</span>
        </div>
        <div className="cb-actions">
          <button className="tt-btn on" onClick={() => download({ campaigns }, `google-ads-${slug}-all-campaigns.csv`)}>⬇ Export all{campaigns.length > 1 ? ` (${campaigns.length})` : ''}</button>
          <button className="tt-btn" onClick={() => onSave({ campaigns: [] })}>clear</button>
        </div>
      </div>
      {campaigns.map((c, ci) => (
        <div key={ci} className="cb-camp">
          <div className="cb-camp-head">
            <span className="cb-camp-name">{c.name}</span>
            <span className={`cb-badge ${c.status === 'Enabled' ? 'en' : ''}`}>{c.status || 'Paused'}</span>
            <span className="v-dim">{c.bidStrategy}</span>
            <button className="cb-dl" title="export just this campaign" onClick={() => download({ campaigns: [c] }, `google-ads-${slug}-${cs(c.name)}.csv`)}>⬇</button>
            <button className="cb-x" title="remove" onClick={() => onSave({ campaigns: campaigns.filter((_, ix) => ix !== ci) })}>✕</button>
          </div>
          {(c.adGroups || []).map((g, gi) => (
            <div key={gi} className="cb-ag">
              <div className="cb-ag-name">▸ {g.name}</div>
              <div className="cb-cols">
                <div className="cb-col">
                  <div className="cb-col-h">Keywords ({(g.keywords || []).length})</div>
                  {(g.keywords || []).map((k, ki) => (
                    <div key={ki} className="cb-kw"><span className={`cb-mt cb-mt-${(k.matchType || 'Broad').toLowerCase()}`}>{(k.matchType || 'Broad')[0]}</span>{k.text}</div>
                  ))}
                </div>
                <div className="cb-col">
                  {(g.ads || []).map((ad, ai) => (
                    <div key={ai}>
                      <div className="cb-col-h">Responsive Search Ad · {(ad.headlines || []).length}H / {(ad.descriptions || []).length}D</div>
                      {(ad.headlines || []).map((h, hi) => { const t = h?.text || ''; const over = t.length > 30; return <div key={'h' + hi} className={`cb-asset ${over ? 'over' : ''}`}><span className="cb-len">{t.length}</span>{t}</div> })}
                      {(ad.descriptions || []).map((d, di) => { const t = d?.text || ''; const over = t.length > 90; return <div key={'d' + di} className={`cb-asset desc ${over ? 'over' : ''}`}><span className="cb-len">{t.length}</span>{t}</div> })}
                      {ad.finalUrl && <div className="cb-url">{ad.finalUrl}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const META_OBJ = { OUTCOME_SALES: 'Sales', OUTCOME_LEADS: 'Leads', OUTCOME_TRAFFIC: 'Traffic', OUTCOME_AWARENESS: 'Awareness', OUTCOME_ENGAGEMENT: 'Engagement' }
function MetaCampaigns({ campaigns, onSave }) {
  const nSets = campaigns.reduce((n, c) => n + (c.adSets || []).length, 0)
  const nAds = campaigns.reduce((n, c) => n + (c.adSets || []).reduce((m, s) => m + (s.ads || []).length, 0), 0)
  return (
    <div className="cb-platform" style={{ marginTop: campaigns.length ? 26 : 0 }}>
      <div className="cb-head">
        <div>
          <h4 className="v-h" style={{ margin: 0 }}>📘 Meta Ads</h4>
          <span className="v-dim">{campaigns.length} campaigns · {nSets} ad sets · {nAds} ads · push via API (all paused)</span>
        </div>
        <div className="cb-actions">
          <button className="tt-btn" disabled title="enable ads_management on the Meta token to push (coming in phase 2)" style={{ opacity: 0.5, cursor: 'not-allowed' }}>⇪ Push to Meta (needs auth)</button>
          <button className="tt-btn" onClick={() => onSave({ campaigns: [] })}>clear</button>
        </div>
      </div>
      <p className="v-note" style={{ marginTop: 0 }}>Meta has no keywords — review the audience + creative below. Pushing creates everything Paused in your ad account for a final check in Ads Manager (enabled once the token has ads_management).</p>
      {campaigns.map((c, ci) => (
        <div key={ci} className="cb-camp">
          <div className="cb-camp-head">
            <span className="cb-camp-name">{c.name}</span>
            <span className={`cb-badge ${c.status === 'Active' ? 'en' : ''}`}>{c.status || 'Paused'}</span>
            <span className="v-dim">{META_OBJ[c.objective] || c.objective}{c.dailyBudget ? ` · $${c.dailyBudget}/day` : ''}</span>
            <button className="cb-x" style={{ marginLeft: 'auto' }} title="remove" onClick={() => onSave({ campaigns: campaigns.filter((_, ix) => ix !== ci) })}>✕</button>
          </div>
          {(c.adSets || []).map((s, si) => (
            <div key={si} className="cb-ag">
              <div className="cb-ag-name">▸ {s.name} <span className="v-dim">· {s.optimizationGoal} · {s.placements}</span></div>
              <div className="cb-cols">
                <div className="cb-col">
                  <div className="cb-col-h">Audience</div>
                  {s.audience?.locations && <div className="cb-kw">📍 {s.audience.locations}</div>}
                  {(s.audience?.ageMin || s.audience?.ageMax) && <div className="cb-kw">👤 {s.audience.ageMin || 18}–{s.audience.ageMax || 65}{s.audience.genders && s.audience.genders !== 'All' ? ` · ${s.audience.genders}` : ''}</div>}
                  {(s.audience?.interests || []).map((it, ii) => <div key={ii} className="cb-kw"># {it}</div>)}
                  {s.audience?.note && <div className="cb-asset desc">{s.audience.note}</div>}
                </div>
                <div className="cb-col">
                  {(s.ads || []).map((ad, ai) => (
                    <div key={ai}>
                      <div className="cb-col-h">Ad{ad.name ? ` · ${ad.name}` : ''}</div>
                      {ad.headline && <div className="cb-asset"><span className="cb-len">H</span>{ad.headline}</div>}
                      {ad.primaryText && <div className="cb-asset desc"><span className="cb-len">B</span>{ad.primaryText}</div>}
                      {ad.description && <div className="cb-asset desc"><span className="cb-len">D</span>{ad.description}</div>}
                      {ad.creativeNote && <div className="cb-creative">🎨 {ad.creativeNote}</div>}
                      {ad.finalUrl && <div className="cb-url">{ad.finalUrl}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ViewBody({ id, m, data, rangeN, rangeLabel, ledger, policies, pins, ordersQ, setOrdersQ, onDrill, campaignDoc, onSaveCampaigns, metaDoc, onSaveMeta, clientName, memories, canEditLabel, onSaveLabel, onUndo, onUnpin, onReask }) {
  // Campaign Builder + Memory are independent of the mission metrics — render
  // before the !m gate so they work even while data is still loading.
  if (id === 'campaign') return <CampaignSheetView doc={campaignDoc} onSave={onSaveCampaigns} metaDoc={metaDoc} onSaveMeta={onSaveMeta} clientName={clientName} onReask={onReask} />
  if (id === 'memory') return <MemoryView memories={memories} clientName={clientName} onReask={onReask} />
  if (id === 'pnl_history') return <PnlHistoryView />
  if (!m) return <p className="loading">reading {rangeN} days of orders, campaigns, and BOM costs…</p>
  if (id === 'overview') return <OverviewView m={m} rangeLabel={rangeLabel} canEditLabel={canEditLabel} onSaveLabel={onSaveLabel} />
  if (id === 'google') return <CampaignView m={m} platform="Google" />
  if (id === 'meta') return <CampaignView m={m} platform="Meta" />
  if (id === 'orders') return <OrdersView data={data} filter={ordersQ} setFilter={setOrdersQ} />
  if (id === 'klaviyo') return <KlaviyoView m={m} />
  if (id === 'manual') return <div className="man-body wide"><Markdown text={MANUAL} /></div>
  if (id === 'ledger') return <LedgerView ledger={ledger} onUndo={onUndo} />
  if (id === 'policies') return <PoliciesView policies={policies} />
  if (id.startsWith('pin:')) {
    const p = pins.find(x => 'pin:' + x.id === id)
    if (!p) return <p className="loading v-pad">pin not found.</p>
    return (
      <div className="v-pad">
        <div className="pin-head">
          <div>
            <h3 className="pin-title">📌 {p.title}</h3>
            <p className="v-dim">pinned {new Date(p.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · snapshot of: “{p.question}”</p>
          </div>
          <div className="pin-actions">
            <button className="tt-btn" onClick={() => onReask(p.question)}>↻ re-ask (fresh data)</button>
            <button className="tt-btn" onClick={() => onUnpin(p.id)}>✕ unpin</button>
          </div>
        </div>
        <RenderSpec spec={p.spec} onDrill={onDrill} />
      </div>
    )
  }
  return <p className="loading v-pad">unknown view.</p>
}

/* ══════════ Resizable table — Google Sheets behavior, IDE skin ══════════
   Drag any header border to resize its column; narrowed text wraps when the
   wrap toggle is on, truncates with … when off. Widths + wrap persist per
   table in localStorage. */
function ResizableTable({ id, columns, rows, note, onRowClick, expandedKey, rowKeyOf, renderExpanded }) {
  const [widths, setWidths] = useState(null) // null = auto layout until touched
  const [wrap, setWrap] = useState(true)
  const [sort, setSort] = useState(null) // {i, dir: 1|-1}
  const tableRef = useRef(null)
  const dragRef = useRef(null) // {i, startX, startW}

  // Click a header to cycle sort: desc → asc → off. Cells provide `s`
  // (sortable primitive) alongside `v` (rendered node).
  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const val = (r) => { const c = r[sort.i]; const s = c?.s ?? c?.v ?? c; return typeof s === 'number' ? s : String(s ?? '') }
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return cmp * sort.dir
    })
  }, [rows, sort])
  const cycleSort = (i) => setSort(s => (!s || s.i !== i) ? { i, dir: -1 } : s.dir === -1 ? { i, dir: 1 } : null)

  useEffect(() => {
    try {
      const w = JSON.parse(localStorage.getItem(`ide_tw_${id}`) || 'null')
      if (Array.isArray(w) && w.length === columns.length) setWidths(w)
      const wr = localStorage.getItem(`ide_wrap_${id}`)
      if (wr != null) setWrap(wr === '1')
    } catch { /* defaults */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      setWidths(w => {
        const next = [...(w || d.snapshot)]
        next[d.i] = Math.min(1400, Math.max(56, d.startW + (e.clientX - d.startX)))
        return next
      })
    }
    const up = () => {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.cursor = ''; document.body.style.userSelect = ''
      setWidths(w => { if (w) localStorage.setItem(`ide_tw_${id}`, JSON.stringify(w)); return w })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [id])

  const startColDrag = (i) => (e) => {
    e.preventDefault(); e.stopPropagation()
    // First touch: snapshot current auto-layout widths so only this column moves
    const ths = [...(tableRef.current?.querySelectorAll('th') || [])]
    const snapshot = ths.map(th => th.offsetWidth)
    dragRef.current = { i, startX: e.clientX, startW: (widths || snapshot)[i], snapshot }
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
  }

  const toggleWrap = () => setWrap(w => { localStorage.setItem(`ide_wrap_${id}`, w ? '0' : '1'); return !w })
  const resetCols = () => { setWidths(null); localStorage.removeItem(`ide_tw_${id}`) }

  return (
    <div>
      <div className="ttools">
        <span className="tt-hint">drag column borders to resize</span>
        <button className={`tt-btn ${wrap ? 'on' : ''}`} onClick={toggleWrap} title="wrap text in cells">↩ wrap {wrap ? 'on' : 'off'}</button>
        {widths && <button className="tt-btn" onClick={resetCols} title="reset column widths">reset</button>}
      </div>
      <div className="rt-scroll">
        {/* When customized, the table gets a DEFINITE width (sum of columns) —
            fixed layout + max-content is undefined behavior and was letting
            the table blow up the page's flex height accounting. */}
        {/* class must NOT be named "fixed" — Tailwind's global .fixed is
            position:fixed and rips the table out of the page flow */}
        <table ref={tableRef} className={`vtable rt ${wrap ? 'wrapon' : 'wrapoff'} ${widths ? 'rt-fixed' : ''}`}
          style={widths ? { width: widths.reduce((a, b) => a + b, 0) } : undefined}>
          {widths && <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>}
          <thead><tr>
            {columns.map((c, i) => (
              <th key={i} className={`${c.num ? 'num' : ''} sortable`} onClick={() => c.label && cycleSort(i)}
                title={c.label ? [c.desc, 'click to sort'].filter(Boolean).join(' · ') : undefined}>
                {c.label}{sort?.i === i ? (sort.dir === -1 ? ' ▾' : ' ▴') : ''}
                <span className="col-grip" onMouseDown={startColDrag(i)} />
              </th>
            ))}
          </tr></thead>
          <tbody>
            {sortedRows.map((r, ri) => {
              const rec = r.__rec
              const key = rec !== undefined && rowKeyOf ? rowKeyOf(rec) : ri
              const open = renderExpanded && expandedKey != null && key === expandedKey
              return (
                <Fragment key={key}>
                  <tr className={`${onRowClick ? 'rt-click' : ''} ${open ? 'on' : ''}`} onClick={onRowClick ? () => onRowClick(rec) : undefined}>
                    {r.map((cell, ci) => <td key={ci} className={cell?.cls || (columns[ci].num ? 'num' : '')}>{cell?.v ?? cell}</td>)}
                  </tr>
                  {open && <tr className="rt-exrow"><td colSpan={columns.length}>{renderExpanded(rec)}</td></tr>}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {note && <p className="v-note">{note}</p>}
    </div>
  )
}

/* ══════════ Views (tab contents) ══════════ */

function OverviewView({ m, rangeLabel, canEditLabel, onSaveLabel }) {
  return (
    <div className="v-pad">
      <h4 className="v-h" style={{ marginTop: 0 }}>Daily P&amp;L</h4>
      <p className="v-note" style={{ marginTop: 0 }}>{rangeLabel}. Click any line to trace it to its source table — orders drill down to line items → SKU → BOM → the raw material cost.</p>
      <PnlTable p={m.pnl} sources={m.sources} campaigns={m.campaigns} rangeLabel={rangeLabel} canEditLabel={canEditLabel} onSaveLabel={onSaveLabel} />
    </div>
  )
}

// The client's morning report. Mirrors Jason's sheet row-for-row.
function LabelEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  if (!editing) return <button className="pnl-edit" title="edit cost per label" onClick={() => setEditing(true)}>✎</button>
  const commit = () => { setEditing(false); if (Number(v) !== Number(value)) onSave(v) }
  return (
    <span className="pnl-editin">$<input autoFocus type="number" step="0.5" value={v}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setV(value); setEditing(false) } }}
      onBlur={commit} />/label</span>
  )
}

function PnlTable({ p, sources, campaigns, rangeLabel, canEditLabel, onSaveLabel }) {
  const [open, setOpen] = useState(null) // label of the drilled line
  if (!p) return <p className="v-dim">no P&amp;L for this range.</p>
  const $ = (n) => n == null ? '—' : '$' + Math.round(n).toLocaleString()
  const $2 = (n) => n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const pc = (n) => n == null ? '' : (n * 100).toFixed(2) + '%'
  const x = (n) => n == null ? '—' : n.toFixed(2) + 'x'
  const gaGap = p.users == null // Users/CPVisit/CVR need GA4
  // Each drillable line names the source it traces to. `d` = drill descriptor.
  const O = (measure) => ({ kind: 'orders', measure })
  const rows = [
    ['Gross Sales', $2(p.grossSales), '', 'strong', null, O('gross')],
    ['Discounts', '-' + $2(p.discounts), pc(p.discountsPct), 'warn', null, O('discounts')],
    ['Refunds', '-' + $2(p.refunds), pc(p.refundsPct), 'warn', null, O('refunds')],
    ['Net Sales', $2(p.netSales), '', 'strong', null, O('net')],
    ['sep'],
    ['Total Orders', String(p.totalOrders), '', '', null, O('countAll')],
    ['New Orders', p.newClassified ? String(p.nOrders) : '— (classifying)', p.newClassified ? pc(p.nOrderPct) : '', '', null, p.newClassified ? O('countNew') : null],
    ['True AOV', $2(p.trueAov), '', 'good', null, O('aov')],
    ['sep'],
    ['Meta Spend', $(p.metaSpend), pc(p.metaPctOfNet) + ' of net', 'warn', null, { kind: 'campaigns', platform: 'Meta' }],
    ['Google Spend', $(p.googleSpend), pc(p.googlePctOfNet) + ' of net', 'warn', null, { kind: 'campaigns', platform: 'Google' }],
    ['Blended ROAS', x(p.blendedRoas), '', 'good'],
    ['Blended CAC', $(p.blendedCpa), '', ''],
    ['New CAC', p.newClassified ? $(p.nCpa) : '—', '', ''],
    ['sep'],
    ['Users (sessions)', gaGap ? '— needs GA4' : p.users.toLocaleString(), '', gaGap ? 'dim' : ''],
    ['Cost / Visit', gaGap ? '—' : $2(p.cpVisit), '', gaGap ? 'dim' : ''],
    ['Conversion Rate', gaGap ? '—' : pc(p.cvrBlended), '', gaGap ? 'dim' : 'good'],
    ['sep'],
    ['COGS', $(p.cogs), pc(p.cogsPct), 'bad', null, sources?.hasCogs ? O('cogs') : null],
    ['Contribution Margin', $2(p.contributionMargin), '', 'good'],
    ['Orders Shipped', String(p.ordersShipped), '', '', null, O('shipped')],
    ['Shipping Costs', $2(p.shippingCosts), pc(p.shippingPct), 'warn', 'shipping', O('shippingCost')],
    ['sep'],
    ['Gross Profit', $2(p.grossProfit), pc(p.grossProfitPct), 'good'],
    ['Profit Margin', pc(p.profitMargin), '', p.profitMargin >= 0 ? 'good' : 'bad'],
  ]
  // Plain-language definition for each line — shown via the ⓘ info icon.
  const DESC = {
    'Gross Sales': 'Merchandise sales before discounts and refunds (order subtotal + discounts). Excludes tax and shipping.',
    'Discounts': 'Total discounts applied across orders in range.',
    'Refunds': 'Money refunded to customers in range.',
    'Net Sales': 'Gross sales minus discounts and refunds — the real top line the rest of the P&L is measured against.',
    'Total Orders': 'Orders with positive net sales in the range.',
    'New Orders': "Orders from first-time customers — a customer whose first-ever order (matched by email, across all history) falls in this range. Counts new customers, not repeat buyers.",
    'True AOV': 'Average order value after discounts & refunds — Net Sales ÷ Total Orders.',
    'Meta Spend': 'Meta (Facebook / Instagram) ad spend in range, from client_meta_campaigns.',
    'Google Spend': 'Google Ads spend in range, from client_yt_campaigns.',
    'Blended ROAS': 'Return on ad spend, blended across all channels — Net Sales ÷ total ad spend. 3x = $3 of net sales per $1 spent.',
    'Blended CAC': 'Blended customer-acquisition cost — total ad spend ÷ Total Orders. Cost per order across new AND returning buyers.',
    'New CAC': 'New-customer acquisition cost — total ad spend ÷ New Customers. What it costs to acquire one first-time buyer.',
    'Users (sessions)': 'Website sessions in range. Needs a GA4 connection.',
    'Cost / Visit': 'Ad spend ÷ website sessions. Needs GA4.',
    'Conversion Rate': 'Orders ÷ website sessions — how many visits become orders. Needs GA4.',
    'COGS': 'Cost of goods sold — the real material cost of what shipped, computed from each order’s SKUs → BOM → client_materials.',
    'Contribution Margin': 'Net Sales − COGS − ad spend. What’s left to cover shipping, overhead, and profit.',
    'Orders Shipped': 'Orders marked fulfilled in range.',
    'Shipping Costs': 'Orders shipped × cost per label (the average pick/pack/label cost you set).',
    'Gross Profit': 'Contribution Margin − shipping costs. The bottom line of this P&L.',
    'Profit Margin': 'Gross Profit ÷ Net Sales — profit as a share of net revenue.',
  }
  return (
    <div className="pnl">
      {rows.map((r, i) => {
        if (r[0] === 'sep') return <div key={i} className="pnl-sep" />
        const drill = r[5]
        const on = open === r[0]
        return (
          <Fragment key={i}>
            <div className={`pnl-row ${drill ? 'drillable' : ''} ${on ? 'on' : ''}`} onClick={drill ? () => setOpen(on ? null : r[0]) : undefined}>
              <span className="pnl-l">
                {drill && <span className="pnl-caret">{on ? '▾' : '▸'}</span>}
                {r[0]}
                {DESC[r[0]] && <span className="pnl-info" title={DESC[r[0]]} onClick={e => e.stopPropagation()}>ⓘ</span>}
                {r[4] === 'shipping' && (
                  <span className="pnl-sub" onClick={e => e.stopPropagation()}> @ {canEditLabel ? <LabelEditor value={p.avgCostPerLabel} onSave={onSaveLabel} /> : `$${p.avgCostPerLabel}/label`}</span>
                )}
              </span>
              <span className={`pnl-v ${r[3]}`}>{r[1]}</span><span className="pnl-pct">{r[2]}</span>
            </div>
            {on && drill && (
              <div className="pnl-drill">
                {drill.kind === 'orders'
                  ? <PnlOrdersDrill orders={sources?.orders || []} measure={drill.measure} costPerLabel={sources?.costPerLabel} rangeLabel={rangeLabel} />
                  : <PnlCampaignsDrill campaigns={campaigns || []} platform={drill.platform} rangeLabel={rangeLabel} />}
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

// One order line's cost cascade: line item → SKU → BOM → client_materials.
function OrderCogsCascade({ lines }) {
  const [open, setOpen] = useState(null)
  const $c = (n) => '$' + Number(n || 0).toFixed(2)
  if (!lines?.length) return <div className="v-dim casc-empty">no line items on this order</div>
  return (
    <div className="casc">
      {lines.map((l, i) => {
        const on = open === i
        return (
          <div key={i} className="casc-line">
            <div className={`casc-lhead ${l.matched ? '' : 'unmatched'}`} onClick={() => l.matched && setOpen(on ? null : i)}>
              <span className="casc-name">{l.matched && <span className="pnl-caret">{on ? '▾' : '▸'}</span>}{l.sku || '—'} <span className="v-dim">×{l.qty}</span></span>
              <span className="casc-sku v-dim">{l.matched ? `sku ${l.parent} · ${l.vinyl}` : 'no SKU match → $0'}</span>
              <span className="casc-cost">{$c(l.cost)}</span>
            </div>
            {on && (
              <div className="casc-bom">
                <div className="casc-bom-h">BOM → client_materials · {$c(l.unit)}/unit × {l.qty}</div>
                {l.bom?.length ? l.bom.map((b, j) => (
                  <div key={j} className="casc-brow">
                    <span className="casc-bname">{b.component}</span>
                    <span className="v-dim">{b.qty} × {$c(b.unit)}</span>
                    <span className="casc-cost">{$c(b.cost)}</span>
                  </div>
                )) : <div className="v-dim">no priced BOM components</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Orders behind a P&L line — source: client_orders, for the selected range.
function PnlOrdersDrill({ orders, measure, costPerLabel, rangeLabel }) {
  const [open, setOpen] = useState(null)
  const $2 = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // measure → per-order value + inclusion filter + a label for the header total.
  const M = {
    gross: { val: o => o.gross, keep: o => o.gross, label: 'gross', money: true },
    discounts: { val: o => o.discounts, keep: o => o.discounts > 0, label: 'discounts', money: true },
    refunds: { val: o => o.refunds, keep: o => o.refunds > 0, label: 'refunds', money: true },
    net: { val: o => o.net, keep: o => o.net, label: 'net', money: true },
    countAll: { val: o => o.net, keep: o => o.net > 0, label: 'net', money: true, count: true },
    countNew: { val: o => o.net, keep: o => o.isNew && o.net > 0, label: 'net', money: true, count: true },
    aov: { val: o => o.net, keep: o => o.net > 0, label: 'net', money: true, count: true },
    cogs: { val: o => o.cogs, keep: o => o.cogs > 0, label: 'COGS', money: true },
    shipped: { val: o => (costPerLabel || 0), keep: o => o.shipped, label: 'label cost', money: true, count: true },
    shippingCost: { val: o => (costPerLabel || 0), keep: o => o.shipped, label: 'label cost', money: true },
  }[measure] || { val: o => o.net, keep: () => true, label: 'net', money: true }
  const rows = orders.filter(M.keep).map(o => ({ o, v: M.val(o) })).sort((a, b) => b.v - a.v)
  const total = rows.reduce((s, r) => s + r.v, 0)
  const srcNote = `source: client_orders · ${rows.length} order${rows.length === 1 ? '' : 's'} · ${rangeLabel}`
  return (
    <div className="src">
      <div className="src-h">{srcNote} · {M.count ? `${rows.length} @ ` : 'total '}{$2(total)}{measure === 'aov' && rows.length ? ` · avg ${$2(total / rows.length)}` : ''}</div>
      <div className="src-scroll">
        {rows.length === 0 ? <div className="v-dim">no orders contribute to this line in range.</div> : rows.map(({ o, v }) => {
          const on = open === o.id
          const canCasc = measure === 'cogs' && o.lines?.length
          return (
            <div key={o.id} className="src-o">
              <div className={`src-orow ${canCasc ? 'drillable' : ''} ${on ? 'on' : ''}`} onClick={canCasc ? () => setOpen(on ? null : o.id) : undefined}>
                <span className="src-name">{canCasc && <span className="pnl-caret">{on ? '▾' : '▸'}</span>}{o.name}</span>
                <span className="v-dim src-date">{String(o.date).slice(0, 10)}</span>
                <span className="v-dim src-email">{o.email}{o.isNew ? ' · new' : ''}</span>
                <span className="src-amt">{$2(v)}</span>
              </div>
              {on && canCasc && <OrderCogsCascade lines={o.lines} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Campaigns behind a spend line — source: the platform's campaign table.
function PnlCampaignsDrill({ campaigns, platform, rangeLabel }) {
  const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
  const rows = campaigns.filter(c => c.platform === platform).sort((a, b) => (b.spend || 0) - (a.spend || 0))
  const table = platform === 'Meta' ? 'client_meta_campaigns' : 'client_yt_campaigns'
  const total = rows.reduce((s, c) => s + (Number(c.spend) || 0), 0)
  return (
    <div className="src">
      <div className="src-h">source: {table} · {rows.length} campaign{rows.length === 1 ? '' : 's'} · {rangeLabel} · total {$(total)}</div>
      <div className="src-scroll">
        {rows.length === 0 ? <div className="v-dim">no {platform} campaigns in range.</div> : rows.map((c, i) => (
          <div key={i} className="src-crow">
            <span className="src-name">{c.stale ? '⏸ ' : ''}{c.campaign_name}</span>
            <span className="v-dim">{(c.clicks || 0).toLocaleString()} clicks · {(c.impressions || 0).toLocaleString()} impr</span>
            <span className="src-amt">{$(c.spend)}</span>
          </div>
        ))}
      </div>
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
      <ResizableTable
        id={`camp-${platform}`}
        columns={[{ label: 'Campaign' }, { label: 'Status' }, { label: 'Spend', num: true }, { label: '$/day', num: true }, { label: 'Clicks', num: true }, { label: 'Orders (CH)', num: true }, { label: 'Attr. Rev', num: true }, { label: 'True ROAS', num: true }]}
        rows={rows.map(c => [
          { v: c.campaign_name, cls: 'tname', s: c.campaign_name },
          { v: c.stale ? <span className="pill dead">stale</span> : c.status === 'ENABLED' ? <span className="pill ok">enabled</span> : <span className="pill dead">paused</span>, s: c.stale ? 'stale' : c.status },
          { v: money(c.spend), cls: 'num', s: c.spend },
          { v: money(c.spendPerDay), cls: 'num', s: c.spendPerDay },
          { v: c.clicks.toLocaleString(), cls: 'num', s: c.clicks },
          { v: c.chOrders, cls: 'num', s: c.chOrders },
          { v: money(c.chRevenue), cls: 'num', s: c.chRevenue },
          { v: c.trueRoas != null ? c.trueRoas.toFixed(2) + 'x' : '—', cls: `num strong ${c.trueRoas == null ? '' : c.trueRoas >= 1 ? 'good' : 'bad'}`, s: c.trueRoas ?? -999 },
        ])}
        note="True ROAS = (UTM-attributed revenue − BOM COGS) ÷ spend · breakeven 1.00x · ask the terminal about any row."
      />
    </div>
  )
}

// Every column of client_orders — the picker can mirror the table 1:1.
// def: shown by default. cell(o) → ResizableTable cell {v, s(ort), cls}.
const fmtDateShort = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const oc = (v) => ({ v: v || <span className="dimc">—</span>, s: String(v || '') })
const ORDER_FIELDS = [
  { key: 'order',        label: 'Order',        def: true, cell: o => ({ v: o.shopify_data?.order_name || o.lead_id, cls: 'tname', s: String(o.shopify_data?.order_name || o.lead_id) }) },
  { key: 'date',         label: 'Date',         def: true, cell: o => ({ v: fmtDateShort(o.created_at), s: o.created_at }) },
  { key: 'channel',      label: 'Channel',      def: true, cell: o => oc(deriveChannel(o)) },
  { key: 'amount',       label: 'Amount',       def: true, num: true, cell: o => ({ v: money(o.sale_amount), cls: 'num strong', s: Number(o.sale_amount) || 0 }) },
  { key: 'customer',     label: 'Customer',     cell: o => oc([o.first_name, o.last_name].filter(Boolean).join(' ')) },
  { key: 'email',        label: 'Email',        cell: o => oc(o.email) },
  { key: 'phone',        label: 'Phone',        cell: o => oc(o.phone) },
  { key: 'address',      label: 'Address',      cell: o => oc(o.address) },
  { key: 'city',         label: 'City',         cell: o => oc(o.city) },
  { key: 'state',        label: 'State',        cell: o => oc(o.state) },
  { key: 'zip_code',     label: 'Zip',          cell: o => oc(o.zip_code) },
  { key: 'source',       label: 'Source',       cell: o => oc(o.source) },
  { key: 'utm_source',   label: 'UTM Source',   cell: o => oc(o.utm_source) },
  { key: 'utm_medium',   label: 'UTM Medium',   cell: o => oc(o.utm_medium) },
  { key: 'utm_campaign', label: 'UTM Campaign', cell: o => oc(o.utm_campaign) },
  { key: 'utm_adgroup',  label: 'UTM Adgroup',  cell: o => oc(o.utm_adgroup) },
  { key: 'utm_content',  label: 'UTM Content',  cell: o => oc(o.utm_content) },
  { key: 'utm_term',     label: 'UTM Term',     cell: o => oc(o.utm_term) },
  { key: 'gclid',        label: 'GCLID',        cell: o => oc(o.gclid) },
  { key: 'wbraid',       label: 'WBRAID',       cell: o => oc(o.wbraid) },
  { key: 'funnel_id',    label: 'Funnel ID',    cell: o => oc(o.funnel_id) },
  { key: 'order_id',     label: 'Order ID',     cell: o => oc(o.order_id || o.lead_id) },
  { key: 'notes',        label: 'Notes',        cell: o => oc(o.notes) },
]
const DEFAULT_ORDER_COLS = ORDER_FIELDS.filter(f => f.def).map(f => f.key)

function OrdersView({ data, filter = '', setFilter }) {
  const all = data?.orders || []
  const q = filter.trim().toLowerCase()
  // Column picker — persisted; "all" mirrors the client_orders table exactly.
  const [cols, setCols] = useState(null) // null = defaults
  const [pickOpen, setPickOpen] = useState(false)
  const pickRef = useRef(null)
  useEffect(() => {
    try { const c = JSON.parse(localStorage.getItem('ide_ordercols') || 'null'); if (Array.isArray(c) && c.length) setCols(c) } catch { /* defaults */ }
  }, [])
  useEffect(() => {
    if (!pickOpen) return
    const close = (e) => { if (pickRef.current && !pickRef.current.contains(e.target)) setPickOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [pickOpen])
  const activeKeys = cols || DEFAULT_ORDER_COLS
  const activeSet = new Set(activeKeys)
  const fields = ORDER_FIELDS.filter(f => activeSet.has(f.key))
  const saveCols = (next) => {
    if (!next || !next.length) return
    setCols(next); localStorage.setItem('ide_ordercols', JSON.stringify(next))
  }
  const toggleCol = (k) => {
    const s = new Set(activeSet); s.has(k) ? s.delete(k) : s.add(k)
    saveCols(ORDER_FIELDS.map(f => f.key).filter(x => s.has(x)))
  }
  // Filter matches whatever a chart label plausibly names: order #, channel,
  // a date ("Jul 5" or ISO) — plus customer/email/campaign when present.
  const matched = q ? all.filter(o => {
    const hay = [
      o.shopify_data?.order_name || o.lead_id, deriveChannel(o), fmtDateShort(o.created_at),
      String(o.created_at).slice(0, 10), o.first_name, o.last_name, o.email, o.utm_campaign, o.utm_source,
    ].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  }) : all
  // Pagination — 100 at a time; resets when the filter or range changes.
  const [shown, setShown] = useState(100)
  useEffect(() => { setShown(100) }, [q, all.length])
  const rows = matched.slice(0, shown)
  return (
    <div className="v-pad">
      <div className="ofilter">
        <input value={filter} onChange={e => setFilter?.(e.target.value)}
          placeholder="filter — order #, channel (Meta, Direct…), date (Jul 5), customer, campaign" />
        {q && <button className="tt-btn" onClick={() => setFilter?.('')}>✕ clear</button>}
        {q && <span className="of-count">{matched.length} of {all.length} match</span>}
        <div className="colpick" ref={pickRef}>
          <button className={`tt-btn ${cols ? 'on' : ''}`} onClick={() => setPickOpen(o => !o)} title="choose columns">
            ⊞ columns {activeKeys.length}/{ORDER_FIELDS.length}
          </button>
          {pickOpen && (
            <div className="colpick-pop">
              {ORDER_FIELDS.map(f => (
                <label key={f.key} className="colpick-it">
                  <input type="checkbox" checked={activeSet.has(f.key)} onChange={() => toggleCol(f.key)} />
                  {f.label}
                </label>
              ))}
              <div className="colpick-foot">
                <button className="tt-btn" onClick={() => saveCols(ORDER_FIELDS.map(f => f.key))}>all — mirror db</button>
                <button className="tt-btn" onClick={() => { setCols(null); localStorage.removeItem('ide_ordercols') }}>reset</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {q && matched.length === 0 ? (
        <p className="loading">no orders match “{filter}” — chart buckets like “Wk1” aggregate many rows; try a channel or a date.</p>
      ) : (
        <>
          <ResizableTable
            id={`orders.${activeKeys.join('.')}`}
            columns={fields.map(f => ({ label: f.label, num: f.num }))}
            rows={rows.map(o => fields.map(f => f.cell(o)))}
            note={`showing ${rows.length} of ${matched.length}${q ? ' matching' : ''}.`}
          />
          {matched.length > shown && (
            <div className="o-more">
              <button className="tt-btn" onClick={() => setShown(s => s + 100)}>▾ load 100 more ({matched.length - shown} left)</button>
              <button className="tt-btn" onClick={() => setShown(matched.length)}>show all {matched.length}</button>
            </div>
          )}
        </>
      )}
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

function LedgerView({ ledger, onUndo }) {
  if (!ledger.length) return <p className="loading v-pad">no decisions yet — approve something in PROBLEMS with y.</p>
  return (
    <div className="v-pad">
      <ResizableTable
        id="ledger3"
        columns={[{ label: 'Decision' }, { label: 'When' }, { label: 'Est.', num: true }, { label: 'Measured', num: true }, { label: 'Status' }, { label: '' }]}
        rows={ledger.map((r) => [
          { v: r.what, cls: 'tname', s: r.what },
          { v: new Date(r.approved_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), s: r.approved_at },
          { v: Number(r.est_impact_monthly) > 0 ? '+' + money(r.est_impact_monthly) + '/mo' : '—', cls: 'num v-dim', s: Number(r.est_impact_monthly) || 0 },
          {
            v: r.measured
              ? (r.measured.delta_monthly != null ? `${r.measured.delta_monthly >= 0 ? '+' : ''}${money(r.measured.delta_monthly)}/mo` : 'n/a')
              : 'in ~7d',
            cls: `num ${r.measured?.delta_monthly > 0 ? 'good' : r.measured?.delta_monthly < 0 ? 'bad' : 'v-dim'}`,
            s: r.measured?.delta_monthly ?? -999999,
          },
          { v: <span className={`pill ${r.status === 'executed' ? 'ok' : 'dead'}`}>{r.status}</span>, s: r.status },
          { v: r.status !== 'reverted' ? <button className="tt-btn" onClick={() => onUndo(r)} title="revert — reopens in PROBLEMS">↩ undo</button> : '—' },
        ])}
        note="persisted in the database · Measured = whole-account net/day delta over the 7 days after approval vs the 7 before (directional, not campaign-isolated) · undo reverts the log; live platform changes list rollback info on the decision."
      />
    </div>
  )
}

function PoliciesView({ policies }) {
  if (!policies.length) return <p className="loading v-pad">no standing rules yet — dismiss a finding with n and say why.</p>
  return (
    <div className="v-pad">
      <ResizableTable
        id="policies"
        columns={[{ label: 'Rule' }, { label: 'Taught' }]}
        rows={policies.map(p => [
          { v: p.reason, cls: 'tname' },
          { v: new Date(p.taught_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) },
        ])}
        note="persisted in the database — the watcher (page loads AND the nightly cron) checks these before proposing."
      />
    </div>
  )
}

/* ══════════ Terminal turns (same grammar as before) ══════════ */

function Turn({ t, selected, onSelect, onApprove, onTeach, onSaveTeach, onPin, onDrill, bare }) {
  if (t.kind === 'render') return bare ? null : (
    <div className="turn"><div className="gutter"><div className="glyph bluec">▦</div><div className="body">
      <div className="meta"><span className="who">agent · rendered view</span></div>
      <div className="render-card">
        <div className="render-h"><span className="render-t">{t.spec.title}</span>
          <button className="tt-btn" onClick={onPin} title="save as a file in the explorer">📌 pin to tab</button>
        </div>
        <RenderSpec spec={t.spec} onDrill={onDrill} />
      </div>
    </div></div></div>
  )
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
      {t.bars && <Bars rows={t.bars} onDrill={onDrill} />}
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

/* Simple read-only table for agent-rendered specs (ResizableTable is for the
   interactive doc views; this one is intentionally dependency-free). */
function DataTable({ head, rows }) {
  return (
    <div className="datatable"><table>
      <thead><tr>{head.map((h, i) => <th key={i} style={i > 0 ? { textAlign: 'right' } : undefined}>{h}</th>)}</tr></thead>
      <tbody>{(rows || []).map((r, i) => <tr key={i}>{(Array.isArray(r) ? r : [String(r)]).map((c, j) => <td key={j} className={j > 0 ? 'num' : ''}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  )
}

/* Generative UI: render a spec the agent produced (bar | line | table) */
const SERIES_COLORS = ['#6ea8fe', '#3fd68f', '#e8b45a', '#a78bfa', '#f4747f']
function RenderSpec({ spec, onDrill }) {
  if (spec.type === 'bar' && spec.bars?.length) {
    return <Bars rows={spec.bars.map((b, i) => ({ label: b.label, value: b.value, color: SERIES_COLORS[i % SERIES_COLORS.length], text: b.text ?? String(b.value) }))} onDrill={onDrill} />
  }
  if (spec.type === 'line' && spec.line?.series?.length) return <LineChart line={spec.line} onDrill={onDrill} />
  if (spec.type === 'table' && spec.table?.head) return <DataTable head={spec.table.head} rows={spec.table.rows || []} />
  return <p className="v-dim">unrenderable spec ({spec.type})</p>
}

function LineChart({ line, onDrill }) {
  const labels = line.labels || []
  // Sanitize model output — a single null/string value must not NaN the SVG
  const series = (line.series || []).map(s => ({ ...s, values: (s.values || []).map(v => Number(v) || 0) }))
  const [hover, setHover] = useState(null) // point index under the cursor
  const W = 620, H = 150, P = 8
  const all = series.flatMap(s => s.values)
  if (!all.length) return null
  const max = Math.max(...all) * 1.08 || 1
  const min = Math.min(0, ...all)
  const n = Math.max(...series.map(s => s.values.length))
  const px = (i) => P + i * (W - 2 * P) / Math.max(1, n - 1)
  const py = (v) => H - P - (v - min) / (max - min || 1) * (H - 2 * P)
  const fmt = (v) => Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100)
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - box.left) / box.width * W
    setHover(Math.min(n - 1, Math.max(0, Math.round((x - P) / ((W - 2 * P) / Math.max(1, n - 1))))))
  }
  // Tooltip flips sides past the midpoint so it never clips at the edges
  const tipLeft = hover != null ? px(hover) / W * 100 : 0
  return (
    <div style={{ maxWidth: W }}>
      <div style={{ marginBottom: 4 }}>
        {series.map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 14, fontSize: 11, color: 'var(--dim)' }}>
            <i style={{ width: 10, height: 3, background: SERIES_COLORS[i % SERIES_COLORS.length], display: 'inline-block', borderRadius: 2 }} />{s.name}
          </span>
        ))}
      </div>
      <div className="ct-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={onDrill ? { cursor: 'pointer' } : undefined}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}
          onClick={() => { if (hover != null && labels[hover] != null) onDrill?.(labels[hover]) }}>
          <line x1={P} y1={py(0)} x2={W - P} y2={py(0)} stroke="rgba(255,255,255,.12)" strokeWidth="1" />
          {series.map((s, i) => (
            <polyline key={i} fill="none" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth="2"
              points={s.values.map((v, j) => `${px(j)},${py(v)}`).join(' ')} />
          ))}
          {hover != null && <>
            <line x1={px(hover)} y1={P} x2={px(hover)} y2={H - P} stroke="rgba(255,255,255,.28)" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((s, i) => s.values[hover] != null && (
              <circle key={i} cx={px(hover)} cy={py(s.values[hover])} r="3.5"
                fill={SERIES_COLORS[i % SERIES_COLORS.length]} stroke="#0b0e14" strokeWidth="1.5" />
            ))}
          </>}
        </svg>
        {hover != null && (
          <div className="ct-tip" style={tipLeft > 55 ? { right: `${100 - tipLeft}%`, marginRight: 8 } : { left: `${tipLeft}%`, marginLeft: 8 }}>
            <div className="ct-tip-l">{labels[hover] ?? `#${hover + 1}`}</div>
            {series.map((s, i) => s.values[hover] != null && (
              <div key={i} className="ct-tip-r">
                <i style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{s.name}<b>{fmt(s.values[hover])}</b>
              </div>
            ))}
            {onDrill && <div className="ct-tip-h">click → matching orders</div>}
          </div>
        )}
      </div>
      {labels.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--faint)' }}>
          <span>{labels[0]}</span><span>{labels[Math.floor(labels.length / 2)]}</span><span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  )
}

function Bars({ rows, onDrill }) {
  const max = Math.max(...rows.map(r => r.value), 0.001)
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div key={i} className={`brow ${onDrill ? 'drill' : ''}`} title={onDrill ? 'click → matching orders' : undefined}
          onClick={onDrill ? () => onDrill(r.label) : undefined}>
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
.ide .explorer{flex-shrink:0;background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;padding-bottom:20px;}

/* resize handles — invisible until hover, like VS Code */
.ide .resize-h{width:5px;margin:0 -2px;flex-shrink:0;cursor:col-resize;z-index:5;position:relative;}
.ide .resize-h:hover,.ide .resize-h:active{background:rgba(110,168,254,.45);}
.ide .resize-v{height:5px;margin-bottom:-2px;cursor:row-resize;z-index:5;position:relative;flex-shrink:0;}
.ide .resize-v:hover,.ide .resize-v:active{background:rgba(110,168,254,.45);}
.ide .exp-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;font-weight:800;font-size:12.5px;border-bottom:1px solid var(--line);}
.ide .exp-badge{font-size:9px;font-weight:800;color:var(--green);background:rgba(63,214,143,.12);border-radius:4px;padding:1px 6px;}
.ide .exp-sec{font-size:9.5px;font-weight:800;letter-spacing:.09em;color:var(--faint);padding:14px 14px 4px;}
.ide .exp-item{display:flex;align-items:center;gap:8px;padding:5px 14px;font-size:12.5px;color:var(--dim);cursor:pointer;border-left:2px solid transparent;}
.ide .exp-item:hover{color:var(--txt);background:rgba(255,255,255,.02);}
.ide .exp-item.on{color:var(--txt);background:rgba(110,168,254,.07);border-left-color:var(--blue);}
.ide .exp-ic{width:16px;text-align:center;font-size:11px;}
.ide .exp-n{margin-left:auto;font-size:10px;color:var(--faint);background:var(--panel2);border-radius:99px;padding:0 6px;}
.ide .exp-n.warn{color:var(--amber);background:rgba(232,180,90,.12);font-weight:800;}
.ide .exp-trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* generative UI */
.ide .datatable{margin:6px 0 2px;border:1px solid var(--line);border-radius:7px;overflow-x:auto;font-size:12px;max-width:640px;}
.ide .datatable table{width:100%;border-collapse:collapse;}
.ide .datatable th{text-align:left;color:var(--faint);font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:6px 11px;background:var(--panel2);font-weight:700;white-space:nowrap;}
.ide .datatable td{padding:5.5px 11px;border-top:1px solid var(--line);color:var(--dim);}
.ide .datatable td:first-child{color:var(--txt);font-weight:600;}
.ide .datatable td.num{text-align:right;font-variant-numeric:tabular-nums;}
.ide .render-card{border:1px solid rgba(110,168,254,.2);border-radius:8px;background:rgba(110,168,254,.03);padding:10px 13px;margin-top:3px;max-width:680px;}
.ide .render-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;}
.ide .render-t{font-weight:700;font-size:12.5px;}
.ide .pin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px;flex-wrap:wrap;}
.ide .pin-title{font-size:14px;font-weight:800;}
.ide .pin-actions{display:flex;gap:8px;}

/* main column */
.ide .main{flex:1;display:flex;flex-direction:column;min-width:0;}
.ide .tabbar{display:flex;align-items:stretch;background:var(--panel);border-bottom:1px solid var(--line);height:34px;flex-shrink:0;overflow-x:auto;}
.ide .burger{background:none;border:none;color:var(--faint);font:inherit;padding:0 12px;cursor:pointer;border-right:1px solid var(--line);}
.ide .burger:hover{color:var(--txt);}
.ide .tab{display:flex;align-items:center;gap:7px;padding:0 14px;font-size:12px;color:var(--dim);border-right:1px solid var(--line);cursor:pointer;white-space:nowrap;}
.ide .tab.on{color:var(--txt);background:var(--bg);box-shadow:inset 0 2px 0 var(--blue);}
.ide .tab-x{color:var(--faint);font-size:13px;} .ide .tab-x:hover{color:var(--txt);}
.ide .view-row{flex:1;display:flex;min-height:0;position:relative;z-index:1;}
.ide .view{flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;min-width:0;}
.ide .view-row.issplit .view{flex:none;}
.ide .view.split{border-left:1px solid var(--line);}
.ide .split-head{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:5px 10px;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:2;}
.ide .split-head select{background:var(--panel2);border:1px solid var(--line);color:var(--txt);font:inherit;font-size:11px;border-radius:5px;padding:2px 6px;outline:none;cursor:pointer;max-width:70%;}
.ide .tab-spacer{flex:1;}
.ide .burger.on-btn{color:var(--blue);}
.ide .vtable th.sortable{cursor:pointer;}
.ide .vtable th.sortable:hover{color:var(--txt);}
.ide .qp-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:75%;}
.ide .loading{color:var(--faint);font-size:12.5px;padding:18px;}
.ide .v-pad{padding:18px 22px 26px;}
.ide .v-h{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:20px 0 8px;}
.ide .v-note{color:var(--faint);font-size:11px;margin-top:12px;}

/* campaign builder sheet */
.ide .cb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;}
.ide .cb-actions{display:flex;gap:8px;}
.ide .cb-camp{border:1px solid var(--line);border-radius:9px;margin-top:14px;overflow:hidden;}
.ide .cb-camp-head{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--panel2);border-bottom:1px solid var(--line);}
.ide .cb-camp-name{font-weight:700;color:var(--txt);}
.ide .cb-badge{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--amber);background:rgba(232,180,90,.14);border-radius:4px;padding:1px 6px;}
.ide .cb-badge.en{color:var(--green);background:rgba(63,214,143,.14);}
.ide .cb-dl{margin-left:auto;color:var(--faint);cursor:pointer;background:none;border:none;font:inherit;padding:0 4px;}
.ide .cb-dl:hover{color:var(--blue);}
.ide .cb-x{color:var(--faint);cursor:pointer;background:none;border:none;font:inherit;padding:0 2px;}
.ide .cb-x:hover{color:var(--red);}
.ide .cb-ag{padding:10px 12px;border-top:1px solid var(--line);}
.ide .cb-ag:first-child{border-top:none;}
.ide .cb-ag-name{font-weight:600;color:var(--dim);margin-bottom:8px;font-size:12px;}
.ide .cb-cols{display:grid;grid-template-columns:minmax(180px,1fr) minmax(240px,2fr);gap:16px;}
.ide .cb-col-h{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin:6px 0 5px;}
.ide .cb-kw{font-size:12px;color:var(--dim);padding:2px 0;display:flex;align-items:center;gap:7px;}
.ide .cb-mt{display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;border-radius:3px;font-size:9px;font-weight:800;flex-shrink:0;}
.ide .cb-mt-exact{background:rgba(63,214,143,.16);color:var(--green);}
.ide .cb-mt-phrase{background:rgba(110,168,254,.16);color:var(--blue);}
.ide .cb-mt-broad{background:rgba(138,147,168,.16);color:var(--dim);}
.ide .cb-asset{font-size:12px;color:var(--dim);padding:2px 0;display:flex;align-items:baseline;gap:8px;}
.ide .cb-asset.desc{color:var(--faint);}
.ide .cb-asset.over{color:var(--red);}
.ide .cb-len{font-size:9px;color:var(--faint);min-width:20px;text-align:right;font-variant-numeric:tabular-nums;}
.ide .cb-asset.over .cb-len{color:var(--red);font-weight:700;}
.ide .cb-url{font-size:11px;color:var(--blue);margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .cb-creative{font-size:11px;color:var(--purple);margin-top:5px;font-style:italic;}

/* daily P&L */
.ide .pnl{max-width:680px;border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-top:4px;}
.ide .pnl-row{display:flex;align-items:baseline;gap:10px;padding:5px 13px;font-size:12.5px;}
.ide .pnl-row:nth-child(odd){background:rgba(255,255,255,.015);}
.ide .pnl-l{color:var(--dim);flex:1;}
.ide .pnl-v{font-variant-numeric:tabular-nums;font-weight:600;color:var(--txt);}
.ide .pnl-v.strong{font-weight:800;}
.ide .pnl-v.good{color:var(--green);} .ide .pnl-v.warn{color:var(--amber);} .ide .pnl-v.bad{color:var(--red);} .ide .pnl-v.dim{color:var(--faint);font-weight:500;}
.ide .pnl-pct{color:var(--faint);font-size:10.5px;min-width:90px;text-align:right;}
.ide .pnl-sep{height:1px;background:var(--line);margin:3px 0;}
.ide .pnl-sub{color:var(--faint);font-size:10.5px;}
.ide .pnl-info{color:var(--faint);font-size:10px;margin-left:5px;cursor:help;opacity:.55;vertical-align:middle;}
.ide .pnl-info:hover{opacity:1;color:var(--blue);}
.ide .pnl-edit{background:none;border:none;color:var(--faint);cursor:pointer;font:inherit;font-size:10px;padding:0 3px;}
.ide .pnl-edit:hover{color:var(--blue);}
.ide .pnl-editin{color:var(--txt);font-size:11px;}
.ide .pnl-editin input{width:48px;background:var(--panel2);border:1px solid var(--blue);border-radius:4px;color:var(--txt);font:inherit;font-size:11px;padding:0 4px;margin:0 1px;outline:none;}
/* drill-to-source (Overview P&L → client_orders → line → SKU → BOM → materials) */
.ide .pnl-row.drillable{cursor:pointer;}
.ide .pnl-row.drillable:hover{background:rgba(255,255,255,.03);}
.ide .pnl-row.on{background:rgba(110,168,254,.07);}
.ide .pnl-caret{display:inline-block;width:12px;color:var(--faint);font-size:9px;}
.ide .pnl-row.drillable:hover .pnl-caret{color:var(--blue);}
.ide .pnl-drill{background:var(--bg);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
.ide .src{padding:8px 13px 10px;}
.ide .src-h{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin-bottom:6px;}
.ide .src-scroll{max-height:320px;overflow-y:auto;}
.ide .src-orow,.ide .src-crow{display:grid;grid-template-columns:1fr 78px minmax(0,1.3fr) 92px;gap:8px;align-items:center;padding:3px 4px;font-size:11.5px;border-top:1px solid rgba(255,255,255,.04);}
.ide .src-crow{grid-template-columns:1fr minmax(0,1.4fr) 92px;}
.ide .src-o:first-child .src-orow,.ide .src-scroll>.src-crow:first-child{border-top:none;}
.ide .src-orow.drillable{cursor:pointer;} .ide .src-orow.drillable:hover{background:rgba(255,255,255,.03);}
.ide .src-orow.on{background:rgba(110,168,254,.07);}
.ide .src-name{color:var(--txt);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .src-email,.ide .src-date{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .src-amt{text-align:right;color:var(--txt);font-weight:600;font-variant-numeric:tabular-nums;}
.ide .casc{background:var(--panel);border-top:1px solid var(--line);padding:4px 4px 4px 16px;}
.ide .casc-line{border-top:1px solid rgba(255,255,255,.04);} .ide .casc-line:first-child{border-top:none;}
.ide .casc-lhead{display:grid;grid-template-columns:1fr minmax(0,1.2fr) 80px;gap:8px;align-items:center;padding:3px 4px;font-size:11px;cursor:pointer;}
.ide .casc-lhead.unmatched{cursor:default;opacity:.6;}
.ide .casc-lhead:not(.unmatched):hover{background:rgba(255,255,255,.03);}
.ide .casc-name{color:var(--txt);} .ide .casc-sku{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .casc-cost{text-align:right;font-variant-numeric:tabular-nums;color:var(--txt);}
.ide .casc-bom{padding:2px 4px 4px 16px;background:var(--bg);}
.ide .casc-bom-h{font-size:9.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin:2px 0 3px;}
.ide .casc-brow{display:grid;grid-template-columns:1fr minmax(0,120px) 70px;gap:8px;align-items:center;padding:1px 4px;font-size:10.5px;}
.ide .casc-bname{color:var(--dim);} .ide .casc-empty{padding:4px 8px;}

/* P&L history record table */
.ide .rec{border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-top:6px;max-width:860px;}
.ide .rec-head,.ide .rec-row{display:grid;grid-template-columns:96px repeat(9,1fr);gap:6px;align-items:center;padding:6px 12px;font-size:12px;}
.ide .rec-head{background:var(--panel2);color:var(--faint);font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;}
.ide .rec-row{border-top:1px solid var(--line);cursor:pointer;font-variant-numeric:tabular-nums;}
.ide .rec-row:hover{background:rgba(255,255,255,.02);}
.ide .rec-row.on{background:rgba(110,168,254,.08);}
.ide .rec-c{text-align:right;color:var(--dim);overflow:hidden;text-overflow:ellipsis;}
.ide .rec-c.date{text-align:left;color:var(--txt);font-weight:600;}
.ide .rec-c.strong{font-weight:800;color:var(--txt);} .ide .rec-c.good{color:var(--green);} .ide .rec-c.warn{color:var(--amber);} .ide .rec-c.bad{color:var(--red);} .ide .rec-c.dim{color:var(--faint);}
.ide .rec-src{padding:8px 14px 12px;background:var(--bg);border-top:1px solid var(--line);}
.ide .rec-src-h{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);margin-bottom:6px;}
.ide .rec-o{display:grid;grid-template-columns:130px 84px 1fr 90px 80px;gap:10px;align-items:center;padding:2px 0;font-size:11.5px;}
.ide .rec-o-name{color:var(--txt);font-weight:600;}
.ide .rec-o-f.good{color:var(--green);} .ide .rec-o-f.dim{color:var(--faint);}
.ide .rec-o-amt{text-align:right;color:var(--txt);font-weight:600;font-variant-numeric:tabular-nums;}

/* memory */
.ide .mem-list{margin-top:12px;display:flex;flex-direction:column;gap:1px;}
.ide .mem-row{display:flex;gap:11px;padding:9px 4px;border-top:1px solid var(--line);}
.ide .mem-row:first-child{border-top:none;}
.ide .mem-kind{flex-shrink:0;font-size:13px;width:18px;text-align:center;}
.ide .mem-content{color:var(--txt);font-size:13px;line-height:1.45;}
.ide .mem-meta{color:var(--faint);font-size:10.5px;margin-top:3px;text-transform:capitalize;}
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
.ide .vtable td.mono{color:var(--txt);font-weight:600;white-space:nowrap;}
.ide .vtable td.strong{font-weight:800;color:var(--txt);} .ide .vtable td.good{color:var(--green);} .ide .vtable td.warn{color:var(--amber);} .ide .vtable td.bad{color:var(--red);} .ide .vtable td.dim{color:var(--faint);}
.ide .vtable tr.rt-click{cursor:pointer;} .ide .vtable tr.rt-click:hover td{background:rgba(255,255,255,.02);}
.ide .vtable tr.rt-click.on td{background:rgba(110,168,254,.08);}
.ide .vtable tr.rt-exrow td{padding:0;background:var(--bg);}
.ide .pill{font-size:9.5px;font-weight:800;border-radius:99px;padding:1px 8px;}

/* resizable table (Google Sheets behavior, IDE skin) */
.ide .ttools{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-bottom:6px;}
.ide .tt-hint{color:var(--faint);font-size:10px;margin-right:auto;}
.ide .tt-btn{background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--faint);font:inherit;font-size:10.5px;padding:3px 10px;cursor:pointer;}
.ide .tt-btn:hover{color:var(--txt);border-color:var(--dim);}
.ide .tt-btn.on{color:var(--blue);border-color:rgba(110,168,254,.4);background:rgba(110,168,254,.08);}
.ide .rt-scroll{overflow-x:auto;max-width:100%;}
.ide .vtable.rt.rt-fixed{table-layout:fixed;}
.ide .vtable.rt th{position:relative;user-select:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ide .vtable.rt .col-grip{position:absolute;top:0;right:-4px;width:9px;height:100%;cursor:col-resize;z-index:3;
  background:linear-gradient(to right,transparent 3.5px,rgba(255,255,255,.14) 3.5px,rgba(255,255,255,.14) 4.5px,transparent 4.5px);}
.ide .vtable.rt .col-grip:hover,.ide .vtable.rt .col-grip:active{background:linear-gradient(to right,transparent 3px,rgba(110,168,254,.6) 3px,rgba(110,168,254,.6) 5px,transparent 5px);}
.ide .vtable.rt.wrapoff td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ide .vtable.rt.wrapon td{white-space:normal;word-break:break-word;overflow-wrap:anywhere;vertical-align:top;}
.ide .vtable.rt.wrapon td.tname,.ide .vtable.rt.wrapoff td.tname{max-width:none;}
.ide .vtable.rt.wrapoff td.tname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .vtable.rt.wrapon td.tname{overflow:visible;text-overflow:clip;white-space:normal;}
.ide .pill.ok{background:rgba(63,214,143,.12);color:var(--green);}
.ide .pill.dead{background:rgba(255,255,255,.07);color:var(--faint);}

/* daily spark */
.ide .spark{display:flex;align-items:flex-end;gap:2px;height:90px;max-width:900px;}
.ide .sp-col{flex:1;height:100%;display:flex;align-items:flex-end;}
.ide .sp-col i{display:block;width:100%;background:rgba(110,168,254,.55);border-radius:2px 2px 0 0;min-height:2px;}
.ide .sp-col:hover i{background:var(--blue);}

/* panel */
.ide .panel{min-height:120px;border-top:1px solid var(--line);background:var(--bg);display:flex;flex-direction:column;flex-shrink:0;position:relative;z-index:10;}
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

/* prompt — Cursor style: input sits on the terminal background, bounded by
   thin hairlines above and below (no box, no radius, no fill) */
/* Claude Code-style prompt: thin rules above/below the input, inset from the
   edges, with a status hint line tucked under the lower rule. */
.ide .prompt-wrap{margin:2px 12px 4px;flex-shrink:0;}
.ide .prompt{display:flex;gap:9px;align-items:center;border-top:1px solid rgba(255,255,255,.26);border-bottom:1px solid rgba(255,255,255,.26);background:var(--bg);padding:9px 4px;transition:border-color .15s;}
.ide .prompt:focus-within{border-top-color:rgba(255,255,255,.45);border-bottom-color:rgba(255,255,255,.45);}
.ide .prompt-hint{padding:5px 4px 6px;font-size:11.5px;letter-spacing:.01em;user-select:none;}
.ide .ph-mode{font-weight:700;}
.ide .ph-mode.warn{color:var(--amber);} .ide .ph-mode.bad{color:var(--red);} .ide .ph-mode.dim{color:var(--faint);}
.ide .ph-agent{color:var(--blue);font-weight:700;}
.ide .ph-q-on{color:var(--green);}
.ide .ps{color:var(--green);font-weight:800;}
.ide .prompt input{flex:1;background:transparent;border:none;outline:none;color:var(--txt);font:inherit;caret-color:var(--txt);}

/* status bar */
.ide .statusbar{display:flex;align-items:center;border-top:1px solid var(--line);background:var(--panel);padding:0 10px;height:30px;font-size:11px;flex-shrink:0;overflow-x:auto;white-space:nowrap;}
.ide .seg{padding:0 10px;border-right:1px solid var(--line);display:flex;gap:6px;align-items:center;height:100%;}
.ide .seg.last{border-right:none;gap:6px;}
.ide .seg.probs{cursor:pointer;}
.ide .sel-range select{background:var(--panel2);border:1px solid var(--line);color:var(--txt);font:inherit;font-size:11px;border-radius:5px;padding:1px 5px;outline:none;cursor:pointer;}
.ide .custom-range{display:inline-flex;align-items:center;gap:4px;margin-left:5px;}
.ide .custom-range input{background:var(--panel2);border:1px solid var(--line);color:var(--txt);font:inherit;font-size:10.5px;border-radius:5px;padding:1px 4px;outline:none;color-scheme:dark;}
.ide .custom-range input:focus{border-color:var(--blue);}
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

/* interactive charts — hover tooltip + click-to-drill */
.ide .ct-wrap{position:relative;}
.ide .ct-tip{position:absolute;top:4px;background:var(--panel2);border:1px solid rgba(255,255,255,.14);border-radius:7px;padding:7px 10px;font-size:11px;line-height:1.5;pointer-events:none;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.45);z-index:5;}
.ide .ct-tip-l{color:var(--txt);font-weight:700;margin-bottom:2px;}
.ide .ct-tip-r{display:flex;align-items:center;gap:6px;color:var(--dim);}
.ide .ct-tip-r i{width:8px;height:8px;border-radius:2px;display:inline-block;flex-shrink:0;}
.ide .ct-tip-r b{color:var(--txt);margin-left:auto;padding-left:12px;}
.ide .ct-tip-h{color:var(--faint);font-size:10px;margin-top:3px;border-top:1px solid var(--line);padding-top:3px;}
.ide .brow.drill{cursor:pointer;border-radius:5px;}
.ide .brow.drill:hover{background:rgba(110,168,254,.07);}
.ide .brow.drill:hover .bl{color:var(--txt);}

/* orders filter bar (drill target) */
.ide .ofilter{display:flex;align-items:center;gap:9px;margin-bottom:10px;}
.ide .ofilter input{flex:0 1 380px;background:var(--panel2);border:1px solid var(--line);border-radius:7px;color:var(--txt);font:inherit;font-size:12px;padding:6px 10px;outline:none;}
.ide .ofilter input:focus{border-color:rgba(110,168,254,.45);}
.ide .of-count{color:var(--dim);font-size:11px;}
.ide .colpick{position:relative;margin-left:auto;}
.ide .colpick-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:40;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:9px;display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:1px 12px;box-shadow:0 14px 34px rgba(0,0,0,.55);}
.ide .colpick-it{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dim);padding:3px 5px;cursor:pointer;border-radius:5px;white-space:nowrap;}
.ide .colpick-it:hover{color:var(--txt);background:rgba(255,255,255,.04);}
.ide .colpick-it input{accent-color:var(--blue);cursor:pointer;}
.ide .colpick-foot{grid-column:1/-1;display:flex;gap:8px;margin-top:7px;padding-top:9px;border-top:1px solid var(--line);}
.ide .o-more{display:flex;gap:8px;margin-top:10px;}
`
