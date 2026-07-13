'use client'

// Agency Mission Control — the fullscreen IDE for running the AGENCY (not a
// single client). Same shape as the per-client mission terminal, but scoped to
// the fleet, the sales pipeline (agency_leads), and service agreements. The
// terminal agent can DRAFT an agreement and open the builder for review — it
// never sends; sending stays the human's explicit click.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
const tid = () => Math.random().toString(36).slice(2)

const TREE = [
  { section: 'DATA', items: [{ id: 'schema', icon: '🗄', label: 'Schema' }] },
  { section: 'FLEET', items: [{ id: 'fleet', icon: '🛰', label: 'Fleet' }] },
  { section: 'SALES', items: [
    { id: 'leads', icon: '🧲', label: 'Leads / Pipeline' },
    { id: 'agreements', icon: '📄', label: 'Agreements' },
  ] },
]
const VIEW_TITLES = { schema: 'Schema', fleet: 'Fleet', leads: 'Leads / Pipeline', agreements: 'Agreements' }

const PACKAGES = [
  { id: 'pilot', name: 'Pilot', price: 1000 }, { id: 'starter', name: 'Starter', price: 1550 },
  { id: 'growth', name: 'Growth', price: 2450 }, { id: 'pro', name: 'Pro', price: 3750 },
  { id: 'custom', name: 'Custom', price: null },
]
// meta.agreement keys the builder reads on load (see agreement/[leadId]/page.js).
const DRAFT_KEYS = ['legalName', 'address', 'packageId', 'billing', 'customPrice', 'customName', 'customScope', 'term', 'termCustom', 'setupFee', 'adOn', 'adPct', 'notes', 'revOn', 'revPct', 'revStart']

