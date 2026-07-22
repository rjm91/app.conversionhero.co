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
import { useTerminalHistory, relTime } from '../../../../lib/terminal-history'
import { supabase } from '../../../../lib/supabase'
import { fetchAllRows } from '../../../../lib/fetch-all'
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
    { id: 'overview', icon: '📊', label: 'PnL' },
    { id: 'schema', icon: '🗄', label: 'Schema' },
  ]},
  { section: 'CAMPAIGNS', items: [
    { id: 'google', icon: '🔍', label: 'Google Ads' },
    { id: 'meta', icon: '📘', label: 'Meta Ads' },
  ]},
  { section: 'BUILD', items: [
    { id: 'campaign', icon: '🎯', label: 'Campaign Builder' },
  ]},
  { section: 'DOCS', items: [
    { id: 'manual', icon: '📖', label: 'Manual' },
    { id: 'ledger', icon: '🧾', label: 'Ledger' },
    { id: 'policies', icon: '🛡', label: 'Policies' },
    { id: 'memory', icon: '🧠', label: 'Memory' },
  ]},
  { section: 'CONFIG', items: [
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ]},
]
const VIEW_TITLES = { overview: 'PnL', schema: 'Schema', google: 'Google Ads', meta: 'Meta Ads', orders: 'Orders', klaviyo: 'Klaviyo', campaign: 'Campaign Builder', pnl_history: 'Daily P&L History', manual: 'Manual', ledger: 'Ledger', policies: 'Policies', memory: 'Memory', settings: 'Settings' }
// Tabs the client can never lose (structural). Everything else is toggleable in
// Settings; DEFAULT_CLIENT_HIDDEN applies until an agency admin sets an explicit list.
const CORE_TABS = new Set(['overview', 'schema', 'settings'])
const TOGGLEABLE_TABS = [
  { id: 'google', label: 'Google Ads' }, { id: 'meta', label: 'Meta Ads' },
  { id: 'campaign', label: 'Campaign Builder' }, { id: 'manual', label: 'Manual' },
  { id: 'ledger', label: 'Ledger' }, { id: 'policies', label: 'Policies' }, { id: 'memory', label: 'Memory' },
]
const DEFAULT_CLIENT_HIDDEN = ['manual', 'ledger', 'policies', 'memory']

