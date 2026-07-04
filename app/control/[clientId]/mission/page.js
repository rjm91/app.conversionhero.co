'use client'

// Mission Control (v1, feature branch) — the agent-native ecom view.
// Real data (same queries + BOM math as the dashboard), rule-based Watcher
// findings, and a Claude-backed ask bar with session context.
// Approvals write to a LOCAL ledger only — nothing touches ad platforms yet.

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchMissionData, computeMission, askContext, rangeDays } from '../../../../lib/mission/data'
import { buildFindings } from '../../../../lib/mission/watchers'

const fmt$ = (n) => '$' + Math.round(n || 0).toLocaleString()
const CHANNEL_COLORS = { Meta: '#0866FF', Google: '#e8eaf2', Direct: '#fb7185', Klaviyo: '#f8a5a5', Shop: '#5a31f4' }

const RANGES = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']]

export default function MissionPage() {
  const { clientId } = useParams()
  const [rangeN, setRangeN] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Local-only ledger + taught policies (v1: localStorage; DB table later)
  const [ledger, setLedger] = useState([])
  const [policies, setPolicies] = useState([])
  const [resolved, setResolved] = useState({}) // finding id -> 'approved' | 'dismissed'
  const lsKey = (k) => `mission_${k}_${clientId}`
  useEffect(() => {
    try {
      setLedger(JSON.parse(localStorage.getItem(lsKey('ledger')) || '[]'))
      setPolicies(JSON.parse(localStorage.getItem(lsKey('policies')) || '[]'))
    } catch { /* fresh start */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])
  const saveLedger = (rows) => { setLedger(rows); localStorage.setItem(lsKey('ledger'), JSON.stringify(rows)) }
  const savePolicies = (rows) => { setPolicies(rows); localStorage.setItem(lsKey('policies'), JSON.stringify(rows)) }

  const range = useMemo(() => rangeDays(rangeN), [rangeN])
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchMissionData(clientId, range.start, range.end)
      .then(d => { if (alive) { setData(d); setLoading(false) } })
      .catch(e => { console.error('[mission]', e); if (alive) setLoading(false) })
    return () => { alive = false }
  }, [clientId, range.start, range.end])

  const m = useMemo(() => data ? computeMission(data) : null, [data])
  const findings = useMemo(() => {
    if (!m) return []
    const dismissedIds = new Set(policies.map(p => p.findingId))
    return buildFindings(m).filter(f => !dismissedIds.has(f.id))
  }, [m, policies])
  const openFindings = findings.filter(f => !resolved[f.id])

  function approve(f) {
    setResolved(r => ({ ...r, [f.id]: 'approved' }))
    saveLedger([{ when: new Date().toISOString(), what: f.action.ledger, impact: Math.round(f.impactMonthly), status: 'approved — logged only (no platform write in v1)' }, ...ledger])
  }
  function dismiss(f, reason) {
    setResolved(r => ({ ...r, [f.id]: 'dismissed' }))
    savePolicies([{ findingId: f.id, reason: reason || 'no reason given', when: new Date().toISOString() }, ...policies])
  }

  return (
    <div className="p-8 text-white" style={{ background: '#0a0d1c', minHeight: '100vh', margin: '-2rem', padding: '2rem' }}>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <span className="inline-block text-[10px] font-bold text-[#34CC93] bg-[#34CC93]/12 rounded px-2 py-0.5 mb-1.5">ECOM · MISSION CONTROL (BETA)</span>
          <h1 className="text-2xl font-bold">{data?.clientName || clientId} · Mission Control</h1>
          <p className="text-sm text-gray-400 mt-0.5">Real data, drafted actions, grounded answers. Approvals log locally — no platform writes yet.</p>
        </div>
        <select value={rangeN} onChange={e => setRangeN(Number(e.target.value))}
          className="border border-white/10 rounded-lg px-3 py-1.5 text-sm font-medium bg-[#171B33] text-gray-100 outline-none cursor-pointer">
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading || !m ? (
        <p className="text-sm text-gray-400 py-20 text-center">Watcher is reading {rangeN} days of orders, campaigns, and BOM costs…</p>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            {[
              ['Gross Revenue', fmt$(m.revenue), null],
              ['COGS (BOM)', m.hasCogs ? fmt$(m.cogs) : '—', 'text-amber-400'],
              ['Ad Spend', fmt$(m.adSpend), 'text-amber-400'],
              ['Net Profit', m.hasCogs ? fmt$(m.netProfit) : '—', m.netProfit >= 0 ? 'text-[#34CC93]' : 'text-rose-400'],
              ['True ROAS', m.trueRoas != null && m.hasCogs ? m.trueRoas.toFixed(2) + 'x' : '—', 'text-[#34CC93]'],
              ['Orders', String(m.orders), null],
            ].map(([l, v, cls]) => (
              <div key={l} className="bg-[#111528] border border-white/[0.06] rounded-xl px-4 py-3.5 relative">
                <span className="absolute top-2.5 right-3 w-1.5 h-1.5 rounded-full bg-[#34CC93]" title="watched" />
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{l}</p>
                <p className={`text-xl font-extrabold mt-0.5 ${cls || ''}`}>{v}</p>
              </div>
            ))}
          </div>

          <AskBar clientName={data.clientName} m={m} range={range} />

          <div className="grid lg:grid-cols-[1.7fr_1fr] gap-5 items-start">
            <div className="space-y-5">
              {/* Action Queue */}
              <section className="bg-[#111528] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.06]">
                  <h2 className="text-sm font-extrabold">⚡ Action Queue</h2>
                  <span className="text-[11px] text-gray-500">{openFindings.length} drafted by the watcher · margin floor {m.hasCogs ? (m.margin * 100).toFixed(1) + '%' : 'n/a'} enforced</span>
                </div>
                {findings.length === 0 && (
                  <p className="px-5 py-6 text-sm text-gray-400">Nothing needs you — every live campaign clears breakeven and the channels look healthy. The watcher re-checks when you change the range.</p>
                )}
                {findings.map(f => (
                  <Finding key={f.id} f={f} state={resolved[f.id]} onApprove={() => approve(f)} onDismiss={(reason) => dismiss(f, reason)} />
                ))}
              </section>

              {/* Channel pulse */}
              <section className="bg-[#111528] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-white/[0.06]"><h2 className="text-sm font-extrabold">📡 Channel Pulse</h2></div>
                {m.byChannel.map(c => {
                  const max = m.byChannel[0]?.revenue || 1
                  return (
                    <div key={c.name} className="flex items-center gap-3 px-5 py-2.5 border-b border-white/[0.04] last:border-0">
                      <span className="w-20 text-xs font-bold">{c.name}</span>
                      <div className="flex-1 h-2 rounded bg-[#171B33] overflow-hidden">
                        <i className="block h-full rounded" style={{ width: `${(c.revenue / max) * 100}%`, background: CHANNEL_COLORS[c.name] || '#7a8bb5' }} />
                      </div>
                      <span className="w-20 text-right text-xs font-bold">{fmt$(c.revenue)}</span>
                      <span className="w-28 text-right text-[11px] text-gray-500">{c.orders} orders{m.hasCogs ? ` · ${fmt$(c.revenue - c.cogs)} margin` : ''}</span>
                    </div>
                  )
                })}
              </section>
            </div>

            <div className="space-y-5">
              {/* Campaign board */}
              <section className="bg-[#111528] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-white/[0.06]"><h2 className="text-sm font-extrabold">🎯 True ROAS per campaign</h2></div>
                {m.campaigns.filter(c => c.spend > 0).map(c => (
                  <div key={c.platform + c.campaign_id} className="px-5 py-2.5 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold truncate flex-1">{c.campaign_name}</span>
                      <span className={`text-xs font-extrabold ${c.trueRoas == null ? 'text-gray-500' : c.trueRoas >= 1 ? 'text-[#34CC93]' : 'text-rose-400'}`}>
                        {c.trueRoas != null ? c.trueRoas.toFixed(2) + 'x' : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10.5px] text-gray-500 mt-0.5">
                      <span>{c.platform}</span><span>·</span><span>{fmt$(c.spend)} spend</span><span>·</span><span>{c.chOrders} orders</span>
                      {c.stale && <span className="text-amber-400 font-bold">· stale</span>}
                      {!c.stale && c.status !== 'ENABLED' && <span>· paused</span>}
                    </div>
                  </div>
                ))}
              </section>

              {/* Ledger */}
              <section className="bg-[#111528] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-white/[0.06]">
                  <h2 className="text-sm font-extrabold">🧾 Decision Ledger</h2>
                  <p className="text-[10.5px] text-gray-500 mt-0.5">local log in v1 — impact measurement comes with the DB table</p>
                </div>
                {ledger.length === 0 && <p className="px-5 py-5 text-sm text-gray-500">No decisions yet.</p>}
                {ledger.slice(0, 12).map((r, i) => (
                  <div key={i} className="px-5 py-2.5 border-b border-white/[0.04] last:border-0 flex gap-2 items-baseline">
                    <span className="text-[10px] text-gray-500 w-16 flex-shrink-0">{new Date(r.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    <span className="text-xs text-gray-300 flex-1">{r.what}</span>
                    {r.impact > 0 && <span className="text-xs font-bold text-[#34CC93]">+{fmt$(r.impact)}/mo est.</span>}
                  </div>
                ))}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Action Queue card ─────────────────────────────────────── */
function Finding({ f, state, onApprove, onDismiss }) {
  const [teaching, setTeaching] = useState(false)
  const [reason, setReason] = useState('')
  return (
    <div className={`px-5 py-4 border-b border-white/[0.06] last:border-0 flex gap-3.5 transition ${state ? 'opacity-50' : ''}`}>
      <span className="text-lg mt-0.5">{f.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[13px] font-bold">{f.title}</h3>
          {!state && <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${f.severity === 'high' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>{f.severity === 'high' ? 'NEEDS YOU' : 'REVIEW'}</span>}
          {state === 'approved' && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#34CC93]/10 text-[#34CC93]">LOGGED</span>}
          {state === 'dismissed' && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/10 text-gray-400">TAUGHT</span>}
        </div>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{f.why}</p>
        <div className="flex gap-3 mt-1.5 text-[10.5px] text-gray-500 flex-wrap">
          {f.impactMonthly > 0 && <span className="text-[#34CC93] font-bold">~{fmt$(f.impactMonthly)}/mo</span>}
          <span className="text-indigo-400">confidence {f.confidence}</span>
          {f.evidence.map((e, i) => <span key={i}>· {e}</span>)}
        </div>
        {!state && !teaching && (
          <div className="flex gap-2 mt-2.5">
            <button onClick={onApprove} className="text-xs font-bold px-3.5 py-1.5 rounded-lg bg-[#34CC93] text-[#062b1e] hover:brightness-110">Approve (logs only)</button>
            <button onClick={() => setTeaching(true)} className="text-xs font-bold px-3.5 py-1.5 rounded-lg text-gray-400 hover:bg-white/[0.06]">Dismiss + teach</button>
          </div>
        )}
        {teaching && (
          <div className="flex gap-2 mt-2.5">
            <input autoFocus value={reason} onChange={e => setReason(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onDismiss(reason) }}
              placeholder="Why is this wrong? Becomes a standing rule — this finding won't re-surface."
              className="flex-1 bg-[#171B33] border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
            <button onClick={() => onDismiss(reason)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/[0.08]">Save</button>
          </div>
        )}
      </div>
    </div>
  )
}

const fmtMoneyLocal = fmt$

/* ── Ask bar: real Claude, session thread, grounded in page data ── */
function AskBar({ clientName, m, range }) {
  const [q, setQ] = useState('')
  const [thread, setThread] = useState([]) // {q, a, pending, error}
  const [busy, setBusy] = useState(false)
  const histRef = useRef([])

  const suggestions = [
    'Why is True ROAS where it is — what would you change?',
    'Compare my campaigns on profit per order',
    'Which channel deserves more budget?',
  ]

  const ask = useCallback(async (question) => {
    if (!question.trim() || busy) return
    setBusy(true); setQ('')
    setThread(t => [...t, { q: question, a: '', pending: true }])
    try {
      const res = await fetch('/api/mission/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: askContext(clientName, m, range),
          history: histRef.current,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'ask failed')
      histRef.current = [...histRef.current, { q: question, a: json.answer }].slice(-6)
      setThread(t => t.map((turn, i) => i === t.length - 1 ? { ...turn, a: json.answer, pending: false } : turn))
    } catch (e) {
      setThread(t => t.map((turn, i) => i === t.length - 1 ? { ...turn, a: '', error: e.message, pending: false } : turn))
    } finally { setBusy(false) }
  }, [busy, clientName, m, range])

  return (
    <div className="mb-5">
      <div className="flex gap-2.5 items-center bg-[#111528] border border-white/[0.06] rounded-2xl px-4 py-3 focus-within:border-blue-500/40 transition">
        <span className="w-8 h-8 rounded-lg grid place-items-center text-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg,#059669,#3b82f6)' }}>✦</span>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(q) }}
          placeholder={thread.length ? 'Ask a follow-up — context carries across turns…' : `Ask anything about ${clientName} — answers use exactly the numbers on this page…`}
          className="flex-1 bg-transparent outline-none text-sm" />
        <button onClick={() => ask(q)} disabled={busy}
          className="text-xs font-extrabold px-4 py-2 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 disabled:opacity-40">ASK</button>
      </div>
      {thread.length === 0 && (
        <div className="flex gap-2 mt-2.5 flex-wrap">
          {suggestions.map(s => (
            <button key={s} onClick={() => ask(s)} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-full bg-[#171B33] border border-white/[0.06] text-gray-400 hover:text-white hover:bg-blue-500/10 disabled:opacity-40">{s}</button>
          ))}
        </div>
      )}
      {thread.map((t, i) => (
        <div key={i} className="mt-3">
          <div className="flex gap-2.5 items-baseline text-[13px] font-semibold bg-[#171B33] border border-white/[0.06] border-b-0 rounded-t-xl px-4 py-2">
            <span className="text-[#34CC93] font-extrabold font-mono">❯</span>
            <span className="flex-1">{t.q}</span>
            <span className="text-[9px] font-extrabold uppercase tracking-wide text-gray-500">you</span>
          </div>
          <div className="bg-blue-500/[0.04] border border-blue-500/[0.18] rounded-b-xl px-4 py-3.5">
            {t.pending && (
              <p className="text-xs text-gray-400 flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                reading {m.orders} orders · {m.campaigns.length} campaigns · BOM margins…
              </p>
            )}
            {t.error && <p className="text-xs text-rose-400">Error: {t.error}</p>}
            {t.a && <p className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">{t.a}</p>}
          </div>
        </div>
      ))}
      {thread.length > 0 && (
        <button onClick={() => { setThread([]); histRef.current = [] }} className="mt-2 text-[11px] text-gray-500 underline hover:text-gray-300">clear session</button>
      )}
    </div>
  )
}
