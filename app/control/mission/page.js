'use client'

// Agency Mission Control — the fullscreen IDE for running the AGENCY (not a
// single client). Same shape as the per-client mission terminal, but scoped to
// the fleet, the sales pipeline (agency_leads), and service agreements. The
// terminal agent can DRAFT an agreement and open the builder for review — it
// never sends; sending stays the human's explicit click.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTerminalHistory, relTime } from '../../../lib/terminal-history'
import { defaultTermsText } from '../../../lib/agreement-email'

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
const tid = () => Math.random().toString(36).slice(2)

const TREE = [
  { section: 'DATA', items: [{ id: 'schema', icon: '🗄', label: 'Schema' }] },
  { section: 'FLEET', items: [{ id: 'fleet', icon: '🛰', label: 'Fleet' }] },
  { section: 'CAMPAIGNS', items: [
    { id: 'google', icon: '🔍', label: 'Google Ads' },
    { id: 'meta', icon: '📘', label: 'Meta Ads' },
  ] },
  { section: 'SALES', items: [
    { id: 'leads', icon: '🧲', label: 'Leads' },
    { id: 'agreements', icon: '📄', label: 'Agreements' },
  ] },
]
const VIEW_TITLES = { schema: 'Schema', fleet: 'Fleet', google: 'Google Ads', meta: 'Meta Ads', leads: 'Leads', agreements: 'Agreements' }
const TREE_ICONS = Object.fromEntries(TREE.flatMap(g => g.items.map(i => [i.id, i.icon])))
// Monochrome line icons (quiet — stay faint), matching the client mission.
const AG_NAV_ICONS = {
  schema: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></>,
  fleet: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  google: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  meta: <><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  leads: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  agreements: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></>,
  control: <><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></>,
}
function AgIcon({ id }) {
  return <svg className="ex-ic" viewBox="0 0 24 24">{AG_NAV_ICONS[id] || null}</svg>
}