export default function BusinessIDE() {
  const { clientId } = useParams()
  const router = useRouter()
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
  // Deep link (?focus=<table>&day=…) → open the client Schema browser tab.
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('focus')) { setTabs(t => t.includes('schema') ? t : [...t, 'schema']); setActiveTab('schema') } } catch { /* ignore */ }
  }, [])
  const [splitTab, setSplitTab] = useState(null)   // second editor pane (or null)
  const [splitPct, setSplitPct] = useState(45)     // right pane width %
  const [qpOpen, setQpOpen] = useState(false)      // ⌘P quick-open
  const [qpQ, setQpQ] = useState('')
  const [panelOpen, setPanelOpen] = useState(false) // closed on load — open via sidebar Terminal/Problems or ctrl+`
  const [panelTab, setPanelTab] = useState('terminal') // 'terminal' | 'problems'
  const [sideOpen, setSideOpen] = useState(true)
  // Resizable panes — drag the dividers like a real IDE; sizes persist.
  const [sideW, setSideW] = useState(218)
  const [panelH, setPanelH] = useState(300)
  const viewRowRef = useRef(null)
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
        const deltaPct = (e.clientX - d.startX) / d.trackW * 100
        const pct = Math.min(70, Math.max(20, d.startPct - deltaPct))
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
    if (type === 'vsplit') {
      const trackW = viewRowRef.current?.getBoundingClientRect().width
      if (!trackW) return
      // Track movement relative to where the divider was grabbed. Using the
      // full window here makes the divider jump because the editor starts to
      // the right of the explorer sidebar.
      dragRef.current = { type, startX: e.clientX, startPct: splitPct, trackW }
    } else {
      dragRef.current = { type }
    }
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

  // Durable per-user terminal chat history (fail-safe — no-ops if the table is
  // missing). Persists the CONVERSATION turns (you/agent); findings + decisions
  // are already server-backed and re-boot themselves.
  const [histOpen, setHistOpen] = useState(false)   // session-history dropdown
  const [bootNonce, setBootNonce] = useState(0)      // bumped each boot → triggers conversation hydration
  const convHydratedRef = useRef(false)
  const { ready: histReady, sessions: histSessions, messages: histMessages, sessionId: histSessionId, saveTurn, newSession: newHistSession, loadSession: loadHistSession } = useTerminalHistory(clientId)
  const msgToTurn = (msg) => ({ id: tid(), kind: msg.role === 'user' ? 'you' : msg.role === 'agent' ? 'agent' : 'sys', text: msg.content || '' })

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
  // ROAS/CAC color thresholds override — same optimistic pattern as cost-per-label.
  const [roasOverride, setRoasOverride] = useState(null) // { red, green }
  const [cacOverride, setCacOverride] = useState(null)   // { green, red }
  const [aovOverride, setAovOverride] = useState(null)   // { red, green }
  const m = useMemo(() => {
    if (!data) return null
    const costPerLabel = labelOverride != null ? labelOverride : data.pnlConfig?.costPerLabel
    const roas = roasOverride ? { roasRedBelow: roasOverride.red, roasGreenAbove: roasOverride.green } : {}
    const cac = cacOverride ? { cacGreenBelow: cacOverride.green, cacRedAbove: cacOverride.red } : {}
    const aov = aovOverride ? { aovRedBelow: aovOverride.red, aovGreenAbove: aovOverride.green } : {}
    return computeMission({ ...data, pnlConfig: { ...data.pnlConfig, costPerLabel, ...roas, ...cac, ...aov } })
  }, [data, labelOverride, roasOverride, cacOverride, aovOverride])
  const isAgencyRole = viewer?.role?.startsWith('agency')
  const canEditRoas = isAgencyRole || viewer?.role === 'client_admin'
  // Client-visible tab control: agency sees everything; a client (real client
  // role OR the agency "view-as" preview) only sees tabs not hidden in settings.
  const [viewAs, setViewAs] = useState(false)
  useEffect(() => {
    const read = () => { try { setViewAs(localStorage.getItem('ca_view_as_client') === '1') } catch { /* noop */ } }
    read(); window.addEventListener('ca:viewas', read); window.addEventListener('storage', read)
    return () => { window.removeEventListener('ca:viewas', read); window.removeEventListener('storage', read) }
  }, [])
  const isClientView = !isAgencyRole || viewAs
  const hiddenTabs = data?.settings?.mission_hidden_tabs || DEFAULT_CLIENT_HIDDEN
  const visibleTree = useMemo(() => TREE.map(sec => ({
    ...sec,
    items: sec.items.filter(it => !isClientView || CORE_TABS.has(it.id) || !hiddenTabs.includes(it.id)),
  })).filter(sec => sec.items.length), [isClientView, hiddenTabs])
  const saveMissionTabs = useCallback(async (hidden) => {
    setData(d => d ? { ...d, settings: { ...(d.settings || {}), mission_hidden_tabs: hidden } } : d)
    try {
      await fetch('/api/client-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, settings: { mission_hidden_tabs: hidden } }) })
    } catch { /* stays applied locally; next load re-reads */ }
  }, [clientId])
  const saveCostPerLabel = useCallback(async (v) => {
    const val = Math.max(0, Number(v) || 0)
    setLabelOverride(val) // optimistic — P&L updates instantly
    try {
      await fetch('/api/client-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, settings: { cost_per_label: val } }) })
    } catch { /* stays applied locally; next load re-reads */ }
  }, [clientId])
  // AOV dial defaults — derived from the client's FULL locked P&L history
  // (daily AOV = net_sales ÷ orders; red below the 33rd percentile, green
  // above the 66th). Used until the client saves their own cutoffs.
  const [aovHist, setAovHist] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.from('client_daily_pnl').select('net_sales, total_orders')
      .eq('client_id', clientId).gt('total_orders', 0).limit(1000)
      .then(({ data }) => {
        if (!alive || !data?.length) return
        const aovs = data.map(r => Number(r.net_sales) / Number(r.total_orders)).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
        if (aovs.length < 10) return // too little history to be meaningful
        const pct = (p) => aovs[Math.min(aovs.length - 1, Math.floor(p * aovs.length))]
        setAovHist({ red: Math.round(pct(1 / 3)), green: Math.round(pct(2 / 3)), days: aovs.length })
      })
    return () => { alive = false }
  }, [clientId])
  const saveAovThresholds = useCallback(async ({ red, green }) => {
    setAovOverride({ red, green }) // optimistic — colors update instantly
    try {
      await fetch('/api/client-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, settings: { aov_red_below: red, aov_green_above: green } }) })
    } catch { /* stays applied locally; next load re-reads */ }
  }, [clientId])

  // Data freshness — when the mission data was last fetched, + a light manual
  // refresh that re-pulls rows without resetting the terminal session.
  const [loadedAt, setLoadedAt] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const refreshData = useCallback(async () => {
    setRefreshing(true)
    try {
      const d = await fetchMissionData(clientId, range.start, range.end)
      setData(d); setLoadedAt(Date.now())
    } catch { /* keep showing current data */ }
    setRefreshing(false)
  }, [clientId, range])

  // P&L zoom-out support: widen the loaded window so a Weekly/Quarterly view
  // aggregates full periods, not just the slice the current range happens to cover.
  const ensureRangeCovers = useCallback((startStr) => {
    if (range.start <= startStr) return
    setCustomRange({ start: startStr, end: range.end })
    setRangeKey('custom')
  }, [range])
  const saveRoasThresholds = useCallback(async ({ red, green }) => {
    setRoasOverride({ red, green }) // optimistic — colors update instantly
    try {
      await fetch('/api/client-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, settings: { roas_red_below: red, roas_green_above: green } }) })
    } catch { /* stays applied locally; next load re-reads */ }
  }, [clientId])
  const saveCacThresholds = useCallback(async ({ green, red }) => {
    setCacOverride({ green, red }) // optimistic — colors update instantly
    try {
      await fetch('/api/client-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, settings: { cac_green_below: green, cac_red_above: red } }) })
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
    convHydratedRef.current = false
    setTurns([]); setSelId(null); setSrvFindings(null)
    push({ kind: 'sys', text: `loading ${rangeLabel} of ${clientId} — orders, campaigns, BOM margins · running the watcher server-side…` })
    fetchMissionData(clientId, range.start, range.end)
      .then(d => { if (alive) { setData(d); setLoadedAt(Date.now()) } })
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
    setBootNonce(n => n + 1)   // signal the conversation-hydration effect to replay saved chat
    inputRef.current?.focus()
  }, [m, data, srvFindings, rangeN, rangeLabel, leversMode])

  // Auto-resume: after the findings boot, append this user's saved conversation
  // turns so the chat survives a refresh. Fail-safe — empty when the table/hook
  // is unavailable. Guarded so it appends once per boot; a "＋ New" / loadSession
  // sets convHydratedRef so it won't clobber a deliberately-chosen session.
  useEffect(() => {
    if (!bootNonce || !histReady || convHydratedRef.current) return
    convHydratedRef.current = true
    if (histMessages.length) setTurns(t => [...t, ...histMessages.map(msgToTurn)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootNonce, histReady, histMessages])

  // "＋ New" — fresh conversation; keep the findings (they're the workspace queue).
  const startNewSession = useCallback(() => {
    newHistSession()
    convHydratedRef.current = true   // don't replay old history into the new session
    setTurns(t => [...t.filter(x => x.kind === 'finding'), { id: tid(), kind: 'sys', text: 'new conversation — findings + decisions still persist server-side. ask away.' }])
    setHistOpen(false)
    inputRef.current?.focus()
  }, [newHistSession])

  // Load a past conversation — keep findings, swap in the chosen transcript.
  const openSession = useCallback(async (id) => {
    setHistOpen(false)
    convHydratedRef.current = true
    const msgs = await loadHistSession(id)
    setTurns(t => [...t.filter(x => x.kind === 'finding'), ...msgs.map(msgToTurn)])
    inputRef.current?.focus()
  }, [loadHistSession])

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
    saveTurn({ role: 'user', content: q })
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
      if (json.answer) saveTurn({ role: 'agent', content: json.answer, actions: (json.actions || []).length ? { actions: json.actions } : undefined })

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
  }, [busy, m, data, range, rangeLabel, ledger, policies, openTurns, turns, activeTab, push, patch, openTab, undoDecision, decide, clientId, campaignDoc, saveCampaignDoc, metaDoc, saveMetaDoc, saveTurn])

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
            {visibleTree.map(sec => (
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

          <div ref={viewRowRef} className={`view-row ${splitTab ? 'issplit' : ''}`}>
            <div className="view" style={splitTab ? { width: `${100 - splitPct}%` } : undefined}>
              <ViewBody id={activeTab} clientId={clientId} m={m} data={data} rangeN={rangeN} rangeLabel={rangeLabel} ledger={ledger} policies={policies} pins={pins}
                ordersQ={ordersQ} setOrdersQ={setOrdersQ} onDrill={drill}
                campaignDoc={campaignDoc} onSaveCampaigns={saveCampaignDoc} metaDoc={metaDoc} onSaveMeta={saveMetaDoc} clientName={data?.clientName || clientId} memories={memories} canEditLabel={isAgencyRole} onSaveLabel={saveCostPerLabel} canEditRoas={canEditRoas} onSaveRoas={saveRoasThresholds} onSaveCac={saveCacThresholds} rangeStart={range.start} onEnsureRange={ensureRangeCovers} onSaveAov={saveAovThresholds} aovDefaults={aovHist} loadedAt={loadedAt} onRefresh={refreshData} refreshing={refreshing} hiddenTabs={hiddenTabs} onSaveMissionTabs={saveMissionTabs}
                onUndo={undoDecision} onUnpin={unpin} onReask={(q) => { setPanelOpen(true); setPanelTab('terminal'); ask(q) }} showClientId={viewer?.role === 'agency_admin_security' && !viewAs} />
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
                <ViewBody id={splitTab} clientId={clientId} m={m} data={data} rangeN={rangeN} rangeLabel={rangeLabel} ledger={ledger} policies={policies} pins={pins}
                  ordersQ={ordersQ} setOrdersQ={setOrdersQ} onDrill={drill}
                  campaignDoc={campaignDoc} onSaveCampaigns={saveCampaignDoc} metaDoc={metaDoc} onSaveMeta={saveMetaDoc} clientName={data?.clientName || clientId} memories={memories} canEditLabel={isAgencyRole} onSaveLabel={saveCostPerLabel} canEditRoas={canEditRoas} onSaveRoas={saveRoasThresholds} onSaveCac={saveCacThresholds} rangeStart={range.start} onEnsureRange={ensureRangeCovers} onSaveAov={saveAovThresholds} aovDefaults={aovHist} loadedAt={loadedAt} onRefresh={refreshData} refreshing={refreshing} hiddenTabs={hiddenTabs} onSaveMissionTabs={saveMissionTabs}
                  onUndo={undoDecision} onUnpin={unpin} onReask={(q) => { setPanelOpen(true); setPanelTab('terminal'); ask(q) }} showClientId={viewer?.role === 'agency_admin_security' && !viewAs} />
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
                {panelTab === 'terminal' && <>
                  <button className="th-btn" onClick={startNewSession} title="Start a new conversation">＋ New</button>
                  <div className="th-hist">
                    <button className="th-btn" onClick={() => setHistOpen(o => !o)} title="Past conversations">History{histSessions.length ? ` (${histSessions.length})` : ''} ▾</button>
                    {histOpen && (
                      <div className="th-menu">
                        {histSessions.length === 0 && <div className="th-empty">no past conversations</div>}
                        {histSessions.map(s => (
                          <button key={s.id} className={`th-item ${s.id === histSessionId ? 'on' : ''}`} onClick={() => openSession(s.id)}>
                            <span className="th-ti">{s.title}</span>
                            <span className="th-when">{relTime(s.updated_at)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>}
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
      .select('order_id, created_at, sale_amount, email, order_name, fulfillment_status')
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

/* ══════════ Settings — per-client ops config (Slack digest, cost/label) ══════════ */
function SettingsView({ canEdit, clientName, hiddenTabs, onSaveMissionTabs }) {
  const { clientId } = useParams()
  const [settings, setSettings] = useState(null)
  const [webhook, setWebhook] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [state, setState] = useState({ saving: false, testing: false, msg: null })

  useEffect(() => {
    let alive = true
    fetch(`/api/client-settings?client_id=${clientId}`, { cache: 'no-store' })
      .then(r => r.json()).then(({ settings }) => {
        if (!alive) return
        setSettings(settings || {})
        setWebhook(settings?.slack_pnl_webhook || '')
        setEnabled(!!settings?.daily_pnl_slack)
      }).catch(() => { if (alive) setSettings({}) })
    return () => { alive = false }
  }, [clientId])

  const save = async () => {
    setState(s => ({ ...s, saving: true, msg: null }))
    const patch = { daily_pnl_slack: enabled }
    if (webhook !== '••••••') patch.slack_pnl_webhook = webhook.trim()
    const res = await fetch('/api/client-settings', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, settings: patch }),
    })
    const j = await res.json().catch(() => ({}))
    // Reflect the just-saved values so 'Send test now' enables immediately.
    if (res.ok) setSettings(s => ({ ...(s || {}), ...patch }))
    setState({ saving: false, testing: false, msg: res.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: j.error || 'Save failed.' } })
  }

  const sendTest = async (format) => {
    setState(s => ({ ...s, testing: format, msg: null }))
    const res = await fetch('/api/mission/pnl-digest', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, ...(format === 'text' ? { format } : {}) }),
    })
    const j = await res.json().catch(() => ({}))
    setState({ saving: false, testing: false, msg: res.ok
      ? { ok: true, text: format === 'text'
          ? `Posted the text-message version to Slack — proof of the daily text (${j.result?.date || ''}).`
          : `Sent to Slack — yesterday’s P&L (${j.result?.date || ''}).` }
      : { ok: false, text: j.error || 'Send failed — check the webhook URL.' } })
  }

  // Digest preview — the exact payload the morning send would post, rendered
  // Slack-style, plus the plain-text twin sent as the daily text notification.
  const [pv, setPv] = useState({ loading: true })
  const [pvTab, setPvTab] = useState('slack')
  const [tplEdit, setTplEdit] = useState(false)
  const [tpl, setTpl] = useState('')
  const [tplSaving, setTplSaving] = useState(false)
  const [pvNonce, setPvNonce] = useState(0)
  useEffect(() => {
    let alive = true
    fetch(`/api/mission/pnl-digest?client_id=${clientId}`, { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return
        setPv(ok ? { loading: false, ...j } : { loading: false, error: j.error || 'preview failed' })
        if (ok) setTpl(j.template || '')
      })
      .catch(e => { if (alive) setPv({ loading: false, error: String(e?.message || e) }) })
    return () => { alive = false }
  }, [clientId, pvNonce])

  // Live rendering while editing — mirrors renderDigest() in lib/mission/pnl-digest.
  const livePv = useMemo(() => {
    if (!tplEdit || !pv.tokens) return null
    const filled = tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => pv.tokens[k] != null ? String(pv.tokens[k]) : `{{${k}}}`)
    const paras = filled.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    const firstLines = (paras[0] || '').split('\n')
    const header = (firstLines[0] || '').replace(/\*/g, '')
    const afterHeader = firstLines.slice(1).join('\n').trim()
    const sections = [...(afterHeader ? [afterHeader] : []), ...paras.slice(1)]
    return {
      payload: { blocks: [
        { type: 'header', text: { text: header } },
        ...sections.map(p => ({ type: 'section', text: { text: p } })),
        { type: 'actions', elements: [{ text: { text: 'Open Overview' }, style: 'primary' }, { text: { text: 'Daily P&L History' } }] },
        { type: 'context', elements: [{ text: pv.footer || '' }] },
      ] },
      text: filled.replace(/\*/g, '') + (pv.url ? `\n\nFull view: ${pv.url}` : ''),
    }
  }, [tplEdit, tpl, pv])

  const saveTpl = async (value) => {
    setTplSaving(true)
    await fetch('/api/client-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, settings: { digest_template: value } }) }).catch(() => {})
    setTplSaving(false); setTplEdit(false); setPvNonce(n => n + 1) // re-fetch server-rendered preview
  }

  if (settings === null) return <p className="loading v-pad">loading settings…</p>
  if (!canEdit) return (
    <div className="v-pad">
      <h4 className="v-h" style={{ marginTop: 0 }}>Settings</h4>
      <p className="v-note">Settings are managed by agency admins.</p>
    </div>
  )
  const canTest = !!settings.slack_pnl_webhook || /^https:\/\/hooks\.slack\.com\//.test(webhook.trim())
  const hidden = new Set(hiddenTabs || [])
  const toggleTab = (id) => {
    const next = hidden.has(id) ? [...hidden].filter(x => x !== id) : [...hidden, id]
    onSaveMissionTabs && onSaveMissionTabs(next)
  }
  return (
    <div className="v-pad">
      <h4 className="v-h" style={{ marginTop: 0 }}>Settings</h4>

      <div className="set-card">
        <div className="set-h">Client-visible tabs</div>
        <p className="v-note" style={{ marginTop: 0 }}>Agency-only. Toggle a tab off to hide it from this client’s users and your “view-as” preview. PnL, Schema and Settings always stay visible.</p>
        {TOGGLEABLE_TABS.map(t => {
          const on = !hidden.has(t.id)
          return (
            <label key={t.id} className="set-row toggle" style={{ justifyContent: 'space-between' }}>
              <span className="set-l" style={{ margin: 0 }}>{t.label} <span className={on ? 'good' : 'a-dim'} style={{ fontSize: 10, marginLeft: 6 }}>{on ? 'visible to client' : 'hidden (agency only)'}</span></span>
              <button type="button" role="switch" aria-checked={on} onClick={() => toggleTab(t.id)}
                className={`tabsw ${on ? 'on' : ''}`}><span /></button>
            </label>
          )
        })}
      </div>

      <div className="set-card">
        <div className="set-h">Daily P&amp;L → Slack digest</div>
        <p className="v-note" style={{ marginTop: 0 }}>Post {clientName}’s locked Daily P&amp;L to a Slack channel every morning at 7:00 AM Phoenix (yesterday’s completed day). Create an <b>Incoming Webhook</b> in Slack for the target channel, then paste its URL below.</p>
        <label className="set-row">
          <span className="set-l">Slack webhook URL</span>
          <input className="set-in" type="text" placeholder="https://hooks.slack.com/services/…"
            value={webhook} onChange={e => setWebhook(e.target.value)} onFocus={e => { if (e.target.value === '••••••') setWebhook('') }} />
        </label>
        <label className="set-row toggle">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          <span className="set-l">Send the digest every morning</span>
        </label>
        <div className="set-actions">
          <button className="set-btn primary" onClick={save} disabled={state.saving}>{state.saving ? 'saving…' : 'Save'}</button>
          <button className="set-btn" onClick={() => sendTest('blocks')} disabled={!!state.testing || !canTest} title={canTest ? 'post yesterday’s P&L to Slack now' : 'save a webhook first'}>{state.testing === 'blocks' ? 'sending…' : 'Slack Test'}</button>
          <button className="set-btn" onClick={() => sendTest('text')} disabled={!!state.testing || !canTest} title={canTest ? 'post the daily-text version to Slack so you can proof the exact SMS wording' : 'save a webhook first'}>{state.testing === 'text' ? 'sending…' : 'SMS Test'}</button>
          {state.msg && <span className={`set-msg ${state.msg.ok ? 'good' : 'bad'}`}>{state.msg.text}</span>}
        </div>
      </div>

      <div className="set-card">
        <div className="set-h">Digest preview{pv.date ? ` — ${pv.date}` : ''}{pv.custom && !tplEdit ? <span className="set-tag">customized</span> : null}</div>
        <div className="pv-bar">
          <div className="pv-tabs">
            <button className={pvTab === 'slack' ? 'on' : ''} onClick={() => setPvTab('slack')} type="button">Slack</button>
            <button className={pvTab === 'text' ? 'on' : ''} onClick={() => setPvTab('text')} type="button">Text (SMS)</button>
          </div>
          {!pv.loading && !pv.error && !tplEdit && (
            <button className="set-btn" onClick={() => setTplEdit(true)} type="button">✎ Edit template</button>
          )}
        </div>
        {tplEdit && (
          <div className="tpl-edit">
            <textarea className="tpl-ta" value={tpl} onChange={e => setTpl(e.target.value)} spellCheck={false} rows={Math.min(24, tpl.split('\n').length + 2)} />
            <p className="v-note tpl-tokens">Placeholders (filled with each day’s numbers): {Object.keys(pv.tokens || {}).map(k => <code key={k}>{`{{${k}}}`}</code>)}. First line = Slack header · blank line = new block · *stars* = bold in Slack, stripped in the text version. Buttons and the footer are added automatically.</p>
            <div className="set-actions">
              <button className="set-btn primary" onClick={() => saveTpl(tpl)} disabled={tplSaving}>{tplSaving ? 'saving…' : 'Save template'}</button>
              <button className="set-btn" onClick={() => saveTpl('')} disabled={tplSaving} title="go back to the built-in layout">Reset to default</button>
              <button className="set-btn" onClick={() => { setTplEdit(false); setTpl(pv.template || '') }} disabled={tplSaving}>Cancel</button>
            </div>
          </div>
        )}
        {pv.loading ? <p className="loading" style={{ padding: '6px 0' }}>building preview from yesterday’s P&L…</p>
          : pv.error ? <p className="v-note">{pv.error}</p>
          : pvTab === 'slack' ? <SlackPreview payload={(livePv || pv).payload} />
          : <pre className="sms-prev">{(livePv || pv).text}</pre>}
      </div>
    </div>
  )
}

// Slack-style rendering of a Block Kit payload — an approximation for the
// Settings preview (header / mrkdwn sections with *bold* / buttons / context).
function SlackPreview({ payload }) {
  const md = (s) => String(s || '').split('\n').map((ln, i) => (
    <div key={i}>{ln.split(/(\*[^*]+\*)/g).map((seg, j) => seg.startsWith('*') && seg.endsWith('*') && seg.length > 2 ? <b key={j}>{seg.slice(1, -1)}</b> : seg)}</div>
  ))
  return (
    <div className="slk">
      <div className="slk-app">
        <span className="slk-av">📊</span>
        <span><span className="slk-name">ConversionHero</span><span className="slk-tag">APP</span><span className="slk-time">7:00 AM</span></span>
      </div>
      {(payload?.blocks || []).map((b, i) => {
        if (b.type === 'header') return <div key={i} className="slk-h">{b.text?.text}</div>
        if (b.type === 'section') return <div key={i} className="slk-sec">{md(b.text?.text)}</div>
        if (b.type === 'actions') return (
          <div key={i} className="slk-btns">
            {(b.elements || []).map((e, j) => <span key={j} className={`slk-btn ${e.style === 'primary' ? 'primary' : ''}`}>{e.text?.text}</span>)}
          </div>
        )
        if (b.type === 'context') return <div key={i} className="slk-ctx">{(b.elements || []).map(e => e.text).join(' ')}</div>
        return null
      })}
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

function ViewBody({ id, clientId, m, data, rangeN, rangeLabel, ledger, policies, pins, ordersQ, setOrdersQ, onDrill, campaignDoc, onSaveCampaigns, metaDoc, onSaveMeta, clientName, memories, canEditLabel, onSaveLabel, canEditRoas, onSaveRoas, onSaveCac, onSaveAov, aovDefaults, rangeStart, onEnsureRange, loadedAt, onRefresh, refreshing, hiddenTabs, onSaveMissionTabs, onUndo, onUnpin, onReask, showClientId }) {
  // Campaign Builder + Memory are independent of the mission metrics — render
  // before the !m gate so they work even while data is still loading.
  if (id === 'campaign') return <CampaignSheetView doc={campaignDoc} onSave={onSaveCampaigns} metaDoc={metaDoc} onSaveMeta={onSaveMeta} clientName={clientName} onReask={onReask} />
  if (id === 'memory') return <MemoryView memories={memories} clientName={clientName} onReask={onReask} />
  if (id === 'pnl_history') return <PnlHistoryView />
  if (id === 'settings') return <SettingsView canEdit={canEditLabel} clientName={clientName} hiddenTabs={hiddenTabs} onSaveMissionTabs={onSaveMissionTabs} />
  if (!m) return <p className="loading">reading {rangeN} days of orders, campaigns, and BOM costs…</p>
  if (id === 'overview') return <OverviewView m={m} rangeLabel={rangeLabel} canEditLabel={canEditLabel} onSaveLabel={onSaveLabel} canEditRoas={canEditRoas} onSaveRoas={onSaveRoas} onSaveCac={onSaveCac} rangeStart={rangeStart} onEnsureRange={onEnsureRange} onSaveAov={onSaveAov} aovDefaults={aovDefaults} loadedAt={loadedAt} onRefresh={onRefresh} refreshing={refreshing} />
  if (id === 'schema') return <ClientSchemaView tz={m.sources?.tz} showClientId={showClientId} />
  if (id === 'google') return <CampaignView m={m} platform="Google" clientId={clientId} start={data.start} end={data.end} rangeLabel={rangeLabel} />
  if (id === 'meta') return <CampaignView m={m} platform="Meta" clientId={clientId} start={data.start} end={data.end} rangeLabel={rangeLabel} />
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

// Row-per-day P&L rows (mirror the Client_daily_pnl_NEW sheet). Channel
// revenue = orders whose derived channel is Meta/Google (paid-only ROAS
// convention); CM = net − BOM COGS − spend. Days bucket in the client's
// business timezone so a day means the same thing here and on Jason's sheet.
// Shared by the Overview day view and the Overview 2 stacked tables.
const DP = {
  $: (n) => n == null ? '—' : '$' + Math.round(n).toLocaleString(),
  x: (n) => n == null ? '—' : n.toFixed(2) + 'x',
  pc: (n) => n == null ? '—' : (n * 100).toFixed(1) + '%',
  div: (a, b) => (b > 0 ? a / b : null),
  cmCls: (n) => n > 0 ? 'good' : n < 0 ? 'bad' : '',
  roasCls: (n, t) => n == null ? '' : n < (t?.red ?? 1) ? 'bad' : n <= (t?.green ?? 1.2) ? 'warn' : 'good',
  day: (r, isTot) => isTot ? r.day : new Date(r.day + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }),
}
function buildDailyRows(m) {
  const orders = m.sources?.orders || []
  const tz = m.sources?.tz || undefined
  const newClassified = !!m.pnl?.newClassified
  const dayOf = (iso) => {
    try { return new Date(iso).toLocaleDateString('en-CA', tz ? { timeZone: tz } : undefined) }
    catch { return String(iso).slice(0, 10) }
  }
  const mk = () => ({ gross: 0, net: 0, discounts: 0, refunds: 0, orders: 0, newOrders: 0, cogs: 0, shipped: 0, channels: {},
    meta: { net: 0, cogs: 0, orders: 0, spend: 0 }, google: { net: 0, cogs: 0, orders: 0, spend: 0 } })
  const byDay = {}
  const R = (d) => (byDay[d] = byDay[d] || { day: d, ...mk() })
  for (const o of orders) {
    const r = R(dayOf(o.date))
    r.gross += o.gross; r.net += o.net; r.cogs += o.cogs
    r.discounts += o.discounts || 0; r.refunds += o.refunds || 0
    if (o.shipped) r.shipped += 1
    if (o.net > 0) { r.orders += 1; if (o.isNew) r.newOrders += 1 }
    const chName = o.channel || 'Other'
    const cc = (r.channels[chName] = r.channels[chName] || { net: 0, gross: 0, cogs: 0, orders: 0, newOrders: 0 })
    cc.net += o.net; cc.gross += o.gross; cc.cogs += o.cogs
    if (o.net > 0) { cc.orders += 1; if (o.isNew) cc.newOrders += 1 }
    const c = o.channel === 'Meta' ? r.meta : o.channel === 'Google' ? r.google : null
    if (c) { c.net += o.net; c.cogs += o.cogs; if (o.net > 0) c.orders += 1 }
  }
  for (const d of (m.daily || [])) {
    if (!(d.spendMeta || d.spendGoogle)) continue
    const r = R(d.date)
    r.meta.spend += d.spendMeta || 0
    r.google.spend += d.spendGoogle || 0
  }
  const list = Object.values(byDay).sort((a, b) => b.day.localeCompare(a.day))
  // Totals row = same math over the whole range.
  const tot = { day: 'Totals', ...mk() }
  for (const r of list) {
    tot.gross += r.gross; tot.net += r.net; tot.orders += r.orders; tot.newOrders += r.newOrders; tot.cogs += r.cogs
    tot.discounts += r.discounts; tot.refunds += r.refunds; tot.shipped += r.shipped
    for (const k of ['meta', 'google']) { tot[k].net += r[k].net; tot[k].cogs += r[k].cogs; tot[k].orders += r[k].orders; tot[k].spend += r[k].spend }
  }
  return { list, tot, newClassified }
}

// Roll the daily P&L rows up into periods for the Daily / Weekly / Quarterly
// zoom. Every field is additive, so a week/quarter is just its days summed;
// weeks start Sunday (matching the calendar views), quarters are calendar.
function blankAgg() {
  return { gross: 0, net: 0, discounts: 0, refunds: 0, orders: 0, newOrders: 0, cogs: 0, shipped: 0, channels: {},
    meta: { net: 0, cogs: 0, orders: 0, spend: 0 }, google: { net: 0, cogs: 0, orders: 0, spend: 0 } }
}
function accumAgg(a, r) {
  a.gross += r.gross; a.net += r.net; a.discounts += r.discounts; a.refunds += r.refunds
  a.orders += r.orders; a.newOrders += r.newOrders; a.cogs += r.cogs; a.shipped += r.shipped
  for (const [ch, c] of Object.entries(r.channels)) {
    const cc = (a.channels[ch] = a.channels[ch] || { net: 0, gross: 0, cogs: 0, orders: 0, newOrders: 0 })
    cc.net += c.net; cc.gross += c.gross; cc.cogs += c.cogs; cc.orders += c.orders; cc.newOrders += c.newOrders
  }
  for (const k of ['meta', 'google']) { a[k].net += r[k].net; a[k].cogs += r[k].cogs; a[k].orders += r[k].orders; a[k].spend += r[k].spend }
}
function buildPeriods(list, zoom, customRange) {
  if (zoom === 'day') {
    return list.map(r => ({
      key: r.day, days: [r.day], agg: r, short: r.day,
      long: new Date(r.day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    }))
  }
  if (zoom === 'custom') {
    if (!customRange?.start || !customRange?.end) return []
    const { start, end } = customRange
    const days = list.filter(r => r.day >= start && r.day <= end)
    const agg = blankAgg()
    days.forEach(r => accumAgg(agg, r))
    const f = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return [{ key: `${start}..${end}`, days: days.map(r => r.day).sort(), agg,
      short: `${new Date(start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → ${new Date(end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      long: `${f(start)} – ${f(end)}` }]
  }
  const P2 = (n) => String(n).padStart(2, '0')
  const by = {}
  for (const r of list) {
    const d = new Date(r.day + 'T00:00:00')
    let key, short, long
    if (zoom === 'week') {
      const ws = new Date(d); ws.setDate(ws.getDate() - ws.getDay())
      const we = new Date(ws); we.setDate(we.getDate() + 6)
      key = `${ws.getFullYear()}-${P2(ws.getMonth() + 1)}-${P2(ws.getDate())}`
      const f = (x) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      short = `wk of ${f(ws)}`
      long = `Week of ${f(ws)} – ${f(we)}, ${we.getFullYear()}`
    } else {
      const q = Math.floor(d.getMonth() / 3) + 1
      key = `${d.getFullYear()}-Q${q}`
      short = `Q${q} ${d.getFullYear()}`
      long = `Q${q} ${d.getFullYear()} · ${['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][q - 1]}`
    }
    const g = (by[key] = by[key] || { key, short, long, days: [], agg: blankAgg() })
    g.days.push(r.day)
    accumAgg(g.agg, r)
  }
  return Object.values(by).map(g => ({ ...g, days: [...g.days].sort() })).sort((x, y) => y.key.localeCompare(x.key))
}

// Airbnb-style range picker — two months, click a start then an end; the days
// between highlight live as you hover. Emits YYYY-MM-DD start/end (sorted).
function RangeCalendar({ value, onPick, onClose }) {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [viewM, setViewM] = useState(() => { const b = value?.end ? new Date(value.end + 'T00:00:00') : new Date(); return new Date(b.getFullYear(), b.getMonth(), 1) })
  const [anchor, setAnchor] = useState(null) // YYYY-MM-DD of first click
  const [hover, setHover] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [onClose])

  const lo = anchor && hover ? (anchor <= hover ? anchor : hover) : (value && !anchor ? value.start : anchor)
  const hi = anchor && hover ? (anchor <= hover ? hover : anchor) : (value && !anchor ? value.end : anchor)
  const clickDay = (s) => {
    if (!anchor) { setAnchor(s); setHover(s); return }
    if (s === anchor) { setAnchor(null); return }
    const [a, b] = anchor <= s ? [anchor, s] : [s, anchor]
    onPick(a, b)
  }
  const Month = ({ base }) => {
    const y = base.getFullYear(), mo = base.getMonth()
    const first = new Date(y, mo, 1)
    const start = new Date(first); start.setDate(1 - first.getDay())
    const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
    return (
      <div className="rc-month">
        <div className="rc-mh">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
        <div className="rc-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="rc-dow">{d}</div>)}
          {cells.map((d, i) => {
            const s = ymd(d), inMo = d.getMonth() === mo
            const inRange = inMo && lo && hi && s >= lo && s <= hi
            const edge = inRange && (s === lo || s === hi)
            return (
              <button key={i} type="button" disabled={!inMo}
                className={`rc-day ${!inMo ? 'rc-out' : ''} ${edge ? 'rc-edge' : inRange ? 'rc-in' : ''}`}
                onClick={() => inMo && clickDay(s)} onMouseEnter={() => anchor && setHover(s)}>
                {d.getDate()}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  const nextM = new Date(viewM.getFullYear(), viewM.getMonth() + 1, 1)
  return (
    <div className="rc-pop" ref={ref}>
      <div className="rc-head">
        <button type="button" onClick={() => setViewM(new Date(viewM.getFullYear(), viewM.getMonth() - 1, 1))}>‹</button>
        <span className="rc-hint">{anchor ? 'pick the end date' : 'pick the start date'}</span>
        <button type="button" onClick={() => setViewM(new Date(viewM.getFullYear(), viewM.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="rc-months"><Month base={viewM} /><Month base={nextM} /></div>
    </div>
  )
}

// Overview — one business day at a time, laid out like Ryan's note: REVENUE /
// ORDERS / PAID ADS (Blended · Meta · Google) / ORGANIC / MARGIN. Every line
// drills to the actual Supabase rows behind it (direct mirror, RLS-gated).
// ROAS color-key popover — hover previews, clicking the ⓘ pins it open (so the
// mouse can reach "edit thresholds"), clicking anywhere else unpins. Own
// component so each ROAS line's ⓘ pins independently.
function RoasKey({ thr, canEdit, onSave, title = 'ROAS color key', desc }) {
  const [pinned, setPinned] = useState(false)
  const [draft, setDraft] = useState(null) // { red, green } as strings while editing
  const valid = draft && Number(draft.red) > 0 && Number(draft.green) > Number(draft.red)
  const commit = () => {
    if (!valid) return
    onSave && onSave({ red: Math.round(Number(draft.red) * 100) / 100, green: Math.round(Number(draft.green) * 100) / 100 })
    setDraft(null); setPinned(false)
  }
  useEffect(() => {
    if (!pinned) return
    const close = () => { setPinned(false); setDraft(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [pinned])
  const fx = (n) => Number(n).toFixed(2) + 'x'
  return (
    <span className="ov-i" onClick={e => e.stopPropagation()}>
      <span className="ov-i-g" onClick={() => setPinned(p => !p)}>ⓘ</span>
      <span className={`ov-pop ${pinned || draft ? 'pin' : ''}`}>
        <b>{title}</b>
        {desc && <span className="ov-pop-desc">{desc}</span>}
        {draft ? (
          <span className="ov-thr-form" onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null) }}>
            <span><i className="kd r" />red below <input autoFocus type="number" step="0.05" min="0.05" value={draft.red}
              onChange={e => setDraft(d => ({ ...d, red: e.target.value }))} />x</span>
            <span><i className="kd g" />green above <input type="number" step="0.05" min="0.05" value={draft.green}
              onChange={e => setDraft(d => ({ ...d, green: e.target.value }))} />x</span>
            <span className="ov-thr-note"><i className="kd y" />yellow = in between</span>
            <span className="ov-thr-btns">
              <button type="button" disabled={!valid} onClick={commit}>save</button>
              <button type="button" onClick={() => setDraft(null)}>cancel</button>
            </span>
          </span>
        ) : (
          <>
            <span><i className="kd r" />under {fx(thr.red)} — losing money on ad spend</span>
            <span><i className="kd y" />{fx(thr.red)} – {fx(thr.green)} — breakeven zone</span>
            <span><i className="kd g" />above {fx(thr.green)} — healthy</span>
            {canEdit && (
              <button type="button" className="ov-thr-edit" onClick={() => setDraft({ red: String(thr.red), green: String(thr.green) })}>✎ edit thresholds</button>
            )}
          </>
        )}
      </span>
    </span>
  )
}

// "Last updated: … ago" + manual refresh — data-freshness indicator for the
// P&L. Re-renders every 10s; goes amber past 15 minutes.
function LastUpdated({ at, onRefresh, refreshing }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 10000); return () => clearInterval(t) }, [])
  if (!at) return null
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000))
  const n = s < 60 ? s : s < 3600 ? Math.floor(s / 60) : Math.floor(s / 3600)
  const unit = s < 60 ? 'second' : s < 3600 ? 'minute' : 'hour'
  return (
    <span className={`ov-upd ${s > 900 ? 'stale' : ''}`} title="when this page's orders, campaigns and COGS were last fetched from the database">
      Last updated: {n} {unit}{n === 1 ? '' : 's'} ago
      <button type="button" onClick={onRefresh} disabled={refreshing} title="re-fetch live data now">{refreshing ? '…' : '⟳'}</button>
    </span>
  )
}

// AOV color-key popover — same pin/edit mechanics; dollar thresholds, higher
// is better. Prepopulated from the client's full P&L history until saved.
function AovKey({ thr, hist, canEdit, onSave }) {
  const [pinned, setPinned] = useState(false)
  const [draft, setDraft] = useState(null) // { red, green } as strings while editing
  const valid = draft && Number(draft.red) > 0 && Number(draft.green) > Number(draft.red)
  const commit = () => {
    if (!valid) return
    onSave && onSave({ red: Math.round(Number(draft.red)), green: Math.round(Number(draft.green)) })
    setDraft(null); setPinned(false)
  }
  useEffect(() => {
    if (!pinned) return
    const close = () => { setPinned(false); setDraft(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [pinned])
  return (
    <span className="ov-i" onClick={e => e.stopPropagation()}>
      <span className="ov-i-g" onClick={() => setPinned(p => !p)}>ⓘ</span>
      <span className={`ov-pop ${pinned || draft ? 'pin' : ''}`}>
        <b>AOV color key</b>
        <span className="ov-pop-desc">AOV = net revenue ÷ orders — average order value.</span>
        {draft ? (
          <span className="ov-thr-form" onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null) }}>
            <span><i className="kd r" />red below $<input autoFocus type="number" step="1" min="1" value={draft.red}
              onChange={e => setDraft(d => ({ ...d, red: e.target.value }))} /></span>
            <span><i className="kd g" />green above $<input type="number" step="1" min="1" value={draft.green}
              onChange={e => setDraft(d => ({ ...d, green: e.target.value }))} /></span>
            <span className="ov-thr-note"><i className="kd y" />yellow = in between</span>
            <span className="ov-thr-btns">
              <button type="button" disabled={!valid} onClick={commit}>save</button>
              <button type="button" onClick={() => setDraft(null)}>cancel</button>
            </span>
          </span>
        ) : (
          <>
            <span><i className="kd r" />under ${thr.red} — below your usual</span>
            <span><i className="kd y" />${thr.red} – ${thr.green} — your typical range</span>
            <span><i className="kd g" />above ${thr.green} — strong</span>
            {thr.auto
              ? <span className="ov-thr-note">auto from {thr.days} days of your P&L history (33rd / 66th percentile) — save to lock in</span>
              : hist && <span className="ov-thr-note">your actual history: low under ${hist.red} · high above ${hist.green} (33rd / 66th percentile, {hist.days} days)</span>}
            {canEdit && (
              <button type="button" className="ov-thr-edit" onClick={() => setDraft({ red: String(thr.red), green: String(thr.green) })}>✎ {thr.auto ? 'edit & save dial' : 'edit dial'}</button>
            )}
          </>
        )}
      </span>
    </span>
  )
}

// Shield Score — one 0–100 daily health number rolled up from the KPIs that
// already carry red/yellow/green dials. Each KPI is scored off its own
// thresholds (40 at red, 85 at green, extrapolated past), then weighted;
// missing KPIs (no spend, unset dial) drop out and the weights re-normalize.
function bandScore(value, red, green, higherBetter) {
  if (value == null || red == null || green == null || red === green) return null
  const t = higherBetter ? (value - red) / (green - red) : (red - value) / (red - green)
  return Math.max(5, Math.min(100, 40 + t * 45))
}
function computeShieldScore({ troas, cac, aov, marginPct }, thr, cacThr, aovThr) {
  const parts = [
    { key: 'True ROAS', w: 0.35, s: bandScore(troas, thr.red, thr.green, true) },
    { key: 'CAC', w: 0.25, s: bandScore(cac, cacThr.red, cacThr.green, false) },
    { key: 'AOV', w: 0.20, s: aovThr ? bandScore(aov, aovThr.red, aovThr.green, true) : null },
    { key: 'Net margin', w: 0.20, s: marginPct == null ? null : Math.max(5, Math.min(100, 40 + (marginPct / 0.30) * 45)) },
  ].filter(p => p.s != null)
  if (!parts.length) return null
  const wsum = parts.reduce((a, p) => a + p.w, 0)
  const score = Math.round(parts.reduce((a, p) => a + p.s * (p.w / wsum), 0))
  const grade = score >= 85 ? 'Excellent' : score >= 70 ? 'Strong' : score >= 55 ? 'Steady' : score >= 40 ? 'Watch' : 'Alert'
  const cls = score >= 70 ? 'good' : score >= 55 ? 'warn' : 'bad'
  return { score, grade, cls, parts: parts.map(p => ({ ...p, weight: Math.round((p.w / wsum) * 100) })) }
}
function ShieldScore({ result }) {
  if (!result) return null
  const { score, grade, cls, parts } = result
  return (
    <div className={`shield ${cls}`}>
      <span className="shield-emoji">🛡</span>
      <div className="shield-mid">
        <div className="shield-lbl">Shield Score</div>
        <div className="shield-num">{score}<span className="shield-grade">· {grade}</span></div>
      </div>
      <span className="ov-i" onClick={e => e.stopPropagation()}>
        <span className="ov-i-g">ⓘ</span>
        <span className="ov-pop">
          <b>Shield Score</b>
          <span className="ov-pop-desc">Daily health from your dialed KPIs — 40 at each red line, 85 at green.</span>
          {parts.map(p => <span key={p.key}><i className={`kd ${p.s >= 70 ? 'g' : p.s >= 55 ? 'y' : 'r'}`} />{p.key} — {Math.round(p.s)}/100 <span className="a-dim">({p.weight}%)</span></span>)}
        </span>
      </span>
    </div>
  )
}

// Static color-key note (hover only, no editor) — explains a fixed color rule.
function KeyNote({ title, lines, desc }) {
  return (
    <span className="ov-i" onClick={e => e.stopPropagation()}>
      <span className="ov-i-g">ⓘ</span>
      <span className="ov-pop">
        <b>{title}</b>
        {desc && <span className="ov-pop-desc">{desc}</span>}
        {lines.map((l, i) => <span key={i}>{l.k && <i className={`kd ${l.k}`} />}{l.t}</span>)}
      </span>
    </span>
  )
}

// CAC color-key popover — same pin/edit mechanics as RoasKey but inverted
// (lower is better) and in dollars. Uncolored until both cutoffs are set.
function CacKey({ thr, canEdit, onSave, desc }) {
  const [pinned, setPinned] = useState(false)
  const [draft, setDraft] = useState(null) // { green, red } as strings while editing
  const valid = draft && Number(draft.green) > 0 && Number(draft.red) > Number(draft.green)
  const commit = () => {
    if (!valid) return
    onSave && onSave({ green: Math.round(Number(draft.green) * 100) / 100, red: Math.round(Number(draft.red) * 100) / 100 })
    setDraft(null); setPinned(false)
  }
  useEffect(() => {
    if (!pinned) return
    const close = () => { setPinned(false); setDraft(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [pinned])
  const isSet = thr.green != null && thr.red != null
  return (
    <span className="ov-i" onClick={e => e.stopPropagation()}>
      <span className="ov-i-g" onClick={() => setPinned(p => !p)}>ⓘ</span>
      <span className={`ov-pop ${pinned || draft ? 'pin' : ''}`}>
        <b>CAC color key</b>
        {desc && <span className="ov-pop-desc">{desc}</span>}
        {draft ? (
          <span className="ov-thr-form" onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null) }}>
            <span><i className="kd g" />green below $<input autoFocus type="number" step="1" min="1" value={draft.green}
              onChange={e => setDraft(d => ({ ...d, green: e.target.value }))} /></span>
            <span><i className="kd r" />red above $<input type="number" step="1" min="1" value={draft.red}
              onChange={e => setDraft(d => ({ ...d, red: e.target.value }))} /></span>
            <span className="ov-thr-note"><i className="kd y" />yellow = in between</span>
            <span className="ov-thr-btns">
              <button type="button" disabled={!valid} onClick={commit}>save</button>
              <button type="button" onClick={() => setDraft(null)}>cancel</button>
            </span>
          </span>
        ) : (
          <>
            {isSet ? (
              <>
                <span><i className="kd g" />under ${thr.green} — efficient acquisition</span>
                <span><i className="kd y" />${thr.green} – ${thr.red} — watch zone</span>
                <span><i className="kd r" />above ${thr.red} — too expensive</span>
              </>
            ) : (
              <span className="ov-thr-note">no CAC dial set — CAC stays uncolored until you set cutoffs</span>
            )}
            {canEdit && (
              <button type="button" className="ov-thr-edit" onClick={() => setDraft({ green: String(thr.green ?? 100), red: String(thr.red ?? 150) })}>✎ {isSet ? 'edit dial' : 'set dial'}</button>
            )}
          </>
        )}
      </span>
    </span>
  )
}

function OverviewView({ m, rangeLabel, canEditRoas, onSaveRoas, onSaveCac, onSaveAov, aovDefaults, rangeStart, onEnsureRange, loadedAt, onRefresh, refreshing }) {
  const { $, x, pc, div, cmCls, roasCls } = DP
  // ROAS traffic-light thresholds — per-client, editable in the color-key popover
  const thr = { red: m.sources?.roasRedBelow ?? 1, green: m.sources?.roasGreenAbove ?? 1.2 }
  const rc = (n) => roasCls(n, thr)
  const { list } = buildDailyRows(m)
  const newClassified = !!m.pnl?.newClassified
  const costPerLabel = m.sources?.costPerLabel ?? 25
  const tz = m.sources?.tz || undefined
  const [zoom, setZoom] = useState('day') // 'day' | 'week' | 'quarter' | 'custom'
  const [customRange, setCustomRange] = useState(null) // { start, end } YYYY-MM-DD
  const [calOpen, setCalOpen] = useState(false)
  const periods = useMemo(() => buildPeriods(list, zoom, customRange), [list, zoom, customRange])
  const keys = useMemo(() => periods.map(p => p.key), [periods])
  const [sel, setSel] = useState(null)
  const activeKey = sel && keys.includes(sel) ? sel : keys[0] || null
  const [drill, setDrill] = useState(null) // { kind, label, channel? }
  useEffect(() => { setDrill(null) }, [activeKey])
  useEffect(() => { if (zoom !== 'custom') setSel(null) }, [zoom])
  // Esc de-selects the drilled metric (unless typing in a field, e.g. the ROAS editor)
  useEffect(() => {
    if (!drill) return
    const onKey = (e) => { if (e.key === 'Escape' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) setDrill(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drill])
  if (!activeKey) return <div className="v-pad"><p className="a-dim">no orders or spend in this range.</p></div>
  const p = periods.find(z => z.key === activeKey)
  const r = p.agg
  const idx = keys.indexOf(activeKey)

  const spend = r.meta.spend + r.google.spend
  const paidNet = r.meta.net + r.google.net
  const cm = r.net - r.cogs - spend
  const shipCost = r.shipped * costPerLabel
  const organic = Object.entries(r.channels)
    .filter(([ch]) => ch !== 'Meta' && ch !== 'Google')
    .sort((a, b) => b[1].net - a[1].net)
  const zoomTitle = zoom === 'day' ? 'Daily' : zoom === 'week' ? 'Weekly' : zoom === 'custom' ? 'Custom' : 'Quarterly'
  const zoomNote = zoom === 'day' ? 'client business day' : `${p.days.length} business day${p.days.length === 1 ? '' : 's'} aggregated`
  // Quarterly needs more history than the default window — widen the load to
  // the start of the PREVIOUS quarter so current + last quarter come in full.
  const pickZoom = (z) => {
    if (z === 'custom') {
      // Seed a default range (last 7 loaded days) so there's always a period, then open the calendar.
      if (!customRange && list.length) { const days = list.map(x => x.day).sort(); setCustomRange({ start: days[Math.max(0, days.length - 7)], end: days[days.length - 1] }) }
      setZoom('custom'); setCalOpen(true); return
    }
    setZoom(z); setCalOpen(false)
    if (z === 'quarter' && onEnsureRange) {
      const t = new Date()
      const pq = new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3 - 3, 1)
      onEnsureRange(`${pq.getFullYear()}-${String(pq.getMonth() + 1).padStart(2, '0')}-01`)
    }
  }
  const applyCustom = (start, end) => {
    if (onEnsureRange) onEnsureRange(start) // widen the loaded window if the start predates it
    setCustomRange({ start, end }); setZoom('custom'); setCalOpen(false)
  }
  // A period whose calendar start predates the loaded window is under-counted — say so.
  const expectedStart = zoom === 'week' ? p.key
    : zoom === 'quarter' ? `${p.key.split('-Q')[0]}-${String((Number(p.key.split('-Q')[1]) - 1) * 3 + 1).padStart(2, '0')}-01`
    : zoom === 'custom' ? customRange?.start
    : null
  const partial = !!(expectedStart && rangeStart && expectedStart < rangeStart)

  const toggle = (dk) => setDrill(d => (d && d.line === dk.line) ? null : dk)
  // Dials: True ROAS reuses the roas_* thresholds; CAC is inverted and optional.
  const troasKey = <RoasKey title="True ROAS color key" desc="True ROAS = (net revenue − COGS) ÷ ad spend — return after product costs, not the platform-reported number." thr={thr} canEdit={canEditRoas} onSave={onSaveRoas} />
  const cacThr = { green: m.sources?.cacGreenBelow ?? null, red: m.sources?.cacRedAbove ?? null }
  const cacCls = (n) => (n == null || cacThr.green == null || cacThr.red == null) ? '' : n <= cacThr.green ? 'good' : n < cacThr.red ? 'warn' : 'bad'
  const cacKey = <CacKey desc="CAC = ad spend ÷ attributed orders — what one new customer costs." thr={cacThr} canEdit={canEditRoas} onSave={onSaveCac} />
  // AOV dial: saved cutoffs win; otherwise the history-derived percentiles.
  const aovThr = (m.sources?.aovRedBelow != null && m.sources?.aovGreenAbove != null)
    ? { red: m.sources.aovRedBelow, green: m.sources.aovGreenAbove, auto: false }
    : aovDefaults ? { red: aovDefaults.red, green: aovDefaults.green, days: aovDefaults.days, auto: true } : null
  const aovCls = (n) => (!aovThr || n == null) ? '' : n < aovThr.red ? 'bad' : n <= aovThr.green ? 'warn' : 'good'
  const aovKey = aovThr ? <AovKey thr={aovThr} hist={aovDefaults} canEdit={canEditRoas} onSave={onSaveAov} /> : null
  // Sign-based lines color themselves; the note tells the reader the rule.
  const signNote = (desc) => <KeyNote title="Color rule" desc={desc} lines={[{ k: 'g', t: 'green — positive, making money' }, { k: 'r', t: 'red — negative, losing money' }]} />
  // Shield Score — composite daily health from the dialed KPIs (paid basis).
  const _paidNet = r.meta.net + r.google.net, _paidCogs = r.meta.cogs + r.google.cogs, _paidOrders = r.meta.orders + r.google.orders
  const shield = computeShieldScore({
    troas: spend > 0 ? (_paidNet - _paidCogs) / spend : null,
    cac: spend > 0 && _paidOrders > 0 ? spend / _paidOrders : null,
    aov: r.orders > 0 ? r.net / r.orders : null,
    marginPct: r.net > 0 ? (cm - shipCost) / r.net : null,
  }, thr, cacThr, aovThr)
  const Line = ({ k, v, cls, dk, info }) => (
    <button className={`ov-line ${dk ? 'on' : ''} ${drill && dk && drill.line === dk.line ? 'open' : ''}`}
      onClick={dk ? () => toggle({ ...dk, label: k }) : undefined} disabled={!dk} type="button">
      <span className="ov-k">{k}{info}</span><span className="ov-dots" /><span className={`ov-v ${cls || ''}`}>{v}</span>
    </button>
  )
  const H = ({ children }) => <div className="ov-h">{children}</div>
  const H2 = ({ children }) => <div className="ov-h2">{children}</div>

  // One paid-ads block (Blended / Meta / Google) — identical line set per spec:
  // Spend, Attributed orders, CAC, AOV, Gross, ROAS, COGS, Net, True ROAS.
  const chGross = (ch) => r.channels[ch]?.gross || 0
  const PaidBlock = ({ b }) => {
    const cac = div(b.spend, b.orders)
    const netAfter = (b.net || b.spend) ? b.net - b.cogs - b.spend : null
    const troas = b.spend > 0 ? (b.net - b.cogs) / b.spend : null
    return (<>
      <H2>{b.name}</H2>
      <div className="ov-blk-lines">
      <Line k="Spend" v={b.spend ? $(b.spend) : '—'} cls={b.spend > 0 ? 'spend' : ''} dk={{ kinds: b.kinds, line: `${b.id}-spend`, hi: b.spendHi, explain: `${b.label} Spend = Σ spend across the ${b.label} campaign day rows = ${$(b.spend)}.` }} />
      <Line k="Attributed orders" v={b.orders} dk={{ kinds: ['orders'], line: `${b.id}-orders`, channel: b.channel, hi: ['utm_source'], explain: `${b.label} attributed orders = orders whose derived channel is ${b.chDesc} = ${b.orders}.` }} />
      <Line k="CAC" info={cacKey} v={$(cac)} cls={cacCls(cac)} dk={{ kinds: ['orders', ...b.kinds], line: `${b.id}-cac`, channel: b.channel, hi: b.spendHi, explain: `${b.label} CAC = spend ÷ attributed orders = ${$(b.spend)} ÷ ${b.orders} = ${$(cac)}.` }} />
      <Line k="AOV" info={aovKey} v={$(div(b.net, b.orders))} cls={aovCls(div(b.net, b.orders))} dk={{ kinds: ['orders'], line: `${b.id}-aov`, channel: b.channel, hi: ['net_revenue'], explain: `${b.label} AOV = attributed net revenue ÷ attributed orders = ${$(b.net)} ÷ ${b.orders} = ${$(div(b.net, b.orders))}.` }} />
      <Line k="Gross" v={$(b.gross)} dk={{ kinds: ['orders'], line: `${b.id}-gross`, channel: b.channel, hi: ['subtotal', 'discounts'], explain: `${b.label} Gross = Σ (subtotal + discounts) of attributed orders = ${$(b.gross)}.` }} />
      {b.id !== 'bl' && (
        <Line k="% of Paid Ad Rev" v={pc(div(b.net, paidNet))} dk={{ kinds: ['orders'], line: `${b.id}-pct`, channel: b.channel, hi: ['net_revenue'], explain: `% of Paid Ad Rev = ${b.label} net revenue ÷ (Meta + Google net revenue) = ${$(b.net)} ÷ ${$(paidNet)} = ${pc(div(b.net, paidNet))}.` }} />
      )}
      <Line k="ROAS" v={x(div(b.net, b.spend))} dk={{ kinds: ['orders', ...b.kinds], line: `${b.id}-roas`, channel: b.channel, hi: ['net_revenue', ...b.spendHi], explain: `${b.label} ROAS = attributed net revenue ÷ spend = ${$(b.net)} ÷ ${$(b.spend)} = ${x(div(b.net, b.spend))}.` }} />
      <Line k="COGS (BOM)" v={$(b.cogs)} cls={b.cogs > 0 ? 'warn' : ''} dk={{ kinds: ['items'], line: `${b.id}-cogs`, channel: b.channel, hi: ['sku', 'qty'], explain: `${b.label} COGS = Σ (qty × BOM unit cost) across attributed orders' line items = ${$(b.cogs)}.` }} />
      {b.id !== 'bl' && (
        <Line k="Contribution Margin" info={signNote('Contribution Margin = net revenue − COGS, before ad spend')} v={$(b.net - b.cogs)} cls={cmCls(b.net - b.cogs)} dk={{ kinds: ['orders', 'items'], line: `${b.id}-cm`, channel: b.channel, hi: ['net_revenue', 'sku', 'qty'], explain: `${b.label} Contribution Margin = net revenue − COGS, before ad spend = ${$(b.net)} − ${$(b.cogs)} = ${$(b.net - b.cogs)}.` }} />
      )}
      <Line k="Net" info={signNote('Net = net revenue − COGS − ad spend')} v={netAfter == null ? '—' : $(netAfter)} cls={cmCls(netAfter)} dk={{ kinds: ['orders', 'items', ...b.kinds], line: `${b.id}-net`, channel: b.channel, hi: ['net_revenue', 'sku', 'qty', ...b.spendHi], explain: `${b.label} Net = ${$(b.net)} net revenue − ${$(b.cogs)} COGS − ${$(b.spend)} spend = ${netAfter == null ? '—' : $(netAfter)}.` }} />
      <Line k="True ROAS" info={troasKey} v={x(troas)} cls={rc(troas)} dk={{ kinds: ['orders', 'items', ...b.kinds], line: `${b.id}-troas`, channel: b.channel, hi: ['net_revenue', 'sku', 'qty', ...b.spendHi], explain: `${b.label} True ROAS = (net revenue − COGS) ÷ spend = (${$(b.net)} − ${$(b.cogs)}) ÷ ${$(b.spend)} = ${x(troas)}.` }} />
      </div>
    </>)
  }
  const paidBlocks = [
    { id: 'bl', name: 'BLENDED ADS', label: 'Blended', channel: 'Paid', chDesc: 'Meta or Google', kinds: ['meta_campaigns', 'google_campaigns'], spendHi: ['spend', 'cost'],
      spend, orders: r.meta.orders + r.google.orders, gross: chGross('Meta') + chGross('Google'), net: paidNet, cogs: r.meta.cogs + r.google.cogs },
    { id: 'm', name: 'META ADS', label: 'Meta', channel: 'Meta', chDesc: 'Meta', kinds: ['meta_campaigns'], spendHi: ['spend'],
      spend: r.meta.spend, orders: r.meta.orders, gross: chGross('Meta'), net: r.meta.net, cogs: r.meta.cogs },
    { id: 'g', name: 'GOOGLE ADS', label: 'Google', channel: 'Google', chDesc: 'Google', kinds: ['google_campaigns'], spendHi: ['cost'],
      spend: r.google.spend, orders: r.google.orders, gross: chGross('Google'), net: r.google.net, cogs: r.google.cogs },
  ]

  return (
    <div className="v-pad ov-pad">
      <div className="ov-top">
        <div>
          <ShieldScore result={shield} />
          {partial && <p className="v-note warn" style={{ margin: '6px 0 0' }}>⚠ partial — data loaded from {rangeStart}; widen the range for the full period</p>}
        </div>
        <div className="ov-nav">
          <LastUpdated at={loadedAt} onRefresh={onRefresh} refreshing={refreshing} />
          <div className="ov-zoom">
            {[['day', 'Daily'], ['week', 'Weekly'], ['quarter', 'Quarterly'], ['custom', 'Custom']].map(([z, zl]) => (
              <button key={z} className={z === zoom ? 'on' : ''} onClick={() => pickZoom(z)} type="button">{zl}</button>
            ))}
          </div>
          {zoom === 'custom' ? (
            <div className="ov-calwrap">
              <button className="ov-day ov-calbtn" onClick={() => setCalOpen(o => !o)} type="button" title="pick a custom date range">
                📅 {customRange ? `${customRange.start} → ${customRange.end}` : 'pick dates'}
              </button>
              {calOpen && <RangeCalendar value={customRange} minDay={rangeStart} onPick={applyCustom} onClose={() => setCalOpen(false)} />}
            </div>
          ) : (
            <>
              <button onClick={() => setSel(keys[Math.min(idx + 1, keys.length - 1)])} disabled={idx >= keys.length - 1} title="older">‹</button>
              <span className="ov-day">{p.short}</span>
              <button onClick={() => setSel(keys[Math.max(idx - 1, 0)])} disabled={idx <= 0} title="newer">›</button>
              <button className="ov-today" onClick={() => setSel(keys[0])} disabled={idx === 0}>latest ↦</button>
            </>
          )}
        </div>
      </div>

      <div className="ov-grid ov-2col">
        <div className="ov-metrics">
          <div className="ov-sec">
            <H>REVENUE</H>
            <Line k="Gross Revenue" v={$(r.gross)} cls="strong" dk={{ kinds: ['orders'], line: 'gross', hi: ['subtotal', 'discounts'], explain: `Gross Revenue = Σ (subtotal + discounts) across the day's orders = ${$(r.gross)}. Merchandise basis — excludes tax and shipping.` }} />
            <Line k="Discounts" v={r.discounts > 0 ? '−' + $(r.discounts) : $(0)} cls={r.discounts > 0 ? 'warn' : ''} dk={{ kinds: ['orders'], line: 'discounts', hi: ['discounts'], explain: `Discounts = Σ discounts column = ${$(r.discounts)} (already included inside subtotal — never double-subtracted).` }} />
            <Line k="Refunds" v={r.refunds > 0 ? '−' + $(r.refunds) : $(0)} cls={r.refunds > 0 ? 'bad' : ''} dk={{ kinds: ['orders'], line: 'refunds', hi: ['refunds'], explain: `Refunds = Σ refunds column = ${$(r.refunds)}.` }} />
            <Line k="Net Revenue" info={signNote('Net Revenue = gross − discounts − refunds')} v={$(r.net)} cls={cmCls(r.net)} dk={{ kinds: ['orders'], line: 'net', hi: ['net_revenue'], explain: `Net Revenue = Σ (subtotal − refunds) = ${$(r.net)} — the true revenue line (the net_revenue column).` }} />
          </div>
          <div className="ov-sec">
            <H>ORDERS</H>
            <Line k="Orders" v={r.orders} dk={{ kinds: ['orders'], line: 'count', hi: ['net_revenue'], explain: `Orders = count of the day's orders with positive net revenue = ${r.orders}.` }} />
            <Line k="New orders (order rate)" v={newClassified ? `${r.newOrders} (${pc(div(r.newOrders, r.orders))})` : '—'} dk={{ kinds: ['orders'], line: 'new', explain: `New orders = orders from first-ever customers (email matched across all history) = ${r.newOrders} of ${r.orders}.` }} />
            <Line k="AOV" info={aovKey} v={$(div(r.net, r.orders))} cls={aovCls(div(r.net, r.orders))} dk={{ kinds: ['orders'], line: 'aov', hi: ['net_revenue'], explain: `AOV = net revenue ÷ orders = ${$(r.net)} ÷ ${r.orders} = ${$(div(r.net, r.orders))}.` }} />
          </div>
          <div className="ov-sec">
            <H>PAID ADS REVENUE</H>
            {paidBlocks.map(b => <PaidBlock key={b.id} b={b} />)}
          </div>
          <div className="ov-sec">
            <H>ORGANIC REVENUE</H>
            {organic.length === 0 && <p className="a-dim" style={{ margin: '4px 0' }}>no organic revenue this day.</p>}
            {organic.map(([ch, c]) => (
              <Line key={ch} k={`${ch} net revenue`} v={$(c.net)} dk={{ kinds: ['orders'], line: 'org:' + ch, hi: ['net_revenue', 'utm_source'], channel: ch, explain: `${ch} = Σ net revenue of orders whose derived channel is ${ch} (UTM + Shopify channel rules) = ${$(c.net)}.` }} />
            ))}
          </div>
          <div className="ov-sec">
            <H>MARGIN</H>
            <Line k="COGS (BOM)" v={$(r.cogs)} cls={r.cogs > 0 ? 'warn' : ''} dk={{ kinds: ['items'], line: 'cogs', hi: ['sku', 'qty'], explain: `COGS = Σ (item qty × BOM unit cost) per line item — each SKU's recipe rows in client_sku_bom priced by client_materials = ${$(r.cogs)}.` }} />
            <Line k={`Net (− ${r.shipped} labels × $${costPerLabel})`} info={signNote('Net = net revenue − COGS − ad spend − shipping labels')} v={$(cm - shipCost)} cls={cmCls(cm - shipCost)} dk={{ kinds: ['pnl_day', 'pnl_channels'], line: 'np', hi: ['gross_profit', 'cost_per_label'], explain: `Net = ${$(r.net)} net revenue − ${$(r.cogs)} COGS − ${$(spend)} ad spend − ${$(shipCost)} shipping labels (${r.shipped} fulfilled × $${costPerLabel}) = ${$(cm - shipCost)}.` }} />
          </div>
        </div>

        {/* Right column: source tables for the clicked metric */}
        <div className="ov-drillcol">
          {drill
            ? <SourceDrill days={p.days} drill={drill} m={m} onClose={() => setDrill(null)} />
            : <div className="ov-drill-empty">Click any metric on the left to open its source rows here.</div>}
        </div>
      </div>
    </div>
  )
}

// Direct mirror of the Supabase rows behind a clicked line — live, RLS-gated
// queries against the actual tables, filtered to the selected business day.
// A line can open SEVERAL tables (every table in its formula), each with a
// TOTALS row pinned on top, plus a plain-English formula explanation.
function SourceDrill({ days, drill, m, onClose }) {
  const { clientId } = useParams()
  const [state, setState] = useState({ loading: true, sets: [] })
  const [sort, setSort] = useState({}) // { [setIdx]: { col, dir: 'asc'|'desc' } }
  // Click a header to cycle asc → desc → off. TOTALS row always stays pinned.
  const clickSort = (si, col) => setSort(s => {
    const cur = s[si]
    if (!cur || cur.col !== col) return { ...s, [si]: { col, dir: 'asc' } }
    if (cur.dir === 'asc') return { ...s, [si]: { col, dir: 'desc' } }
    const { [si]: _drop, ...rest } = s
    return rest
  })
  const sortRows = (rows, cfg) => {
    if (!cfg) return rows
    const dir = cfg.dir === 'desc' ? -1 : 1
    return [...rows].sort((a, b) => {
      const av = a[cfg.col], bv = b[cfg.col]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
    })
  }
  // days = the selected period's business days, sorted ascending (one entry in Daily zoom)
  const dFrom = days[0], dTo = days[days.length - 1]
  const dayLabel = dFrom === dTo ? dFrom : `${dFrom} → ${dTo}`
  const dayOrders = useMemo(() => {
    const tz = m.sources?.tz || undefined
    const inPeriod = new Set(days)
    const dayOf = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', tz ? { timeZone: tz } : undefined) } catch { return String(iso).slice(0, 10) } }
    const chMatch = (o) => !drill.channel ? true : drill.channel === 'Paid' ? (o.channel === 'Meta' || o.channel === 'Google') : o.channel === drill.channel
    return (m.sources?.orders || []).filter(o => inPeriod.has(dayOf(o.date)) && chMatch(o))
  }, [m, days, drill.channel])

  useEffect(() => {
    let alive = true
    const ids = dayOrders.map(o => o.id).slice(0, 400)
    const chLabel = drill.channel ? `${drill.channel}-attributed ` : ''
    const fetchKind = async (kind) => {
      if (kind === 'orders') {
        const { data, error } = await supabase.from('client_orders')
          .select('order_name, order_id, created_at, utm_source, shopify_channel, financial_status, fulfillment_status, sale_amount, subtotal, discounts, refunds, tax, net_revenue')
          .eq('client_id', clientId).in('order_id', ids).order('created_at', { ascending: true })
        if (error) throw error
        return { table: 'client_orders', note: `${chLabel}orders`, rows: data || [] }
      }
      if (kind === 'items') {
        const { data, error } = await supabase.from('client_order_items')
          .select('order_id, sku, title, qty, ordered_at')
          .eq('client_id', clientId).in('order_id', ids).order('ordered_at', { ascending: true })
        if (error) throw error
        return { table: 'client_order_items', note: `${chLabel}line items`, rows: data || [] }
      }
      if (kind === 'meta_campaigns') {
        const { data, error } = await supabase.from('client_meta_campaigns')
          .select('campaign_name, date, spend, impressions, clicks, conversions')
          .eq('client_id', clientId).gte('date', dFrom).lte('date', dTo).order('spend', { ascending: false })
        if (error) throw error
        return { table: 'client_meta_campaigns', note: 'Meta campaign day rows', rows: data || [] }
      }
      if (kind === 'google_campaigns') {
        const { data, error } = await supabase.from('client_google_campaigns')
          .select('campaign_name, date, cost, impressions, clicks, conversions')
          .eq('client_id', clientId).gte('date', dFrom).lte('date', dTo).order('cost', { ascending: false })
        if (error) throw error
        return { table: 'client_google_campaigns', note: 'Google campaign day rows', rows: data || [] }
      }
      if (kind === 'pnl_day') {
        const { data, error } = await supabase.from('client_daily_pnl')
          .select('date, net_sales, gross_profit, total_orders, total_spend, cogs, cost_per_label')
          .eq('client_id', clientId).gte('date', dFrom).lte('date', dTo)
        if (error) throw error
        return { table: 'client_daily_pnl', note: 'locked daily record', rows: data || [] }
      }
      if (kind === 'pnl_channels') {
        const { data, error } = await supabase.from('client_channel_daily_pnl')
          .select('day, channel, gross_revenue, net_revenue, discounts, refunds, orders, new_orders, cogs, spend')
          .eq('client_id', clientId).gte('day', dFrom).lte('day', dTo).order('net_revenue', { ascending: false })
        if (error) throw error
        return { table: 'client_channel_daily_pnl', note: 'per-channel daily record', rows: data || [] }
      }
      return null
    }
    setState({ loading: true, sets: [] })
    Promise.all((drill.kinds || []).map(fetchKind))
      .then(sets => { if (alive) setState({ loading: false, sets: sets.filter(Boolean) }) })
      .catch(e => { if (alive) setState({ loading: false, sets: [], error: e.message || String(e) }) })
    return () => { alive = false }
  }, [drill.line, dFrom, dTo, clientId])  // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v) => v == null ? '—' : typeof v === 'number' ? Number(v.toFixed(2)).toLocaleString() : String(v)
  const totalsFor = (rows, cols) => {
    const t = {}
    for (const c of cols) {
      const vals = rows.map(rw => rw[c]).filter(v => typeof v === 'number')
      t[c] = vals.length ? vals.reduce((a, b) => a + b, 0) : null
    }
    return t
  }
  return (
    <div className="ov-drill">
      <div className="ov-drill-bar">
        <span className="ov-drill-sel">▾ {drill.label || 'metric'} — source rows</span>
        <button type="button" className="ov-drill-x" onClick={onClose} title="De-select this metric (or click its line again, or press Esc)">✕ close</button>
      </div>
      {drill.explain && <div className="ov-explain">ⓘ {drill.explain}</div>}
      {state.error && <p className="a-err" style={{ padding: '8px 0' }}>{state.error}</p>}
      {state.loading && <p className="a-dim" style={{ padding: '8px 0' }}>querying source tables…</p>}
      {state.sets.map((set, si) => {
        const cols = set.rows.length ? Object.keys(set.rows[0]) : []
        const tot = totalsFor(set.rows, cols)
        // Columns the clicked metric's math actually reads — highlighted below
        const hi = new Set(drill.hi || [])
        const hcls = (c) => hi.has(c) ? ' hi' : ''
        const hits = cols.filter(c => hi.has(c))
        const hiTitle = `Highlighted because “${drill.label || 'the selected metric'}” (selected in the Daily P&L above) is computed from this column.`
        return (
          <div key={si} className="ov-set">
            <div className="ov-drill-h">
              <a className="mono ov-tlink" href={`/control/${clientId}/mission?focus=${set.table}${dFrom === dTo ? `&day=${dFrom}` : ''}`} target="_blank" rel="noreferrer"
                title="Open this table in your Schema browser, filtered to this day">public.{set.table} ↗</a>
              <span className="dim"> · {set.note} · {dayLabel} · {set.rows.length} rows · live database read (RLS)</span>
              {hits.length > 0 && <span className="ov-hi-note" title={hiTitle}>⌖ {hits.join(', ')} = source of “{drill.label}”</span>}
            </div>
            {set.rows.length === 0 ? <p className="a-dim" style={{ padding: '4px 0 10px' }}>no rows for this day.</p> : (
              <div className="dpnl dp2" style={{ maxHeight: 420 }}>
                <table>
                  <thead><tr>{cols.map(c => {
                    const s = sort[si]
                    const arrow = s?.col === c ? (s.dir === 'asc' ? ' ▲' : ' ▼') : ''
                    return (
                      <th key={c} className={`sortable${hcls(c)}`} style={{ textAlign: 'left' }} onClick={() => clickSort(si, c)}
                        title="click to sort — click again to reverse, once more to clear">
                        {c}{hi.has(c) && <span className="hi-ic" title={hiTitle}>⌖</span>}<span className="sort-ar">{arrow}</span>
                      </th>
                    )
                  })}</tr></thead>
                  <tbody>
                    <tr className="tot">{cols.map((c, i) => <td key={c} className={hcls(c).trim()} style={{ textAlign: 'left' }}>{i === 0 && tot[cols[0]] == null ? 'TOTALS' : tot[c] == null ? '' : fmt(tot[c])}</td>)}</tr>
                    {sortRows(set.rows, sort[si]).map((rw, i) => <tr key={i}>{cols.map(c => <td key={c} className={hcls(c).trim()} style={{ textAlign: 'left' }}>{fmt(rw[c])}</td>)}</tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Client-scoped Schema browser — the ecom tables THIS client may see. Rows are
// read with the signed-in user's own supabase session, so RLS tenant policies
// enforce the boundary; a client login can never see another tenant's rows.
// Deep-linked from the Overview drills (?focus=<table>&day=YYYY-MM-DD).
function ClientSchemaView({ tz, showClientId }) {
  const { clientId } = useParams()
  const [model, setModel] = useState(null)
  const [err, setErr] = useState(null)
  const [counts, setCounts] = useState({})
  const [table, setTable] = useState(null)
  const [dayFilter, setDayFilter] = useState(null)
  const [vq, setVq] = useState(null) // verify deep link: { filters, hi, label }
  const [rows, setRows] = useState({ loading: false, list: [], total: null })
  const [q, setQ] = useState('')
  const [view, setView] = useState('table') // 'graph' | 'table' — default to the list
  const [hiddenCols, setHiddenCols] = useState(new Set()) // columns toggled off
  const [colsOpen, setColsOpen] = useState(false)         // column picker dropdown
  const colsRef = useRef(null)
  useEffect(() => { setHiddenCols(new Set()); setColsOpen(false) }, [table]) // reset per table
  useEffect(() => {
    const close = (e) => { if (colsRef.current && !colsRef.current.contains(e.target)) setColsOpen(false) }
    if (colsOpen) document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [colsOpen])

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get('focus')) setTable(sp.get('focus'))
      if (sp.get('day')) setDayFilter(sp.get('day'))
      if (sp.get('vq')) { const o = decodeVq(sp.get('vq')); if (o && Array.isArray(o.filters)) setVq({ ...o, table: sp.get('focus') || null }) }
    } catch { /* no params */ }
  }, [])

  useEffect(() => {
    let alive = true
    fetch(`/api/mission/schema?client_id=${clientId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!alive) return; if (d.error) setErr(d.error); else { setModel(d); if (!table && d.tables?.length) setTable(d.tables[0].name) } })
      .catch(e => alive && setErr(String(e)))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  // Row counts per table — the user's OWN session (RLS-scoped).
  useEffect(() => {
    if (!model) return
    let alive = true
    ;(async () => {
      const out = {}
      for (const t of model.tables) {
        try {
          const { count } = await supabase.from(t.name).select('*', { count: 'exact', head: true }).eq('client_id', clientId)
          out[t.name] = count ?? 0
        } catch { out[t.name] = null }
        if (!alive) return
      }
      if (alive) setCounts(out)
    })()
    return () => { alive = false }
  }, [model, clientId])

  // Rows for the selected table (+ optional business-day filter).
  useEffect(() => {
    if (!table || !model) return
    const meta = model.tables.find(t => t.name === table)
    if (!meta) return
    let alive = true
    setRows({ loading: true, list: [], total: null })
    ;(async () => {
      try {
        let qy = supabase.from(table).select('*', { count: 'exact' }).eq('client_id', clientId)
        if (dayFilter) {
          const cols = meta.columns.map(c => c.name)
          const eqCol = ['day', 'date'].find(c => cols.includes(c))
          const tsCol = ['ordered_at', 'created_at'].find(c => cols.includes(c))
          if (eqCol) qy = qy.eq(eqCol, dayFilter)
          else if (tsCol) {
            const probe = new Date(dayFilter + 'T00:00:00Z')
            const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Phoenix', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(probe).map(x => [x.type, x.value]))
            const offMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second) - probe.getTime()
            const startMs = probe.getTime() - offMs
            qy = qy.gte(tsCol, new Date(startMs).toISOString()).lt(tsCol, new Date(startMs + 86400000).toISOString())
          }
        }
        // Verify deep link: apply the agent's exact filters ONLY on the table
        // it was built for — otherwise navigating to another table would query
        // columns (e.g. sku) that table doesn't have.
        const vqHere = vq && vq.table === table
        if (vqHere) {
          for (const f of vq.filters || []) {
            if (!f?.column || !f?.op) continue
            if (f.op === 'in' && Array.isArray(f.value)) qy = qy.in(f.column, f.value)
            else if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is'].includes(f.op)) qy = qy[f.op](f.column, f.value)
          }
        }
        const orderCol = ['created_at', 'ordered_at', 'day', 'date'].find(c => meta.columns.some(x => x.name === c))
        if (orderCol) qy = qy.order(orderCol, { ascending: false })
        const { data, count, error } = await qy.limit(vqHere ? 1000 : 100)
        if (error) throw error
        if (alive) setRows({ loading: false, list: data || [], total: count ?? 0 })
      } catch (e) { if (alive) setRows({ loading: false, list: [], total: null, error: e.message || String(e) }) }
    })()
    return () => { alive = false }
  }, [table, dayFilter, vq, model, clientId, tz])

  if (err) return <div className="v-pad"><p className="a-err">{err}</p></div>
  if (!model) return <div className="v-pad"><p className="a-dim">reading the schema…</p></div>
  const meta = model.tables.find(t => t.name === table)
  const shown = model.tables.filter(t => !q || t.name.includes(q.toLowerCase()))
  // A verify deep link only applies to the table it was built for.
  const vqActive = vq && vq.table === table
  // client_id: security admins see it pinned leftmost; everyone else never sees it.
  let cols = rows.list.length ? Object.keys(rows.list[0]) : []
  if (cols.includes('client_id')) {
    cols = cols.filter(c => c !== 'client_id')
    if (showClientId) cols = ['client_id', ...cols]
  }
  const allCols = cols                       // every available column (order-normalized)
  cols = cols.filter(c => !hiddenCols.has(c)) // what actually renders
  const fmt = (v) => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'number' ? Number(Number(v).toFixed(2)).toLocaleString() : String(v)

  if (view === 'graph') {
    return <SchemaGraph model={model} counts={counts} onOpen={(name) => { setTable(name); setView('table') }} onList={() => setView('table')} />
  }

  return (
    <div className="cs-root">
      <aside className="cs-rail">
        <div className="cs-rail-h">
          <span>YOUR DATA · {model.tables.length} tables</span>
          <button className="cs-graph-btn" onClick={() => setView('graph')} title="schema map">⬡ map</button>
        </div>
        <input className="cs-q" placeholder="filter tables…" value={q} onChange={e => setQ(e.target.value)} />
        {shown.map(t => (
          <button key={t.name} className={`cs-t ${t.name === table ? 'on' : ''}`} onClick={() => setTable(t.name)}>
            <span className="cs-tn">{t.name}</span>
            <span className="cs-tc">{counts[t.name] == null ? '…' : counts[t.name].toLocaleString()}</span>
          </button>
        ))}
        <p className="cs-note">Row counts and rows are read with YOUR login — row-level security scopes everything to {clientId}.</p>
      </aside>
      <div className="cs-main">
        {meta && (
          <>
            <div className="cs-head">
              <span className="cs-path">public.{meta.name}</span>
              <span className="dim"> · {rows.total == null ? '…' : `${rows.total.toLocaleString()} rows`}</span>
              {allCols.length > 0 && (
                <div className="cs-colpick" ref={colsRef}>
                  <button className="cs-graph-btn" onClick={() => setColsOpen(o => !o)}>
                    ⊞ Columns <span className="dim">{cols.length}/{allCols.length}</span>
                  </button>
                  {colsOpen && (
                    <div className="cs-colmenu">
                      <div className="cs-colmenu-top">
                        <button onClick={() => setHiddenCols(new Set())}>all</button>
                        <button onClick={() => setHiddenCols(new Set(allCols.slice(1)))}>none</button>
                      </div>
                      {allCols.map(c => {
                        const on = !hiddenCols.has(c)
                        const meta2 = meta.columns.find(x => x.name === c)
                        return (
                          <label key={c} className="cs-colrow">
                            <input type="checkbox" checked={on} onChange={() => setHiddenCols(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n })} />
                            <span className="cs-colname">{c}</span>
                            {meta2?.ref && <span className="cs-colfk">→ {meta2.ref.table}</span>}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            {dayFilter && (
              <div className="cs-filter">filtered: day = {dayFilter}<button onClick={() => setDayFilter(null)}>✕ clear</button></div>
            )}
            {vqActive && (
              <div className="cs-filter vq">
                ⛏ verifying{vq.label ? <> “<b>{vq.label}</b>”</> : null} — {(vq.filters || []).map(f => `${f.column} ${f.op} ${Array.isArray(f.value) ? `[${f.value.length} value${f.value.length === 1 ? '' : 's'}]` : f.value ?? ''}`).join(' · ')} · rows read live through your login (RLS)
                <button onClick={() => setVq(null)}>✕ clear</button>
              </div>
            )}
            {rows.error && <p className="a-err">{rows.error}</p>}
            {rows.loading && <p className="a-dim">querying with your session…</p>}
            {!rows.loading && rows.list.length === 0 && !rows.error && <p className="a-dim">no rows{dayFilter ? ' for this day' : vqActive ? ' match these filters' : ''}.</p>}
            {rows.list.length > 0 && (() => {
              const vhi = new Set(vqActive ? (vq?.hi || []) : [])
              const hc = (c) => vhi.has(c) ? 'hi' : ''
              const tot = vqActive ? cols.reduce((acc, c) => { const vals = rows.list.map(rw => rw[c]).filter(x => typeof x === 'number'); acc[c] = vals.length ? vals.reduce((a, b) => a + b, 0) : null; return acc }, {}) : null
              return (
                <div className="dpnl dp2 cs-tbl" style={{ maxHeight: 'calc(100vh - 420px)' }}>
                  <table>
                    <thead><tr>{cols.map(c => <th key={c} className={hc(c)} style={{ textAlign: 'left' }}>{c}{vhi.has(c) && <span className="hi-ic" title="highlighted — the verified numbers come from this column">⌖</span>}</th>)}</tr></thead>
                    <tbody>
                      {tot && <tr className="tot">{cols.map((c, i) => <td key={c} className={hc(c)} style={{ textAlign: 'left' }}>{i === 0 && tot[cols[0]] == null ? 'TOTALS' : tot[c] == null ? '' : fmt(tot[c])}</td>)}</tr>}
                      {rows.list.map((rw, i) => <tr key={i}>{cols.map(c => <td key={c} className={hc(c)} style={{ textAlign: 'left' }}>{fmt(rw[c])}</td>)}</tr>)}
                    </tbody>
                  </table>
                </div>
              )
            })()}
            {rows.total > rows.list.length && <p className="a-dim" style={{ marginTop: 6 }}>showing first {rows.list.length} of {rows.total.toLocaleString()} rows{vqActive ? ' — TOTALS covers the shown rows only' : dayFilter ? '' : ' — deep-link with a day filter to narrow'}.</p>}
          </>
        )}
      </div>
    </div>
  )
}

// Schema map — force-directed graph of the client's tables (nodes) and their
// foreign keys (links). Node size scales with row count; click a node to open
// that table's rows. Runs a tiny spring/repulsion simulation on mount.
const SCHEMA_COLORS = ['#6ea8fe', '#3fd68f', '#e8b45a', '#a78bfa', '#f4747f', '#ee946c', '#5ac8e8', '#c78bfa']
function SchemaGraph({ model, counts, onOpen, onList }) {
  const W = 1000, H = 640
  const { clientId } = useParams()
  const nodes = model.tables
  const [pos, setPos] = useState(null)
  const [hover, setHover] = useState(null)
  const raf = useRef(0)
  const svgRef = useRef(null)
  const drag = useRef(null) // { name, ox, oy, moved }
  const justDragged = useRef(false)
  const storeKey = `csg_pos_${clientId}`

  // Drag to rearrange — freeform positions persist per client.
  const toSvg = (e) => {
    const svg = svgRef.current
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse())
    return { x: pt.x, y: pt.y }
  }
  const onNodeDown = (name) => (e) => {
    e.preventDefault()
    const p = toSvg(e)
    drag.current = { name, ox: p.x - pos[name].x, oy: p.y - pos[name].y, moved: false }
  }
  const onMove = (e) => {
    if (!drag.current || !pos) return
    const { name, ox, oy } = drag.current
    const p = toSvg(e)
    drag.current.moved = true
    cancelAnimationFrame(raf.current) // stop any running simulation — user owns layout now
    setPos(prev => ({ ...prev, [name]: { ...prev[name], x: Math.max(40, Math.min(W - 40, p.x - ox)), y: Math.max(30, Math.min(H - 30, p.y - oy)) } }))
  }
  const onUp = () => {
    if (drag.current?.moved && pos) {
      try { localStorage.setItem(storeKey, JSON.stringify(Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, { x: Math.round(v.x), y: Math.round(v.y) }])))) } catch { /* quota */ }
    }
    justDragged.current = !!drag.current?.moved
    drag.current = null
  }

  const degree = useMemo(() => {
    const d = {}
    for (const t of nodes) d[t.name] = 0
    for (const e of model.edges) { if (d[e.from] != null) d[e.from]++; if (d[e.to] != null) d[e.to]++ }
    return d
  }, [model, nodes])

  useEffect(() => {
    // Saved freeform arrangement wins — skip the simulation entirely.
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || 'null')
      if (saved && nodes.every(t => saved[t.name])) {
        setPos(Object.fromEntries(nodes.map(t => [t.name, { ...saved[t.name], vx: 0, vy: 0 }])))
        return
      }
    } catch { /* fall through to simulation */ }
    // Seed on a circle (deterministic — busiest tables toward the centre).
    const order = [...nodes].sort((a, b) => (degree[b.name] || 0) - (degree[a.name] || 0))
    const P = {}
    order.forEach((t, i) => {
      const ang = (i / order.length) * Math.PI * 2
      const rad = 60 + (i / order.length) * 240
      P[t.name] = { x: W / 2 + Math.cos(ang) * rad, y: H / 2 + Math.sin(ang) * rad, vx: 0, vy: 0 }
    })
    let iter = 0
    const step = () => {
      iter++
      for (const a of nodes) for (const b of nodes) {
        if (a.name === b.name) continue
        const pa = P[a.name], pb = P[b.name]
        let dx = pa.x - pb.x, dy = pa.y - pb.y
        let d2 = dx * dx + dy * dy || 0.01
        const rep = 42000 / d2
        const d = Math.sqrt(d2)
        pa.vx += (dx / d) * rep; pa.vy += (dy / d) * rep
      }
      for (const e of model.edges) {
        const pa = P[e.from], pb = P[e.to]; if (!pa || !pb) continue
        const dx = pb.x - pa.x, dy = pb.y - pa.y
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01
        const f = (d - 150) * 0.02
        pa.vx += (dx / d) * f; pa.vy += (dy / d) * f
        pb.vx -= (dx / d) * f; pb.vy -= (dy / d) * f
      }
      for (const t of nodes) {
        const p = P[t.name]
        p.vx += (W / 2 - p.x) * 0.008; p.vy += (H / 2 - p.y) * 0.008
        p.x += Math.max(-20, Math.min(20, p.vx)); p.y += Math.max(-20, Math.min(20, p.vy))
        p.vx *= 0.82; p.vy *= 0.82
        p.x = Math.max(60, Math.min(W - 60, p.x)); p.y = Math.max(50, Math.min(H - 50, p.y))
      }
      setPos({ ...P })
      if (iter < 220) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  const rOf = (name) => {
    const c = counts[name]
    const base = 20 + Math.min(26, Math.sqrt(c || 0) * 0.9)
    return Math.round(base)
  }
  const colorOf = (name) => SCHEMA_COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % SCHEMA_COLORS.length]

  return (
    <div className="csg-root">
      <div className="csg-head">
        <div>
          <div className="csg-title">Schema map</div>
          <div className="csg-sub">{nodes.length} tables · {model.edges.length} relationships · click a table to open its rows</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="cs-graph-btn" onClick={() => { try { localStorage.removeItem(storeKey) } catch { /* noop */ } window.location.reload() }} title="forget your arrangement and re-run the auto layout">↺ auto layout</button>
          <button className="cs-graph-btn" onClick={onList}>☰ list view</button>
        </div>
      </div>
      <div className="csg-canvas">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
          onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
          {pos && model.edges.map((e, i) => {
            const a = pos[e.from], b = pos[e.to]; if (!a || !b) return null
            const lit = hover && (e.from === hover || e.to === hover)
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit ? '#8fb4ff' : 'rgba(255,255,255,.13)'} strokeWidth={lit ? 1.6 : 1} strokeDasharray={e.logical ? '4 4' : undefined}><title>{`${e.from}.${e.col} → ${e.to}.${e.toCol}`}</title></line>
          })}
          {pos && nodes.map(t => {
            const p = pos[t.name]; if (!p) return null
            const r = rOf(t.name), col = colorOf(t.name)
            const dim = hover && hover !== t.name && !model.edges.some(e => (e.from === hover && e.to === t.name) || (e.to === hover && e.from === t.name))
            return (
              <g key={t.name} transform={`translate(${p.x},${p.y})`} className="csg-node" opacity={dim ? 0.35 : 1}
                onPointerDown={onNodeDown(t.name)}
                onClick={() => { if (!justDragged.current) onOpen(t.name) }}
                onMouseEnter={() => setHover(t.name)} onMouseLeave={() => setHover(null)}>
                <circle r={r} fill={col} fillOpacity="0.9" stroke={col} strokeWidth="1.5" />
                <text textAnchor="middle" dy={r + 13} className="csg-label">{t.name.replace(/^client_/, '')}</text>
                {counts[t.name] != null && <text textAnchor="middle" dy="4" className="csg-count">{counts[t.name] >= 1000 ? (counts[t.name] / 1000).toFixed(1) + 'k' : counts[t.name]}</text>}
              </g>
            )
          })}
        </svg>
        {!pos && <div className="csg-loading">laying out the schema…</div>}
      </div>
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
  const x = (n) => n == null ? '—' : n.toFixed(2) + 'x'
  const gaGap = p.users == null // Users/CPVisit/CVR need GA4
  const pc1 = (n) => n == null ? '' : (n * 100).toFixed(1) + '%'
  // Jason reads the P&L as RATIOS AGAINST GROSS SALES. Every cost/margin line
  // shows "% of gross"; the two ad platforms show their share "of spend" (they
  // sum to 100%). Each % carries an ⓘ naming its denominator, so if the basis
  // ever needs to change it's explicit and easy to find.
  const gross = p.grossSales || 0
  const totalSpend = (p.metaSpend || 0) + (p.googleSpend || 0)
  const ofG = (n) => gross ? n / gross : null            // share of gross sales
  const share = (n) => totalSpend ? n / totalSpend : null // share of total ad spend
  const G = (n) => pc1(ofG(n)) + ' of gross'
  // Each drillable line names the source it traces to. `d` = drill descriptor.
  const O = (measure) => ({ kind: 'orders', measure })
  const rows = [
    ['Gross Sales', $2(p.grossSales), '', 'strong', null, O('gross')],
    ['Discounts', '-' + $2(p.discounts), G(p.discounts), 'warn', null, O('discounts')],
    ['Refunds', '-' + $2(p.refunds), G(p.refunds), 'warn', null, O('refunds')],
    ['Net Sales', $2(p.netSales), G(p.netSales), 'strong', null, O('net')],
    ['sep'],
    ['Total Orders', String(p.totalOrders), '', '', null, O('countAll')],
    ['New Orders', p.newClassified ? String(p.nOrders) : '— (classifying)', p.newClassified ? pc1(p.nOrderPct) + ' of orders' : '', '', null, p.newClassified ? O('countNew') : null],
    ['True AOV', $2(p.trueAov), '', 'good', null, O('aov')],
    ['sep'],
    ['Meta Spend', $(p.metaSpend), pc1(share(p.metaSpend)) + ' of spend', 'warn', null, { kind: 'campaigns', platform: 'Meta' }],
    ['Google Spend', $(p.googleSpend), pc1(share(p.googleSpend)) + ' of spend', 'warn', null, { kind: 'campaigns', platform: 'Google' }],
    ['Ad Spend (total)', $(totalSpend), G(totalSpend), 'warn'],
    ['Blended ROAS', x(p.blendedRoas), '', 'good'],
    ['Blended CAC', $(p.blendedCpa), '', ''],
    ['New CAC', p.newClassified ? $(p.nCpa) : '—', '', ''],
    ['sep'],
    ['Users (sessions)', gaGap ? '— needs GA4' : p.users.toLocaleString(), '', gaGap ? 'dim' : ''],
    ['Cost / Visit', gaGap ? '—' : $2(p.cpVisit), '', gaGap ? 'dim' : ''],
    ['Conversion Rate', gaGap ? '—' : pc1(p.cvrBlended), '', gaGap ? 'dim' : 'good'],
    ['sep'],
    ['COGS', $(p.cogs), G(p.cogs), 'bad', null, sources?.hasCogs ? O('cogs') : null],
    ['Contribution Margin', $2(p.contributionMargin), G(p.contributionMargin), 'good'],
    ['Orders Shipped', String(p.ordersShipped), '', '', null, O('shipped')],
    ['Shipping Costs', $2(p.shippingCosts), G(p.shippingCosts), 'warn', 'shipping', O('shippingCost')],
    ['sep'],
    ['Gross Profit', $2(p.grossProfit), G(p.grossProfit), 'good'],
    ['Profit Margin', pc1(ofG(p.grossProfit)), 'of gross', p.grossProfit >= 0 ? 'good' : 'bad'],
  ]
  // Plain-language definition for each line — shown via the ⓘ info icon.
  const DESC = {
    'Gross Sales': 'Merchandise sales before discounts and refunds (order subtotal + discounts). Excludes tax and shipping. This is the base every "% of gross" is measured against.',
    'Discounts': 'Total discounts applied across orders in range. Shown as % of Gross Sales.',
    'Refunds': 'Money refunded to customers in range. Shown as % of Gross Sales.',
    'Net Sales': 'Gross sales minus discounts and refunds. The % is Net ÷ Gross Sales — how much of gross survives.',
    'Total Orders': 'Orders with positive net sales in the range.',
    'New Orders': "Orders from first-time customers — a customer whose first-ever order (matched by email, across all history) falls in this range. The % is new ÷ total orders.",
    'True AOV': 'Average order value after discounts & refunds — Net Sales ÷ Total Orders.',
    'Meta Spend': 'Meta (Facebook / Instagram) ad spend, from client_meta_campaigns. The % is Meta’s share of total ad spend (Meta + Google).',
    'Google Spend': 'Google Ads spend, from client_google_campaigns. The % is Google’s share of total ad spend (Meta + Google).',
    'Ad Spend (total)': 'Meta + Google spend combined. Shown as % of Gross Sales.',
    'Blended ROAS': 'Return on ad spend, blended across all channels — Net Sales ÷ total ad spend. 3x = $3 of net sales per $1 spent.',
    'Blended CAC': 'Blended customer-acquisition cost — total ad spend ÷ Total Orders. Cost per order across new AND returning buyers.',
    'New CAC': 'New-customer acquisition cost — total ad spend ÷ New Customers. What it costs to acquire one first-time buyer.',
    'Users (sessions)': 'Website sessions in range. Needs a GA4 connection.',
    'Cost / Visit': 'Ad spend ÷ website sessions. Needs GA4.',
    'Conversion Rate': 'Orders ÷ website sessions — how many visits become orders. Needs GA4.',
    'COGS': 'Cost of goods sold — the real material cost of what shipped, from each order’s SKUs → BOM → client_materials. Shown as % of Gross Sales.',
    'Contribution Margin': 'Net Sales − COGS − ad spend. What’s left to cover shipping, overhead, and profit. Shown as % of Gross Sales.',
    'Orders Shipped': 'Orders marked fulfilled in range.',
    'Shipping Costs': 'Orders shipped × cost per label (the average pick/pack/label cost you set). Shown as % of Gross Sales.',
    'Gross Profit': 'Contribution Margin − shipping costs — the bottom line of this P&L. Shown as % of Gross Sales.',
    'Profit Margin': 'Gross Profit ÷ Gross Sales — profit as a share of gross revenue.',
  }
  return (
    <>
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
    </>
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
  const table = platform === 'Meta' ? 'client_meta_campaigns' : 'client_google_campaigns'
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

function missionTableRow(record, cells) {
  cells.__rec = record
  return cells
}

function adsNumber(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function adCostPerConversion(cost, conversions) {
  return Number(conversions) > 0 ? money(Number(cost || 0) / Number(conversions)) : '—'
}

function AdStatusPill({ status, stale = false }) {
  const enabled = !stale && status === 'ENABLED'
  const label = stale ? 'stale' : status ? String(status).toLowerCase() : 'unknown'
  return <span className={`pill ${enabled ? 'ok' : 'dead'}`}>{label}</span>
}

// Google sync stores one row per entity per day. The Mission tab needs a
// range-level view, so sum the daily rows while preserving the latest entity
// status/name/type for the selected period.
function aggregateGoogleHierarchy(rows, idKey, nameKey) {
  const byId = new Map()
  for (const row of rows || []) {
    const id = String(row[idKey] || '')
    if (!id) continue
    let current = byId.get(id)
    if (!current) {
      current = { ...row, [idKey]: id, cost: 0, impressions: 0, clicks: 0, conversions: 0, _latestDate: '' }
      byId.set(id, current)
    }
    current.cost += Number(row.cost) || 0
    current.impressions += Number(row.impressions) || 0
    current.clicks += Number(row.clicks) || 0
    current.conversions += Number(row.conversions) || 0
    const rowDate = String(row.date || '')
    if (rowDate >= current._latestDate) {
      current._latestDate = rowDate
      current.status = row.status || current.status
      current[nameKey] = row[nameKey] || current[nameKey]
      current.ad_type = row.ad_type || current.ad_type
      current.youtube_video_id = row.youtube_video_id || current.youtube_video_id
    }
  }
  return [...byId.values()]
    .map(row => ({ ...row, cpc: row.clicks > 0 ? row.cost / row.clicks : 0, cost_per_conversion: row.conversions > 0 ? row.cost / row.conversions : 0 }))
    .sort((a, b) => b.cost - a.cost)
}

function GoogleCampaignHierarchy({ m, clientId, start, end, rangeLabel }) {
  const campaigns = m.campaigns.filter(c => c.platform === 'Google')
  const [level, setLevel] = useState('campaigns')
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [selectedAdGroup, setSelectedAdGroup] = useState(null)
  const [adGroups, setAdGroups] = useState([])
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // A new client or date range always starts at the campaign level. The child
  // tables are fetched only when requested, rather than loading every ad on
  // every Mission-page visit.
  useEffect(() => {
    setLevel('campaigns')
    setSelectedCampaign(null)
    setSelectedAdGroup(null)
    setAdGroups([])
    setAds([])
    setLoading(false)
    setError('')
  }, [clientId, start, end])

  const readChildren = useCallback((table, foreignKey, foreignId) => fetchAllRows((from, to) => (
    supabase.from(table)
      .select('*')
      .eq('client_id', clientId)
      .eq(foreignKey, foreignId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .range(from, to)
  )), [clientId, start, end])

  const openCampaign = async (campaign) => {
    setSelectedCampaign(campaign)
    setSelectedAdGroup(null)
    setLevel('adGroups')
    setLoading(true)
    setError('')
    try {
      const rows = await readChildren('client_google_ad_groups', 'campaign_id', campaign.campaign_id)
      setAdGroups(aggregateGoogleHierarchy(rows, 'ad_group_id', 'ad_group_name'))
    } catch (e) {
      setAdGroups([])
      setError(`Could not load this campaign’s ad groups: ${e?.message || 'unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const openAdGroup = async (adGroup) => {
    setSelectedAdGroup(adGroup)
    setLevel('ads')
    setLoading(true)
    setError('')
    try {
      const rows = await readChildren('client_google_ads', 'ad_group_id', adGroup.ad_group_id)
      setAds(aggregateGoogleHierarchy(rows, 'ad_id', 'ad_name'))
    } catch (e) {
      setAds([])
      setError(`Could not load this ad group’s ads: ${e?.message || 'unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const backToCampaigns = () => {
    setLevel('campaigns')
    setSelectedCampaign(null)
    setSelectedAdGroup(null)
    setError('')
  }
  const backToAdGroups = () => {
    setLevel('adGroups')
    setSelectedAdGroup(null)
    setError('')
  }

  const currentRows = level === 'campaigns' ? campaigns : level === 'adGroups' ? adGroups : ads
  const tableId = `google-${level}-${clientId}`
  const table = level === 'campaigns'
    ? {
        columns: [{ label: 'Campaign' }, { label: 'Status' }, { label: 'Spend', num: true }, { label: 'Clicks', num: true }, { label: 'Conversions', num: true }, { label: 'Cost / Conv.', num: true }, { label: 'True ROAS', num: true }],
        rows: campaigns.map(c => missionTableRow(c, [
          { v: c.campaign_name, cls: 'tname', s: c.campaign_name },
          { v: <AdStatusPill status={c.status} stale={c.stale} />, s: c.stale ? 'stale' : c.status },
          { v: money(c.spend), cls: 'num', s: c.spend },
          { v: adsNumber(c.clicks), cls: 'num', s: c.clicks },
          { v: adsNumber(c.conversions), cls: 'num', s: c.conversions },
          { v: adCostPerConversion(c.spend, c.conversions), cls: 'num', s: c.conversions > 0 ? c.spend / c.conversions : -1 },
          { v: c.trueRoas != null ? c.trueRoas.toFixed(2) + 'x' : '—', cls: `num strong ${c.trueRoas == null ? '' : c.trueRoas >= 1 ? 'good' : 'bad'}`, s: c.trueRoas ?? -1 },
        ])),
        rowKey: r => r.campaign_id,
        onRowClick: openCampaign,
        empty: 'no Google campaigns in this range.',
        note: `Click a campaign to open its ad groups · source: client_google_campaigns · ${rangeLabel}`,
      }
    : level === 'adGroups'
      ? {
          columns: [{ label: 'Ad Group' }, { label: 'Status' }, { label: 'Spend', num: true }, { label: 'Clicks', num: true }, { label: 'Conversions', num: true }, { label: 'Cost / Conv.', num: true }],
          rows: adGroups.map(g => missionTableRow(g, [
            { v: g.ad_group_name || g.ad_group_id, cls: 'tname', s: g.ad_group_name },
            { v: <AdStatusPill status={g.status} />, s: g.status },
            { v: money(g.cost), cls: 'num', s: g.cost },
            { v: adsNumber(g.clicks), cls: 'num', s: g.clicks },
            { v: adsNumber(g.conversions), cls: 'num', s: g.conversions },
            { v: adCostPerConversion(g.cost, g.conversions), cls: 'num', s: g.cost_per_conversion || -1 },
          ])),
          rowKey: r => r.ad_group_id,
          onRowClick: openAdGroup,
          empty: 'no ad groups in this campaign for this range.',
          note: `Click an ad group to open its ads · source: client_google_ad_groups · ${rangeLabel}`,
        }
      : {
          columns: [{ label: 'Ad' }, { label: 'Type' }, { label: 'Status' }, { label: 'Spend', num: true }, { label: 'Clicks', num: true }, { label: 'Conversions', num: true }, { label: 'Cost / Conv.', num: true }],
          rows: ads.map(ad => missionTableRow(ad, [
            { v: ad.ad_name || `Ad ${ad.ad_id}`, cls: 'tname', s: ad.ad_name },
            { v: ad.ad_type || '—', cls: 'mono', s: ad.ad_type || '' },
            { v: <AdStatusPill status={ad.status} />, s: ad.status },
            { v: money(ad.cost), cls: 'num', s: ad.cost },
            { v: adsNumber(ad.clicks), cls: 'num', s: ad.clicks },
            { v: adsNumber(ad.conversions), cls: 'num', s: ad.conversions },
            { v: adCostPerConversion(ad.cost, ad.conversions), cls: 'num', s: ad.cost_per_conversion || -1 },
          ])),
          rowKey: r => r.ad_id,
          onRowClick: null,
          empty: 'no ads in this ad group for this range.',
          note: `source: client_google_ads · ${rangeLabel}`,
        }

  return (
    <div className="v-pad">
      <div className="campaign-drill-head">
        <div>
          <h3 className="v-h" style={{ margin: 0 }}>Google Ads</h3>
          <p className="v-note">Campaign performance for {rangeLabel}. Drill into the underlying Google entities without leaving Mission Control.</p>
        </div>
        <div className="campaign-drill-path" aria-label="Google Ads hierarchy">
          <span className={level === 'campaigns' ? 'on' : ''}>Campaigns</span><b>›</b><span className={level === 'adGroups' ? 'on' : ''}>Ad groups</span><b>›</b><span className={level === 'ads' ? 'on' : ''}>Ads</span>
        </div>
      </div>

      {level !== 'campaigns' && (
        <nav className="campaign-breadcrumb" aria-label="Campaign drill-down path">
          <button onClick={backToCampaigns}>Campaigns</button>
          <span>›</span>
          {level === 'adGroups'
            ? <strong>{selectedCampaign?.campaign_name}</strong>
            : <button onClick={backToAdGroups}>{selectedCampaign?.campaign_name}</button>}
          {level === 'ads' && <><span>›</span><strong>{selectedAdGroup?.ad_group_name}</strong></>}
        </nav>
      )}

      {error && <p className="campaign-drill-error" role="alert">{error}</p>}
      {loading
        ? <p className="loading">loading {level === 'adGroups' ? 'ad groups' : 'ads'}…</p>
        : table.rows.length
          ? <ResizableTable id={tableId} columns={table.columns} rows={table.rows} rowKeyOf={table.rowKey} onRowClick={table.onRowClick} note={table.note} />
          : <p className="loading">{table.empty}</p>}
    </div>
  )
}

function MetaCampaignFramework({ m, rangeLabel }) {
  const rows = m.campaigns.filter(c => c.platform === 'Meta')
  return (
    <div className="v-pad">
      <div className="campaign-drill-head">
        <div>
          <h3 className="v-h" style={{ margin: 0 }}>Meta Ads</h3>
          <p className="v-note">Campaign performance for {rangeLabel}. The hierarchy is ready for ad-set and ad data once those entities are synced.</p>
        </div>
        <div className="campaign-drill-path" aria-label="Meta Ads target hierarchy">
          <span className="on">Campaigns</span><b>›</b><span>Ad sets</span><b>›</b><span>Ads</span>
        </div>
      </div>

      <section className="meta-framework" aria-labelledby="meta-framework-heading">
        <div>
          <p id="meta-framework-heading" className="meta-framework-title">Campaign level is live · ad-set and ad drill-down is pending</p>
          <p className="meta-framework-copy">Meta currently syncs only <code>client_meta_campaigns</code>, so this tab can safely show campaign totals but cannot yet invent ad-set or ad rows.</p>
        </div>
        <ol className="meta-framework-list">
          <li>Create RLS-protected daily <code>client_meta_ad_sets</code> and <code>client_meta_ads</code> tables keyed to their parent campaign/ad-set IDs.</li>
          <li>Extend the Meta Graph sync to fetch <code>level=adset</code> and <code>level=ad</code> insights, plus current delivery, budget, targeting/placement, and creative metadata where the connection permits it.</li>
          <li>Backfill the selected history, add the tables to the Schema/MCP allowlists, then enable this same campaign → ad set → ad drill-down.</li>
        </ol>
      </section>

      {rows.length
        ? <ResizableTable
            id="meta-campaigns"
            columns={[{ label: 'Campaign' }, { label: 'Status' }, { label: 'Spend', num: true }, { label: 'Clicks', num: true }, { label: 'Conversions', num: true }, { label: 'True ROAS', num: true }]}
            rows={rows.map(c => missionTableRow(c, [
              { v: c.campaign_name, cls: 'tname', s: c.campaign_name },
              { v: <AdStatusPill status={c.status} stale={c.stale} />, s: c.stale ? 'stale' : c.status },
              { v: money(c.spend), cls: 'num', s: c.spend },
              { v: adsNumber(c.clicks), cls: 'num', s: c.clicks },
              { v: adsNumber(c.conversions), cls: 'num', s: c.conversions },
              { v: c.trueRoas != null ? c.trueRoas.toFixed(2) + 'x' : '—', cls: `num strong ${c.trueRoas == null ? '' : c.trueRoas >= 1 ? 'good' : 'bad'}`, s: c.trueRoas ?? -1 },
            ]))}
            rowKeyOf={c => c.campaign_id}
            note={`Campaign-level source: client_meta_campaigns · ${rangeLabel}`}
          />
        : <p className="loading">no Meta campaigns in this range.</p>}
    </div>
  )
}

function CampaignView({ m, platform, clientId, start, end, rangeLabel }) {
  if (platform === 'Meta') return <MetaCampaignFramework m={m} rangeLabel={rangeLabel} />
  return <GoogleCampaignHierarchy m={m} clientId={clientId} start={start} end={end} rangeLabel={rangeLabel} />
}

// Every column of client_orders — the picker can mirror the table 1:1.
// def: shown by default. cell(o) → ResizableTable cell {v, s(ort), cls}.
const fmtDateShort = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const oc = (v) => ({ v: v || <span className="dimc">—</span>, s: String(v || '') })
const ORDER_FIELDS = [
  { key: 'order',        label: 'Order',        def: true, cell: o => ({ v: o.order_name || o.lead_id, cls: 'tname', s: String(o.order_name || o.lead_id) }) },
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
      o.order_name || o.lead_id, deriveChannel(o), fmtDateShort(o.created_at),
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
function DataTable({ head, rows, rowHref }) {
  return (
    <div className="datatable"><table>
      <thead><tr>{head.map((h, i) => <th key={i} style={i > 0 ? { textAlign: 'right' } : undefined}>{h}</th>)}</tr></thead>
      <tbody>{(rows || []).map((r, i) => {
        const href = rowHref ? rowHref(i) : null
        return (
          <tr key={i} className={href ? 'click' : ''} title={href ? 'click to verify — opens the Schema browser filtered to this row’s source records' : undefined}
            onClick={href ? () => window.open(href, '_blank', 'noopener') : undefined}>
            {(Array.isArray(r) ? r : [String(r)]).map((c, j) => <td key={j} className={j > 0 ? 'num' : ''}>{c}</td>)}
          </tr>
        )
      })}</tbody>
    </table></div>
  )
}

/* Verify deep links — encode a filter set for the Schema browser (?vq=…). */
function encodeVq(o) { try { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') } catch { return '' } }
function decodeVq(s) { try { return JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))))) } catch { return null } }

/* Generative UI: render a spec the agent produced (bar | line | table) */
const SERIES_COLORS = ['#6ea8fe', '#3fd68f', '#e8b45a', '#a78bfa', '#f4747f']
function RenderSpec({ spec, onDrill }) {
  const { clientId } = useParams()
  const v = spec.verify
  // Deep link to the Schema browser filtered to this view's source rows
  const vUrl = (extra) => `/control/${clientId}/mission?focus=${v.table}&vq=${encodeVq({ filters: [...(v.filters || []), ...(extra || [])], hi: v.hi || [], label: spec.title })}`
  const vLink = (pos) => v?.table && (
    <a className={`vq-link ${pos || ''}`} href={vUrl()} target="_blank" rel="noreferrer"
      title="Open the Schema browser filtered to the exact rows this view was computed from — live read through your login (RLS)">
      ⛏ verify source rows in Schema ↗
    </a>
  )
  if (spec.type === 'bar' && spec.bars?.length) {
    return <>
      <Bars rows={spec.bars.map((b, i) => ({ label: b.label, value: b.value, color: SERIES_COLORS[i % SERIES_COLORS.length], text: b.text ?? String(b.value) }))} onDrill={onDrill} />
      {vLink()}
    </>
  }
  if (spec.type === 'line' && spec.line?.series?.length) return <><LineChart line={spec.line} onDrill={onDrill} />{vLink()}</>
  if (spec.type === 'table' && spec.table?.head) {
    const rowHref = v?.table && v.row_column && Array.isArray(v.row_values)
      ? (i) => Array.isArray(v.row_values[i]) && v.row_values[i].length ? vUrl([{ column: v.row_column, op: 'in', value: v.row_values[i] }]) : null
      : null
    // Link above AND below — long tables would otherwise hide it off-screen
    return <>{vLink('top')}<DataTable head={spec.table.head} rows={spec.table.rows || []} rowHref={rowHref} />{vLink()}</>
  }
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
                fill={SERIES_COLORS[i % SERIES_COLORS.length]} stroke="#202023" strokeWidth="1.5" />
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
.ide{--bg:#202023;--panel:#1a1a1c;--panel2:#2a2a2e;--line:rgba(255,255,255,.06);--txt:#e4e4e6;--dim:#9a9aa2;--faint:#6a6a72;--green:#3fd68f;--red:#f4747f;--amber:#e8b45a;--orange:#ee946c;--blue:#6ea8fe;--purple:#a78bfa;
  position:fixed;inset:0;top:var(--mt-top,57px);z-index:30;background:var(--bg);color:var(--txt);font:13px/1.5 "SF Mono",ui-monospace,Menlo,Consolas,monospace;}
.ide-cols{display:flex;height:100%;}
.ide .dim{color:var(--faint);} .ide .good{color:var(--green);} .ide .warn{color:var(--amber);} .ide .bad,.ide .badc{color:var(--red);}
.ide .goodc{color:var(--green);} .ide .bluec{color:var(--blue);} .ide .purpc{color:var(--purple);} .ide .dimc{color:var(--faint);}
.ide .strong{font-weight:700;}

/* explorer */
.ide .explorer{flex-shrink:0;background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;padding-bottom:20px;}

/* resize handles — invisible until hover, like VS Code */
.ide .resize-h{width:5px;margin:0 -2px;flex-shrink:0;cursor:col-resize;z-index:5;position:relative;transition:background .12s;}
.ide .resize-h:hover{background:rgba(255,255,255,.10);}
.ide .resize-h:active{background:rgba(255,255,255,.16);}
.ide .resize-v{height:5px;margin-bottom:-2px;cursor:row-resize;z-index:5;position:relative;flex-shrink:0;transition:background .12s;}
.ide .resize-v:hover{background:rgba(255,255,255,.10);}
.ide .resize-v:active{background:rgba(255,255,255,.16);}
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
.ide .v-pad{padding:18px 24px 40px;}
.ide .v-h{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:20px 0 8px;}
.ide .v-note{color:var(--faint);font-size:11px;margin-top:12px;}
.ide .campaign-drill-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px;}
.ide .campaign-drill-head .v-note{margin:4px 0 0;}
.ide .campaign-drill-path{display:flex;align-items:center;gap:7px;color:var(--faint);font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;padding:5px 7px;border:1px solid var(--line);border-radius:6px;background:var(--panel);}
.ide .campaign-drill-path b{font-size:14px;font-weight:400;color:var(--line);line-height:10px;}.ide .campaign-drill-path .on{color:var(--blue);}
.ide .campaign-breadcrumb{display:flex;align-items:center;gap:7px;margin:0 0 12px;font-size:11.5px;min-width:0;}.ide .campaign-breadcrumb button{border:0;background:none;padding:0;color:var(--blue);font:inherit;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px;}.ide .campaign-breadcrumb button:hover{text-decoration:underline;}.ide .campaign-breadcrumb span{color:var(--faint);}.ide .campaign-breadcrumb strong{color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .campaign-drill-error{margin:0 0 12px;border:1px solid rgba(244,116,127,.3);border-radius:6px;background:rgba(244,116,127,.08);color:var(--red);font-size:11.5px;padding:8px 10px;}
.ide .meta-framework{border:1px solid rgba(110,168,254,.26);border-radius:8px;background:rgba(110,168,254,.055);padding:12px 14px;margin:0 0 15px;max-width:880px;}.ide .meta-framework-title{font-size:12px;font-weight:800;color:var(--txt);margin:0 0 4px;}.ide .meta-framework-copy{font-size:11.5px;line-height:1.5;color:var(--dim);margin:0;}.ide .meta-framework code{font-size:10.5px;color:var(--blue);background:rgba(110,168,254,.1);border-radius:3px;padding:1px 4px;}.ide .meta-framework-list{margin:10px 0 0;padding:9px 0 0 18px;border-top:1px solid rgba(110,168,254,.16);color:var(--dim);font-size:11px;line-height:1.55;}.ide .meta-framework-list li+li{margin-top:4px;}

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
.ide .dpnl{border:1px solid var(--line);border-radius:9px;overflow:auto;margin-top:4px;max-height:calc(100vh - 320px);}
.ide .dpnl table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;font-size:11.5px;font-variant-numeric:tabular-nums;}
.ide .dpnl th{position:sticky;top:0;background:var(--panel2);color:var(--txt);font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;line-height:1;padding:8px 11px;text-align:right;white-space:nowrap;z-index:2;border-bottom:1px solid var(--line);}
.ide .dpnl th.sortable{cursor:pointer;user-select:none;}
.ide .dpnl th.sortable:hover{color:var(--blue);}
.ide .dpnl th .sort-ar{color:var(--blue);font-size:8px;}
.ide .dpnl thead tr:first-child th{text-align:center;color:var(--blue);font-size:10px;border-left:1px solid var(--line);top:0;}
.ide .dpnl thead tr:first-child th:first-child{border-left:none;}
.ide .dpnl thead tr:last-child th{top:26px;}
.ide .dpnl td{padding:5.5px 11px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line);color:var(--txt);}
.ide .dpnl tbody tr:last-child td{border-bottom:none;}
.ide .dpnl th:first-child,.ide .dpnl td:first-child{position:sticky;left:0;background:var(--panel);text-align:left;z-index:1;}
.ide .dpnl thead th:first-child{z-index:3;background:var(--panel2);}
.ide .dpnl tr.tot td{font-weight:700;background:rgba(110,168,254,.06);}
.ide .dpnl tr.tot td:first-child{background:var(--panel2);}
.ide .dpnl tr:not(.tot):hover td{background:rgba(255,255,255,.02);}
.ide .dpnl tr:not(.tot):hover td:first-child{background:var(--panel2);}
.ide .ov-pad{padding:18px 24px 40px;}
.ide .ov-top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;}
/* Shield Score card */
.ide .shield{display:inline-flex;align-items:center;gap:11px;padding:9px 14px;border:1px solid var(--line2);border-radius:11px;background:var(--panel);}
.ide .shield.good{border-color:rgba(63,214,143,.35);box-shadow:inset 0 0 0 1px rgba(63,214,143,.06);}
.ide .shield.warn{border-color:rgba(232,180,90,.35);}
.ide .shield.bad{border-color:rgba(244,116,127,.4);}
.ide .shield-emoji{font-size:22px;line-height:1;}
.ide .shield-lbl{font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);}
.ide .shield-num{font-size:24px;font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums;}
.ide .shield.good .shield-num{color:var(--green);} .ide .shield.warn .shield-num{color:var(--amber);} .ide .shield.bad .shield-num{color:var(--red);}
.ide .shield-grade{font-size:12px;font-weight:600;color:var(--dim);margin-left:6px;}
/* its ⓘ sits at the very top of the page — open the key downward, not up.
   Extra .ov-i in the selector outranks the base .ide .ov-i .ov-pop rule that
   appears later in this stylesheet (which would otherwise re-pin bottom:18px). */
.ide .shield .ov-i .ov-pop{top:22px;bottom:auto;left:-8px;}
.ide .shield .ov-i .ov-pop::after{top:auto;bottom:100%;height:24px;}
.ide .ov-nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.ide .ov-upd{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--faint);margin-right:8px;white-space:nowrap;}
.ide .ov-upd.stale{color:var(--amber);}
.ide .ov-upd button{background:none;border:1px solid var(--line);border-radius:5px;color:var(--dim);cursor:pointer;font-size:12px;line-height:1;padding:3px 7px;}
.ide .ov-upd button:hover{color:var(--txt);border-color:var(--dim);}
.ide .ov-upd button:disabled{opacity:.5;cursor:default;}
/* digest preview (Settings) — Slack-style mock + SMS text twin + template editor */
.ide .pv-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.ide .set-tag{font-size:9px;background:rgba(110,168,254,.15);color:var(--blue);padding:2px 6px;border-radius:4px;margin-left:8px;vertical-align:2px;letter-spacing:.05em;text-transform:uppercase;}
.ide .tpl-edit{margin:10px 0 14px;}
.ide .tpl-ta{width:100%;max-width:580px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--txt);font:inherit;font-size:12px;line-height:1.55;resize:vertical;}
.ide .tpl-ta:focus{outline:none;border-color:var(--blue);}
.ide .tpl-tokens{max-width:580px;}
.ide .tpl-tokens code{background:var(--panel2);border:1px solid var(--line);border-radius:4px;padding:0 4px;margin:0 2px;font-size:10.5px;color:var(--blue);white-space:nowrap;}
.ide .pv-tabs{display:flex;gap:2px;background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:2px;width:fit-content;margin-bottom:10px;}
.ide .pv-tabs button{background:none;border:none;color:var(--dim);font:inherit;font-size:11px;padding:3px 10px;border-radius:5px;cursor:pointer;}
.ide .pv-tabs button:hover{color:var(--txt);}
.ide .pv-tabs button.on{background:var(--blue);color:#fff;}
.ide .slk{background:#1a1d21;border:1px solid var(--line);border-radius:10px;padding:14px 16px;max-width:580px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
.ide .slk-app{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.ide .slk-av{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,#4f8ef7,#7c5cff);display:grid;place-items:center;font-size:17px;flex-shrink:0;}
.ide .slk-name{font-weight:800;color:#e8eaed;font-size:14px;}
.ide .slk-tag{font-size:9px;background:#35383f;color:#b9bcc4;padding:1px 4px;border-radius:3px;margin-left:5px;vertical-align:1px;}
.ide .slk-time{color:#9a9ea6;font-size:11px;margin-left:6px;}
.ide .slk-h{font-size:16px;font-weight:900;color:#e8eaed;margin:6px 0;}
.ide .slk-sec{font-size:13px;color:#d1d3d8;line-height:1.55;margin:8px 0;}
.ide .slk-sec b{color:#fff;}
.ide .slk-btns{display:flex;gap:8px;margin:10px 0 4px;flex-wrap:wrap;}
.ide .slk-btn{border:1px solid #565a63;border-radius:6px;padding:5px 12px;font-size:12.5px;font-weight:700;color:#d1d3d8;}
.ide .slk-btn.primary{background:#007a5a;border-color:#007a5a;color:#fff;}
.ide .slk-ctx{font-size:11px;color:#9a9ea6;margin-top:8px;}
.ide .sms-prev{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:14px 16px;font-size:12px;line-height:1.6;white-space:pre-wrap;max-width:580px;color:var(--txt);margin:0;}
/* custom range picker */
.ide .ov-calwrap{position:relative;}
.ide .ov-calbtn{cursor:pointer;border:1px solid var(--line2);background:var(--panel);}
.ide .rc-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:60;background:var(--panel2);border:1px solid var(--line2);border-radius:11px;padding:12px;box-shadow:0 18px 50px rgba(0,0,0,.55);}
.ide .rc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.ide .rc-head button{width:26px;height:24px;border:1px solid var(--line);background:var(--panel);color:var(--dim);border-radius:6px;cursor:pointer;}
.ide .rc-hint{font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.06em;font-weight:700;}
.ide .rc-months{display:flex;gap:16px;}
.ide .rc-mh{text-align:center;font-size:12px;font-weight:700;color:var(--txt);margin-bottom:6px;}
.ide .rc-grid{display:grid;grid-template-columns:repeat(7,26px);gap:1px;}
.ide .rc-dow{text-align:center;font-size:9px;color:var(--faint);height:16px;line-height:16px;}
.ide .rc-day{height:26px;border:none;background:none;color:var(--dim);font:inherit;font-size:11px;cursor:pointer;border-radius:0;}
.ide .rc-day:hover:not(:disabled){background:rgba(255,255,255,.08);border-radius:6px;}
.ide .rc-out{visibility:hidden;}
.ide .rc-in{background:rgb(var(--blue-500,110 168 254) / .22);color:var(--txt);}
.ide .rc-edge{background:rgb(var(--blue-500,110 168 254));color:#fff;font-weight:700;border-radius:6px;}
.ide .ov-zoom{display:flex;gap:2px;background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:2px;margin-right:8px;}
.ide .ov-zoom button{background:none;border:none;color:var(--dim);font:inherit;font-size:11px;padding:3px 10px;border-radius:5px;cursor:pointer;}
.ide .ov-zoom button:hover{color:var(--txt);}
/* active zoom = client's brand primary (--blue-500 is set on :root as "r g b"
   channels by the layout; falls back to the default blue when no brand color) */
.ide .ov-zoom button.on{background:rgb(var(--blue-500, 110 168 254));color:#fff;}
.ide .ov-nav button{background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:13px;padding:3px 10px;cursor:pointer;}
.ide .ov-nav button:disabled{opacity:.35;cursor:default;}
.ide .ov-nav button:not(:disabled):hover{border-color:var(--blue);}
.ide .ov-day{font-weight:800;font-size:13px;padding:0 4px;font-variant-numeric:tabular-nums;}
.ide .ov-today{font-size:11px;}
.ide .ov-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:0 64px;}
/* PnL: metrics stacked on the left, click-to-drill tables on the right */
.ide .ov-grid.ov-2col{grid-template-columns:minmax(340px,440px) minmax(0,1fr);gap:0 40px;align-items:start;}
.ide .ov-drillcol{position:sticky;top:0;min-width:0;}
.ide .ov-drillcol .ov-drill{margin-top:0;border-top:none;padding-top:0;}
.ide .ov-drill-empty{border:1px dashed var(--line);border-radius:10px;padding:28px 20px;color:var(--faint);font-size:12px;text-align:center;margin-top:24px;}
@media (max-width: 1100px){.ide .ov-grid.ov-2col{grid-template-columns:1fr;}.ide .ov-drillcol{position:static;}}
.ide .ov-sec{margin-bottom:20px;}
.ide .ov-h{font-size:11px;font-weight:800;letter-spacing:.09em;color:var(--blue);border-bottom:1px solid var(--line);padding-bottom:4px;margin:0 0 6px;}
.ide .ov-h2{font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--txt);margin:14px 0 3px;}
/* paid-ads block: indented KPI group under its white channel headline */
.ide .ov-blk-lines{margin-left:5px;padding-left:12px;border-left:1px solid var(--line);}
.ide .ov-line{display:flex;align-items:baseline;width:100%;background:none;border:none;padding:2.5px 2px;font:inherit;font-size:12.5px;color:inherit;text-align:left;border-radius:4px;}
.ide .ov-line.on{cursor:pointer;}
.ide .ov-line.on:hover{background:rgba(110,168,254,.07);}
.ide .ov-line.open{background:rgba(110,168,254,.12);}
.ide .ov-line:disabled{cursor:default;}
.ide .ov-k{color:var(--dim);}
.ide .ov-dots{flex:1;border-bottom:1px dotted var(--line);margin:0 8px 3px;}
.ide .ov-v{font-weight:700;font-variant-numeric:tabular-nums;color:var(--txt);}
.ide .ov-v.good{color:var(--green);}
.ide .ov-v.bad{color:var(--red);}
.ide .ov-v.warn{color:var(--amber);}
.ide .ov-v.spend{color:var(--orange);} /* ad spend — money out, not a warning */
.ide .ov-v.lgreen{color:#8fe0bb;}
.ide .kd{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;flex-shrink:0;}
.ide .kd.g{background:var(--green);}.ide .kd.y{background:var(--amber);}.ide .kd.r{background:var(--red);}
.ide .ov-i{position:relative;display:inline-block;margin-left:7px;color:var(--faint);font-size:10px;cursor:help;}
.ide .ov-i:hover{color:var(--blue);}
.ide .ov-i .ov-pop{display:none;position:absolute;left:-12px;bottom:18px;z-index:60;width:250px;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:10px 13px;box-shadow:0 14px 40px rgba(0,0,0,.5);font-size:11px;color:var(--dim);text-align:left;white-space:normal;}
.ide .ov-i:hover .ov-pop{display:block;}
.ide .ov-pop b{display:block;color:var(--txt);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;margin-bottom:7px;}
.ide .ov-i .ov-pop.pin{display:block;}
/* element+class outranks the later '.ov-pop > span{display:flex}' rule below */
.ide .ov-pop > span.ov-pop-desc{display:block;color:var(--faint);font-size:10.5px;line-height:1.45;margin:-3px 0 8px;font-style:italic;}
.ide .ov-i-g{cursor:pointer;}
/* invisible strip under the popover so the mouse can cross the gap to reach it */
.ide .ov-i .ov-pop::after{content:'';position:absolute;left:0;right:0;top:100%;height:22px;}
.ide .ov-thr-edit{display:block;margin-top:7px;padding:0;background:none;border:none;color:var(--blue);font-size:10.5px;cursor:pointer;text-align:left;}
.ide .ov-thr-edit:hover{text-decoration:underline;}
.ide .ov-pop > span.ov-thr-form{display:block;padding:0;}
.ide .ov-thr-form > span{display:flex;align-items:center;gap:4px;padding:2px 0;line-height:1.45;white-space:nowrap;}
.ide .ov-thr-form input{width:52px;background:var(--bg);border:1px solid var(--line);border-radius:5px;color:var(--txt);font:inherit;font-size:11px;padding:2px 5px;}
.ide .ov-thr-form input:focus{outline:none;border-color:var(--blue);}
.ide .ov-thr-note{color:var(--faint);}
.ide .ov-thr-btns{gap:8px;margin-top:6px;}
.ide .ov-thr-btns button{background:var(--bg);border:1px solid var(--line);border-radius:5px;color:var(--txt);font-size:10.5px;padding:2px 9px;cursor:pointer;}
.ide .ov-thr-btns button:first-child{border-color:var(--blue);color:var(--blue);}
.ide .ov-thr-btns button:disabled{opacity:.4;cursor:default;}
.ide .ov-pop > span{display:flex;align-items:baseline;padding:2px 0;line-height:1.45;}
.ide .ov-drill{margin-top:6px;border-top:1px solid var(--line);padding-top:10px;}
.ide .ov-drill-h{font-size:11.5px;margin-bottom:6px;}
.ide .ov-explain{font-size:12px;color:var(--dim);background:rgba(110,168,254,.06);border:1px solid rgba(110,168,254,.18);border-radius:7px;padding:8px 12px;margin-bottom:12px;max-width:1100px;line-height:1.55;}
.ide .ov-drill-bar{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin-bottom:6px;}
.ide .ov-drill-sel{font-size:11px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.04em;}
.ide .ov-drill-x{background:none;border:1px solid var(--line);border-radius:6px;color:var(--dim);font-size:11px;padding:2px 9px;cursor:pointer;}
.ide .ov-drill-x:hover{color:var(--txt);border-color:var(--dim);}
.ide .ov-set{margin-bottom:16px;}
/* column(s) the clicked P&L metric is computed from */
.ide .ov-set th.hi{color:var(--blue);background:linear-gradient(rgba(110,168,254,.10),rgba(110,168,254,.10)),var(--panel2);} /* opaque — sticky header must not let rows show through */
.ide .ov-set td.hi{background:rgba(110,168,254,.07);}
.ide .ov-set th .hi-ic{margin-left:4px;color:var(--blue);cursor:help;}
.ide .ov-hi-note{margin-left:10px;color:var(--blue);font-size:11px;cursor:help;white-space:nowrap;}
.ide .ov-drill-h .mono{font-family:inherit;font-weight:800;color:var(--txt);}
.ide .ov-tlink{text-decoration:none;}
.ide .ov-tlink:hover{color:var(--blue);text-decoration:underline;}
.ide .cs-root{display:flex;height:100%;min-height:0;}
.ide .cs-rail{width:250px;flex-shrink:0;border-right:1px solid var(--line);overflow-y:auto;padding:14px 10px;}
.ide .cs-rail-h{display:flex;align-items:center;justify-content:space-between;font-size:9.5px;font-weight:800;letter-spacing:.08em;color:var(--faint);padding:0 4px 8px;}
.ide .cs-graph-btn{background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--dim);font:inherit;font-size:11px;padding:3px 9px;cursor:pointer;letter-spacing:0;text-transform:none;}
.ide .cs-graph-btn:hover{color:var(--txt);border-color:var(--dim);}
/* schema map (force graph) */
.ide .csg-root{display:flex;flex-direction:column;height:100%;min-height:0;padding:14px 18px;}
.ide .csg-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;}
.ide .csg-title{font-size:15px;font-weight:800;color:var(--txt);}
.ide .csg-sub{font-size:11px;color:var(--faint);margin-top:2px;}
.ide .csg-canvas{flex:1;min-height:0;position:relative;background:radial-gradient(circle at 50% 45%,rgba(110,168,254,.05),transparent 60%);border:1px solid var(--line);border-radius:12px;overflow:hidden;}
.ide .csg-node{cursor:pointer;transition:opacity .15s;}
.ide .csg-node:hover circle{filter:brightness(1.15);}
.ide .csg-label{fill:var(--dim);font-size:10px;font-weight:600;pointer-events:none;}
.ide .csg-count{fill:#202023;font-size:10px;font-weight:800;pointer-events:none;}
.ide .csg-loading{position:absolute;inset:0;display:grid;place-items:center;color:var(--faint);font-size:12px;}
.ide .cs-q{width:100%;box-sizing:border-box;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:11.5px;padding:5px 8px;margin-bottom:8px;outline:none;}
.ide .cs-t{display:flex;align-items:center;width:100%;gap:8px;background:none;border:none;color:var(--dim);font:inherit;font-size:12px;padding:4.5px 6px;cursor:pointer;text-align:left;border-radius:5px;}
.ide .cs-t:hover{background:rgba(255,255,255,.03);color:var(--txt);}
.ide .cs-t.on{background:rgba(110,168,254,.1);color:var(--txt);}
.ide .cs-tn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .cs-tc{color:var(--faint);font-size:10.5px;font-variant-numeric:tabular-nums;}
.ide .cs-note{color:var(--faint);font-size:10.5px;padding:10px 4px;line-height:1.5;}
.ide .cs-main{flex:1;overflow-y:auto;padding:18px 24px;min-width:0;}
.ide .cs-head{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
.ide .cs-path{font-weight:800;font-size:14px;}
/* column picker dropdown */
.ide .cs-colpick{position:relative;margin-left:auto;}
.ide .cs-colmenu{position:absolute;right:0;top:calc(100% + 4px);z-index:40;width:230px;max-height:340px;overflow-y:auto;background:var(--panel2);border:1px solid var(--line2);border-radius:9px;padding:6px;box-shadow:0 14px 40px rgba(0,0,0,.5);}
.ide .cs-colmenu-top{display:flex;gap:6px;padding:2px 4px 6px;border-bottom:1px solid var(--line);margin-bottom:4px;}
.ide .cs-colmenu-top button{background:none;border:1px solid var(--line);border-radius:5px;color:var(--dim);font:inherit;font-size:10.5px;padding:2px 9px;cursor:pointer;}
.ide .cs-colmenu-top button:hover{color:var(--txt);border-color:var(--dim);}
.ide .cs-colrow{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:5px;cursor:pointer;font-size:12px;}
.ide .cs-colrow:hover{background:var(--hover,rgba(255,255,255,.05));}
.ide .cs-colrow input{accent-color:var(--blue);cursor:pointer;}
.ide .cs-colname{color:var(--txt);}
.ide .cs-colfk{margin-left:auto;font-size:10px;color:var(--blue);}
.ide .cs-filter{display:inline-flex;align-items:center;gap:10px;font-size:11px;color:var(--amber);background:rgba(242,180,92,.08);border:1px solid rgba(242,180,92,.25);border-radius:6px;padding:4px 10px;margin-bottom:10px;}
/* verify deep link (agent answer → source rows) */
.ide .cs-filter.vq{color:var(--blue);background:rgba(110,168,254,.08);border-color:rgba(110,168,254,.3);}
.ide .cs-tbl th.hi{color:var(--blue);background:linear-gradient(rgba(110,168,254,.10),rgba(110,168,254,.10)),var(--panel2);}
.ide .cs-tbl td.hi{background:rgba(110,168,254,.07);}
.ide .cs-tbl th .hi-ic{margin-left:4px;color:var(--blue);cursor:help;}
.ide .datatable tr.click{cursor:pointer;}
.ide .datatable tr.click:hover td{background:rgba(110,168,254,.07);}
.ide .vq-link{display:inline-block;margin-top:6px;font-size:11px;color:var(--blue);text-decoration:none;}
.ide .vq-link.top{display:block;margin:0 0 8px;}
.ide .vq-link:hover{text-decoration:underline;}
.ide .cs-filter button{background:none;border:none;color:var(--dim);font:inherit;font-size:10px;cursor:pointer;}
.ide .cs-filter button:hover{color:var(--txt);}
.ide .dp2-sec{margin-bottom:22px;}
.ide .dp2-h{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--blue);margin:0 0 6px;}
.ide .dpnl.dp2{max-height:420px;display:inline-block;min-width:0;max-width:100%;}
.ide .dpnl.dp2 table{min-width:0;}
.ide .dpnl.dp2 thead tr:last-child th{top:0;}
.ide .pnl{border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-top:4px;}
.ide .pnl-row{display:flex;align-items:baseline;gap:10px;padding:5px 13px;font-size:12.5px;}
.ide .pnl-row:nth-child(odd){background:rgba(255,255,255,.015);}
.ide .pnl-l{color:var(--dim);flex:1;}
.ide .pnl-v{font-variant-numeric:tabular-nums;font-weight:600;color:var(--txt);}
.ide .pnl-v.strong{font-weight:800;}
.ide .pnl-v.good{color:var(--green);} .ide .pnl-v.warn{color:var(--amber);} .ide .pnl-v.bad{color:var(--red);} .ide .pnl-v.dim{color:var(--faint);font-weight:500;}
.ide .pnl-pct{color:var(--dim);font-size:11px;font-weight:600;min-width:104px;text-align:right;font-variant-numeric:tabular-nums;}
/* ratio strip — the percentages Jason scans first */
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
.ide .th-btn{background:none;border:1px solid var(--line);border-radius:5px;color:var(--dim);font:inherit;font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 8px;margin-left:4px;cursor:pointer;line-height:18px;}
.ide .th-btn:hover{color:var(--txt);border-color:var(--dim);}
.ide .th-hist{position:relative;}
.ide .th-menu{position:absolute;top:26px;left:0;z-index:60;min-width:240px;max-height:320px;overflow-y:auto;background:var(--panel2);border:1px solid var(--line);border-radius:8px;box-shadow:0 14px 40px rgba(0,0,0,.55);padding:4px;}
.ide .th-empty{color:var(--faint);font-size:11px;font-weight:400;letter-spacing:0;padding:8px 10px;}
.ide .th-item{width:100%;display:flex;align-items:baseline;justify-content:space-between;gap:10px;background:none;border:none;color:var(--dim);font:inherit;font-size:12px;font-weight:400;letter-spacing:0;text-align:left;padding:6px 9px;border-radius:6px;cursor:pointer;line-height:1.3;}
.ide .th-item:hover{background:rgba(255,255,255,.04);color:var(--txt);}
.ide .th-item.on{background:rgba(110,168,254,.12);color:var(--txt);}
.ide .th-ti{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide .th-when{color:var(--faint);font-size:10px;white-space:nowrap;flex-shrink:0;}
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
/* settings */
.ide .set-card{max-width:620px;border:1px solid var(--line);border-radius:9px;padding:14px 16px;margin-top:6px;background:var(--panel);}
.ide .set-h{font-size:13px;font-weight:800;color:var(--txt);margin-bottom:4px;}
.ide .set-row{display:flex;flex-direction:column;gap:4px;margin-top:12px;}
.ide .set-row.toggle{flex-direction:row;align-items:center;gap:8px;cursor:pointer;}
.ide .tabsw{position:relative;width:38px;height:21px;border-radius:11px;border:none;background:var(--line);cursor:pointer;flex-shrink:0;transition:background .15s;}
.ide .tabsw.on{background:var(--green);}
.ide .tabsw span{position:absolute;top:2px;left:2px;width:17px;height:17px;border-radius:50%;background:#fff;transition:transform .15s;}
.ide .tabsw.on span{transform:translateX(17px);}
.ide .set-l{font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--faint);}
.ide .set-in{background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:12px;padding:6px 9px;outline:none;}
.ide .set-in:focus{border-color:var(--blue);}
.ide .set-actions{display:flex;align-items:center;gap:10px;margin-top:14px;}
.ide .set-btn{background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:11.5px;padding:5px 14px;cursor:pointer;white-space:nowrap;}
.ide .set-btn:hover:not(:disabled){border-color:var(--dim);}
.ide .set-btn.primary{background:var(--blue);border-color:var(--blue);color:#0b1220;font-weight:700;}
.ide .set-btn:disabled{opacity:.5;cursor:default;}
.ide .set-msg{font-size:11.5px;} .ide .set-msg.good{color:var(--green);} .ide .set-msg.bad{color:var(--red);}
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
