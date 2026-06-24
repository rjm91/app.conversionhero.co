'use client'

/*
 * Agency-level Revenue Channels — accordion UI mirroring the client
 * EcomControlCenter look.
 *
 * WIRED to real agency data via GET /api/agency/revenue-channels:
 *   • Overview / Blended / Blaztr ← agency_leads (real pipeline: leads → appts
 *     → clients → MRR), aggregated by meta.source. Blaztr top-of-funnel
 *     (sent / replied) comes best-effort from the Blaztr API.
 *   • Google Ads / Meta Ads ← not running yet (empty state) until launched.
 *
 * Still placeholder: per-channel trend chart (no time series yet) and
 * Blaztr spend / CAC (cold-email cost isn't tracked in the DB) → shown as "—".
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ─── formatting ─── */
const fmt$ = (n) => '$' + Math.round(n || 0).toLocaleString()
const fmtNum = (n) => Math.round(n || 0).toLocaleString()
const fmtPct = (x) => `${(100 * (x || 0)).toFixed(1)}%`
const ratio = (a, b) => (b ? a / b : 0)

/* ─── ⓘ tooltip ─── */
function InfoTip({ text }) {
  const [pos, setPos] = useState(null)
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(r.left + r.width / 2, 120), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 120)
    setPos({ x, y: r.bottom + 6 })
  }
  const hide = () => setPos(null)
  return (
    <span tabIndex={0} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={(e) => e.stopPropagation()}
      className="inline-flex align-middle ml-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 cursor-help outline-none">
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
      </svg>
      {pos && (
        <span style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateX(-50%)', zIndex: 60 }}
          className="pointer-events-none w-56 rounded-lg bg-gray-900 dark:bg-black/95 text-white text-[11px] font-normal normal-case tracking-normal leading-snug px-3 py-2 shadow-xl ring-1 ring-white/10">
          {text}
        </span>
      )}
    </span>
  )
}