const PACKAGES = [
  { id: 'pilot', name: 'Pilot', price: 1000 }, { id: 'starter', name: 'Starter', price: 1550 },
  { id: 'growth', name: 'Growth', price: 2450 }, { id: 'pro', name: 'Pro', price: 3750 },
  { id: 'custom', name: 'Custom', price: null },
]
// meta.agreement keys the builder reads on load (see agreement/[leadId]/page.js).
const DRAFT_KEYS = ['legalName', 'address', 'packageId', 'billing', 'customPrice', 'customName', 'customScope', 'term', 'termCustom', 'setupFee', 'adOn', 'adPct', 'notes', 'revOn', 'revPct', 'revStart', 'paymentOptions', 'emailSubject', 'emailMessage', 'emailCc', 'emailTerms']
// Human-readable field labels for the terminal's honest change report.
const FIELD_LABEL = { customScope: 'scope', legalName: 'legal name', address: 'address', packageId: 'package', billing: 'billing', customPrice: 'price', customName: 'package name', term: 'term', termCustom: 'term', setupFee: 'setup fee', adOn: 'ad add-on', adPct: 'ad %', notes: 'notes', revOn: 'revenue share', revPct: 'revenue %', revStart: 'revenue-share start', paymentOptions: 'payment options', emailSubject: 'email subject', emailMessage: 'email message', emailCc: 'email cc', emailTerms: 'agreement terms text' }

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
  const [reloadKeys, setReloadKeys] = useState({}) // leadId → nonce; bump to remount an open agreement iframe with fresh data
  const [histOpen, setHistOpen] = useState(false)  // session-history dropdown
  const [recent, setRecent] = useState([])         // [{id, at}] most-recent-first — tabs you've worked in
  const recentSkipRef = useRef(true)               // skip recording the default tab on mount
  const dragRef = useRef(null)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const hydratedRef = useRef(false)

  // Durable per-user terminal history (fail-safe — no-ops if the table is missing).
  const { ready: histReady, sessions: histSessions, messages: histMessages, sessionId: histSessionId, saveTurn, newSession: newHistSession, loadSession: loadHistSession, renameSession: renameHistSession } = useTerminalHistory('agency')
  const [editId, setEditId] = useState(null) // session id being renamed in the History menu

  // Restore saved panel/explorer sizes.
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem('agide_sideW')); if (w >= 160 && w <= 480) setSideW(w)
      const h = Number(localStorage.getItem('agide_panelH')); if (h >= 120 && h <= window.innerHeight - 220) setPanelH(h)
      else setPanelH(Math.round(window.innerHeight * 0.36))
    } catch { /* defaults */ }
  }, [])
  // Restore latest activity (tabs you've worked in), then record each tab switch.
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem('agide_recent') || '[]')
      if (Array.isArray(r)) setRecent(r.filter(x => x && typeof x.id === 'string'))
    } catch { /* fresh */ }
  }, [])
  useEffect(() => {
    if (recentSkipRef.current) { recentSkipRef.current = false; return }
    setRecent(r => {
      const next = [{ id: activeTab, at: Date.now() }, ...r.filter(x => x.id !== activeTab)].slice(0, 8)
      try { localStorage.setItem('agide_recent', JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [activeTab])
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

  // Welcome line + saved-turn → local-turn mapping (role user→'user', agent→
  // 'agent', system→'sys').
  const welcomeLine = useCallback(() => `agency session · ${fleet?.clients.length || 0} clients · ${fleet?.findings.length || 0} open problems across the fleet. Ask me to draft an agreement ("draft a Growth agreement for Acme Co, monthly") and I'll open the builder for your review — I never send, that stays your click.`, [fleet])
  const msgToTurn = (msg) => ({ id: tid(), kind: msg.role === 'user' ? 'user' : msg.role === 'agent' ? 'agent' : 'sys', text: msg.content || '' })

  // Hydrate the terminal once fleet + saved history are both ready. Replay the
  // saved conversation if there is one; otherwise seed the welcome line.
  useEffect(() => {
    if (!fleet || !histReady || hydratedRef.current) return
    hydratedRef.current = true
    if (histMessages.length) setTurns(histMessages.map(msgToTurn))
    else push({ kind: 'sys', text: welcomeLine() })
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, histReady, histMessages])

  // "＋ New" — mint a fresh session, clear the terminal, reseed the welcome line.
  const startNewSession = useCallback(() => {
    newHistSession()
    setTurns([{ id: tid(), kind: 'sys', text: welcomeLine() }])
    setHistOpen(false)
    inputRef.current?.focus()
  }, [newHistSession, welcomeLine])

  // Load a past conversation into the terminal.
  const openSession = useCallback(async (id) => {
    setHistOpen(false)
    const msgs = await loadHistSession(id)
    setTurns(msgs.length ? msgs.map(msgToTurn) : [{ id: tid(), kind: 'sys', text: welcomeLine() }])
    inputRef.current?.focus()
  }, [loadHistSession, welcomeLine])

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

  // Execute an agreement draft: find/create the lead, MERGE the given fields
  // into meta.agreement (never wiping fields the tool didn't set), then return
  // what actually changed so the terminal can report it honestly.
  const doDraftAgreement = useCallback(async (inp) => {
    const [first, ...rest] = (inp.contact || inp.company || '').trim().split(/\s+/)
    let lead = findLead(inp)
    const created = !lead
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
    // Only the fields the tool explicitly set. Defaults (growth/monthly) apply
    // ONLY on a brand-new agreement — never override an existing package/billing
    // the human already chose (that was silently clobbering custom packages).
    const prev = lead.meta?.agreement || {}
    const draft = {}
    for (const k of DRAFT_KEYS) if (inp[k] != null) draft[k] = inp[k]
    // Payment options must satisfy the send route's shape (id/label/amount>0);
    // mint ids the model didn't provide and coerce amounts.
    if (Array.isArray(draft.paymentOptions)) {
      draft.paymentOptions = draft.paymentOptions
        .filter(o => o && (o.label || o.amount))
        .map(o => ({ id: o.id || tid(), label: o.label || '', amount: Number(o.amount) || 0, note: o.note || '' }))
    }
    const isNewAgreement = !prev.packageId && !prev.customName
    if (isNewAgreement) { if (!draft.packageId) draft.packageId = 'growth'; if (!draft.billing) draft.billing = 'monthly' }
    const changed = Object.keys(draft).filter(k => JSON.stringify(draft[k]) !== JSON.stringify(prev[k]))
    // When the scope changes, drop any saved terms override so the contract's
    // Services section regenerates from the new scope (terms derive from fields)
    // — unless this same call explicitly set the terms text.
    const regen = draft.customScope != null && draft.emailTerms === undefined ? { emailTerms: null } : {}
    const patchRes = await fetch(`/api/agency-leads/${lead.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: inp.company ?? lead.company, email: inp.email ?? lead.email, phone: inp.phone ?? lead.phone,
        ...(first ? { first_name: first, last_name: rest.join(' ') || null } : {}),
        sale_status: 'Agreement Drafted',
        meta: { ...(lead.meta || {}), agreement: { ...prev, ...draft, ...regen } },
      }),
    })
    if (!patchRes.ok) { const j = await patchRes.json().catch(() => ({})); throw new Error(j.error || 'could not save the draft') }
    loadLeads()
    // Live-refresh: if this lead's builder tab is already open, remount its
    // iframe so the just-saved draft shows immediately (frames don't re-fetch).
    setReloadKeys(m => ({ ...m, [lead.id]: (m[lead.id] || 0) + 1 }))
    return { leadId: lead.id, created, changed, agreement: { ...prev, ...draft } }
  }, [findLead, loadLeads])

  const runAction = useCallback(async (a) => {
    if (a.name === 'open_view' && VIEW_TITLES[a.input?.view]) { openTab(a.input.view); return `opened the ${VIEW_TITLES[a.input.view]} view` }
    if (a.name === 'rename_session') {
      const title = (a.input?.title || '').trim()
      if (!title || !histSessionId) return `couldn't rename — no active conversation yet`
      renameHistSession(histSessionId, title); return `renamed this conversation to “${title.slice(0, 60)}”`
    }
    if (a.name === 'open_agreement' && a.input?.lead_id) {
      const l = (leads || []).find(x => x.id === a.input.lead_id)
      if (!l) return `couldn't find that prospect in the pipeline`
      openAgreementTab(a.input.lead_id); return `opening the agreement builder for ${l.company || l.email || 'that prospect'}`
    }
    if (a.name === 'draft_agreement') {
      const r = await doDraftAgreement(a.input || {})
      openAgreementTab(r.leadId)
      const who = a.input?.company || a.input?.contact || 'the prospect'
      if (r.created) {
        const pkg = PACKAGES.find(p => p.id === (r.agreement.packageId || 'growth'))
        return `drafted a ${pkg?.name || 'Growth'} agreement for ${who} — opened it in a tab above. Review and hit Send when ready (nothing sends until you do).`
      }
      // Update to an existing agreement — report exactly which fields changed.
      const fields = r.changed.map(k => FIELD_LABEL[k] || k)
      const uniq = [...new Set(fields)]
      if (!uniq.length) return `no fields changed on ${who}'s agreement — it already matched. Opened the builder above.`
      return `updated ${uniq.join(', ')} on ${who}'s agreement — refreshed the builder above. Review and hit Send when ready (nothing sends until you do).`
    }
    return null
  }, [openTab, leads, openAgreementTab, doDraftAgreement, histSessionId, renameHistSession])

  const ask = useCallback(async (q) => {
    const question = (q ?? input).trim()
    if (!question || busy) return
    setInput('')
    push({ kind: 'user', text: question })
    saveTurn({ role: 'user', content: question })
    const agentId = tid()
    push({ id: agentId, kind: 'agent', text: '', pending: true })
    setBusy(true)
    try {
      // What the user is looking at RIGHT NOW, so "this draft / this client"
      // never needs a clarifying question. For an agreement tab, re-fetch the
      // pipeline first — the builder iframe auto-saves directly to the API, so
      // the parent's copy of the draft fields can be stale.
      const agLeadId = activeTab.startsWith('agreement:') ? activeTab.slice('agreement:'.length) : null
      let liveLeads = leads || []
      if (agLeadId) {
        try {
          const fresh = await fetch('/api/agency-leads', { cache: 'no-store' }).then(r => r.json())
          if (Array.isArray(fresh.leads)) { liveLeads = fresh.leads; setLeads(fresh.leads) }
        } catch { /* stale beats nothing */ }
      }
      const agLead = agLeadId ? liveLeads.find(x => x.id === agLeadId) : null
      const tabLabel = (id) => id.startsWith('agreement:')
        ? `agreement builder: ${liveLeads.find(x => x.id === id.slice('agreement:'.length))?.company || 'unknown prospect'}`
        : VIEW_TITLES[id] || id
      const context = {
        workspace: {
          active_tab: tabLabel(activeTab),
          open_tabs: tabs.map(tabLabel),
          viewing_agreement: agLead ? (() => {
            const ag = agLead.meta?.agreement || null
            const contact = [agLead.first_name, agLead.last_name].filter(Boolean).join(' ') || null
            return {
              lead_id: agLead.id, company: agLead.company, contact,
              email: agLead.email, status: agLead.sale_status || agLead.lead_status,
              draft: ag,
              // The contract text as the client would see it right now — the
              // hand-edited override, or the document generated from the fields.
              effective_terms: ag ? (ag.emailTerms ?? defaultTermsText({
                customer: { company: agLead.company, contact },
                agreement: { ...ag, custom: ag.packageId === 'custom', scope: ag.customScope },
              })) : null,
              terms_are_generated: !!ag && ag.emailTerms == null,
            }
          })() : null,
        },
        clients: (fleet?.clients || []).map(c => ({ id: c.client_id, name: c.client_name, open_problems: c.open_problems, rev_30d: c.metrics?.revenue })),
        open_problems: fleet?.findings?.length || 0,
        pipeline: liveLeads.slice(0, 40).map(l => ({ lead_id: l.id, company: l.company, name: [l.first_name, l.last_name].filter(Boolean).join(' '), email: l.email, status: l.sale_status || l.lead_status, has_agreement: !!l.meta?.agreement })),
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
      const answer = json.answer || 'Done.'
      patch(agentId, { pending: false, text: answer })
      saveTurn({ role: 'agent', content: answer })
      const acts = json.actions || []
      for (const a of acts) {
        try { const note = await runAction(a); if (note) { push({ kind: 'sys', text: `agent action · ${note}` }); saveTurn({ role: 'system', content: `agent action · ${note}`, actions: a }) } }
        catch (e) { push({ kind: 'sys', text: `agent action failed · ${e.message}` }) }
      }
      // Client-side safety net: if the reply asserts an agreement change but no
      // draft ran, flag it so a false "done" never stands unqualified.
      const claim = /\b(updated|changed|revised|rewrote|reworded|simplified|cleaned up|dropped (it|this|that) in|now (leads|reads|includes)|i'?ve (updated|changed|added|revised))\b/i.test(json.answer || '')
        && /\b(scope|agreement|draft|package|term|contract)\b/i.test(json.answer || '')
      if (claim && !acts.some(a => a.name === 'draft_agreement')) {
        push({ kind: 'sys', text: '⚠ nothing was applied to the draft — the reply described a change without making it. Ask again to apply it, or edit directly in the builder.' })
      }
    } catch (e) {
      patch(agentId, { pending: false, text: '', error: e.message })
    } finally { setBusy(false); inputRef.current?.focus() }
  }, [input, busy, push, patch, fleet, leads, turns, runAction, saveTurn, activeTab, tabs])

  const tabTitle = (id) => {
    if (id.startsWith('agreement:')) {
      const l = (leads || []).find(x => x.id === id.slice('agreement:'.length))
      return `📄 ${l?.company || l?.email || 'Agreement'}`
    }
    return VIEW_TITLES[id] || id
  }

  return (
    <div className="aide mission-shell">
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
                  <AgIcon id={it.id} />{it.label}
                  {it.id === 'agreements' && openAgreements > 0 && <span className="ex-count">{openAgreements}</span>}
                </button>
              ))}
            </div>
          ))}
          {recent.filter(r => r.id !== activeTab).length > 0 && <div className="ex-sec">
            <div className="ex-h">LATEST ACTIVITY</div>
            {recent.filter(r => r.id !== activeTab).slice(0, 5).map(r => {
              const isAg = r.id.startsWith('agreement:')
              const label = isAg
                ? ((leads || []).find(x => x.id === r.id.slice('agreement:'.length))?.company || 'Agreement')
                : VIEW_TITLES[r.id] || r.id
              return (
                <button key={r.id} className="ex-item" onClick={() => openTab(r.id)}>
                  <AgIcon id={isAg ? 'agreements' : r.id} />
                  <span className="ex-ti">{label}</span>
                  <span className="ex-when">{relTime(r.at)}</span>
                </button>
              )
            })}
          </div>}
          <div className="ex-sec">
            <div className="ex-h">AGENCY</div>
            <a className="ex-item" href="/control"><AgIcon id="control" />Control Center<span className="ex-out">↗</span></a>
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
            {activeTab === 'google' && <AgencyPaidMediaView platform="google" />}
            {activeTab === 'meta' && <AgencyPaidMediaView platform="meta" />}
            {activeTab === 'leads' && <LeadsView leads={leads} onOpen={openAgreementTab} onRefresh={loadLeads} />}
            {activeTab === 'agreements' && <AgreementsView rows={agreements} onOpen={openAgreementTab} onNew={() => ask('draft a new agreement')} />}
            {/* Agreement builders stay mounted (form state survives tab switches);
                only the active one is shown. */}
            {tabs.filter(id => id.startsWith('agreement:')).map(id => {
              const leadId = id.slice('agreement:'.length)
              // key includes the reload nonce → an agent edit remounts it fresh.
              return (
                <iframe key={`${id}#${reloadKeys[leadId] || 0}`} className="ag-frame" title="Agreement Builder"
                  style={{ display: activeTab === id ? 'block' : 'none' }}
                  src={`/control/agreement/${leadId}`} />
              )
            })}
          </div>

          {/* Terminal panel */}
          {panelOpen && (
            <div className="panel" style={{ height: panelH }}>
              <div className="resize-v" onMouseDown={startDrag('panel')} title="drag to resize" />
              <div className="panel-tabs">
                <span className="on">TERMINAL</span>
                <button className="th-btn" onClick={startNewSession} title="Start a new conversation">＋ New</button>
                <div className="th-hist">
                  <button className="th-btn" onClick={() => setHistOpen(o => !o)} title="Past conversations">History{histSessions.length ? ` (${histSessions.length})` : ''} ▾</button>
                  {histOpen && (
                    <div className="th-menu">
                      {histSessions.length === 0 && <div className="th-empty">no past conversations</div>}
                      {histSessions.map(s => (
                        <div key={s.id} className={`th-row ${s.id === histSessionId ? 'on' : ''}`}>
                          {editId === s.id ? (
                            <input className="th-edit" autoFocus defaultValue={s.title === 'New conversation' ? '' : s.title}
                              onKeyDown={e => { if (e.key === 'Enter') { renameHistSession(s.id, e.currentTarget.value); setEditId(null) } else if (e.key === 'Escape') setEditId(null) }}
                              onBlur={e => { renameHistSession(s.id, e.currentTarget.value); setEditId(null) }} />
                          ) : (
                            <button className="th-item" onClick={() => openSession(s.id)}>
                              <span className="th-ti">{s.title}</span>
                              <span className="th-when">{relTime(s.updated_at)}</span>
                            </button>
                          )}
                          <button className="th-ren" title="Rename" onClick={e => { e.stopPropagation(); setEditId(s.id) }}>✎</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

const MCC_PLATFORM = {
  google: { icon: '🔍', title: 'Google Ads', subtitle: 'Manager account view · clients, ad accounts, and campaigns', source: 'client_google_campaigns' },
  meta: { icon: '📘', title: 'Meta Ads', subtitle: 'Facebook & Instagram · clients, ad accounts, and campaigns', source: 'client_meta_campaigns' },
}
const mccMoney = (n, digits = 0) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
const mccNum = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
const mccRate = (n) => n == null ? '—' : Number(n).toFixed(2) + 'x'
const mccDate = (d) => d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'
function mccAccountId(platform, value) {
  const v = String(value || '').replace(/\D/g, '')
  if (!v || v === 'unassigned') return 'unassigned sync rows'
  if (platform === 'google' && v.length === 10) return `${v.slice(0, 3)}-${v.slice(3, 6)}-${v.slice(6)}`
  return platform === 'meta' ? `act_${v}` : v
}
function mccStatus(status, stale) {
  if (stale) return { label: 'stale', cls: 'stale' }
  const value = String(status || 'unknown').toLowerCase()
  return { label: value, cls: /enabled|active/.test(value) ? 'live' : /paused/.test(value) ? 'paused' : 'off' }
}

function AgencyPaidMediaView({ platform }) {
  const cfg = MCC_PLATFORM[platform]
  const [days, setDays] = useState(30)
  const [reload, setReload] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accountQuery, setAccountQuery] = useState('')
  const [campaignQuery, setCampaignQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState(null)
  const [selectedCampaignId, setSelectedCampaignId] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/agency/paid-media?platform=${platform}&days=${days}`, { cache: 'no-store', signal: controller.signal })
      .then(async r => { const body = await r.json(); if (!r.ok || body.error) throw new Error(body.error || `HTTP ${r.status}`); return body })
      .then(setData)
      .catch(e => { if (e.name !== 'AbortError') setError(e.message || String(e)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [platform, days, reload])

  useEffect(() => {
    const accounts = data?.accounts || []
    setSelectedKey(current => accounts.some(a => a.key === current) ? current : (accounts[0]?.key || null))
  }, [data])
  useEffect(() => { setSelectedCampaignId(null); setCampaignQuery('') }, [selectedKey])

  const accounts = data?.accounts || []
  const aq = accountQuery.trim().toLowerCase()
  const shownAccounts = accounts.filter(a => !aq || [a.client_name, a.client_id, a.account_id, a.industry].some(v => String(v || '').toLowerCase().includes(aq)))
  const account = accounts.find(a => a.key === selectedKey) || null
  const cq = campaignQuery.trim().toLowerCase()
  const campaigns = (account?.campaigns || []).filter(c => !cq || [c.campaign_name, c.campaign_id, c.status, c.channel_type].some(v => String(v || '').toLowerCase().includes(cq)))
  const selectedCampaign = account?.campaigns?.find(c => c.campaign_id === selectedCampaignId) || null
  const summary = data?.summary

  return (
    <div className={`mcc-root ${platform}`}>
      <header className="mcc-head">
        <div className="mcc-heading">
          <span className="mcc-logo">{cfg.icon}</span>
          <div><h3>{cfg.title}</h3><p>{cfg.subtitle}</p></div>
        </div>
        <div className="mcc-actions">
          <div className="mcc-range" aria-label="Reporting range">
            {[7, 30, 90].map(n => <button key={n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n}D</button>)}
          </div>
          <button className="mcc-refresh" disabled={loading} onClick={() => setReload(x => x + 1)} title="Refresh paid-media data">{loading ? '↻' : '⟳'}</button>
        </div>
      </header>

      <div className="mcc-kpis">
        <div><span>Spend</span><b>{summary ? mccMoney(summary.metrics.spend) : '—'}</b></div>
        <div><span>Connected accounts</span><b>{summary ? `${summary.connected_accounts}/${summary.accounts}` : '—'}</b></div>
        <div><span>Campaigns</span><b>{summary ? summary.campaigns.toLocaleString() : '—'}</b><small>{summary ? `${summary.active_campaigns} active` : ''}</small></div>
        <div><span>Clicks</span><b>{summary ? mccNum(summary.metrics.clicks) : '—'}</b></div>
        <div><span>Conversions</span><b>{summary ? mccNum(summary.metrics.conversions) : '—'}</b></div>
        <div><span>Cost / conversion</span><b>{summary?.metrics.cpa != null ? mccMoney(summary.metrics.cpa, 2) : '—'}</b></div>
        <div><span>Platform ROAS</span><b className={summary?.metrics.roas >= 1 ? 'good' : ''}>{summary ? mccRate(summary.metrics.roas) : '—'}</b></div>
      </div>

      {error && <div className="mcc-alert err">Could not load {cfg.title}: {error}</div>}
      {data?.truncated && <div className="mcc-alert warn">This range exceeded 50,000 daily rows. Narrow the range for a complete rollup.</div>}
      {data?.limitation && <div className="mcc-alert info">{data.limitation}</div>}

      <div className="mcc-body">
        <aside className="mcc-accounts">
          <div className="mcc-accounts-head"><span>AD ACCOUNTS</span><b>{shownAccounts.length}</b></div>
          <input className="mcc-search" value={accountQuery} onChange={e => setAccountQuery(e.target.value)} placeholder="filter clients or account IDs…" aria-label="Filter ad accounts" />
          <div className="mcc-account-list">
            {loading && !data && <div className="mcc-empty">loading account fleet…</div>}
            {!loading && !error && shownAccounts.length === 0 && <div className="mcc-empty">no ad accounts found for this range.</div>}
            {shownAccounts.map(a => (
              <button key={a.key} className={`mcc-account ${selectedKey === a.key ? 'on' : ''}`} onClick={() => setSelectedKey(a.key)}>
                <span className={`mcc-conn ${a.connected && a.active ? 'ok' : ''}`} title={a.connected ? (a.active ? 'connected' : 'inactive') : 'campaign rows have no matching saved connection'} />
                <span className="mcc-account-copy">
                  <b>{a.client_name}</b>
                  <small>{mccAccountId(platform, a.account_id)} · {a.campaign_count} campaign{a.campaign_count === 1 ? '' : 's'}</small>
                </span>
                <span className="mcc-account-spend">{mccMoney(a.metrics.spend)}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="mcc-main">
          {!account && <div className="mcc-empty main">Select an ad account to inspect its campaigns.</div>}
          {account && (
            <>
              <div className="mcc-account-head">
                <div>
                  <div className="mcc-path"><span>Accounts</span><b>›</b><strong>{account.client_name}</strong></div>
                  <p>{mccAccountId(platform, account.account_id)} · {account.industry || 'industry not set'} · last sync {account.last_sync ? relTime(account.last_sync) : 'unknown'}</p>
                </div>
                <a href={`/control/${account.client_id}/mission?tab=${platform}`} className="mcc-open-client">Open client Mission ↗</a>
              </div>

              <div className="mcc-campaign-tools">
                <div><b>Campaigns</b><span>{account.campaign_count} in {data?.range?.days || days} days</span></div>
                <input className="mcc-search" value={campaignQuery} onChange={e => setCampaignQuery(e.target.value)} placeholder="filter campaigns…" aria-label="Filter campaigns" />
              </div>

              <div className={`mcc-campaign-area ${selectedCampaign ? 'has-detail' : ''}`}>
                <div className="mcc-grid-scroll">
                  <table className="mcc-grid">
                    <thead><tr><th>Campaign</th><th>Status</th><th>Type</th><th>Budget</th><th>Spend</th><th>Impr.</th><th>Clicks</th><th>CPC</th><th>Conv.</th><th>Cost / conv.</th><th>ROAS</th><th>Last active</th></tr></thead>
                    <tbody>
                      {campaigns.map(c => {
                        const state = mccStatus(c.status, c.stale)
                        return (
                          <tr key={c.campaign_id} className={selectedCampaignId === c.campaign_id ? 'on' : ''} onClick={() => setSelectedCampaignId(c.campaign_id)}>
                            <td><b>{c.campaign_name}</b><small>{c.campaign_id}</small></td>
                            <td><span className={`mcc-status ${state.cls}`}>{state.label}</span></td>
                            <td>{c.channel_type || (platform === 'meta' ? 'Meta' : '—')}</td>
                            <td>{c.budget ? mccMoney(c.budget) : '—'}</td>
                            <td className="num">{mccMoney(c.metrics.spend)}</td>
                            <td className="num">{mccNum(c.metrics.impressions)}</td>
                            <td className="num">{mccNum(c.metrics.clicks)}</td>
                            <td className="num">{c.metrics.cpc != null ? mccMoney(c.metrics.cpc, 2) : '—'}</td>
                            <td className="num">{mccNum(c.metrics.conversions)}</td>
                            <td className="num">{c.metrics.cpa != null ? mccMoney(c.metrics.cpa, 2) : '—'}</td>
                            <td className={`num ${c.metrics.roas >= 1 ? 'good' : c.metrics.roas != null ? 'bad' : ''}`}>{mccRate(c.metrics.roas)}</td>
                            <td>{mccDate(c.latest_date)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {!loading && campaigns.length === 0 && <div className="mcc-empty">no campaigns match this account and range.</div>}
                </div>

                {selectedCampaign && (
                  <aside className="mcc-detail">
                    <div className="mcc-detail-head"><span>CAMPAIGN</span><button onClick={() => setSelectedCampaignId(null)}>×</button></div>
                    <h4>{selectedCampaign.campaign_name}</h4>
                    <p className="mcc-detail-id">{selectedCampaign.campaign_id}</p>
                    <div className="mcc-detail-state">{(() => { const s = mccStatus(selectedCampaign.status, selectedCampaign.stale); return <span className={`mcc-status ${s.cls}`}>{s.label}</span> })()}<span>{selectedCampaign.channel_type || (platform === 'meta' ? 'Meta' : 'type unavailable')}</span></div>
                    <div className="mcc-detail-grid">
                      <div><span>Spend</span><b>{mccMoney(selectedCampaign.metrics.spend)}</b></div>
                      <div><span>Budget</span><b>{selectedCampaign.budget ? mccMoney(selectedCampaign.budget) : '—'}</b></div>
                      <div><span>Impressions</span><b>{mccNum(selectedCampaign.metrics.impressions)}</b></div>
                      <div><span>Clicks</span><b>{mccNum(selectedCampaign.metrics.clicks)}</b></div>
                      <div><span>Conversions</span><b>{mccNum(selectedCampaign.metrics.conversions)}</b></div>
                      <div><span>Cost / conv.</span><b>{selectedCampaign.metrics.cpa != null ? mccMoney(selectedCampaign.metrics.cpa, 2) : '—'}</b></div>
                      <div><span>Conv. value</span><b>{mccMoney(selectedCampaign.metrics.conversion_value)}</b></div>
                      <div><span>ROAS</span><b>{mccRate(selectedCampaign.metrics.roas)}</b></div>
                    </div>
                    <p className="mcc-detail-note">{selectedCampaign.daily_rows} daily source row{selectedCampaign.daily_rows === 1 ? '' : 's'} · latest {mccDate(selectedCampaign.latest_date)} · {cfg.source}</p>
                    <a href={`/control/${account.client_id}/mission?tab=${platform}`} className="mcc-detail-open">Open {platform === 'google' ? 'campaign hierarchy' : 'client campaign tab'} ↗</a>
                  </aside>
                )}
              </div>
            </>
          )}
        </main>
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

const LEAD_EMPTY = { company: '', first_name: '', last_name: '', email: '', phone: '' }
function LeadsView({ leads, onOpen, onRefresh }) {
  const [sel, setSel] = useState(() => new Set())   // selected lead ids (bulk)
  const [creating, setCreating] = useState(false)   // new-lead form open
  const [form, setForm] = useState(LEAD_EMPTY)
  const [busy, setBusy] = useState(false)

  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = leads && leads.length > 0 && sel.size === leads.length
  const toggleAll = () => setSel(allSelected ? new Set() : new Set((leads || []).map(l => l.id)))

  const createLead = async () => {
    if (!form.company.trim() && !form.email.trim() && !form.first_name.trim()) return
    setBusy(true)
    try {
      await fetch('/api/agency-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, notify: false }) })
      setForm(LEAD_EMPTY); setCreating(false); onRefresh && onRefresh()
    } catch { /* keep form open */ }
    setBusy(false)
  }
  const deleteLead = async (id) => {
    if (!confirm('Delete this lead? This cannot be undone.')) return
    await fetch(`/api/agency-leads/${id}`, { method: 'DELETE' }).catch(() => {})
    setSel(s => { const n = new Set(s); n.delete(id); return n }); onRefresh && onRefresh()
  }
  const deleteSelected = async () => {
    if (!sel.size || !confirm(`Delete ${sel.size} lead${sel.size === 1 ? '' : 's'}? This cannot be undone.`)) return
    setBusy(true)
    await Promise.allSettled([...sel].map(id => fetch(`/api/agency-leads/${id}`, { method: 'DELETE' })))
    setSel(new Set()); onRefresh && onRefresh(); setBusy(false)
  }

  if (!leads) return <p className="a-dim v-pad">loading leads…</p>
  return (
    <div className="v-pad">
      <div className="v-h-row">
        <h4 className="v-h">Leads</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sel.size > 0 && <button className="a-btn" disabled={busy} onClick={deleteSelected}>🗑 Delete {sel.size} selected</button>}
          <button className="a-btn primary" onClick={() => setCreating(c => !c)}>{creating ? '✕ Cancel' : '+ New lead'}</button>
        </div>
      </div>
      <p className="v-note">Prospects from the agency funnels and manually added leads. Open one to build or continue their agreement.</p>

      {creating && (
        <div className="lead-new" onKeyDown={e => { if (e.key === 'Enter') createLead(); if (e.key === 'Escape') { setCreating(false); setForm(LEAD_EMPTY) } }}>
          <input autoFocus placeholder="Company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
          <input placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
          <input placeholder="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
          <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <button className="a-btn primary" disabled={busy} onClick={createLead}>{busy ? 'Adding…' : 'Add lead'}</button>
        </div>
      )}

      {!leads.length ? <p className="a-dim" style={{ marginTop: 12 }}>No leads yet — add one with “+ New lead”.</p> : (
        <div className="tbl leads">
          <div className="tr th">
            <span><input type="checkbox" checked={allSelected} onChange={toggleAll} title="select all" /></span>
            <span>Company</span><span>Contact</span><span>Email</span><span>Status</span><span></span>
          </div>
          {leads.map(l => (
            <div key={l.id} className={`tr ${sel.has(l.id) ? 'on' : ''}`}>
              <span onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></span>
              <span className="strong" onClick={() => onOpen(l.id)}>{l.company || '—'}</span>
              <span onClick={() => onOpen(l.id)}>{[l.first_name, l.last_name].filter(Boolean).join(' ') || '—'}</span>
              <span className="dim" onClick={() => onOpen(l.id)}>{l.email || '—'}</span>
              <span onClick={() => onOpen(l.id)}><span className={`pill ${statusPill(l.sale_status || l.lead_status)}`}>{l.sale_status || l.lead_status || 'New'}</span></span>
              <span className="lead-actions"><button className="lead-del" title="delete lead" onClick={e => { e.stopPropagation(); deleteLead(l.id) }}>🗑</button></span>
            </div>
          ))}
        </div>
      )}
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
  system:  { label: 'System',         color: '#9a9aa2' },
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
  const [mode, setMode] = useState('table')      // ShieldTech parity: table browser first, map on demand
  const [tableQuery, setTableQuery] = useState('')
  const [domainFilter, setDomainFilter] = useState('all')
  const [pos, setPos] = useState({})             // name -> {x,y}
  const [view, setView] = useState({ x: 0, y: 0, k: 0.72 })
  const [focus, setFocus] = useState(null)
  const [hoverEdge, setHoverEdge] = useState(null)
  const [rowState, setRowState] = useState({})   // table -> { rows, columns, total, loading, error, offset }
  const [hiddenCols, setHiddenCols] = useState(new Set())
  const [colsOpen, setColsOpen] = useState(false)

  const vpRef = useRef(null)
  const colsRef = useRef(null)
  const drag = useRef(null)
  const didFit = useRef(false)
  const didSelect = useRef(false)
  // Deep-link support: /control/mission?focus=<table>&day=YYYY-MM-DD&client_id=chXXX
  // (the client-mission drill headers link here). linkFilter scopes the row
  // browser; pendingFocus selects the requested table once the model exists.
  const [linkFilter, setLinkFilter] = useState(null)
  const pendingFocusRef = useRef(null)
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const day = sp.get('day'), cid = sp.get('client_id'), focus0 = sp.get('focus')
      if (day || cid) setLinkFilter({ day: day || null, client_id: cid || null })
      if (focus0) pendingFocusRef.current = focus0
    } catch { /* no params */ }
  }, [])

  useEffect(() => { setHiddenCols(new Set()); setColsOpen(false) }, [focus])
  useEffect(() => {
    const close = (e) => { if (colsRef.current && !colsRef.current.contains(e.target)) setColsOpen(false) }
    if (colsOpen) document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [colsOpen])

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
    if (mode !== 'map' || didFit.current || !model || !meta || !Object.keys(pos).length || !vpRef.current) return
    const r = vpRef.current.getBoundingClientRect()
    setView(svFitView(pos, model.tables, meta.heights, r.width, r.height))
    didFit.current = true
  }, [mode, pos, model, meta])
  useEffect(() => {
    if (!model || !meta || didSelect.current) return
    didSelect.current = true
    const requested = pendingFocusRef.current
    pendingFocusRef.current = null
    const first = (requested && meta.byName[requested] ? requested : null)
      || model.tables.find(t => t.name === 'agency')?.name
      || model.tables[0]?.name
    if (first) setFocus(first)
  }, [model, meta])

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
    fetch(`/api/agency/table-data?table=${encodeURIComponent(table)}&limit=25&offset=${offset}${linkFilter?.day ? `&day=${linkFilter.day}` : ''}${linkFilter?.client_id ? `&client_id=${encodeURIComponent(linkFilter.client_id)}` : ''}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setRowState(s => {
        if (d.error) return { ...s, [table]: { ...(s[table] || {}), loading: false, error: d.error } }
        const prev = s[table] || {}
        const rows = append ? [...(prev.rows || []), ...(d.rows || [])] : (d.rows || [])
        return { ...s, [table]: { loading: false, error: null, offset, columns: d.columns || [], rows, total: d.total ?? rows.length } }
      }))
      .catch(e => setRowState(s => ({ ...s, [table]: { ...(s[table] || {}), loading: false, error: String(e) } })))
  }, [linkFilter])

  // When focus lands on a table we haven't loaded, pull its first page.
  useEffect(() => {
    if (!focus) return
    if (!rowState[focus] || (!rowState[focus].rows && !rowState[focus].loading)) fetchRows(focus, 0, false)
  }, [focus, rowState, fetchRows])

  /* ── pan / zoom / drag ── */
  useEffect(() => {
    const el = vpRef.current
    if (!el || mode !== 'map') return
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
  }, [mode])

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

  // The agency schema is much larger than a client schema, so the table rail is
  // grouped by domain and can be narrowed without changing the map model.
  const orderedTables = useMemo(() => {
    if (!model) return []
    return [...model.tables].sort((a, b) => {
      const da = SV_CLUSTER_ORDER.indexOf(a.domain), db = SV_CLUSTER_ORDER.indexOf(b.domain)
      return (da - db) || a.name.localeCompare(b.name)
    })
  }, [model])
  const tableGroups = useMemo(() => {
    const needle = tableQuery.trim().toLowerCase()
    return SV_CLUSTER_ORDER.map(domain => ({
      domain,
      tables: orderedTables.filter(t => (domainFilter === 'all' || t.domain === domain) && t.domain === domain && (!needle || t.name.toLowerCase().includes(needle))),
    })).filter(g => g.tables.length)
  }, [orderedTables, tableQuery, domainFilter])
  const focusLinks = useMemo(() => {
    if (!focus || !meta) return []
    const seen = new Set()
    return [...(meta.outbound[focus] || []).map(e => ({ ...e, other: e.to, direction: 'out' })),
      ...(meta.inbound[focus] || []).map(e => ({ ...e, other: e.from, direction: 'in' }))]
      .filter(e => { const k = `${e.direction}:${e.other}`; if (seen.has(k)) return false; seen.add(k); return true })
  }, [focus, meta])
  const allRowCols = focusRows?.columns?.length
    ? focusRows.columns
    : (focusT?.columns || []).map(c => c.name)
  const shownRowCols = allRowCols.filter(c => !hiddenCols.has(c))
  const fmtCell = (v) => {
    if (v == null || v === '') return ''
    if (typeof v === 'object') return JSON.stringify(v)
    if (typeof v === 'number') return Number(Number(v).toFixed(4)).toLocaleString()
    return String(v)
  }
  const openTableMode = () => {
    if (!focus && orderedTables[0]) setFocus(orderedTables[0].name)
    setMode('table')
  }

  const bounds = useMemo(() => {
    let maxx = 1000, maxy = 800
    if (meta) for (const n in pos) { maxx = Math.max(maxx, pos[n].x + SV_CARD_W); maxy = Math.max(maxy, pos[n].y + (meta.heights[n] || 120)) }
    return { w: maxx + 400, h: maxy + 400 }
  }, [pos, meta])

  return (
    <div className="sv-root">
      <div className="sv-toolbar">
        <span className="sv-title">schema.{mode === 'table' ? 'tables' : 'map'}</span>
        <div className="sv-mode" role="tablist" aria-label="Schema view">
          <button className={mode === 'table' ? 'on' : ''} onClick={openTableMode} role="tab" aria-selected={mode === 'table'}>▦ Tables</button>
          <button className={mode === 'map' ? 'on' : ''} onClick={() => setMode('map')} role="tab" aria-selected={mode === 'map'}>⬡ Schema map</button>
        </div>
        <span className="sv-meta">{model ? `${model.counts.tables} tables · ${model.counts.fk} FK · ${model.counts.logical} logical` : 'loading…'}</span>
        {mode === 'map' ? (
          <>
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
          </>
        ) : <span className="sv-readonly">live rows · read only</span>}
      </div>

      {mode === 'table' ? (
        <div className="sv-browser">
          <aside className="sv-browser-rail">
            <div className="sv-br-head">
              <span>AGENCY DATA</span>
              <span>{model?.tables?.length || '…'} tables</span>
            </div>
            <div className="sv-br-controls">
              <input value={tableQuery} onChange={e => setTableQuery(e.target.value)} placeholder="filter tables…" aria-label="Filter schema tables" />
              <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)} aria-label="Filter tables by domain">
                <option value="all">all domains</option>
                {SV_CLUSTER_ORDER.map(domain => <option key={domain} value={domain}>{SV_CLUSTER[domain].label}</option>)}
              </select>
            </div>
            <div className="sv-br-list">
              {err && <div className="sv-br-msg err">failed to load schema: {err}</div>}
              {!model && !err && <div className="sv-br-msg">reading db/schema.md…</div>}
              {model && tableGroups.length === 0 && <div className="sv-br-msg">no matching tables</div>}
              {tableGroups.map(group => (
                <div className="sv-br-group" key={group.domain}>
                  <div className="sv-br-group-h">
                    <span className="sv-br-dot" style={{ background: svColor(group.domain) }} />
                    <span>{SV_CLUSTER[group.domain].label}</span>
                    <span>{group.tables.length}</span>
                  </div>
                  {group.tables.map(t => {
                    const rc = counts?.[t.name]
                    return (
                      <button key={t.name} className={`sv-br-table ${focus === t.name ? 'on' : ''}`} onClick={() => setFocus(t.name)}>
                        <span className="sv-br-name">{t.name}</span>
                        <span className="sv-br-count">{rc === undefined ? '…' : rc === null ? '—' : svNum(rc)}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="sv-br-note">Agency access · live Supabase rows · sensitive values redacted</div>
          </aside>

          <section className="sv-browser-main">
            {!focusT && <div className="sv-table-empty">Select a table to browse its columns and live rows.</div>}
            {focusT && (
              <>
                <div className="sv-table-head">
                  <div className="sv-table-identity">
                    <div><span className="sv-table-dot" style={{ background: svColor(focusT.domain) }} /><b>public.{focusT.name}</b></div>
                    <span>{SV_CLUSTER[focusT.domain].label} · {focusT.columns.length} columns · {focusRows?.total == null ? '…' : `${svNum(focusRows.total)} rows`}</span>
                  </div>
                  {allRowCols.length > 0 && (
                    <div className="sv-colpick" ref={colsRef}>
                      <button className="sv-table-btn" onClick={() => setColsOpen(o => !o)}>⊞ Columns <span>{shownRowCols.length}/{allRowCols.length}</span></button>
                      {colsOpen && (
                        <div className="sv-colmenu">
                          <div className="sv-colmenu-top">
                            <button onClick={() => setHiddenCols(new Set())}>all</button>
                            <button onClick={() => setHiddenCols(new Set(allRowCols.slice(1)))}>first only</button>
                          </div>
                          {allRowCols.map(c => {
                            const on = !hiddenCols.has(c)
                            const cm = focusT.columns.find(x => x.name === c)
                            return (
                              <label key={c} className="sv-colrow">
                                <input type="checkbox" checked={on} onChange={() => setHiddenCols(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n })} />
                                <span>{c}</span>
                                <small>{cm?.type}</small>
                                {cm?.ref && <em>→ {cm.ref.table}</em>}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {(focusLinks.length > 0 || linkFilter) && (
                  <div className="sv-table-context">
                    {focusLinks.length > 0 && <div className="sv-relations"><span>RELATED</span>{focusLinks.map(e => (
                      <button key={`${e.direction}:${e.other}`} onClick={() => setFocus(e.other)} title={`${e.from}.${e.col} → ${e.to}.${e.toCol}`}>
                        {e.direction === 'out' ? '→' : '←'} {e.other}
                      </button>
                    ))}</div>}
                    {linkFilter && (
                      <div className="sv-filter">
                        filtered: {linkFilter.day ? `day = ${linkFilter.day}` : ''}{linkFilter.day && linkFilter.client_id ? ' · ' : ''}{linkFilter.client_id ? `client = ${linkFilter.client_id}` : ''}
                        <button onClick={() => { setLinkFilter(null); setRowState({}) }}>✕ clear</button>
                      </div>
                    )}
                  </div>
                )}

                <div className="sv-table-data">
                  {(!focusRows || (focusRows.loading && !focusRows.rows)) && <div className="sv-table-empty">querying live rows…</div>}
                  {focusRows?.error && <div className="sv-table-empty err">error: {focusRows.error}</div>}
                  {focusRows?.rows && focusRows.rows.length === 0 && !focusRows.loading && <div className="sv-table-empty">no rows{linkFilter ? ' match these filters' : ''}</div>}
                  {focusRows?.rows && focusRows.rows.length > 0 && (
                    <div className="sv-table-grid-scroll">
                      <table className="sv-grid sv-table-grid">
                        <thead><tr>{shownRowCols.map(c => {
                          const cm = focusT.columns.find(x => x.name === c)
                          return <th key={c} title={cm ? `${cm.type}${cm.key ? ` · ${cm.key}` : ''}` : c}>{c}{cm?.key && <span className={`sv-th-key ${cm.key.includes('PK') ? 'pk' : 'fk'}`}>{cm.key.replace('+', '·')}</span>}</th>
                        })}</tr></thead>
                        <tbody>{focusRows.rows.map((row, ri) => (
                          <tr key={ri}>{shownRowCols.map(c => {
                            const s = fmtCell(row[c])
                            return <td key={c} title={s}>{s ? (s.length > 160 ? s.slice(0, 160) + '…' : s) : <span className="sv-null">null</span>}</td>
                          })}</tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>

                {focusRows?.rows && focusRows.rows.length > 0 && (
                  <div className="sv-table-foot">
                    <span>showing {svNum(focusRows.rows.length)} of {svNum(focusRows.total || focusRows.rows.length)} rows</span>
                    {focusRows.rows.length < (focusRows.total || 0) && (
                      <button className="sv-table-btn" disabled={focusRows.loading} onClick={() => fetchRows(focus, (focusRows.offset || 0) + 25, true)}>
                        {focusRows.loading ? 'loading…' : 'load 25 more'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      ) : (
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
            {linkFilter && (
              <div className="sv-filter">
                filtered: {linkFilter.day ? `day = ${linkFilter.day}` : ''}{linkFilter.day && linkFilter.client_id ? ' · ' : ''}{linkFilter.client_id ? `client = ${linkFilter.client_id}` : ''}
                <button onClick={() => { setLinkFilter(null); setRowState({}) }}>✕ clear</button>
              </div>
            )}
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
      )}
    </div>
  )
}

const CSS = `
.aide{position:fixed;inset:var(--mt-top,36px) 0 0 0;display:flex;flex-direction:column;overflow:hidden;}
.aide-body{flex:1;display:flex;min-height:0;}
.aide .ex{width:230px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;padding-bottom:20px;}
.aide .resize-h{width:5px;margin:0 -2px;flex-shrink:0;cursor:col-resize;z-index:5;position:relative;transition:background .12s;}
.aide .resize-h:hover{background:rgba(255,255,255,.10);}
.aide .resize-h:active{background:rgba(255,255,255,.16);}
.aide .resize-v{height:5px;margin-bottom:-2px;cursor:row-resize;z-index:5;position:relative;flex-shrink:0;transition:background .12s;}
.aide .resize-v:hover{background:rgba(255,255,255,.10);}
.aide .resize-v:active{background:rgba(255,255,255,.16);}
/* Covers embedded frames during a drag so they don't swallow mouse events. */
.aide .drag-overlay{position:fixed;inset:0;z-index:9999;}
.aide .ex-top{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);}
.aide .ex-brand{font-weight:800;font-size:12.5px;}
.aide .ex-badge{font-size:8.5px;font-weight:800;letter-spacing:.06em;background:rgba(110,168,254,.15);color:var(--blue);padding:2px 6px;border-radius:4px;}
.aide .ex-sec{margin-top:12px;}
.aide .ex-h{font-size:9.5px;font-weight:800;letter-spacing:.08em;color:var(--faint);padding:2px 14px;margin-bottom:2px;}
.aide .ex-item{width:100%;display:flex;align-items:center;gap:9px;padding:5px 14px;background:none;border:0;border-left:2px solid transparent;color:var(--dim);font:inherit;font-size:12.5px;cursor:pointer;text-align:left;}
.aide .ex-item:hover{background:rgba(255,255,255,.03);color:var(--txt);}
.aide .ex-item.on{background:rgba(110,168,254,.07);border-left-color:var(--blue);color:var(--txt);}
.aide .ex-ic{width:15px;height:15px;flex-shrink:0;stroke:var(--faint);stroke-width:1.7;fill:none;stroke-linecap:round;stroke-linejoin:round;}
.aide .ex-item{text-decoration:none;}
.aide .ex-out{margin-left:auto;color:var(--faint);font-size:11px;}
.aide .ex-ti{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .ex-when{margin-left:auto;color:var(--faint);font-size:10px;flex-shrink:0;}
.aide .sv-filter{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--amber);background:rgba(242,180,92,.08);border:1px solid rgba(242,180,92,.25);border-radius:6px;padding:4px 8px;margin:6px 0;}
.aide .sv-filter button{background:none;border:none;color:var(--dim);font:inherit;font-size:10px;cursor:pointer;margin-left:auto;}
.aide .sv-filter button:hover{color:var(--txt);}
.aide .ex-count{margin-left:auto;background:rgba(242,180,92,.18);color:var(--amber);font-size:10px;font-weight:800;border-radius:99px;padding:0 6px;}
.aide .main{flex:1;display:flex;flex-direction:column;min-width:0;}
.aide .tabbar{display:flex;align-items:stretch;background:var(--panel);border-bottom:1px solid var(--line);height:34px;flex-shrink:0;overflow-x:auto;}
.aide .burger{background:none;border:none;color:var(--faint);font:inherit;padding:0 12px;cursor:pointer;border-right:1px solid var(--line);}
.aide .burger:hover{color:var(--txt);}
.aide .tab{display:flex;align-items:center;gap:7px;padding:0 14px;font-size:12px;color:var(--dim);border-right:1px solid var(--line);cursor:pointer;white-space:nowrap;}
.aide .tab.on{color:var(--txt);background:var(--bg);box-shadow:inset 0 2px 0 var(--blue);}
.aide .tab-x{color:var(--faint);font-size:13px;}.aide .tab-x:hover{color:var(--txt);}
.aide .tab-spacer{flex:1;}
.aide .view{flex:1;overflow-y:auto;min-height:0;position:relative;}
.aide .ag-frame{width:100%;height:100%;border:none;background:var(--bg);}
.aide .v-pad{padding:18px 24px 40px;}
.aide .v-h{font-size:15px;font-weight:800;margin:0 0 4px;}
.aide .v-h-row{display:flex;align-items:center;justify-content:space-between;}
.aide .v-note{color:var(--dim);font-size:12px;margin:0 0 14px;max-width:760px;}
.aide .a-dim{color:var(--faint);}.aide .a-err{color:var(--red);padding:12px 24px;}
.aide .f-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
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
.aide .tbl{border:1px solid var(--line);border-radius:9px;overflow:hidden;}
.aide .tr{display:grid;grid-template-columns:1.4fr 1.1fr 1.6fr .9fr .6fr;gap:10px;align-items:center;padding:8px 14px;border-top:1px solid var(--line);font-size:12.5px;cursor:pointer;}
.aide .tbl .tr:first-child{border-top:none;}
.aide .tbl.two .tr{grid-template-columns:1.6fr 1.2fr 1fr .6fr;}
/* Leads table with a leading checkbox column + row delete */
.aide .tbl.leads .tr{grid-template-columns:30px 1.4fr 1.1fr 1.6fr .9fr 36px;cursor:default;}
.aide .tbl.leads .tr .strong,.aide .tbl.leads .tr span:not(.lead-actions):not(.th){cursor:pointer;}
.aide .tbl.leads .tr.on{background:rgba(var(--blue-500,110 168 254) / .10);}
.aide .tbl.leads input[type=checkbox]{accent-color:rgb(var(--blue-500,110 168 254));cursor:pointer;}
.aide .lead-actions{text-align:right;}
.aide .lead-del{background:none;border:none;color:var(--faint);cursor:pointer;font-size:12px;opacity:0;padding:2px;}
.aide .tbl.leads .tr:hover .lead-del{opacity:1;}
.aide .lead-del:hover{color:var(--red);}
.aide .lead-new{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:9px;background:var(--panel2);}
.aide .lead-new input{flex:1;min-width:120px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:12.5px;padding:6px 10px;}
.aide .lead-new input:focus{outline:none;border-color:rgb(var(--blue-500,110 168 254));}
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
.aide .a-btn.primary{background:var(--blue);border-color:var(--blue);color:var(--bg);font-weight:700;}
.aide .a-btn:hover{border-color:var(--dim);}
.aide .panel{min-height:120px;display:flex;flex-direction:column;border-top:1px solid var(--line);background:var(--bg);flex-shrink:0;position:relative;}
.aide .panel-tabs{display:flex;gap:2px;align-items:center;background:var(--panel);border-bottom:1px solid var(--line);padding:0 10px;height:30px;font-size:10.5px;font-weight:800;letter-spacing:.06em;flex-shrink:0;}
.aide .panel-tabs span{padding:0 10px;color:var(--faint);cursor:pointer;line-height:30px;}
.aide .panel-tabs span.on{color:var(--txt);box-shadow:inset 0 -2px 0 var(--blue);}
.aide .panel-x{margin-left:auto;}
.aide .th-btn{background:none;border:1px solid var(--line);border-radius:5px;color:var(--dim);font:inherit;font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 8px;margin-left:4px;cursor:pointer;line-height:18px;}
.aide .th-btn:hover{color:var(--txt);border-color:var(--dim);}
.aide .th-hist{position:relative;}
.aide .th-menu{position:absolute;top:26px;left:0;z-index:60;min-width:240px;max-height:320px;overflow-y:auto;background:var(--panel2);border:1px solid var(--line);border-radius:8px;box-shadow:0 14px 40px rgba(0,0,0,.55);padding:4px;}
.aide .th-empty{color:var(--faint);font-size:11px;font-weight:400;letter-spacing:0;padding:8px 10px;}
.aide .th-row{display:flex;align-items:center;gap:2px;border-radius:6px;}
.aide .th-row.on{background:rgba(110,168,254,.12);}
.aide .th-row:hover{background:rgba(255,255,255,.04);}
.aide .th-item{flex:1;min-width:0;display:flex;align-items:baseline;justify-content:space-between;gap:10px;background:none;border:none;color:var(--dim);font:inherit;font-size:12px;font-weight:400;letter-spacing:0;text-align:left;padding:6px 9px;border-radius:6px;cursor:pointer;}
.aide .th-row:hover .th-item,.aide .th-row.on .th-item{color:var(--txt);}
.aide .th-ren{flex-shrink:0;background:none;border:none;color:var(--faint);font:inherit;font-size:11px;cursor:pointer;padding:4px 8px;border-radius:5px;opacity:0;}
.aide .th-row:hover .th-ren{opacity:1;}
.aide .th-ren:hover{color:var(--blue);background:rgba(255,255,255,.06);}
.aide .th-edit{flex:1;min-width:0;background:var(--bg);border:1px solid var(--blue);border-radius:6px;color:var(--txt);font:inherit;font-size:12px;padding:5px 8px;margin:1px 0;outline:none;}
.aide .th-ti{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .th-when{color:var(--faint);font-size:10px;white-space:nowrap;flex-shrink:0;}
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
.aide .statusbar{display:flex;align-items:center;border-top:1px solid var(--line);background:var(--panel);padding:0 10px;height:30px;font-size:11px;flex-shrink:0;overflow-x:auto;white-space:nowrap;}
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

/* ── Agency paid-media manager (MCC-style account → campaign browser) ── */
.aide .mcc-root{--mcc-accent:var(--blue);position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--bg);}
.aide .mcc-root.meta{--mcc-accent:#7f8cff;}
.aide .mcc-head{height:58px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 16px;border-bottom:1px solid var(--line);background:var(--panel);flex-shrink:0;}
.aide .mcc-heading{display:flex;align-items:center;gap:10px;min-width:0;}
.aide .mcc-logo{width:30px;height:30px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px;background:var(--panel2);font-size:15px;}
.aide .mcc-heading h3{font-size:14px;line-height:1.2;margin:0;color:var(--txt);}
.aide .mcc-heading p{font-size:10.5px;margin:3px 0 0;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.aide .mcc-actions{display:flex;align-items:center;gap:7px;flex-shrink:0;}
.aide .mcc-range{display:flex;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--panel2);}
.aide .mcc-range button{height:25px;border:0;border-right:1px solid var(--line);background:transparent;color:var(--faint);font:inherit;font-size:10px;padding:0 9px;cursor:pointer;}
.aide .mcc-range button:last-child{border-right:0;}
.aide .mcc-range button:hover{color:var(--txt);}
.aide .mcc-range button.on{color:var(--txt);background:var(--bg);box-shadow:inset 0 -2px 0 var(--mcc-accent);}
.aide .mcc-refresh{width:28px;height:27px;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--dim);font:inherit;cursor:pointer;}
.aide .mcc-refresh:hover:not(:disabled){color:var(--txt);border-color:var(--dim);}
.aide .mcc-refresh:disabled{opacity:.6;}
.aide .mcc-kpis{min-height:61px;display:grid;grid-template-columns:repeat(7,minmax(100px,1fr));border-bottom:1px solid var(--line);background:var(--bg);flex-shrink:0;overflow-x:auto;}
.aide .mcc-kpis>div{display:flex;flex-direction:column;justify-content:center;padding:7px 13px;border-right:1px solid var(--line);white-space:nowrap;}
.aide .mcc-kpis>div:last-child{border-right:0;}
.aide .mcc-kpis span{color:var(--faint);font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;}
.aide .mcc-kpis b{color:var(--txt);font-size:13px;margin-top:2px;font-variant-numeric:tabular-nums;}
.aide .mcc-kpis b.good{color:var(--green);}
.aide .mcc-kpis small{color:var(--faint);font-size:8.5px;}
.aide .mcc-alert{min-height:29px;display:flex;align-items:center;padding:4px 14px;border-bottom:1px solid var(--line);font-size:10px;flex-shrink:0;}
.aide .mcc-alert.err{color:var(--red);background:rgba(244,116,127,.07);}
.aide .mcc-alert.warn{color:var(--amber);background:rgba(232,180,90,.07);}
.aide .mcc-alert.info{color:var(--dim);background:rgba(110,168,254,.05);}
.aide .mcc-body{flex:1;display:flex;min-height:0;overflow:hidden;}
.aide .mcc-accounts{width:300px;display:flex;flex-direction:column;min-height:0;flex-shrink:0;background:var(--panel);border-right:1px solid var(--line);}
.aide .mcc-accounts-head{height:32px;display:flex;align-items:center;justify-content:space-between;padding:0 11px;color:var(--faint);font-size:9px;font-weight:800;letter-spacing:.07em;}
.aide .mcc-accounts-head b{font-size:9px;font-variant-numeric:tabular-nums;}
.aide .mcc-search{height:29px;box-sizing:border-box;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--txt);font:inherit;font-size:10.5px;padding:0 9px;outline:none;}
.aide .mcc-search:focus{border-color:var(--mcc-accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--mcc-accent) 20%,transparent);}
.aide .mcc-accounts>.mcc-search{margin:0 8px 8px;flex-shrink:0;}
.aide .mcc-account-list{flex:1;min-height:0;overflow-y:auto;padding:0 6px 8px;}
.aide .mcc-account{width:100%;min-height:51px;display:flex;align-items:center;gap:8px;padding:6px 7px;border:0;border-left:2px solid transparent;border-radius:5px;background:transparent;color:var(--dim);font:inherit;text-align:left;cursor:pointer;}
.aide .mcc-account:hover{background:rgba(255,255,255,.035);}
.aide .mcc-account.on{background:color-mix(in srgb,var(--mcc-accent) 10%,transparent);border-left-color:var(--mcc-accent);color:var(--txt);}
.aide .mcc-conn{width:7px;height:7px;border-radius:50%;background:var(--faint);flex-shrink:0;}
.aide .mcc-conn.ok{background:var(--green);box-shadow:0 0 7px rgba(63,214,143,.5);}
.aide .mcc-account-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.aide .mcc-account-copy b{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .mcc-account-copy small{font-size:9px;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .mcc-account-spend{font-size:10px;font-weight:700;color:var(--dim);font-variant-numeric:tabular-nums;flex-shrink:0;}
.aide .mcc-account.on .mcc-account-spend{color:var(--txt);}
.aide .mcc-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
.aide .mcc-account-head{min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 14px;border-bottom:1px solid var(--line);flex-shrink:0;}
.aide .mcc-path{display:flex;align-items:center;gap:7px;font-size:11px;}
.aide .mcc-path span,.aide .mcc-path b{color:var(--faint);font-weight:400;}
.aide .mcc-path strong{color:var(--txt);font-size:12px;}
.aide .mcc-account-head p{margin:3px 0 0;color:var(--faint);font-size:9.5px;}
.aide .mcc-open-client,.aide .mcc-detail-open{border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--dim);font-size:10px;text-decoration:none;padding:5px 9px;white-space:nowrap;}
.aide .mcc-open-client:hover,.aide .mcc-detail-open:hover{color:var(--txt);border-color:var(--mcc-accent);}
.aide .mcc-campaign-tools{height:45px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 14px;border-bottom:1px solid var(--line);flex-shrink:0;}
.aide .mcc-campaign-tools>div{display:flex;align-items:baseline;gap:8px;}
.aide .mcc-campaign-tools b{font-size:11.5px;}
.aide .mcc-campaign-tools span{font-size:9.5px;color:var(--faint);}
.aide .mcc-campaign-tools .mcc-search{width:220px;}
.aide .mcc-campaign-area{flex:1;min-height:0;display:flex;overflow:hidden;}
.aide .mcc-grid-scroll{flex:1;min-width:0;min-height:0;overflow:auto;}
.aide .mcc-grid{width:max-content;min-width:100%;border-collapse:collapse;font-size:10px;}
.aide .mcc-grid th{position:sticky;top:0;z-index:3;height:27px;padding:0 9px;background:var(--panel2);border-bottom:1px solid var(--line);color:var(--faint);font-size:8.5px;font-weight:800;letter-spacing:.04em;text-align:left;white-space:nowrap;}
.aide .mcc-grid td{height:34px;padding:3px 9px;border-bottom:1px solid rgba(255,255,255,.035);color:var(--dim);white-space:nowrap;font-variant-numeric:tabular-nums;}
.aide .mcc-grid th:first-child,.aide .mcc-grid td:first-child{position:sticky;left:0;z-index:2;background:var(--bg);min-width:220px;max-width:300px;}
.aide .mcc-grid th:first-child{z-index:4;background:var(--panel2);}
.aide .mcc-grid tbody tr{cursor:pointer;}
.aide .mcc-grid tbody tr:hover td{background:rgba(255,255,255,.025);color:var(--txt);}
.aide .mcc-grid tbody tr:hover td:first-child{background:var(--panel2);}
.aide .mcc-grid tbody tr.on td{background:color-mix(in srgb,var(--mcc-accent) 7%,transparent);color:var(--txt);}
.aide .mcc-grid tbody tr.on td:first-child{box-shadow:inset 2px 0 0 var(--mcc-accent);background:color-mix(in srgb,var(--mcc-accent) 10%,var(--bg));}
.aide .mcc-grid td:first-child b{display:block;max-width:270px;overflow:hidden;text-overflow:ellipsis;color:var(--txt);}
.aide .mcc-grid td:first-child small{display:block;max-width:270px;overflow:hidden;text-overflow:ellipsis;color:var(--faint);font-size:8.5px;}
.aide .mcc-grid td.num{text-align:right;color:var(--txt);}
.aide .mcc-grid td.good{color:var(--green);}.aide .mcc-grid td.bad{color:var(--red);}
.aide .mcc-status{display:inline-block;border-radius:99px;padding:1px 6px;font-size:8.5px;font-weight:800;}
.aide .mcc-status.live{color:var(--green);background:rgba(63,214,143,.12);}
.aide .mcc-status.paused{color:var(--amber);background:rgba(232,180,90,.12);}
.aide .mcc-status.stale,.aide .mcc-status.off{color:var(--faint);background:rgba(255,255,255,.05);}
.aide .mcc-detail{width:300px;min-height:0;overflow-y:auto;flex-shrink:0;padding:0 14px 14px;background:var(--panel);border-left:1px solid var(--line);box-shadow:-12px 0 30px rgba(0,0,0,.16);}
.aide .mcc-detail-head{height:34px;display:flex;align-items:center;justify-content:space-between;color:var(--faint);font-size:8.5px;font-weight:800;letter-spacing:.07em;}
.aide .mcc-detail-head button{border:0;background:none;color:var(--faint);font:inherit;font-size:16px;cursor:pointer;}
.aide .mcc-detail-head button:hover{color:var(--txt);}
.aide .mcc-detail h4{font-size:12px;line-height:1.35;margin:3px 0;color:var(--txt);}
.aide .mcc-detail-id{margin:0;color:var(--faint);font-size:9px;word-break:break-all;}
.aide .mcc-detail-state{display:flex;align-items:center;gap:7px;margin:10px 0;}
.aide .mcc-detail-state>span:last-child{color:var(--dim);font-size:9.5px;}
.aide .mcc-detail-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:7px;overflow:hidden;}
.aide .mcc-detail-grid>div{display:flex;flex-direction:column;padding:7px 8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);}
.aide .mcc-detail-grid>div:nth-child(2n){border-right:0;}
.aide .mcc-detail-grid>div:nth-last-child(-n+2){border-bottom:0;}
.aide .mcc-detail-grid span{color:var(--faint);font-size:8px;text-transform:uppercase;letter-spacing:.04em;}
.aide .mcc-detail-grid b{color:var(--txt);font-size:11px;margin-top:2px;font-variant-numeric:tabular-nums;}
.aide .mcc-detail-note{margin:10px 0;color:var(--faint);font-size:9px;line-height:1.5;}
.aide .mcc-detail-open{display:block;text-align:center;}
.aide .mcc-empty{padding:14px;color:var(--faint);font-size:10.5px;}
.aide .mcc-empty.main{padding:24px;}

/* ── Schema view (ERD canvas + live data) — prefixed .sv-* so it never
      collides with the agency IDE's own classes ── */
.aide .sv-root{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--bg);overflow:hidden;}
.aide .sv-toolbar{display:flex;align-items:center;gap:14px;height:32px;flex-shrink:0;padding:0 12px;background:var(--panel);border-bottom:1px solid var(--line);font-size:11px;overflow-x:auto;white-space:nowrap;}
.aide .sv-title{font-weight:800;color:var(--txt);}
.aide .sv-meta{color:var(--faint);}
.aide .sv-mode{display:flex;align-items:center;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--panel2);flex-shrink:0;}
.aide .sv-mode button{height:23px;border:0;border-right:1px solid var(--line);background:transparent;color:var(--faint);font:inherit;font-size:10.5px;padding:0 9px;cursor:pointer;}
.aide .sv-mode button:last-child{border-right:0;}
.aide .sv-mode button:hover{color:var(--txt);background:rgba(255,255,255,.035);}
.aide .sv-mode button.on{color:var(--txt);background:var(--bg);box-shadow:inset 0 -2px 0 var(--blue);}
.aide .sv-readonly{margin-left:auto;color:var(--faint);}
.aide .sv-legend-inline{display:flex;align-items:center;gap:14px;color:var(--faint);}
.aide .sv-lg{display:flex;align-items:center;gap:5px;}
.aide .sv-lg b{color:var(--blue);}
.aide .sv-lg-pk{font-size:9px;font-weight:800;color:var(--amber);background:rgba(232,180,90,.14);border-radius:4px;padding:1px 5px;box-shadow:0 0 8px rgba(232,180,90,.4);}
.aide .sv-lg-fk{font-size:9px;font-weight:800;color:var(--blue);background:rgba(110,168,254,.14);border-radius:4px;padding:1px 5px;}
.aide .sv-tools{margin-left:auto;display:flex;align-items:center;gap:4px;}
.aide .sv-tools button{width:24px;height:22px;border:1px solid var(--line);background:var(--panel2);color:var(--dim);border-radius:5px;font:inherit;font-size:12px;cursor:pointer;}
.aide .sv-tools button:hover{color:var(--txt);border-color:var(--dim);}
.aide .sv-zoom{color:var(--faint);font-variant-numeric:tabular-nums;min-width:38px;text-align:right;}

/* Tables is the default agency-schema surface. It mirrors the client Mission
   browser while grouping the larger agency schema into bounded domains. */
.aide .sv-browser{flex:1;display:flex;min-height:0;overflow:hidden;}
.aide .sv-browser-rail{width:286px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;background:var(--panel);border-right:1px solid var(--line);}
.aide .sv-br-head{height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;color:var(--faint);font-size:9.5px;font-weight:800;letter-spacing:.07em;flex-shrink:0;}
.aide .sv-br-controls{display:grid;grid-template-columns:minmax(0,1fr) 106px;gap:6px;padding:0 9px 9px;flex-shrink:0;}
.aide .sv-br-controls input,.aide .sv-br-controls select{min-width:0;height:28px;box-sizing:border-box;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:10.5px;padding:0 8px;outline:none;}
.aide .sv-br-controls input:focus,.aide .sv-br-controls select:focus{border-color:var(--blue);box-shadow:0 0 0 1px rgba(110,168,254,.18);}
.aide .sv-br-controls select{color:var(--dim);cursor:pointer;padding-right:2px;}
.aide .sv-br-list{flex:1;min-height:0;overflow-y:auto;padding:0 7px 10px;}
.aide .sv-br-group{margin-bottom:8px;}
.aide .sv-br-group-h{position:sticky;top:0;z-index:1;height:24px;display:flex;align-items:center;gap:7px;padding:0 6px;background:var(--panel);color:var(--faint);font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;}
.aide .sv-br-group-h span:last-child{margin-left:auto;font-variant-numeric:tabular-nums;}
.aide .sv-br-dot,.aide .sv-table-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;box-shadow:0 0 7px currentColor;}
.aide .sv-br-table{width:100%;height:27px;display:flex;align-items:center;gap:8px;padding:0 7px;border:0;border-left:2px solid transparent;border-radius:4px;background:transparent;color:var(--dim);font:inherit;font-size:11px;text-align:left;cursor:pointer;}
.aide .sv-br-table:hover{background:rgba(255,255,255,.035);color:var(--txt);}
.aide .sv-br-table.on{background:rgba(110,168,254,.09);border-left-color:var(--blue);color:var(--txt);}
.aide .sv-br-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .sv-br-count{color:var(--faint);font-size:9.5px;font-variant-numeric:tabular-nums;}
.aide .sv-br-msg{padding:12px 8px;color:var(--faint);font-size:11px;line-height:1.5;}
.aide .sv-br-msg.err{color:var(--red);}
.aide .sv-br-note{flex-shrink:0;padding:8px 11px;border-top:1px solid var(--line);color:var(--faint);font-size:9.5px;line-height:1.4;}
.aide .sv-browser-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);}
.aide .sv-table-head{min-height:62px;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--line);flex-shrink:0;}
.aide .sv-table-identity{min-width:0;display:flex;flex-direction:column;gap:3px;}
.aide .sv-table-identity>div{display:flex;align-items:center;gap:8px;min-width:0;}
.aide .sv-table-identity b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .sv-table-identity>span{color:var(--faint);font-size:10.5px;}
.aide .sv-table-btn{background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--dim);font:inherit;font-size:10.5px;padding:5px 9px;cursor:pointer;white-space:nowrap;}
.aide .sv-table-btn:hover:not(:disabled){color:var(--txt);border-color:var(--dim);}
.aide .sv-table-btn:disabled{opacity:.5;cursor:default;}
.aide .sv-table-btn span{color:var(--faint);}
.aide .sv-colpick{position:relative;margin-left:auto;flex-shrink:0;}
.aide .sv-colmenu{position:absolute;right:0;top:calc(100% + 5px);z-index:50;width:280px;max-height:360px;overflow-y:auto;padding:6px;background:var(--popup);border:1px solid var(--line2);border-radius:9px;box-shadow:0 16px 44px rgba(0,0,0,.55);}
.aide .sv-colmenu-top{display:flex;gap:6px;padding:2px 4px 6px;margin-bottom:4px;border-bottom:1px solid var(--line);}
.aide .sv-colmenu-top button{background:none;border:1px solid var(--line);border-radius:5px;color:var(--dim);font:inherit;font-size:9.5px;padding:2px 8px;cursor:pointer;}
.aide .sv-colmenu-top button:hover{color:var(--txt);}
.aide .sv-colrow{display:flex;align-items:center;gap:7px;min-height:27px;padding:2px 6px;border-radius:5px;color:var(--txt);font-size:10.5px;cursor:pointer;}
.aide .sv-colrow:hover{background:rgba(255,255,255,.04);}
.aide .sv-colrow input{accent-color:var(--blue);cursor:pointer;}
.aide .sv-colrow span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aide .sv-colrow small{margin-left:auto;color:var(--faint);font-size:9px;white-space:nowrap;}
.aide .sv-colrow em{color:var(--purple);font-size:8.5px;font-style:normal;white-space:nowrap;}
.aide .sv-table-context{padding:8px 16px 0;flex-shrink:0;}
.aide .sv-relations{display:flex;align-items:center;gap:5px;overflow-x:auto;padding-bottom:2px;}
.aide .sv-relations>span{color:var(--faint);font-size:9px;font-weight:800;letter-spacing:.07em;margin-right:2px;}
.aide .sv-relations button{border:1px solid var(--line);border-radius:99px;background:var(--panel2);color:var(--dim);font:inherit;font-size:9.5px;padding:2px 7px;cursor:pointer;white-space:nowrap;}
.aide .sv-relations button:hover{color:var(--blue);border-color:rgba(110,168,254,.35);}
.aide .sv-table-data{flex:1;min-height:0;display:flex;padding:10px 16px 12px;overflow:hidden;}
.aide .sv-table-empty{padding:22px;color:var(--faint);font-size:11.5px;}
.aide .sv-table-empty.err{color:var(--red);}
.aide .sv-table-grid-scroll{flex:1;min-height:0;overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--bg);}
.aide .sv-table-grid{width:max-content;min-width:100%;}
.aide .sv-table-grid th{top:0;height:27px;z-index:2;}
.aide .sv-table-grid td{max-width:360px;height:26px;}
.aide .sv-table-grid th:first-child{position:sticky;left:0;z-index:3;}
.aide .sv-table-grid td:first-child{position:sticky;left:0;z-index:1;background:var(--bg);}
.aide .sv-table-grid tr:hover td:first-child{background:var(--panel2);}
.aide .sv-th-key{display:inline-block;margin-left:5px;border-radius:3px;padding:0 4px;font-size:8px;font-weight:800;}
.aide .sv-th-key.pk{color:var(--amber);background:rgba(232,180,90,.14);}
.aide .sv-th-key.fk{color:var(--blue);background:rgba(110,168,254,.14);}
.aide .sv-table-foot{height:38px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;border-top:1px solid var(--line);color:var(--faint);font-size:10.5px;flex-shrink:0;}

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