export default function AgencyMission() {
  const [fleet, setFleet] = useState(null)
  const [leads, setLeads] = useState(null)
  const [err, setErr] = useState(null)
  const [tabs, setTabs] = useState(['schema'])
  const [activeTab, setActiveTab] = useState('schema')
  const [turns, setTurns] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [sideOpen, setSideOpen] = useState(true)
  const [sideW, setSideW] = useState(230)   // explorer width (drag its right edge)
  const [panelH, setPanelH] = useState(300) // terminal height (drag its top edge)
  const [dragging, setDragging] = useState(false) // true mid-drag → overlay so embedded frames don't swallow the drag
  const dragRef = useRef(null)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)

  // Restore saved panel/explorer sizes.
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem('agide_sideW')); if (w >= 160 && w <= 480) setSideW(w)
      const h = Number(localStorage.getItem('agide_panelH')); if (h >= 120 && h <= window.innerHeight - 220) setPanelH(h)
      else setPanelH(Math.round(window.innerHeight * 0.36))
    } catch { /* defaults */ }
  }, [])
  // Drag-to-resize: explorer width (col-resize) + terminal height (row-resize).
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      if (d.type === 'side') {
        const w = Math.min(480, Math.max(160, e.clientX))
        setSideW(w); localStorage.setItem('agide_sideW', String(w))
      } else {
        const h = Math.min(window.innerHeight - 220, Math.max(120, window.innerHeight - e.clientY - 30))
        setPanelH(h); localStorage.setItem('agide_panelH', String(h))
      }
    }
    const up = () => { if (!dragRef.current) return; dragRef.current = null; setDragging(false); document.body.style.cursor = ''; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [])
  const startDrag = (type) => (e) => {
    e.preventDefault()
    dragRef.current = { type }
    setDragging(true)
    document.body.style.cursor = type === 'panel' ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const push = useCallback((t) => setTurns(x => [...x, { id: tid(), ...t }]), [])
  const patch = useCallback((id, u) => setTurns(x => x.map(t => t.id === id ? { ...t, ...u } : t)), [])

  const loadLeads = useCallback(() => {
    fetch('/api/agency-leads', { cache: 'no-store' })
      .then(r => r.json()).then(j => setLeads(j.leads || [])).catch(() => setLeads([]))
  }, [])

  useEffect(() => {
    fetch('/api/mission/fleet', { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'load failed'); return j })
      .then(setFleet).catch(e => setErr(e.message))
    loadLeads()
  }, [loadLeads])

  useEffect(() => {
    if (!fleet || turns.length) return
    push({ kind: 'sys', text: `agency session · ${fleet.clients.length} clients · ${fleet.findings.length} open problems across the fleet. Ask me to draft an agreement ("draft a Growth agreement for Acme Co, monthly") and I'll open the builder for your review — I never send, that stays your click.` })
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet])

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [turns])

  const openTab = useCallback((id) => {
    setTabs(t => t.includes(id) ? t : [...t, id]); setActiveTab(id)
  }, [])
  // Open the Agreement Builder as a closeable in-IDE tab (embedded above the
  // terminal) instead of navigating away — keeps you on /control/mission.
  const openAgreementTab = useCallback((leadId) => { if (leadId) openTab(`agreement:${leadId}`) }, [openTab])
  const closeTab = (id) => setTabs(t => {
    const next = t.filter(x => x !== id)
    if (activeTab === id) setActiveTab(next[next.length - 1] || 'fleet')
    return next.length ? next : ['fleet']
  })

  // Agreements = leads that have a drafted/sent agreement.
  const agreements = useMemo(() => (leads || []).filter(l => l.meta?.agreement || /Agreement/i.test(l.sale_status || '')), [leads])
  const openAgreements = useMemo(() => agreements.filter(l => !/Sent|Viewed|Paid|Signed/i.test(l.sale_status || '')).length, [agreements])

  // Find a pipeline lead by id or (fallback) email/company match.
  const findLead = useCallback((inp) => {
    const list = leads || []
    if (inp.lead_id) return list.find(l => l.id === inp.lead_id) || null
    const email = (inp.email || '').toLowerCase().trim()
    if (email) { const m = list.find(l => (l.email || '').toLowerCase().trim() === email); if (m) return m }
    const company = (inp.company || '').toLowerCase().trim()
    if (company) return list.find(l => (l.company || '').toLowerCase().trim() === company) || null
    return null
  }, [leads])

  // Execute an agreement draft: find/create the lead, save the draft into
  // meta.agreement, then navigate to the builder for review + send.
  const doDraftAgreement = useCallback(async (inp) => {
    const [first, ...rest] = (inp.contact || inp.company || '').trim().split(/\s+/)
    let lead = findLead(inp)
    // Create a new lead if this prospect isn't in the pipeline yet.
    if (!lead) {
      const res = await fetch('/api/agency-leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: inp.company || null, first_name: first || null, last_name: rest.join(' ') || null,
          email: inp.email || null, phone: inp.phone || null, notify: false,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'could not create the lead')
      lead = j.lead
    }
    // Build the meta.agreement draft from the tool's fields (only known keys).
    const draft = {}
    for (const k of DRAFT_KEYS) if (inp[k] != null) draft[k] = inp[k]
    if (!draft.packageId) draft.packageId = 'growth'
    if (!draft.billing) draft.billing = 'monthly'
    const patchRes = await fetch(`/api/agency-leads/${lead.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: inp.company ?? lead.company, email: inp.email ?? lead.email, phone: inp.phone ?? lead.phone,
        ...(first ? { first_name: first, last_name: rest.join(' ') || null } : {}),
        sale_status: 'Agreement Drafted',
        meta: { ...(lead.meta || {}), agreement: { ...(lead.meta?.agreement || {}), ...draft } },
      }),
    })
    if (!patchRes.ok) { const j = await patchRes.json().catch(() => ({})); throw new Error(j.error || 'could not save the draft') }
    loadLeads()
    return lead.id
  }, [findLead, loadLeads])

  const runAction = useCallback(async (a) => {
    if (a.name === 'open_view' && VIEW_TITLES[a.input?.view]) { openTab(a.input.view); return `opened the ${VIEW_TITLES[a.input.view]} view` }
    if (a.name === 'open_agreement' && a.input?.lead_id) {
      const l = (leads || []).find(x => x.id === a.input.lead_id)
      if (!l) return `couldn't find that prospect in the pipeline`
      openAgreementTab(a.input.lead_id); return `opening the agreement builder for ${l.company || l.email || 'that prospect'}`
    }
    if (a.name === 'draft_agreement') {
      const leadId = await doDraftAgreement(a.input || {})
      const pkg = PACKAGES.find(p => p.id === (a.input?.packageId || 'growth'))
      openAgreementTab(leadId)
      return `drafted a ${pkg?.name || 'Growth'} agreement for ${a.input?.company || a.input?.contact || 'the prospect'} — opened it in a tab above. Review and hit Send when ready (nothing sends until you do).`
    }
    return null
  }, [openTab, leads, openAgreementTab, doDraftAgreement])

  const ask = useCallback(async (q) => {
    const question = (q ?? input).trim()
    if (!question || busy) return
    setInput('')
    push({ kind: 'user', text: question })
    const agentId = tid()
    push({ id: agentId, kind: 'agent', text: '', pending: true })
    setBusy(true)
    try {
      const context = {
        clients: (fleet?.clients || []).map(c => ({ id: c.client_id, name: c.client_name, open_problems: c.open_problems, rev_30d: c.metrics?.revenue })),
        open_problems: fleet?.findings?.length || 0,
        pipeline: (leads || []).slice(0, 40).map(l => ({ lead_id: l.id, company: l.company, name: [l.first_name, l.last_name].filter(Boolean).join(' '), email: l.email, status: l.sale_status || l.lead_status, has_agreement: !!l.meta?.agreement })),
      }
      const hist = turns.filter(t => t.kind === 'user' || (t.kind === 'agent' && !t.pending)).slice(-8)
      const history = []
      for (let i = 0; i < hist.length - 1; i++) if (hist[i].kind === 'user' && hist[i + 1]?.kind === 'agent') history.push({ q: hist[i].text, a: hist[i + 1].text })
      const res = await fetch('/api/agency/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, history }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'agent error')
      patch(agentId, { pending: false, text: json.answer || 'Done.' })
      for (const a of (json.actions || [])) {
        try { const note = await runAction(a); if (note) push({ kind: 'sys', text: `agent action · ${note}` }) }
        catch (e) { push({ kind: 'sys', text: `agent action failed · ${e.message}` }) }
      }
    } catch (e) {
      patch(agentId, { pending: false, text: '', error: e.message })
    } finally { setBusy(false); inputRef.current?.focus() }
  }, [input, busy, push, patch, fleet, leads, turns, runAction])

  const tabTitle = (id) => {
    if (id.startsWith('agreement:')) {
      const l = (leads || []).find(x => x.id === id.slice('agreement:'.length))
      return `📄 ${l?.company || l?.email || 'Agreement'}`
    }
    return VIEW_TITLES[id] || id
  }

  return (
    <div className="aide">
      <style>{CSS}</style>
      {dragging && <div className="drag-overlay" />}
      <div className="aide-body">
        {/* Explorer */}
        {sideOpen && <aside className="ex" style={{ width: sideW }}>
          <div className="ex-top"><span className="ex-brand">ConversionHero</span><span className="ex-badge">AGENCY</span></div>
          {TREE.map(g => (
            <div key={g.section} className="ex-sec">
              <div className="ex-h">{g.section}</div>
              {g.items.map(it => (
                <button key={it.id} className={`ex-item ${activeTab === it.id ? 'on' : ''}`} onClick={() => openTab(it.id)}>
                  <span className="ex-ic">{it.icon}</span>{it.label}
                  {it.id === 'agreements' && openAgreements > 0 && <span className="ex-count">{openAgreements}</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="ex-sec">
            <div className="ex-h">SHORTCUTS</div>
            <button className="ex-item" onClick={() => ask('draft a new agreement')}><span className="ex-ic">✍️</span>New agreement</button>
          </div>
          <div className="ex-sec">
            <div className="ex-h">AGENCY</div>
            <a className="ex-item" href="/control"><span className="ex-ic">📊</span>Control Center<span className="ex-out">↗</span></a>
          </div>
        </aside>}
        {sideOpen && <div className="resize-h" onMouseDown={startDrag('side')} title="drag to resize" />}

        {/* Main */}
        <div className="main">
          <div className="tabbar">
            <button className="burger" onClick={() => setSideOpen(o => !o)} title="Toggle explorer">☰</button>
            {tabs.map(id => (
              <div key={id} className={`tab ${activeTab === id ? 'on' : ''}`} onClick={() => setActiveTab(id)}>
                {tabTitle(id)}
                {(tabs.length > 1 || id.startsWith('agreement:')) && <span className="tab-x" onClick={(e) => { e.stopPropagation(); closeTab(id) }}>×</span>}
              </div>
            ))}
            <div className="tab-spacer" />
          </div>
          <div className="view">
            {err && <p className="a-err">{err}</p>}
            {activeTab === 'schema' && <SchemaView />}
            {activeTab === 'fleet' && <FleetView fleet={fleet} />}
            {activeTab === 'leads' && <LeadsView leads={leads} onOpen={openAgreementTab} />}
            {activeTab === 'agreements' && <AgreementsView rows={agreements} onOpen={openAgreementTab} onNew={() => ask('draft a new agreement')} />}
            {/* Agreement builders stay mounted (form state survives tab switches);
                only the active one is shown. */}
            {tabs.filter(id => id.startsWith('agreement:')).map(id => (
              <iframe key={id} className="ag-frame" title="Agreement Builder"
                style={{ display: activeTab === id ? 'block' : 'none' }}
                src={`/control/agreement/${id.slice('agreement:'.length)}`} />
            ))}
          </div>

          {/* Terminal panel */}
          {panelOpen && (
            <div className="panel" style={{ height: panelH }}>
              <div className="resize-v" onMouseDown={startDrag('panel')} title="drag to resize" />
              <div className="panel-tabs">
                <span className="on">TERMINAL</span>
                <span className="panel-x" onClick={() => setPanelOpen(false)} title="hide">▾</span>
              </div>
              <div className="stream" ref={scrollRef}>
                {turns.map(t => (
                  <div key={t.id} className={`t-turn ${t.kind}`}>
                    {t.kind === 'user' && <span className="t-p">❯</span>}
                    {t.kind === 'agent'
                      ? (t.pending ? <span className="t-dim">thinking…</span> : t.error ? <span className="t-err">error: {t.error}</span> : <span className="t-agent">{t.text}</span>)
                      : <span className={t.kind === 'sys' ? 't-sys' : 't-user'}>{t.text}</span>}
                  </div>
                ))}
              </div>
              <div className="prompt-wrap">
                <div className="prompt">
                  <span className="ps">❯</span>
                  <input ref={inputRef} value={input} disabled={busy}
                    placeholder={busy ? 'thinking…' : ''}
                    onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask() }}
                    autoComplete="off" spellCheck="false" />
                </div>
                <div className="prompt-hint">
                  <span className="ph-mode warn">▶▶ agency ops</span>
                  <span className="dim"> (drafts only — sending stays your click)</span>
                  <span className="dim"> · agent </span><span className="ph-agent">conversionhero</span>
                  <span className="dim"> · ⌘K commands · ? manual</span>
                </div>
              </div>
            </div>
          )}

          {/* Status bar */}
          <div className="statusbar">
            <div className="seg"><span className="pulse" /><b>agency</b></div>
            {fleet && <>
              <div className="seg"><span className="dim">clients</span><b>{fleet.clients.length}</b></div>
              <div className="seg"><span className="dim">problems</span><b className={fleet.findings.length ? 'warn' : 'good'}>{fleet.findings.length}</b></div>
              <div className="seg"><span className="dim">open agreements</span><b className={openAgreements ? 'warn' : 'good'}>{openAgreements}</b></div>
            </>}
            <div className="tab-spacer" />
            {!panelOpen && <div className="seg"><button className="st-btn" onClick={() => setPanelOpen(true)}>terminal ▴</button></div>}
            <div className="seg last">
              <span className="kbd">⌘K</span><span className="kbd">ctrl+`</span>
              <button className="helpbtn" onClick={() => ask('what can this agency terminal do?')}>?</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FleetView({ fleet }) {
  if (!fleet) return <p className="a-dim v-pad">reading the fleet…</p>
  return (
    <div className="v-pad">
      <h4 className="v-h">Fleet</h4>
      <p className="v-note">Every ecom client — open problems and 30-day economics. Click any client to open their full IDE.</p>
      <div className="f-grid">
        {fleet.clients.map(c => {
          const net = c.metrics ? c.metrics.revenue - c.metrics.cogs - c.metrics.spend : null
          return (
            <a key={c.client_id} href={`/control/${c.client_id}/mission`} className="f-card">
              <div className="f-card-h"><b>{c.client_name || c.client_id}</b>
                {c.open_problems > 0 ? <span className={`f-pill ${c.high_problems ? 'hot' : 'warm'}`}>⚠ {c.open_problems}</span> : <span className="f-pill ok">clear</span>}</div>
              {c.metrics ? (
                <div className="f-nums">
                  <div><span>rev 30d</span><b>{money(c.metrics.revenue)}</b></div>
                  <div><span>spend</span><b>{money(c.metrics.spend)}</b></div>
                  <div><span>net</span><b className={net >= 0 ? 'good' : 'bad'}>{money(net)}</b></div>
                </div>
              ) : <div className="f-nomet">no metrics yet</div>}
            </a>
          )
        })}
      </div>
    </div>
  )
}

function statusPill(s) {
  const v = (s || '').toLowerCase()
  if (/sent|viewed/.test(v)) return 'sent'
  if (/paid|signed|won/.test(v)) return 'won'
  if (/draft/.test(v)) return 'draft'
  return 'new'
}

function LeadsView({ leads, onOpen }) {
  if (!leads) return <p className="a-dim v-pad">loading the pipeline…</p>
  if (!leads.length) return <p className="a-dim v-pad">No leads in the pipeline yet.</p>
  return (
    <div className="v-pad">
      <h4 className="v-h">Leads / Pipeline</h4>
      <p className="v-note">Prospects from the agency funnels. Open one to build or continue their agreement.</p>
      <div className="tbl">
        <div className="tr th"><span>Company</span><span>Contact</span><span>Email</span><span>Status</span><span></span></div>
        {leads.map(l => (
          <div key={l.id} className="tr" onClick={() => onOpen(l.id)}>
            <span className="strong">{l.company || '—'}</span>
            <span>{[l.first_name, l.last_name].filter(Boolean).join(' ') || '—'}</span>
            <span className="dim">{l.email || '—'}</span>
            <span><span className={`pill ${statusPill(l.sale_status || l.lead_status)}`}>{l.sale_status || l.lead_status || 'New'}</span></span>
            <span className="go">open →</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgreementsView({ rows, onOpen, onNew }) {
  return (
    <div className="v-pad">
      <div className="v-h-row"><h4 className="v-h">Agreements</h4><button className="a-btn primary" onClick={onNew}>+ New agreement</button></div>
      <p className="v-note">Drafted and sent service agreements. Open one to review or send. Nothing sends without your explicit click in the builder.</p>
      {!rows.length ? <p className="a-dim">No agreements yet — ask the terminal to “draft a Growth agreement for Acme Co”.</p> : (
        <div className="tbl two">
          <div className="tr th"><span>Company</span><span>Package</span><span>Status</span><span></span></div>
          {rows.map(l => {
            const ag = l.meta?.agreement || {}
            const pkg = PACKAGES.find(p => p.id === ag.packageId)
            return (
              <div key={l.id} className="tr" onClick={() => onOpen(l.id)}>
                <span className="strong">{l.company || l.email || '—'}</span>
                <span>{pkg?.name || (ag.customName ? `Custom · ${ag.customName}` : '—')}</span>
                <span><span className={`pill ${statusPill(l.sale_status)}`}>{l.sale_status || 'Drafted'}</span></span>
                <span className="go">open →</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SchemaView — the app's data architecture as a relational graph, lit with live
   row counts and click-to-browse real rows. Ported from the standalone Mission B
   ERD canvas (geometry, clustered auto-layout, zoom/pan, draggable nodes, glowing
   SVG edges, focus + detail panel, localStorage positions). Shell (explorer /
   terminal / status / quick-open) dropped — the agency page already has those.
   READ-ONLY: fetches the parsed schema + live counts/rows, never writes.
   ═══════════════════════════════════════════════════════════════════════════ */
const SV_CLUSTER = {
  client:  { label: 'Tenant data',    color: '#6ea8fe' },
  agency:  { label: 'Agency root',    color: '#3fd68f' },
  funnel:  { label: 'Funnels',        color: '#e8b45a' },
  mission: { label: 'Agent brain',    color: '#a78bfa' },
  billing: { label: 'Auth & billing', color: '#5ad1e8' },
  system:  { label: 'System',         color: '#8a93a8' },
}
const SV_CLUSTER_ORDER = ['agency', 'billing', 'funnel', 'client', 'mission', 'system']
const svColor = (d) => (SV_CLUSTER[d] || SV_CLUSTER.system).color

const SV_CARD_W = 222
const SV_HEAD_H = 30
const SV_ROW_H = 19
const SV_LIST_TOP = 6
const SV_FOOT_H = 17
const SV_COUNT_H = 18
const SV_SLOT_H = 172
const svCardH = (keyN, hasMore) => SV_HEAD_H + SV_LIST_TOP + keyN * SV_ROW_H + (hasMore ? SV_FOOT_H : 0) + SV_COUNT_H + 8
const svRowCY = (i) => SV_HEAD_H + SV_LIST_TOP + i * SV_ROW_H + SV_ROW_H / 2
const svSpine = (n) => n === 'client_id' || n === 'agency_id'
const svNum = (n) => (n == null ? null : Number(n).toLocaleString())

function svAutoLayout(tables) {
  const byDom = {}
  for (const t of tables) (byDom[t.domain] ||= []).push(t)
  const pos = {}
  const GAPX = 40, CGAP = 92, MAXW = 2400
  let cx = 0, cy = 0, rowMaxH = 0
  for (const dom of SV_CLUSTER_ORDER) {
    const list = byDom[dom]
    if (!list) continue
    const cols = Math.min(dom === 'client' ? 5 : 3, Math.max(1, Math.ceil(Math.sqrt(list.length))))
    const rows = Math.ceil(list.length / cols)
    const blockW = cols * (SV_CARD_W + GAPX)
    const blockH = rows * SV_SLOT_H
    if (cx > 0 && cx + blockW > MAXW) { cx = 0; cy += rowMaxH + CGAP; rowMaxH = 0 }
    list.forEach((t, i) => {
      const c = i % cols, r = Math.floor(i / cols)
      pos[t.name] = { x: cx + c * (SV_CARD_W + GAPX), y: cy + r * SV_SLOT_H }
    })
    cx += blockW + CGAP
    rowMaxH = Math.max(rowMaxH, blockH)
  }
  return pos
}

function svFitView(pos, tables, heights, vw, vh) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  for (const t of tables) {
    const p = pos[t.name]; if (!p) continue
    minx = Math.min(minx, p.x); miny = Math.min(miny, p.y)
    maxx = Math.max(maxx, p.x + SV_CARD_W); maxy = Math.max(maxy, p.y + (heights[t.name] || 120))
  }
  if (!isFinite(minx)) return { x: 0, y: 0, k: 0.7 }
  const w = maxx - minx, h = maxy - miny
  const k = Math.max(0.14, Math.min(vw / (w + 140), vh / (h + 140), 1))
  return { x: (vw - w * k) / 2 - minx * k, y: (vh - h * k) / 2 - miny * k, k }
}

function SchemaView() {
  const [model, setModel] = useState(null)      // { tables, edges, counts }
  const [err, setErr] = useState(null)
  const [counts, setCounts] = useState(null)     // { table: rowCount|null }
  const [pos, setPos] = useState({})             // name -> {x,y}
  const [view, setView] = useState({ x: 0, y: 0, k: 0.72 })
  const [focus, setFocus] = useState(null)
  const [hoverEdge, setHoverEdge] = useState(null)
  const [rowState, setRowState] = useState({})   // table -> { rows, columns, total, loading, error, offset }

  const vpRef = useRef(null)
  const drag = useRef(null)
  const didFit = useRef(false)

  /* ── load the parsed schema + live row counts ── */
  useEffect(() => {
    let alive = true
    fetch('/api/agency/schema', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!alive) return; if (d.error) setErr(d.error); else setModel(d) })
      .catch(e => alive && setErr(String(e)))
    fetch('/api/agency/table-data?counts=1', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (alive && d.counts) setCounts(d.counts) })
      .catch(() => {})
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
      heights[t.name] = svCardH(kc.length, t.columns.length > kc.length)
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
        const raw = localStorage.getItem(`agsv_pos_${t.name}`)
        if (raw) { const p = JSON.parse(raw); if (p && typeof p.x === 'number') saved[t.name] = p }
      } catch { /* ignore */ }
    }
    setPos({ ...svAutoLayout(model.tables), ...saved })
  }, [model, meta])

  useEffect(() => {
    if (didFit.current || !model || !meta || !Object.keys(pos).length || !vpRef.current) return
    const r = vpRef.current.getBoundingClientRect()
    setView(svFitView(pos, model.tables, meta.heights, r.width, r.height))
    didFit.current = true
  }, [pos, model, meta])

  const related = useMemo(() => {
    if (!model) return null
    const t = focus
    if (!t && hoverEdge == null) return null
    const nodes = new Set(), edges = new Set()
    if (t) {
      nodes.add(t)
      model.edges.forEach((e, i) => { if (e.from === t || e.to === t) { edges.add(i); nodes.add(e.from); nodes.add(e.to) } })
    }
    if (hoverEdge != null && model.edges[hoverEdge]) {
      const e = model.edges[hoverEdge]
      edges.add(hoverEdge); nodes.add(e.from); nodes.add(e.to)
    }
    return { nodes, edges }
  }, [focus, hoverEdge, model])

  const posRef = useRef(pos)
  useEffect(() => { posRef.current = pos }, [pos])

  const focusTable = useCallback((name, center) => {
    setFocus(name)
    if (center && meta && vpRef.current) {
      const p = posRef.current[name]
      if (p) {
        const r = vpRef.current.getBoundingClientRect()
        const cxw = p.x + SV_CARD_W / 2, cyw = p.y + (meta.heights[name] || 120) / 2
        setView(v => ({ ...v, x: r.width / 2 - cxw * v.k, y: r.height / 2 - cyw * v.k }))
      }
    }
  }, [meta])

  /* ── fetch a page of live rows for the focused table ── */
  const fetchRows = useCallback((table, offset, append) => {
    setRowState(s => ({ ...s, [table]: { ...(s[table] || {}), loading: true, error: null, offset } }))
    fetch(`/api/agency/table-data?table=${encodeURIComponent(table)}&limit=25&offset=${offset}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setRowState(s => {
        if (d.error) return { ...s, [table]: { ...(s[table] || {}), loading: false, error: d.error } }
        const prev = s[table] || {}
        const rows = append ? [...(prev.rows || []), ...(d.rows || [])] : (d.rows || [])
        return { ...s, [table]: { loading: false, error: null, offset, columns: d.columns || [], rows, total: d.total ?? rows.length } }
      }))
      .catch(e => setRowState(s => ({ ...s, [table]: { ...(s[table] || {}), loading: false, error: String(e) } })))
  }, [])

  // When focus lands on a table we haven't loaded, pull its first page.
  useEffect(() => {
    if (!focus) return
    if (!rowState[focus] || (!rowState[focus].rows && !rowState[focus].loading)) fetchRows(focus, 0, false)
  }, [focus, rowState, fetchRows])

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
      }
    }
    const up = () => {
      const d = drag.current
      if (d?.type === 'node') {
        if (d.moved) { try { localStorage.setItem(`agsv_pos_${d.name}`, JSON.stringify(posRef.current[d.name])) } catch { /* quota */ } }
        else focusTable(d.name)
        document.body.style.cursor = ''
      } else if (d?.type === 'pan') { document.body.style.cursor = '' }
      drag.current = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [view.k, focusTable])

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

  const fitAll = useCallback(() => {
    if (!model || !meta || !vpRef.current) return
    const r = vpRef.current.getBoundingClientRect()
    setView(svFitView(posRef.current, model.tables, meta.heights, r.width, r.height))
  }, [model, meta])

  const resetLayout = useCallback(() => {
    if (!model || !meta) return
    for (const t of model.tables) { try { localStorage.removeItem(`agsv_pos_${t.name}`) } catch { /* ignore */ } }
    const base = svAutoLayout(model.tables)
    setPos(base)
    requestAnimationFrame(() => { const r = vpRef.current?.getBoundingClientRect(); if (r) setView(svFitView(base, model.tables, meta.heights, r.width, r.height)) })
  }, [model, meta])

  const focusT = focus && meta ? meta.byName[focus] : null
  const focusRows = focus ? rowState[focus] : null

  const bounds = useMemo(() => {
    let maxx = 1000, maxy = 800
    if (meta) for (const n in pos) { maxx = Math.max(maxx, pos[n].x + SV_CARD_W); maxy = Math.max(maxy, pos[n].y + (meta.heights[n] || 120)) }
    return { w: maxx + 400, h: maxy + 400 }
  }, [pos, meta])

  return (
    <div className="sv-root">
      <div className="sv-toolbar">
        <span className="sv-title">schema.graph</span>
        <span className="sv-meta">{model ? `${model.counts.tables} tables · ${model.counts.fk} FK · ${model.counts.logical} logical` : 'loading…'}</span>
        <div className="sv-legend-inline">
          <span className="sv-lg"><span className="sv-lg-pk">PK</span> key glows</span>
          <span className="sv-lg"><span className="sv-lg-fk">FK</span> foreign link</span>
          <span className="sv-lg"><b>client_id · agency_id</b> tenant spine</span>
        </div>
        <div className="sv-tools">
          <button onClick={() => setView(v => ({ ...v, k: Math.min(2.4, v.k * 1.2) }))} title="Zoom in">＋</button>
          <button onClick={() => setView(v => ({ ...v, k: Math.max(0.12, v.k * 0.83) }))} title="Zoom out">－</button>
          <button onClick={fitAll} title="Fit">⤢</button>
          <button onClick={resetLayout} title="Reset layout">↺</button>
          <span className="sv-zoom">{Math.round(view.k * 100)}%</span>
        </div>
      </div>

      <div className={`sv-viewport ${focus ? 'has-focus' : ''}`} ref={vpRef} onMouseDown={startPan}>
        {err && <div className="sv-loading">failed to load schema: {err}</div>}
        {!model && !err && <div className="sv-loading">parsing db/schema.md…</div>}

        {model && meta && (
          <div className="sv-world" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.k})` }}>
            <svg className="sv-edges" width={bounds.w} height={bounds.h}>
              <defs>
                <filter id="svglow" x="-40%" y="-40%" width="180%" height="180%">
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
                const sCenter = sp.x + SV_CARD_W / 2, tCenter = tp.x + SV_CARD_W / 2
                const exitRight = self ? true : tCenter >= sCenter
                const sx = sp.x + (exitRight ? SV_CARD_W : 0), sy = sp.y + svRowCY(si)
                const entryRight = self ? true : sCenter > tCenter
                const tx = tp.x + (entryRight ? SV_CARD_W : 0), ty = tp.y + svRowCY(ti)
                const off = self ? 46 : Math.max(42, Math.min(200, Math.abs(tx - sx) * 0.5))
                const c1 = sx + (exitRight ? off : -off), c2 = tx + (entryRight ? off : -off)
                const d = `M${sx},${sy} C${c1},${sy} ${c2},${ty} ${tx},${ty}`
                const active = related?.edges.has(i)
                const dim = related && !active
                const col = svColor(meta.byName[e.from]?.domain)
                return (
                  <path key={i} d={d} className={`sv-edge ${e.kind} ${active ? 'active' : ''} ${dim ? 'dim' : ''}`}
                    style={{ stroke: col, filter: active ? 'url(#svglow)' : undefined }}
                    onMouseEnter={() => setHoverEdge(i)} onMouseLeave={() => setHoverEdge(h => h === i ? null : h)} />
                )
              })}
            </svg>

            {model.tables.map(t => {
              const p = pos[t.name]; if (!p) return null
              const kc = meta.keyCols[t.name]
              const more = t.columns.length - kc.length
              const col = svColor(t.domain)
              const isFocus = focus === t.name
              const isRel = related?.nodes.has(t.name)
              const dim = related && !isRel
              const rc = counts ? counts[t.name] : undefined
              return (
                <div key={t.name} className={`sv-node ${isFocus ? 'focus' : ''} ${isRel && !isFocus ? 'rel' : ''} ${dim ? 'dim' : ''}`}
                  style={{ left: p.x, top: p.y, width: SV_CARD_W, '--c': col, borderColor: isFocus ? col : undefined }}
                  onMouseDown={startNodeDrag(t.name)}>
                  <div className="sv-n-head" style={{ background: `linear-gradient(90deg, ${col}22, transparent)` }}>
                    <span className="sv-n-dot" style={{ background: col }} />
                    <span className="sv-n-name">{t.name}</span>
                  </div>
                  <div className="sv-n-keys">
                    {kc.map(c => {
                      const pk = c.key.includes('PK'), fk = c.key.includes('FK')
                      const glow = (isFocus || isRel) && pk
                      return (
                        <div key={c.name} className={`sv-n-key ${pk ? 'pk' : ''} ${fk ? 'fk' : ''} ${svSpine(c.name) ? 'spine' : ''} ${glow ? 'glow' : ''}`}
                          style={glow ? { '--c': col } : undefined}>
                          <span className="sv-n-kn">{c.name}</span>
                          <span className="sv-n-tag">{c.key.replace('+', '·')}</span>
                        </div>
                      )
                    })}
                  </div>
                  {more > 0 && <div className="sv-n-more">+{more} column{more > 1 ? 's' : ''}</div>}
                  <div className={`sv-n-count ${rc ? '' : 'zero'}`}>
                    {rc === undefined ? '…' : rc === null ? '— rows' : `${svNum(rc)} row${rc === 1 ? '' : 's'}`}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* focus detail panel */}
        {focusT && meta && (
          <div className="sv-detail">
            <div className="sv-dt-head">
              <span className="sv-dt-dot" style={{ background: svColor(focusT.domain) }} />
              <span className="sv-dt-name">{focusT.name}</span>
              <span className="sv-dt-dom" style={{ color: svColor(focusT.domain) }}>{SV_CLUSTER[focusT.domain].label}</span>
              <button className="sv-dt-x" onClick={() => setFocus(null)}>✕</button>
            </div>

            <div className="sv-dt-sub">
              {counts && counts[focusT.name] != null
                ? <span><b>{svNum(counts[focusT.name])}</b> rows · {focusT.columns.length} columns</span>
                : <span>{focusT.columns.length} columns</span>}
            </div>

            <div className="sv-dt-sec">COLUMNS <span className="sv-dt-cnt">{focusT.columns.length}</span></div>
            <div className="sv-dt-cols">
              {focusT.columns.map(c => (
                <div key={c.name} className={`sv-dt-c ${c.key ? 'keyed' : ''}`}>
                  <span className="sv-dt-cn">{c.name}</span>
                  <span className="sv-dt-ct">{c.type}</span>
                  {c.key && <span className={`sv-dt-ck ${c.key.includes('PK') ? 'pk' : 'fk'}`}>{c.key.replace('+', '·')}</span>}
                  {c.ref && <span className="sv-dt-ref">→ {c.ref.table}</span>}
                </div>
              ))}
            </div>

            <div className="sv-dt-sec">LIVE ROWS
              {focusRows?.total != null && <span className="sv-dt-cnt">{svNum(focusRows.total)}</span>}
            </div>
            <div className="sv-rows">
              {(!focusRows || (focusRows.loading && !focusRows.rows)) && <div className="sv-rows-msg">loading rows…</div>}
              {focusRows?.error && <div className="sv-rows-msg err">error: {focusRows.error}</div>}
              {focusRows?.rows && focusRows.rows.length === 0 && !focusRows.loading && <div className="sv-rows-msg">no rows</div>}
              {focusRows?.rows && focusRows.rows.length > 0 && (
                <div className="sv-grid-scroll">
                  <table className="sv-grid">
                    <thead>
                      <tr>{(focusRows.columns || Object.keys(focusRows.rows[0])).map(c => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {focusRows.rows.map((r, ri) => (
                        <tr key={ri}>
                          {(focusRows.columns || Object.keys(r)).map(c => {
                            const v = r[c]
                            const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
                            return <td key={c} title={s}>{s.length > 80 ? s.slice(0, 80) + '…' : (s || <span className="sv-null">null</span>)}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {focusRows?.rows && focusRows.rows.length > 0 && focusRows.rows.length < (focusRows.total || 0) && (
                <button className="sv-more-btn" disabled={focusRows.loading}
                  onClick={() => fetchRows(focus, (focusRows.offset || 0) + 25, true)}>
                  {focusRows.loading ? 'loading…' : `load more (${svNum(focusRows.rows.length)} / ${svNum(focusRows.total)})`}
                </button>
              )}
            </div>
          </div>
        )}

        {model && <div className="sv-hint">scroll = zoom · drag bg = pan · drag card = move · click = browse rows</div>}
      </div>
    </div>
  )
}

const CSS = `
.aide{--bg:#0b0e14;--panel:#12161f;--panel2:#161b28;--line:rgba(255,255,255,.08);--txt:#dbe1ee;--dim:#8a93a8;--faint:#5a6377;--blue:#6ea8fe;--green:#3fd68f;--amber:#f2b45c;--red:#ff6b6b;
  position:fixed;inset:var(--mt-top,36px) 0 0 0;background:var(--bg);color:var(--txt);font-family:"SF Mono",ui-monospace,Menlo,Consolas,monospace;font-size:13px;display:flex;flex-direction:column;overflow:hidden;}
.aide-body{flex:1;display:flex;min-height:0;}
.aide .ex{width:230px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;padding-bottom:20px;}
.aide .resize-h{width:5px;margin:0 -2px;flex-shrink:0;cursor:col-resize;z-index:5;position:relative;}
.aide .resize-h:hover,.aide .resize-h:active{background:rgba(110,168,254,.45);}
.aide .resize-v{height:5px;margin-bottom:-2px;cursor:row-resize;z-index:5;position:relative;flex-shrink:0;}
.aide .resize-v:hover,.aide .resize-v:active{background:rgba(110,168,254,.45);}
/* Covers embedded frames during a drag so they don't swallow mouse events. */
.aide .drag-overlay{position:fixed;inset:0;z-index:9999;}
.aide .ex-top{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);}
.aide .ex-brand{font-weight:800;font-size:12.5px;}
.aide .ex-badge{font-size:8.5px;font-weight:800;letter-spacing:.06em;background:rgba(110,168,254,.15);color:var(--blue);padding:2px 6px;border-radius:4px;}
.aide .ex-sec{margin-top:12px;}
.aide .ex-h{font-size:9.5px;font-weight:800;letter-spacing:.08em;color:var(--faint);padding:2px 14px;margin-bottom:2px;}
.aide .ex-item{width:100%;display:flex;align-items:center;gap:9px;padding:5px 14px;background:none;border:none;color:var(--dim);font:inherit;font-size:12.5px;cursor:pointer;text-align:left;}
.aide .ex-item:hover{background:rgba(255,255,255,.03);color:var(--txt);}
.aide .ex-item.on{background:rgba(110,168,254,.1);color:var(--txt);}
.aide .ex-ic{width:16px;text-align:center;}
.aide .ex-item{text-decoration:none;}
.aide .ex-out{margin-left:auto;color:var(--faint);font-size:11px;}
.aide .ex-count{margin-left:auto;background:rgba(242,180,92,.18);color:var(--amber);font-size:10px;font-weight:800;border-radius:99px;padding:0 6px;}
.aide .main{flex:1;display:flex;flex-direction:column;min-width:0;}
.aide .tabbar{display:flex;align-items:stretch;background:var(--panel);border-bottom:1px solid var(--line);height:34px;flex-shrink:0;overflow-x:auto;}
.aide .burger{background:none;border:none;color:var(--faint);font:inherit;padding:0 12px;cursor:pointer;border-right:1px solid var(--line);}
.aide .burger:hover{color:var(--txt);}
.aide .tab{display:flex;align-items:center;gap:7px;padding:0 14px;font-size:12px;color:var(--dim);border-right:1px solid var(--line);cursor:pointer;white-space:nowrap;}
.aide .tab.on{color:var(--txt);background:var(--bg);box-shadow:inset 0 2px 0 var(--blue);}
.aide .tab-x{color:var(--faint);font-size:14px;}.aide .tab-x:hover{color:var(--red);}
.aide .tab-spacer{flex:1;}
.aide .view{flex:1;overflow-y:auto;min-height:0;position:relative;}
.aide .ag-frame{width:100%;height:100%;border:none;background:var(--bg);}
.aide .v-pad{padding:20px 24px;}
.aide .v-h{font-size:15px;font-weight:800;margin:0 0 4px;}
.aide .v-h-row{display:flex;align-items:center;justify-content:space-between;max-width:1000px;}
.aide .v-note{color:var(--dim);font-size:12px;margin:0 0 14px;max-width:760px;}
.aide .a-dim{color:var(--faint);}.aide .a-err{color:var(--red);padding:12px 24px;}
.aide .f-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;max-width:1100px;}
.aide .f-card{display:block;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;text-decoration:none;color:inherit;transition:border-color .15s;}
.aide .f-card:hover{border-color:var(--blue);}
.aide .f-card-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.aide .f-card-h b{font-size:13.5px;}
.aide .f-pill{font-size:10px;font-weight:800;border-radius:99px;padding:2px 8px;}
.aide .f-pill.ok{background:rgba(63,214,143,.12);color:var(--green);}.aide .f-pill.warm{background:rgba(242,180,92,.15);color:var(--amber);}.aide .f-pill.hot{background:rgba(255,107,107,.15);color:var(--red);}
.aide .f-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.aide .f-nums div{display:flex;flex-direction:column;}.aide .f-nums span{font-size:9.5px;color:var(--faint);text-transform:uppercase;letter-spacing:.04em;}
.aide .f-nums b{font-size:13px;font-variant-numeric:tabular-nums;}
.aide .f-nomet{color:var(--faint);font-size:11px;}
.aide .good{color:var(--green);}.aide .bad{color:var(--red);}.aide .warn{color:var(--amber);}.aide .strong{color:var(--txt);font-weight:600;}.aide .dim{color:var(--dim);}
.aide .tbl{border:1px solid var(--line);border-radius:9px;overflow:hidden;max-width:1000px;}
.aide .tr{display:grid;grid-template-columns:1.4fr 1.1fr 1.6fr .9fr .6fr;gap:10px;align-items:center;padding:8px 14px;border-top:1px solid var(--line);font-size:12.5px;cursor:pointer;}
.aide .tbl .tr:first-child{border-top:none;}
.aide .tbl.two .tr{grid-template-columns:1.6fr 1.2fr 1fr .6fr;}
.aide .tr.th{background:var(--panel2);color:var(--faint);font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;cursor:default;}
.aide .tr:not(.th):hover{background:rgba(255,255,255,.02);}
.aide .tr .go{color:var(--faint);font-size:11px;text-align:right;opacity:0;}
.aide .tr:not(.th):hover .go{opacity:1;color:var(--blue);}
.aide .pill{font-size:10px;font-weight:700;border-radius:99px;padding:2px 8px;white-space:nowrap;}
.aide .pill.new{background:rgba(255,255,255,.06);color:var(--dim);}
.aide .pill.draft{background:rgba(110,168,254,.14);color:var(--blue);}
.aide .pill.sent{background:rgba(242,180,92,.16);color:var(--amber);}
.aide .pill.won{background:rgba(63,214,143,.14);color:var(--green);}
.aide .a-btn{background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:12px;padding:5px 12px;cursor:pointer;}
.aide .a-btn.primary{background:var(--blue);border-color:var(--blue);color:#0b1220;font-weight:700;}
.aide .a-btn:hover{border-color:var(--dim);}
.aide .panel{min-height:120px;display:flex;flex-direction:column;border-top:1px solid var(--line);background:var(--bg);flex-shrink:0;position:relative;}
.aide .panel-tabs{display:flex;gap:2px;align-items:center;background:var(--panel);border-bottom:1px solid var(--line);padding:0 10px;height:30px;font-size:10.5px;font-weight:800;letter-spacing:.06em;flex-shrink:0;}
.aide .panel-tabs span{padding:0 10px;color:var(--faint);cursor:pointer;line-height:30px;}
.aide .panel-tabs span.on{color:var(--txt);box-shadow:inset 0 -2px 0 var(--blue);}
.aide .panel-x{margin-left:auto;}
.aide .stream{flex:1;overflow-y:auto;padding:12px 16px;line-height:1.55;}
.aide .t-turn{margin-bottom:7px;white-space:pre-wrap;word-break:break-word;}
.aide .t-p{color:var(--green);font-weight:800;margin-right:7px;}
.aide .t-user{color:var(--txt);}
.aide .t-agent{color:var(--dim);}
.aide .t-sys{color:var(--faint);font-size:12px;}
.aide .t-dim{color:var(--faint);}.aide .t-err{color:var(--red);}
.aide .prompt-wrap{margin:2px 12px 4px;flex-shrink:0;}
.aide .prompt{display:flex;gap:9px;align-items:center;border-top:1px solid rgba(255,255,255,.26);border-bottom:1px solid rgba(255,255,255,.26);background:var(--bg);padding:9px 4px;}
.aide .ps{color:var(--green);font-weight:800;}
.aide .prompt input{flex:1;background:transparent;border:none;outline:none;color:var(--txt);font:inherit;font-size:13px;caret-color:var(--txt);}
.aide .prompt-hint{padding:5px 4px 6px;font-size:11.5px;letter-spacing:.01em;user-select:none;color:var(--faint);}
.aide .ph-mode{font-weight:700;}.aide .ph-mode.warn{color:var(--amber);}
.aide .ph-agent{color:var(--blue);font-weight:700;}
.aide .statusbar{display:flex;align-items:center;border-top:1px solid var(--line);background:var(--panel);padding:0 4px;height:30px;font-size:11px;flex-shrink:0;overflow-x:auto;white-space:nowrap;}
.aide .statusbar .seg{padding:0 10px;border-right:1px solid var(--line);display:flex;gap:6px;align-items:center;height:100%;}
.aide .statusbar .seg.last{border-right:none;gap:6px;}
.aide .seg b{font-variant-numeric:tabular-nums;}
.aide .pulse{width:6px;height:6px;border-radius:50%;background:var(--green);animation:aidepu 2s infinite;}
@keyframes aidepu{0%,100%{opacity:1;}50%{opacity:.4;}}
.aide .st-btn{background:none;border:1px solid var(--line);border-radius:5px;color:var(--faint);font:inherit;font-size:10.5px;padding:2px 9px;cursor:pointer;}
.aide .st-btn:hover{color:var(--txt);}
.aide .kbd{font-size:10px;color:var(--faint);border:1px solid var(--line);border-radius:4px;padding:1px 5px;background:var(--panel2);}
.aide .helpbtn{width:20px;height:20px;border-radius:5px;border:1px solid var(--line);background:var(--panel2);color:var(--dim);font:inherit;font-size:11px;font-weight:800;cursor:pointer;}
.aide .helpbtn:hover{color:var(--txt);}

/* ── Schema view (ERD canvas + live data) — prefixed .sv-* so it never
      collides with the agency IDE's own classes ── */
.aide{--purple:#a78bfa;}
.aide .sv-root{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--bg);overflow:hidden;}
.aide .sv-toolbar{display:flex;align-items:center;gap:14px;height:32px;flex-shrink:0;padding:0 12px;background:var(--panel);border-bottom:1px solid var(--line);font-size:11px;overflow-x:auto;white-space:nowrap;}
.aide .sv-title{font-weight:800;color:var(--txt);}
.aide .sv-meta{color:var(--faint);}
.aide .sv-legend-inline{display:flex;align-items:center;gap:14px;color:var(--faint);}
.aide .sv-lg{display:flex;align-items:center;gap:5px;}
.aide .sv-lg b{color:var(--blue);}
.aide .sv-lg-pk{font-size:9px;font-weight:800;color:var(--amber);background:rgba(232,180,90,.14);border-radius:4px;padding:1px 5px;box-shadow:0 0 8px rgba(232,180,90,.4);}
.aide .sv-lg-fk{font-size:9px;font-weight:800;color:var(--blue);background:rgba(110,168,254,.14);border-radius:4px;padding:1px 5px;}
.aide .sv-tools{margin-left:auto;display:flex;align-items:center;gap:4px;}
.aide .sv-tools button{width:24px;height:22px;border:1px solid var(--line);background:var(--panel2);color:var(--dim);border-radius:5px;font:inherit;font-size:12px;cursor:pointer;}
.aide .sv-tools button:hover{color:var(--txt);border-color:var(--dim);}
.aide .sv-zoom{color:var(--faint);font-variant-numeric:tabular-nums;min-width:38px;text-align:right;}

.aide .sv-viewport{flex:1;position:relative;overflow:hidden;background:
  radial-gradient(circle at 1px 1px, rgba(255,255,255,.045) 1px, transparent 0) 0 0/26px 26px, var(--bg);cursor:grab;min-height:0;}
.aide .sv-viewport:active{cursor:grabbing;}
.aide .sv-loading{color:var(--faint);font-size:12.5px;padding:24px;}
.aide .sv-world{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;}
.aide .sv-edges{position:absolute;top:0;left:0;overflow:visible;pointer-events:none;}
.aide .sv-edge{fill:none;stroke-width:1.4;opacity:.32;transition:opacity .15s;pointer-events:stroke;cursor:pointer;}
.aide .sv-edge.logical{stroke-dasharray:4 4;opacity:.22;}
.aide .sv-edge:hover{opacity:.9;}
.aide .sv-edge.active{opacity:1;stroke-width:2;}
.aide .sv-edge.dim{opacity:.06;}

.aide .sv-node{position:absolute;background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden;cursor:grab;user-select:none;
  box-shadow:0 2px 10px rgba(0,0,0,.35);transition:opacity .15s,box-shadow .15s,border-color .15s;}
.aide .sv-node:active{cursor:grabbing;}
.aide .sv-node:hover{border-color:var(--dim);}
.aide .sv-node.rel{border-color:var(--c);box-shadow:0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent),0 2px 12px rgba(0,0,0,.4);}
.aide .sv-node.focus{box-shadow:0 0 0 1px var(--c),0 0 26px color-mix(in srgb, var(--c) 45%, transparent),0 6px 22px rgba(0,0,0,.5);z-index:6;}
.aide .sv-node.dim{opacity:.28;}
.aide .sv-n-head{display:flex;align-items:center;gap:7px;height:30px;padding:0 10px;border-bottom:1px solid var(--line);}
.aide .sv-n-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;box-shadow:0 0 7px currentColor;}
.aide .sv-n-name{font-weight:700;font-size:12px;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .sv-n-keys{padding:6px 0 0;}
.aide .sv-n-key{display:flex;align-items:center;gap:6px;height:19px;padding:0 10px;font-size:11px;}
.aide .sv-n-kn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dim);}
.aide .sv-n-tag{margin-left:auto;font-size:8.5px;font-weight:800;letter-spacing:.04em;padding:0 4px;border-radius:3px;color:var(--faint);background:var(--panel2);}
.aide .sv-n-key.pk .sv-n-kn{color:var(--amber);font-weight:700;}
.aide .sv-n-key.pk .sv-n-tag{color:var(--amber);background:rgba(232,180,90,.14);box-shadow:0 0 7px rgba(232,180,90,.28);}
.aide .sv-n-key.fk .sv-n-kn{color:var(--blue);}
.aide .sv-n-key.fk .sv-n-tag{color:var(--blue);background:rgba(110,168,254,.14);}
.aide .sv-n-key.spine .sv-n-kn{color:var(--blue);font-weight:700;}
.aide .sv-n-key.spine .sv-n-tag{color:var(--blue);background:rgba(110,168,254,.16);}
.aide .sv-n-key.glow .sv-n-tag{box-shadow:0 0 10px var(--c);}
.aide .sv-n-key.pk.glow .sv-n-kn{text-shadow:0 0 9px rgba(232,180,90,.7);}
.aide .sv-n-more{font-size:10px;color:var(--faint);padding:3px 10px 4px;border-top:1px solid rgba(255,255,255,.04);}
.aide .sv-n-count{font-size:10px;font-weight:700;color:var(--green);padding:3px 10px 6px;border-top:1px solid rgba(255,255,255,.05);font-variant-numeric:tabular-nums;}
.aide .sv-n-count.zero{color:var(--faint);font-weight:400;}

