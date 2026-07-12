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
  { section: 'FLEET', items: [{ id: 'fleet', icon: '🛰', label: 'Fleet' }] },
  { section: 'SALES', items: [
    { id: 'leads', icon: '🧲', label: 'Leads / Pipeline' },
    { id: 'agreements', icon: '📄', label: 'Agreements' },
  ] },
]
const VIEW_TITLES = { fleet: 'Fleet', leads: 'Leads / Pipeline', agreements: 'Agreements' }

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
  const [tabs, setTabs] = useState(['fleet'])
  const [activeTab, setActiveTab] = useState('fleet')
  const [turns, setTurns] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [sideOpen, setSideOpen] = useState(true)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)

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
      <div className="aide-body">
        {/* Explorer */}
        {sideOpen && <aside className="ex">
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
        </aside>}

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
            <div className="panel">
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
                    placeholder={busy ? 'thinking…' : 'ask about the fleet · or “draft a Growth agreement for Acme Co, monthly”'}
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

const CSS = `
.aide{--bg:#0b0e14;--panel:#12161f;--panel2:#161b28;--line:rgba(255,255,255,.08);--txt:#dbe1ee;--dim:#8a93a8;--faint:#5a6377;--blue:#6ea8fe;--green:#3fd68f;--amber:#f2b45c;--red:#ff6b6b;
  position:fixed;inset:var(--mt-top,36px) 0 0 0;background:var(--bg);color:var(--txt);font-family:"SF Mono",ui-monospace,Menlo,Consolas,monospace;font-size:13px;display:flex;flex-direction:column;overflow:hidden;}
.aide-body{flex:1;display:flex;min-height:0;}
.aide .ex{width:230px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;padding-bottom:20px;}
.aide .ex-top{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);}
.aide .ex-brand{font-weight:800;font-size:12.5px;}
.aide .ex-badge{font-size:8.5px;font-weight:800;letter-spacing:.06em;background:rgba(110,168,254,.15);color:var(--blue);padding:2px 6px;border-radius:4px;}
.aide .ex-sec{margin-top:12px;}
.aide .ex-h{font-size:9.5px;font-weight:800;letter-spacing:.08em;color:var(--faint);padding:2px 14px;margin-bottom:2px;}
.aide .ex-item{width:100%;display:flex;align-items:center;gap:9px;padding:5px 14px;background:none;border:none;color:var(--dim);font:inherit;font-size:12.5px;cursor:pointer;text-align:left;}
.aide .ex-item:hover{background:rgba(255,255,255,.03);color:var(--txt);}
.aide .ex-item.on{background:rgba(110,168,254,.1);color:var(--txt);}
.aide .ex-ic{width:16px;text-align:center;}
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
.aide .panel{height:38%;min-height:150px;display:flex;flex-direction:column;border-top:1px solid var(--line);background:var(--bg);flex-shrink:0;}
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
`