/* ─── one accordion section ─── */
function Section({ id, icon, name, count, kpis = [], open, onToggle, children }) {
  return (
    <div className="border border-gray-100 dark:border-white/[0.06] rounded-xl mb-3 bg-white dark:bg-[#111528] overflow-hidden">
      <div onClick={() => onToggle(id)} className="flex items-center gap-3.5 px-4 py-4 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-[#161b30] transition">
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        {icon}
        <div className="min-w-0">
          <span className="text-[15px] font-bold text-gray-900 dark:text-white">{name}</span>
          {count != null && <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{count}</span>}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-6 flex-shrink-0">
          {kpis.map((k, i) => (
            <div key={i} className="text-right hidden sm:block">
              <div className={`text-base font-bold leading-tight ${k.ch ? 'text-[#34CC93]' : 'text-gray-900 dark:text-white'}`}>{k.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-0.5">{k.label}{k.info && <InfoTip text={k.info} />}</div>
            </div>
          ))}
        </div>
      </div>
      {open && <div className="border-t border-gray-100 dark:border-white/[0.06]">{children}</div>}
    </div>
  )
}

/* ─── placeholder trend chart (time series not wired yet) ─── */
function ChartPlaceholder() {
  return (
    <div className="px-5 pt-5">
      <div className="relative h-40 rounded-lg bg-gray-50 dark:bg-[#0d1020] border border-gray-100 dark:border-white/[0.04] overflow-hidden">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 160">
          <defs>
            <linearGradient id="arcFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#01D2FB" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#01D2FB" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 120 C 60 90, 90 130, 140 95 S 250 60, 300 80 S 370 40, 400 55 L 400 160 L 0 160 Z" fill="url(#arcFade)" />
          <path d="M0 120 C 60 90, 90 130, 140 95 S 250 60, 300 80 S 370 40, 400 55" fill="none" stroke="#01D2FB" strokeWidth="2" opacity="0.55" />
        </svg>
        <span className="absolute top-2 right-3 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 bg-white/70 dark:bg-black/40 rounded px-1.5 py-0.5">Trend · soon</span>
      </div>
    </div>
  )
}

/* ─── a breakdown table ─── */
function ChannelTable({ columns, rows }) {
  return (
    <div className="p-5 overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead className="bg-gray-50 dark:bg-[#0d1020]">
          <tr>
            {columns.map((h, i) => (
              <th key={h} className={`${i === 0 ? 'text-left' : 'text-right'} px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
          {rows.map((r, ri) => (
            <tr key={ri} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              {r.map((c, ci) => (
                <td key={ci} className={`${ci === 0 ? 'text-left font-medium text-gray-800 dark:text-gray-200' : 'text-right text-gray-600 dark:text-gray-300'} px-4 py-2.5`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─── empty state for a channel that isn't live yet ─── */
function NotRunning({ name }) {
  return (
    <div className="p-8 flex flex-col items-center text-center gap-1.5">
      <div className="w-9 h-9 rounded-full grid place-items-center bg-gray-100 dark:bg-white/[0.06] text-gray-400 mb-1">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
      </div>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{name} isn’t running yet</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs">This channel lights up with live metrics once you launch your first campaign and connect the account.</p>
    </div>
  )
}

/* ─── channel icons ─── */
const channelIcon = {
  overview: <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>∑</div>,
  blended: <div className="w-7 h-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /></svg>
  </div>,
  blaztr: <div className="w-7 h-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #01D2FB, #0193b8)' }}>
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
  </div>,
  google: <div className="w-7 h-7 rounded-lg grid place-items-center bg-white border border-gray-200 text-[#4285F4] text-xs font-extrabold flex-shrink-0">G</div>,
  meta: <div className="w-7 h-7 rounded-lg grid place-items-center bg-[#0866FF] text-white text-sm font-extrabold flex-shrink-0">f</div>,
}

const NOT_RUNNING = [
  { id: 'google_ads', name: 'Google Ads', icon: channelIcon.google },
  { id: 'meta_ads', name: 'Meta Ads', icon: channelIcon.meta },
]
const ZERO = { leads: 0, appts: 0, clients: 0, mrr: 0 }

/* ─────────────────────────────────────────────────────────────────────── */
export default function AgencyRevenueChannels() {
  const [open, setOpen] = useState({ overview: true })
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  useEffect(() => {
    let active = true
    let fetched = false
    const fetchWith = async (token) => {
      if (fetched || !active || !token) return
      fetched = true
      try {
        const res = await fetch('/api/agency/revenue-channels', { headers: { Authorization: `Bearer ${token}` } })
        const j = await res.json()
        if (!active) return
        if (!res.ok) { setErr(j.error || 'Failed to load'); fetched = false; return }
        setErr(null); setData(j)
      } catch (e) { if (active) { setErr(String(e?.message || e)); fetched = false } }
    }
    // Fast path: session already restored.
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.access_token) fetchWith(session.access_token) })
    // Robust path: fires INITIAL_SESSION (and SIGNED_IN) with the restored
    // session once storage is read — avoids the getSession()-on-mount race.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) fetchWith(session.access_token)
      else if (event === 'INITIAL_SESSION' && active && !fetched) setErr('Not signed in')
    })
    return () => { active = false; subscription?.unsubscribe() }
  }, [])

  const t = data?.total || ZERO
  const bz = data?.blaztr || ZERO
  const funnel = data?.blaztrFunnel || null
  const chMax = Math.max(1, bz.mrr)

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Revenue Channels</h2>
        {err
          ? <span className="text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-full px-2 py-0.5">Couldn’t load · {err}</span>
          : !data
            ? <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-400/10 rounded-full px-2 py-0.5 animate-pulse">Loading…</span>
            : <span className="text-[10px] font-bold uppercase tracking-wide text-[#1a9e6e] dark:text-[#34CC93] bg-[#34CC93]/10 rounded-full px-2 py-0.5">Live · Blaztr + pipeline</span>}
      </div>

      {/* Overview */}
      <Section id="overview" icon={channelIcon.overview} name="Overview" count="all channels" open={open.overview} onToggle={toggle}
        kpis={[
          { label: 'MRR Added', value: fmt$(t.mrr), ch: true, info: 'New monthly recurring revenue from clients closed (sale_status = Sold).' },
          { label: 'Clients', value: fmtNum(t.clients) },
          { label: 'Appts', value: fmtNum(t.appts) },
          { label: 'Leads', value: fmtNum(t.leads) },
        ]}>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">MRR by Channel</p>
            {[['Blaztr', bz.mrr, '#01D2FB'], ['Google Ads', 0, '#4285F4'], ['Meta Ads', 0, '#0866FF']].map(([name, val, color]) => (
              <div key={name} className="w-full flex items-center gap-3 py-1.5 px-1 -mx-1">
                <span className="w-24 text-xs text-gray-500 dark:text-gray-400 truncate">{name}</span>
                <div className="flex-1 h-2 rounded bg-gray-100 dark:bg-[#161b30] overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(val / chMax) * 100}%`, background: color }} />
                </div>
                <span className="w-16 text-right text-xs font-semibold text-gray-700 dark:text-gray-200">{fmt$(val)}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Efficiency</p>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'Close Rate', value: fmtPct(ratio(t.clients, t.appts)), info: 'Clients ÷ appointments.' },
                { label: 'Booked Rate', value: fmtPct(ratio(t.appts, t.leads)), info: 'Appointments ÷ leads.' },
                { label: 'Avg Contract', value: t.clients ? fmt$(t.mrr / t.clients) : '—', ch: true, info: 'MRR added ÷ clients closed.' },
                { label: 'Total Leads', value: fmtNum(t.leads) },
              ].map(({ label, value, ch, info }) => (
                <div key={label} className="bg-gray-50 dark:bg-[#161b30] rounded-lg px-3.5 py-3">
                  <div className={`text-xl font-bold ${ch ? 'text-[#34CC93]' : 'text-gray-900 dark:text-white'}`}>{value}</div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{label}{info && <InfoTip text={info} />}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Blended — all channels combined */}
      <Section id="blended" icon={channelIcon.blended} name="Blended" count="all channels" open={open.blended} onToggle={toggle}
        kpis={open.blended ? [] : [
          { label: 'Spend', value: '—', info: 'Acquisition spend not tracked yet (cold-email tooling / ad spend wires in later).' },
          { label: 'Leads', value: fmtNum(t.leads) },
          { label: 'Clients', value: fmtNum(t.clients) },
          { label: 'Cost / Client', value: '—' },
          { label: 'MRR Added', value: fmt$(t.mrr), ch: true },
        ]}>
        <ChartPlaceholder />
        <ChannelTable
          columns={['Channel', 'Spend', 'Leads', 'Clients', 'Cost / Client', 'MRR']}
          rows={[
            ['Blaztr', '—', fmtNum(bz.leads), fmtNum(bz.clients), '—', fmt$(bz.mrr)],
            ['Google Ads', '—', '—', '—', '—', '— not running yet'],
            ['Meta Ads', '—', '—', '—', '—', '— not running yet'],
          ]}
        />
      </Section>

      {/* Blaztr — live cold-email channel */}
      <Section id="blaztr" icon={channelIcon.blaztr} name="Blaztr" count="cold email" open={open.blaztr} onToggle={toggle}
        kpis={open.blaztr ? [] : [
          { label: 'Sent', value: funnel ? fmtNum(funnel.sent) : '—' },
          { label: 'Replies', value: funnel ? fmtNum(funnel.replied) : fmtNum(bz.leads) },
          { label: 'Booked', value: fmtNum(bz.appts) },
          { label: 'Clients', value: fmtNum(bz.clients) },
          { label: 'MRR Added', value: fmt$(bz.mrr), ch: true },
        ]}>
        <ChartPlaceholder />
        <ChannelTable
          columns={['Stage', 'Count', 'Value']}
          rows={[
            ['Sent', funnel ? fmtNum(funnel.sent) : '—', ''],
            ['Replied', funnel ? fmtNum(funnel.replied) : fmtNum(bz.leads), ''],
            ['Booked (appt)', fmtNum(bz.appts), ''],
            ['Clients (sold)', fmtNum(bz.clients), fmt$(bz.mrr) + ' MRR'],
          ]}
        />
      </Section>

      {/* Not-running channels */}
      {NOT_RUNNING.map((c) => (
        <Section key={c.id} id={c.id} icon={c.icon} name={c.name} count="not running yet" kpis={[]} open={open[c.id]} onToggle={toggle}>
          <NotRunning name={c.name} />
        </Section>
      ))}
    </div>
  )
}