.aide .sv-hint{position:absolute;left:12px;bottom:10px;font-size:10.5px;color:var(--faint);background:rgba(11,14,20,.72);border:1px solid var(--line);border-radius:6px;padding:3px 9px;pointer-events:none;}

.aide .sv-detail{position:absolute;top:10px;right:10px;bottom:10px;width:360px;max-width:calc(100% - 20px);background:var(--panel);border:1px solid var(--line);border-radius:11px;overflow-y:auto;box-shadow:0 18px 50px rgba(0,0,0,.55);z-index:20;padding-bottom:14px;}
.aide .sv-dt-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel);z-index:2;}
.aide .sv-dt-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;box-shadow:0 0 8px currentColor;}
.aide .sv-dt-name{font-weight:800;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .sv-dt-dom{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-left:auto;white-space:nowrap;}
.aide .sv-dt-x{background:none;border:none;color:var(--faint);cursor:pointer;font:inherit;font-size:13px;padding:0 2px;}
.aide .sv-dt-x:hover{color:var(--txt);}
.aide .sv-dt-sub{padding:8px 14px 2px;font-size:11.5px;color:var(--dim);}
.aide .sv-dt-sub b{color:var(--green);font-variant-numeric:tabular-nums;}
.aide .sv-dt-sec{font-size:9px;font-weight:800;letter-spacing:.08em;color:var(--faint);padding:14px 14px 5px;display:flex;align-items:center;gap:6px;}
.aide .sv-dt-cnt{background:var(--panel2);border-radius:99px;padding:0 6px;font-size:9px;}
.aide .sv-dt-cols{padding:0 14px;display:flex;flex-direction:column;gap:1px;}
.aide .sv-dt-c{display:flex;align-items:baseline;gap:8px;font-size:11px;padding:2px 0;border-top:1px solid rgba(255,255,255,.03);}
.aide .sv-dt-c.keyed .sv-dt-cn{color:var(--txt);font-weight:600;}
.aide .sv-dt-cn{color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .sv-dt-ct{color:var(--faint);font-size:10px;margin-left:auto;white-space:nowrap;}
.aide .sv-dt-ck{font-size:8.5px;font-weight:800;border-radius:3px;padding:0 4px;flex-shrink:0;}
.aide .sv-dt-ck.pk{color:var(--amber);background:rgba(232,180,90,.14);}
.aide .sv-dt-ck.fk{color:var(--blue);background:rgba(110,168,254,.14);}
.aide .sv-dt-ref{font-size:9px;color:var(--purple);white-space:nowrap;flex-shrink:0;}
.aide .sv-rows{padding:0 14px;}
.aide .sv-rows-msg{color:var(--faint);font-size:11px;padding:6px 0;}
.aide .sv-rows-msg.err{color:var(--red);}
.aide .sv-grid-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:7px;max-height:340px;overflow-y:auto;}
.aide .sv-grid{border-collapse:collapse;font-size:10.5px;min-width:100%;}
.aide .sv-grid th{position:sticky;top:0;background:var(--panel2);color:var(--faint);font-weight:800;text-align:left;padding:5px 8px;white-space:nowrap;border-bottom:1px solid var(--line);letter-spacing:.02em;z-index:1;}
.aide .sv-grid td{padding:4px 8px;white-space:nowrap;color:var(--dim);border-bottom:1px solid rgba(255,255,255,.03);max-width:220px;overflow:hidden;text-overflow:ellipsis;}
.aide .sv-grid tr:hover td{background:rgba(255,255,255,.02);color:var(--txt);}
.aide .sv-null{color:var(--faint);font-style:italic;}
.aide .sv-more-btn{width:100%;margin-top:8px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--dim);font:inherit;font-size:11px;padding:6px 10px;cursor:pointer;}
.aide .sv-more-btn:hover:not(:disabled){color:var(--txt);border-color:var(--dim);}
.aide .sv-more-btn:disabled{opacity:.55;cursor:default;}
`
