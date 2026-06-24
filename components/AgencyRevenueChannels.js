'use client'

/*
 * Agency-level Revenue Channels — accordion UI mirroring the client
 * client EcomControlCenter look. SHELL ONLY: every number below is
 * placeholder demo data. Wiring plan — replace the `CHANNELS` / `OVERVIEW`
 * data objects (and the chart/table bodies) per channel, one at a time:
 *   • Blaztr (cold email) → Blaztr sync  (app/api/blaztr-sync)
 *   • Google Ads  → agency Google Ads account
 *   • Meta Ads    → agency Meta ad account
 * Nothing here fetches yet — it's the dashboard chassis the data drops into.
 */

import { useState } from 'react'

/* ─── formatting (self-contained so wiring stays local to this file) ─── */
const fmt$ = (n) => '$' + Math.round(n || 0).toLocaleString()

/* ─── ⓘ tooltip (copied from EcomControlCenter for visual parity) ─── */
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

/* ─── one accordion section (header KPI summary + expandable body) ─── */
function Section({ id, icon, name, count, kpis = [], open, onToggle, children, headerCtrl }) {
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
        {headerCtrl && <div className="ml-5 flex-shrink-0">{headerCtrl}</div>}
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

/* ─── placeholder trend chart (drops out when the real series is wired) ─── */
function ChartPlaceholder() {
  return (
    <div className="px-5 pt-5">
      <div className="relative h-40 rounded-lg bg-gray-50 dark:bg-[#0d1020] border border-gray-100 dark:border-white/[0.04] overflow-hidden">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 160">
          <defs>
            <linearGradient id="arcFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34CC93" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#34CC93" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 120 C 60 90, 90 130, 140 95 S 250 60, 300 80 S 370 40, 400 55 L 400 160 L 0 160 Z" fill="url(#arcFade)" />
          <path d="M0 120 C 60 90, 90 130, 140 95 S 250 60, 300 80 S 370 40, 400 55" fill="none" stroke="#34CC93" strokeWidth="2" opacity="0.55" />
        </svg>
        <span className="absolute top-2 right-3 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 bg-white/70 dark:bg-black/40 rounded px-1.5 py-0.5">Demo</span>
      </div>
    </div>
  )
}

/* ─── a placeholder breakdown table styled like the client paid-ads tables ─── */
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

/* ─── channel icons (brand parity with the client view) ─── */
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

/* ─── PLACEHOLDER DATA — swap per channel when wiring. ────────────────── */
const OVERVIEW = {
  header: [
    { label: 'MRR Added', value: fmt$(6100), ch: true, info: 'New monthly recurring revenue from clients closed in range (placeholder).' },
    { label: 'Clients', value: '5' },
    { label: 'Appts', value: '37' },
    { label: 'Spend', value: fmt$(290), info: 'Acquisition spend across channels — cold-email tooling/data for now (no paid ads running yet).' },
    { label: 'CAC', value: fmt$(58), info: 'Blended cost to acquire one client (placeholder).' },
  ],
  byChannel: [ // [name, MRR, color] — only Blaztr is live; paid not running yet
    ['Blaztr', 6100, '#01D2FB'],
    ['Google Ads', 0, '#4285F4'],
    ['Meta Ads', 0, '#0866FF'],
  ],
  efficiency: [
    { label: 'Close Rate', value: '13.5%', info: 'Clients ÷ appointments (placeholder).' },
    { label: 'Cost / Appt', value: fmt$(8) },
    { label: 'Avg Contract', value: fmt$(1220), ch: true },
    { label: 'Pipeline MRR', value: fmt$(28400), info: 'Weighted open-deal MRR (placeholder).' },
  ],
}

// Blended acquisition across all channels (one row per channel). Cold Email is
// the only live channel today — Google/Meta show as not running yet.
const BLENDED = {
  header: [
    { label: 'Spend', value: fmt$(290) },
    { label: 'Leads', value: '37' },
    { label: 'Clients', value: '5' },
    { label: 'Cost / Client', value: fmt$(58), info: 'Blended acquisition cost across every channel (placeholder).' },
    { label: 'MRR Added', value: fmt$(6100), ch: true },
  ],
  columns: ['Channel', 'Spend', 'Leads', 'Clients', 'Cost / Client', 'MRR'],
  rows: [
    ['Blaztr', fmt$(290), '37', '5', fmt$(58), fmt$(6100)],
    ['Google Ads', '—', '—', '—', '—', '— not running yet'],
    ['Meta Ads', '—', '—', '—', '—', '— not running yet'],
  ],
}

const CHANNELS = [
  {
    id: 'blaztr', name: 'Blaztr', icon: channelIcon.blaztr, count: 'cold email',
    header: [
      { label: 'Sent', value: '48,200' }, { label: 'Replies', value: '612' },
      { label: 'Booked', value: '37' }, { label: 'Clients', value: '5' },
      { label: 'MRR Added', value: fmt$(6100), ch: true },
    ],
    table: {
      columns: ['Campaign', 'Sent', 'Replies', 'Booked', 'Clients', 'MRR'],
      rows: [
        ['Q2 HVAC — Texas', '12,400', '180', '11', '2', fmt$(2450)],
        ['Ecom DTC — Apparel', '9,800', '142', '8', '1', fmt$(1550)],
        ['RV / Auto Accessories', '7,600', '98', '6', '1', fmt$(1100)],
        ['Med Spa — National', '18,400', '192', '12', '1', fmt$(1000)],
      ],
    },
  },
  { id: 'google_ads', name: 'Google Ads', icon: channelIcon.google, notRunning: true },
  { id: 'meta_ads', name: 'Meta Ads', icon: channelIcon.meta, notRunning: true },
]

/* ─────────────────────────────────────────────────────────────────────── */
export default function AgencyRevenueChannels() {
  const [open, setOpen] = useState({ overview: true })
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }))
  const chMax = Math.max(1, ...OVERVIEW.byChannel.map(([, v]) => v))

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Revenue Channels</h2>
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5">Demo · data wires in next</span>
      </div>

      {/* Overview */}
      <Section id="overview" icon={channelIcon.overview} name="Overview" count="all channels" kpis={OVERVIEW.header} open={open.overview} onToggle={toggle}>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">MRR by Channel</p>
            {OVERVIEW.byChannel.map(([name, val, color]) => (
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
              {OVERVIEW.efficiency.map(({ label, value, ch, info }) => (
                <div key={label} className="bg-gray-50 dark:bg-[#161b30] rounded-lg px-3.5 py-3">
                  <div className={`text-xl font-bold ${ch ? 'text-[#34CC93]' : 'text-gray-900 dark:text-white'}`}>{value}</div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{label}{info && <InfoTip text={info} />}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Blended — all channels combined (mirrors the client blended view) */}
      <Section id="blended" icon={channelIcon.blended} name="Blended" count="all channels" kpis={open.blended ? [] : BLENDED.header} open={open.blended} onToggle={toggle}>
        <ChartPlaceholder />
        <ChannelTable columns={BLENDED.columns} rows={BLENDED.rows} />
      </Section>

      {/* Per-channel */}
      {CHANNELS.map((c) => (
        <Section key={c.id} id={c.id} icon={c.icon} name={c.name} count={c.notRunning ? 'not running yet' : c.count}
          kpis={c.notRunning || open[c.id] ? [] : c.header} open={open[c.id]} onToggle={toggle}>
          {c.notRunning ? <NotRunning name={c.name} /> : (<><ChartPlaceholder /><ChannelTable columns={c.table.columns} rows={c.table.rows} /></>)}
        </Section>
      ))}
    </div>
  )
}
