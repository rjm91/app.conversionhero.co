'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const fmt$    = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
const fmt$2   = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum  = (n) => Number(n || 0).toLocaleString()
const fmtPct  = (n) => (Math.round((n || 0) * 1000) / 10) + '%'
const fmtRoas = (n) => (Math.round((n || 0) * 100) / 100) + 'x'

// Process layer: classify an order into a MARKETING SOURCE bucket (what drove
// the sale), not Shopify's sales channel. UTM is preferred because ad-driven
// website orders carry it even when Shopify's sourceName says "Online Store".
// Native marketplace channels have no website UTM, so we fall back to the
// Shopify sales-channel id. IDs confirmed via Shopify channelInformation:
//   2329312 = Facebook & Instagram channel, 3890849 = Shop app.
const CHANNEL_BY_SOURCENAME = {
  '2329312': 'Meta',
  '3890849': 'Shop',
}
// Detect an ad platform in a single attribution string (source/medium/campaign).
function platformOf(str) {
  const s = (str || '').toLowerCase()
  if (/facebook|meta|instagram|\bfb\b/.test(s)) return 'Meta'
  if (/google|adwords|gads|youtube/.test(s))    return 'Google'
  return null
}
function deriveChannel(o) {
  const sd = o.shopify_data || {}
  // RULE: if Google or Facebook appears ANYWHERE in the journey (first OR last
  // visit, or the merged top-level UTM), attribute the order to that platform —
  // even if the last click was email/Klaviyo. Prefer last-touch platform, then
  // first-touch, then the merged top-level UTM (for rows synced before we kept
  // both visits).
  const lastP   = platformOf([sd.last_utm?.source,  sd.last_utm?.medium,  sd.last_utm?.campaign].join(' '))
  const firstP  = platformOf([sd.first_utm?.source, sd.first_utm?.medium, sd.first_utm?.campaign].join(' '))
  const mergedP = platformOf([o.utm_source, o.utm_medium, o.utm_campaign, o.utm_content].join(' '))
  const platform = lastP || firstP || mergedP
  if (platform) return platform
  // No platform anywhere → next strongest signal across every source we have.
  const blob = [o.utm_source, o.utm_medium, sd.first_utm?.source, sd.first_utm?.medium, sd.last_utm?.source, sd.last_utm?.medium]
    .filter(Boolean).join(' ').toLowerCase()
  if (/klaviyo|mailchimp|sendgrid|newsletter|email/.test(blob)) return 'Email'
  if (/shop_app|shopapp|\bshop\b/.test(blob)) return 'Shop'
  if (o.utm_source) return o.utm_source.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  // Last resort: the Shopify sales channel.
  const ch = sd.channel
  if (ch && CHANNEL_BY_SOURCENAME[ch]) return CHANNEL_BY_SOURCENAME[ch]
  if (ch === 'Online Store') return 'Direct'
  return ch || 'Other'
}

function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
}

// Preset date ranges (primary selector). 'custom' falls back to the date inputs.
const RANGE_OPTIONS = [
  ['today',     'Today'],
  ['last_7',    'Last 7 Days'],
  ['last_14',   'Last 14 Days'],
  ['last_30',   'Last 30 Days'],
  ['last_90',   'Last 90 Days'],
  ['this_year', 'This Year'],
  ['last_year', 'Last Year'],
  ['all_time',  'All Time'],
  ['custom',    'Custom'],
]
function rangeFor(preset) {
  const today = new Date()
  const end = today.toISOString().slice(0, 10)
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
  switch (preset) {
    case 'today':     return { start: end, end }
    case 'last_7':    return { start: daysAgo(7),  end }
    case 'last_14':   return { start: daysAgo(14), end }
    case 'last_30':   return { start: daysAgo(30), end }
    case 'last_90':   return { start: daysAgo(90), end }
    case 'this_year': return { start: `${today.getFullYear()}-01-01`, end }
    case 'last_year': { const y = today.getFullYear() - 1; return { start: `${y}-01-01`, end: `${y}-12-31` } }
    case 'all_time':  return { start: '2000-01-01', end }
    default:          return null // custom
  }
}

// One accordion section with inline KPI summary in the header bar.
// Small ⓘ icon that reveals an explanation on hover/focus. Uses fixed
// positioning so the tooltip escapes the section's overflow-hidden clipping.
function InfoTip({ text }) {
  const [pos, setPos] = useState(null)
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(r.left + r.width / 2, 120), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 120)
    setPos({ x, y: r.bottom + 6 })
  }
  const hide = () => setPos(null)
  return (
    <span
      tabIndex={0}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex align-middle ml-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 cursor-help outline-none"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
      </svg>
      {pos && (
        <span
          style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateX(-50%)', zIndex: 60 }}
          className="pointer-events-none w-56 rounded-lg bg-gray-900 dark:bg-black/95 text-white text-[11px] font-normal normal-case tracking-normal leading-snug px-3 py-2 shadow-xl ring-1 ring-white/10"
        >
          {text}
        </span>
      )}
    </span>
  )
}

// Toggleable trend-chart metrics. axis 'money' → right $ axis, 'count' → left.
const TREND_METRICS = [
  { key: 'spend',       label: 'Spend',        axis: 'money', color: '#3b82f6' },
  { key: 'chRev',       label: 'Revenue (CH)', axis: 'money', color: '#34CC93' },
  { key: 'clicks',      label: 'Clicks',       axis: 'count', color: '#f59e0b' },
  { key: 'conversions', label: 'Conv',         axis: 'count', color: '#06b6d4' },
  { key: 'chConv',      label: 'Conv (CH)',    axis: 'count', color: '#10b981' },
  { key: 'aov',         label: 'AOV',          axis: 'money', color: '#a855f7' },
]

// Is a hex color light enough that white text on it would be unreadable?
function isLightHex(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 180
}

// Time-series chart for an accordion. Single platform → pass `a`. Blended
// comparison → pass `a` (Google) + `b` (Meta) + compare: Meta renders dashed.
function TrendChart({ dates, a, b, compare, primaryColor }) {
  const [active, setActive] = useState({ spend: true })
  const toggle = (k) => setActive(s => ({ ...s, [k]: !s[k] }))
  if (!dates.length) return null
  // A single day (e.g. "Today") can't draw a line, and a lone point sits at the
  // left edge. Render it as a centered pyramid: baseline → peak (middle) → baseline.
  const single = dates.length === 1
  const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const labels = single ? ['', dayLabel(dates[0]), ''] : dates.map(dayLabel)
  const toSeries = (arr) => single ? [0, Number(arr?.[0]) || 0, 0] : arr
  const fewPoints = labels.length <= 2
  // Vertical fill gradient: saturated near the top of the plot (the peaks),
  // fading to transparent at the baseline.
  const fillGrad = (color) => (ctx) => {
    const { chart } = ctx
    const area = chart.chartArea
    if (!area) return color + '00'
    const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
    g.addColorStop(0, color + '80')    // ~50% alpha at the top (peaks)
    g.addColorStop(0.55, color + '24') // ~14% mid
    g.addColorStop(1, color + '00')    // transparent at the baseline
    return g
  }
  const line = (label, data, color, axis, dashed, fill = true) => ({
    label, data: toSeries(data), borderColor: color, backgroundColor: fill ? fillGrad(color) : 'transparent', fill,
    yAxisID: axis === 'money' ? 'y1' : 'y', tension: single ? 0 : 0.3, borderWidth: 2.25,
    pointRadius: single ? [0, 5, 0] : (fewPoints ? 5 : 0), pointBackgroundColor: color,
    pointHoverRadius: single ? [0, 6, 0] : (fewPoints ? 6 : 3), pointHoverBackgroundColor: color,
    borderDash: dashed ? [5, 4] : [],
  })
  // Each metric keeps its own color so multiple metrics stay distinguishable;
  // only the primary "Spend" metric is overridden (white for Google, red for
  // Blended). In compare mode both platforms share the metric color (Google
  // solid, Meta dashed).
  const colorFor = (md) => (md.key === 'spend' && primaryColor) ? primaryColor : md.color
  const datasets = []
  for (const md of TREND_METRICS) {
    if (!active[md.key]) continue
    const col = colorFor(md)
    if (compare) {
      datasets.push(line(`${md.label} · Google`, a[md.key], col, md.axis, false, true))
      datasets.push(line(`${md.label} · Meta`,   b[md.key], col, md.axis, true, true))
    } else {
      datasets.push(line(md.label, a[md.key], col, md.axis, false))
    }
  }
  const anyMoney = TREND_METRICS.some(md => active[md.key] && md.axis === 'money')
  const anyCount = TREND_METRICS.some(md => active[md.key] && md.axis === 'count')
  return (
    <div className="px-5 pt-5 pb-1">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TREND_METRICS.map(md => {
          const on = !!active[md.key]
          const bg = colorFor(md)
          // White pills (Google) need readable text — use the Google "G" blue.
          const txt = isLightHex(bg) ? '#4285F4' : '#ffffff'
          return (
            <button key={md.key} onClick={() => toggle(md.key)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition ${on ? 'border-transparent' : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'}`}
              style={on ? { background: bg, color: txt } : undefined}>
              {md.label}
            </button>
          )
        })}
        {compare && <span className="text-[10px] text-gray-400 dark:text-gray-500 self-center ml-1">solid = Google · dashed = Meta</span>}
      </div>
      <div className="h-52">
        {datasets.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-gray-400">Select a metric to plot.</div>
        ) : (
          <Line data={{ labels, datasets }} options={{
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: compare, labels: { boxWidth: 10, font: { size: 10 }, color: '#9aa4bf' } },
              tooltip: { callbacks: { label: (c) => {
                const money = /Spend|Revenue|AOV/.test(c.dataset.label)
                return `${c.dataset.label}: ${money ? '$' + Math.round(c.parsed.y).toLocaleString() : c.parsed.y.toLocaleString()}`
              } } },
            },
            scales: {
              x:  { grid: { display: true, color: 'rgba(148,163,184,0.12)' }, ticks: { color: '#9aa4bf', maxTicksLimit: 8, font: { size: 10 } } },
              y:  { display: anyCount, position: 'left',  grid: { color: 'rgba(148,163,184,0.14)' }, ticks: { color: '#9aa4bf', font: { size: 10 }, precision: 0, count: 8 } },
              y1: { display: anyMoney, position: 'right', grid: { drawOnChartArea: !anyCount, color: 'rgba(148,163,184,0.14)' }, ticks: { color: '#9aa4bf', font: { size: 10 }, count: 8, callback: (v) => '$' + v.toLocaleString() } },
            },
          }} />
        )}
      </div>
    </div>
  )
}

function Section({ id, icon, name, count, kpis, open, onToggle, children, action }) {
  return (
    <div className="border border-gray-100 dark:border-white/[0.06] rounded-xl mb-3 bg-white dark:bg-[#111528] overflow-hidden">
      <div
        onClick={() => onToggle(id)}
        className="flex items-center gap-3.5 px-4 py-4 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-[#161b30] transition"
      >
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        {icon}
        <div className="min-w-0">
          <span className="text-[15px] font-bold text-gray-900 dark:text-white">{name}</span>
          {count != null && <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{count}</span>}
        </div>
        <div className="flex-1" />
        {action}
        <div className="flex items-center gap-6 flex-shrink-0">
          {kpis.map((k, i) => (
            <div key={i} className="text-right">
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

// Shared column widths so the Google and Meta tables line up as one master
// grid (table-fixed + this colgroup in both). 13 columns, must sum to 100%.
const PAID_COL_WIDTHS = ['18%', '7%', '7%', '7%', '6%', '5%', '6%', '6%', '6%', '7%', '6%', '7%', '6%', '6%']
function PaidColGroup() {
  return <colgroup>{PAID_COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
}

const platformIcon = {
  overview: <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgb(var(--blue-400)), rgb(var(--blue-700)))' }}>∑</div>,
  google:   <div className="w-7 h-7 rounded-lg grid place-items-center bg-white border border-gray-200 text-[#4285F4] text-xs font-extrabold flex-shrink-0">G</div>,
  meta:     <div className="w-7 h-7 rounded-lg grid place-items-center bg-[#0866FF] text-white text-sm font-extrabold flex-shrink-0">f</div>,
  orders:   <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgb(var(--blue-400)), rgb(var(--blue-700)))' }}>🛍</div>,
}

const SHOPIFY_PILL = {
  PAID: 'bg-[#34CC93]/10 text-[#1a9e6e] dark:text-[#34CC93]', PENDING: 'bg-[#FFD024]/10 text-[#b89600] dark:text-[#FFD024]',
  FULFILLED: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300', UNFULFILLED: 'bg-[#FFD024]/10 text-[#b89600] dark:text-[#FFD024]',
}
function Pill({ status }) {
  if (!status) return <span className="text-gray-300 dark:text-gray-600">—</span>
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ')
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${SHOPIFY_PILL[status] || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>{label}</span>
}

// Anthropic-style relative timestamp
function relativeTime(ts, now) {
  if (!ts) return null
  const s = Math.max(0, Math.floor((now - new Date(ts).getTime()) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return 'less than a minute ago'
  const min = Math.floor(s / 60)
  if (min < 60) return min === 1 ? '1 minute ago' : `${min} minutes ago`
  const h = Math.floor(min / 60)
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`
  const d = Math.floor(h / 24)
  return d === 1 ? '1 day ago' : `${d} days ago`
}

// "Last updated: X ago" + a circular refresh arrow (replaces the refresh button)
function LastUpdated({ syncedAt, syncing, onRefresh }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])
  const rel = syncing ? 'updating…' : relativeTime(syncedAt, now)
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
      {rel && <span>Last updated: {rel}</span>}
      <button
        onClick={(e) => { e.stopPropagation(); onRefresh() }}
        disabled={syncing}
        title="Refresh"
        className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition disabled:opacity-50"
      >
        <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-2.64-6.36" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 3v6h-6" />
        </svg>
      </button>
    </div>
  )
}

// Skeleton placeholder that mirrors the accordion layout — shimmer in, no
// spinner flash or layout jump when real data swaps in.
function DashboardSkeleton() {
  const bar = 'bg-gray-200/70 dark:bg-white/[0.06] animate-pulse rounded'
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-white dark:bg-[#111528] overflow-hidden">
          <div className="flex items-center gap-3.5 px-4 py-4">
            <span className={`w-4 h-4 ${bar}`} />
            <span className={`w-7 h-7 rounded-lg ${bar}`} />
            <span className={`h-3.5 w-36 ${bar}`} />
            <div className="flex-1" />
            <div className="hidden sm:flex items-end gap-6">
              {[0, 1, 2, 3].map(j => (
                <div key={j} className="flex flex-col items-end gap-1.5">
                  <span className={`h-4 w-14 ${bar}`} />
                  <span className={`h-2 w-9 ${bar}`} style={{ opacity: 0.6 }} />
                </div>
              ))}
            </div>
          </div>
          {i === 0 && (
            <div className="border-t border-gray-100 dark:border-white/[0.06] p-5">
              <div className={`h-44 w-full ${bar}`} style={{ opacity: 0.5 }} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function EcomControlCenter({ clientId, clientName }) {
  const defaults = defaultDates()
  const [startDate, setStartDate]   = useState(defaults.start)
  const [endDate, setEndDate]       = useState(defaults.end)
  const [appliedStart, setAppliedStart] = useState(defaults.start)
  const [appliedEnd, setAppliedEnd]     = useState(defaults.end)
  const [preset, setPreset]             = useState('last_30')

  const [orders, setOrders]       = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [metaCampaigns, setMetaCampaigns] = useState([])
  const [googleDaily, setGoogleDaily] = useState([])
  const [metaDaily, setMetaDaily]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [firstLoad, setFirstLoad] = useState(true)
  const [brandColor, setBrandColor] = useState('#3b82f6') // client brand primary (fallback blue)
  const [isDark, setIsDark] = useState(false)
  const [googleSyncing, setGoogleSyncing] = useState(false)
  const [metaSyncing, setMetaSyncing] = useState(false)
  const [open, setOpen] = useState({ overview: true, blended: true, google: true, meta: false, orders: false })
  const toggle = useCallback((id) => setOpen(o => ({ ...o, [id]: !o[id] })), [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [ordersRes, campRes, metaRes] = await Promise.all([
      supabase.from('client_lead')
        .select('lead_id, sale_amount, utm_campaign, utm_source, utm_medium, utm_content, shopify_data, created_at, first_name, last_name')
        .eq('client_id', clientId)
        .like('lead_id', 'shopify_%')
        .gte('created_at', appliedStart)
        .lte('created_at', appliedEnd + 'T23:59:59-12:00')
        .order('created_at', { ascending: false }),
      supabase.from('client_yt_campaigns')
        .select('*')
        .eq('client_id', clientId)
        .ilike('campaign_name', `%${clientId}%`)
        .gte('date', appliedStart)
        .lte('date', appliedEnd),
      supabase.from('client_meta_campaigns')
        .select('*')
        .eq('client_id', clientId)
        .gte('date', appliedStart)
        .lte('date', appliedEnd),
    ])

    setOrders(ordersRes.data || [])
    setGoogleDaily(campRes.data || [])
    setMetaDaily(metaRes.data || [])

    // Aggregate Google campaign rows per campaign_id
    const map = {}
    for (const row of (campRes.data || [])) {
      const id = row.campaign_id
      if (!map[id]) map[id] = { campaign_id: id, campaign_name: row.campaign_name, status: row.status, budget: row.budget, cost: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0, synced_at: row.synced_at }
      map[id].cost += Number(row.cost) || 0
      map[id].impressions += Number(row.impressions) || 0
      map[id].clicks += Number(row.clicks) || 0
      map[id].conversions += Number(row.conversions) || 0
      map[id].conversions_value += Number(row.conversions_value) || 0
      if (row.synced_at > map[id].synced_at) { map[id].status = row.status; map[id].budget = row.budget; map[id].synced_at = row.synced_at }
    }
    setCampaigns(Object.values(map).sort((a, b) => b.cost - a.cost))

    // Aggregate Meta campaign rows per campaign_id
    const mmap = {}
    for (const row of (metaRes.data || [])) {
      const id = row.campaign_id
      if (!mmap[id]) mmap[id] = { campaign_id: id, campaign_name: row.campaign_name, status: row.status, budget: row.budget, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0, synced_at: row.synced_at }
      mmap[id].spend += Number(row.spend) || 0
      mmap[id].impressions += Number(row.impressions) || 0
      mmap[id].clicks += Number(row.clicks) || 0
      mmap[id].conversions += Number(row.conversions) || 0
      mmap[id].conversions_value += Number(row.conversions_value) || 0
      if (row.synced_at > mmap[id].synced_at) { mmap[id].status = row.status; mmap[id].budget = row.budget; mmap[id].synced_at = row.synced_at }
    }
    setMetaCampaigns(Object.values(mmap).sort((a, b) => b.spend - a.spend))
    setLoading(false)
    setFirstLoad(false)
  }, [clientId, appliedStart, appliedEnd])

  useEffect(() => { fetchData() }, [fetchData])

  // Always reload with the CURRENT range (not whatever was selected when an
  // async sync started), so a slow sync can't overwrite the chosen range.
  const fetchDataRef = useRef(fetchData)
  useEffect(() => { fetchDataRef.current = fetchData }, [fetchData])

  // Auto-refresh platform data once per page open: cached data shows
  // immediately (above), then we sync Google + Meta + Shopify in the
  // background and reload — so the user never has to click Refresh.
  const didAutoSync = useRef(false)
  useEffect(() => {
    if (didAutoSync.current) return
    didAutoSync.current = true
    ;(async () => {
      setGoogleSyncing(true); setMetaSyncing(true)
      try {
        await Promise.allSettled([
          fetch(`/api/sync-youtube-ads?start=${appliedStart}&end=${appliedEnd}`, { cache: 'no-store' }),
          fetch(`/api/sync-meta-ads?client_id=${clientId}&start=${appliedStart}&end=${appliedEnd}`, { cache: 'no-store' }),
          fetch(`/api/sync-shopify-orders?client_id=${clientId}&start=${appliedStart}&end=${appliedEnd}`, { cache: 'no-store' }),
        ])
        await fetchDataRef.current()
      } catch (e) {
        console.error('[EcomControlCenter] auto-refresh failed:', e)
      } finally {
        setGoogleSyncing(false); setMetaSyncing(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  // Track dark mode so "Google = white" stays visible in light mode too.
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Client brand primary color (for the trend chart). Falls back to blue.
  useEffect(() => {
    let cancelled = false
    supabase.from('client').select('branding').eq('client_id', clientId).single().then(({ data }) => {
      if (cancelled) return
      const colors = data?.branding?.colors || []
      const primary = colors.find(c => /primary/i.test(c.role || ''))?.hex || colors[0]?.hex
      if (primary) setBrandColor(primary)
    })
    return () => { cancelled = true }
  }, [clientId])

  function applyDates() { setPreset('custom'); setAppliedStart(startDate); setAppliedEnd(endDate) }

  // Preset dropdown — applies the range to ALL data on the page immediately
  function onPresetChange(key) {
    setPreset(key)
    if (key === 'custom') return // user picks dates + Apply
    const r = rangeFor(key)
    if (!r) return
    setStartDate(r.start); setEndDate(r.end)
    setAppliedStart(r.start); setAppliedEnd(r.end)
  }

  // Pull the latest Google Ads data for this client, then reload
  async function handleGoogleRefresh() {
    if (googleSyncing) return
    setGoogleSyncing(true)
    try {
      await fetch(`/api/sync-youtube-ads?start=${appliedStart}&end=${appliedEnd}`, { cache: 'no-store' })
      await fetchData()
    } catch (e) {
      console.error('[EcomControlCenter] Google refresh failed:', e)
    } finally {
      setGoogleSyncing(false)
    }
  }

  // Pull the latest Meta (Facebook) data for this client, then reload
  async function handleMetaRefresh() {
    if (metaSyncing) return
    setMetaSyncing(true)
    try {
      await fetch(`/api/sync-meta-ads?client_id=${clientId}&start=${appliedStart}&end=${appliedEnd}`, { cache: 'no-store' })
      await fetchData()
    } catch (e) {
      console.error('[EcomControlCenter] Meta refresh failed:', e)
    } finally {
      setMetaSyncing(false)
    }
  }

  // Per-campaign attribution from orders (utm_campaign → orders/revenue)
  const campaignAttr = useMemo(() => {
    const m = {}
    for (const o of orders) {
      const c = (o.utm_campaign || '').trim()
      if (!c) continue
      if (!m[c]) m[c] = { count: 0, revenue: 0 }
      m[c].count++
      m[c].revenue += Number(o.sale_amount) || 0
    }
    return m
  }, [orders])

  const m = useMemo(() => {
    const revenue = orders.reduce((s, o) => s + (Number(o.sale_amount) || 0), 0)
    const orderCount = orders.length
    const tracked = orders.filter(o => (o.utm_campaign || '').trim())
    const trackedRevenue = tracked.reduce((s, o) => s + (Number(o.sale_amount) || 0), 0)
    const googleSpend  = campaigns.reduce((s, c) => s + c.cost, 0)
    const googleClicks = campaigns.reduce((s, c) => s + c.clicks, 0)
    const googleBudget = campaigns.reduce((s, c) => s + (Number(c.budget) || 0), 0)
    const googleImpr   = campaigns.reduce((s, c) => s + (Number(c.impressions) || 0), 0)
    const metaSpend    = metaCampaigns.reduce((s, c) => s + c.spend, 0)
    const metaClicks   = metaCampaigns.reduce((s, c) => s + c.clicks, 0)
    const metaImpr     = metaCampaigns.reduce((s, c) => s + (Number(c.impressions) || 0), 0)
    const adSpend = googleSpend + metaSpend     // blended
    const clicks  = googleClicks + metaClicks
    const byChannel = {}
    for (const o of orders) {
      const ch = deriveChannel(o)
      byChannel[ch] = (byChannel[ch] || 0) + (Number(o.sale_amount) || 0)
    }
    // Per-platform CH rollups (orders' utm_campaign matched to each platform's campaign IDs)
    const gConv = campaigns.reduce((s, c) => s + (campaignAttr[c.campaign_id]?.count || 0), 0)
    const gRev  = campaigns.reduce((s, c) => s + (campaignAttr[c.campaign_id]?.revenue || 0), 0)
    const gConvGoogle = campaigns.reduce((s, c) => s + (Number(c.conversions) || 0), 0)
    const mConv = metaCampaigns.reduce((s, c) => s + (campaignAttr[c.campaign_id]?.count || 0), 0)
    const mRev  = metaCampaigns.reduce((s, c) => s + (campaignAttr[c.campaign_id]?.revenue || 0), 0)
    const mConvPlatform = metaCampaigns.reduce((s, c) => s + (Number(c.conversions) || 0), 0)
    const metaBudget    = metaCampaigns.reduce((s, c) => s + (Number(c.budget) || 0), 0)
    // Platform-reported conversion value → platform ROAS (value ÷ spend)
    const googleConvValue = campaigns.reduce((s, c) => s + (Number(c.conversions_value) || 0), 0)
    const metaConvValue   = metaCampaigns.reduce((s, c) => s + (Number(c.conversions_value) || 0), 0)
    return {
      gConvGoogle,
      revenue, orderCount,
      aov: orderCount ? revenue / orderCount : 0,
      trackedRevenue, trackedCount: tracked.length,
      attrRate: orderCount ? tracked.length / orderCount : 0,
      googleSpend, googleClicks, googleBudget, googleImpr, metaSpend, metaClicks, metaImpr,
      adSpend, clicks,
      roas: adSpend ? revenue / adSpend : 0,
      costPerOrder: orderCount ? adSpend / orderCount : 0,
      convRate: clicks ? orderCount / clicks : 0,
      byChannel: Object.entries(byChannel).sort((a, b) => b[1] - a[1]),
      gConv, gRev, gRoas: googleSpend ? gRev / googleSpend : 0,
      mConv, mRev, mConvPlatform, metaBudget, mRoas: metaSpend ? mRev / metaSpend : 0,
      // Platform-reported ROAS (the platform's own conversion value ÷ spend)
      googleConvValue, metaConvValue,
      gRoasPlatform: googleSpend ? googleConvValue / googleSpend : 0,
      mRoasPlatform: metaSpend ? metaConvValue / metaSpend : 0,
      blendedRoasPlatform: (googleSpend + metaSpend) ? (googleConvValue + metaConvValue) / (googleSpend + metaSpend) : 0,
      // Blended (Google + Meta)
      blendedConvPlatform: gConvGoogle + mConvPlatform,
      blendedConvCH: gConv + mConv,
      blendedRevCH: gRev + mRev,
      blendedRoas: (googleSpend + metaSpend) ? (gRev + mRev) / (googleSpend + metaSpend) : 0,
    }
  }, [orders, campaigns, metaCampaigns, campaignAttr])

  // Daily time series for the trend charts: spend/impr/clicks/conv from the raw
  // per-day campaign rows, plus CH conv/revenue from orders bucketed by order
  // date and split by which platform's campaign id the order matched.
  const trend = useMemo(() => {
    const dates = []
    const d1 = new Date(appliedEnd + 'T00:00:00')
    for (let d = new Date(appliedStart + 'T00:00:00'); d <= d1; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10))
    }
    const idx = Object.fromEntries(dates.map((d, i) => [d, i]))
    const blank = () => ({
      spend: Array(dates.length).fill(0), impressions: Array(dates.length).fill(0),
      clicks: Array(dates.length).fill(0), conversions: Array(dates.length).fill(0),
      chConv: Array(dates.length).fill(0), chRev: Array(dates.length).fill(0),
      aov: Array(dates.length).fill(0),
    })
    const google = blank(), meta = blank()
    for (const r of googleDaily) {
      const i = idx[String(r.date).slice(0, 10)]; if (i == null) continue
      google.spend[i]       += Number(r.cost) || 0
      google.impressions[i] += Number(r.impressions) || 0
      google.clicks[i]      += Number(r.clicks) || 0
      google.conversions[i] += Number(r.conversions) || 0
    }
    for (const r of metaDaily) {
      const i = idx[String(r.date).slice(0, 10)]; if (i == null) continue
      meta.spend[i]       += Number(r.spend) || 0
      meta.impressions[i] += Number(r.impressions) || 0
      meta.clicks[i]      += Number(r.clicks) || 0
      meta.conversions[i] += Number(r.conversions) || 0
    }
    const gIds = new Set(campaigns.map(c => String(c.campaign_id)))
    const mIds = new Set(metaCampaigns.map(c => String(c.campaign_id)))
    for (const o of orders) {
      const i = idx[String(o.created_at).slice(0, 10)]; if (i == null) continue
      const c = (o.utm_campaign || '').trim(); if (!c) continue
      const rev = Number(o.sale_amount) || 0
      if (gIds.has(c))      { google.chConv[i] += 1; google.chRev[i] += rev }
      else if (mIds.has(c)) { meta.chConv[i]   += 1; meta.chRev[i]   += rev }
    }
    // AOV per day = attributed revenue / attributed orders
    for (let i = 0; i < dates.length; i++) {
      google.aov[i] = google.chConv[i] > 0 ? google.chRev[i] / google.chConv[i] : 0
      meta.aov[i]   = meta.chConv[i]   > 0 ? meta.chRev[i]   / meta.chConv[i]   : 0
    }
    return { dates, google, meta }
  }, [appliedStart, appliedEnd, googleDaily, metaDaily, orders, campaigns, metaCampaigns])

  const googleSynced = useMemo(() => campaigns.reduce((mx, c) => (c.synced_at || '') > mx ? c.synced_at : mx, ''), [campaigns])
  const metaSynced   = useMemo(() => metaCampaigns.reduce((mx, c) => (c.synced_at || '') > mx ? c.synced_at : mx, ''), [metaCampaigns])

  const channelMax = Math.max(1, ...m.byChannel.map(([, v]) => v))
  const googleColor = isDark ? '#ffffff' : '#171717' // white in dark, near-black in light
  // Lighten a hex toward white (for the Email channel = lighter brand red)
  const lighten = (hex, amt) => {
    const h = String(hex || '').replace('#', '')
    if (h.length !== 6) return hex
    const ch = (i) => { const x = parseInt(h.slice(i, i + 2), 16); return Math.round(x + (255 - x) * amt).toString(16).padStart(2, '0') }
    return `#${ch(0)}${ch(2)}${ch(4)}`
  }
  const channelColor = (name) => ({
    Meta: '#0866FF', Google: googleColor, Email: lighten(brandColor, 0.45),
    Direct: brandColor, Shop: '#5a31f4', 'Draft Order': '#64748b',
  }[name] || '#7a8bb5')

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <span className="inline-block text-[10px] font-bold text-[#34CC93] bg-[#34CC93]/12 rounded px-2 py-0.5 mb-1.5">ECOM</span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Control Center</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{clientName || clientId} at a glance. Click any section to expand.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={preset}
            onChange={e => onPresetChange(e.target.value)}
            className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {RANGE_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
          {preset === 'custom' && (
            <>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={applyDates} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition">Apply</button>
            </>
          )}
        </div>
      </div>

      {/* Data-accuracy notice for clients */}
      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/[0.08] px-4 py-3">
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-[13px] leading-relaxed text-amber-800 dark:text-amber-200/90">
          <span className="font-semibold">Heads up:</span> ad attribution (the green <span className="font-semibold">"CH"</span> columns) is still being calibrated and may be inaccurate right now. <span className="font-semibold">Shopify orders/revenue and Google &amp; Meta ad data are accurate</span> for the selected date ranges.
        </p>
      </div>

      {firstLoad ? (
        <DashboardSkeleton />
      ) : (
        <div className={`transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          {/* Overview */}
          <Section id="overview" icon={platformIcon.overview} name="Overview" open={open.overview} onToggle={toggle}
            kpis={[
              { label: 'Revenue', value: fmt$(m.revenue), info: 'Total Shopify sales in this date range, across every channel (paid, email, organic, direct).' },
              { label: 'Ad Spend', value: fmt$(m.adSpend), info: 'Blended Google Ads + Meta Ads spend. Other channels like email and organic carry no ad cost.' },
              { label: 'Blended ROAS', value: fmtRoas(m.roas), info: 'Total revenue ÷ blended ad spend (Google + Meta). All-channel revenue measured against paid spend only.' },
              { label: 'Orders', value: fmtNum(m.orderCount), info: 'Count of all Shopify orders in this range, across every channel.' },
              { label: 'Attributed', value: fmtPct(m.attrRate), ch: true, info: 'Share of orders carrying a campaign ID we can match to a Google/Meta campaign — ConversionHero first-party attribution.' },
            ]}>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Revenue by Channel</p>
                {m.byChannel.length === 0 ? <p className="text-sm text-gray-400">No orders in range.</p> : m.byChannel.map(([name, val]) => (
                  <div key={name} className="flex items-center gap-3 py-1.5">
                    <span className="w-24 text-xs text-gray-500 dark:text-gray-400 truncate">{name}</span>
                    <div className="flex-1 h-2 rounded bg-gray-100 dark:bg-[#161b30] overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${(val / channelMax) * 100}%`, background: channelColor(name) }} />
                    </div>
                    <span className="w-16 text-right text-xs font-semibold text-gray-700 dark:text-gray-200">{fmt$(val)}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Efficiency</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    ['AOV', fmt$2(m.aov), false, 'Average order value = total revenue ÷ total orders.'],
                    ['Cost / Order', fmt$2(m.costPerOrder), false, 'Blended ad spend (Google + Meta) ÷ all orders. Spreads paid spend across every order, including email/organic/direct — so true cost per ad-driven order is higher.'],
                    ['Conversion Rate', fmtPct(m.convRate), false, 'All orders ÷ blended ad clicks (Google + Meta). A rough orders-per-paid-click ratio; the numerator includes non-paid orders, so it runs high.'],
                    ['Tracked Revenue (CH)', fmt$(m.trackedRevenue), true, "Revenue from orders matched to a Google/Meta campaign ID — ConversionHero's first-party attributed revenue."],
                  ].map(([label, value, ch, info]) => (
                    <div key={label} className="bg-gray-50 dark:bg-[#161b30] rounded-lg px-3.5 py-3">
                      <div className={`text-xl font-bold ${ch ? 'text-[#34CC93]' : 'text-gray-900 dark:text-white'}`}>{value}</div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{label}{info && <InfoTip text={info} />}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Blended Paid Ads (Google + Meta) */}
          <Section
            id="blended"
            icon={<div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgb(var(--blue-400)), rgb(var(--blue-700)))' }}>∑</div>}
            name="Blended"
            count="Google + Meta"
            open={open.blended} onToggle={toggle}
            kpis={open.blended ? [] : [
              { label: 'Spend', value: fmt$(m.adSpend) },
              { label: 'Clicks', value: fmtNum(m.clicks) },
              { label: 'Conv', value: fmtNum(m.blendedConvPlatform) },
              { label: 'Conv (CH)', value: fmtNum(m.blendedConvCH), ch: true },
              { label: 'ROAS (CH)', value: fmtRoas(m.blendedRoas), ch: true },
            ]}>
            <TrendChart dates={trend.dates} a={trend.google} b={trend.meta} compare primaryColor={brandColor} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap table-fixed min-w-[900px]">
                <PaidColGroup />
                <thead className="bg-gray-50 dark:bg-[#0d1020]">
                  <tr>
                    {['Platform', 'Status', 'Budget/Day', 'Cost', 'Impr', 'CTR', 'Clicks', 'CPC', 'Conv', 'Cost/Conv'].map((h, i) => (
                      <th key={h} className={`${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'} px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}>{h}</th>
                    ))}
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ROAS</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">Conv (CH)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">Cost/Conv (CH)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">ROAS (CH)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/[0.06]">
                  <tr className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-2 font-medium text-gray-800 dark:text-white"><span className="w-4 h-4 rounded bg-white border border-gray-200 grid place-items-center text-[9px] font-extrabold text-[#4285F4]">G</span>Google Ads</span></td>
                    <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">—</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$(m.googleBudget)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(m.googleSpend)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(m.googleImpr)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtPct(m.googleImpr > 0 ? m.googleClicks / m.googleImpr : 0)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(m.googleClicks)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(m.googleClicks > 0 ? m.googleSpend / m.googleClicks : 0)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{Number(m.gConvGoogle || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{m.gConvGoogle > 0 ? fmt$2(m.googleSpend / m.gConvGoogle) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{m.gRoasPlatform > 0 ? fmtRoas(m.gRoasPlatform) : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{m.gConv}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{m.gConv > 0 ? fmt$2(m.googleSpend / m.gConv) : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{m.gRoas > 0 ? fmtRoas(m.gRoas) : '—'}</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-2 font-medium text-gray-800 dark:text-white"><span className="w-4 h-4 rounded bg-[#0866FF] grid place-items-center text-[9px] font-extrabold text-white">f</span>Meta Ads</span></td>
                    <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">—</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{m.metaBudget > 0 ? fmt$(m.metaBudget) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(m.metaSpend)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(m.metaImpr)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtPct(m.metaImpr > 0 ? m.metaClicks / m.metaImpr : 0)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(m.metaClicks)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(m.metaClicks > 0 ? m.metaSpend / m.metaClicks : 0)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{Number(m.mConvPlatform || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{m.mConvPlatform > 0 ? fmt$2(m.metaSpend / m.mConvPlatform) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{m.mRoasPlatform > 0 ? fmtRoas(m.mRoasPlatform) : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{m.mConv}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{m.mConv > 0 ? fmt$2(m.metaSpend / m.mConv) : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{m.mRoas > 0 ? fmtRoas(m.mRoas) : '—'}</td>
                  </tr>
                  <tr className="bg-gray-100 dark:bg-[#0d1020] font-bold text-gray-900 dark:text-white border-t border-gray-200 dark:border-white/10">
                    <td className="px-4 py-3">Blended</td>
                    <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">—</td>
                    <td className="px-4 py-3 text-right">{fmt$(m.googleBudget + m.metaBudget)}</td>
                    <td className="px-4 py-3 text-right">{fmt$2(m.adSpend)}</td>
                    <td className="px-4 py-3 text-right">{fmtNum(m.googleImpr + m.metaImpr)}</td>
                    <td className="px-4 py-3 text-right">{fmtPct((m.googleImpr + m.metaImpr) > 0 ? m.clicks / (m.googleImpr + m.metaImpr) : 0)}</td>
                    <td className="px-4 py-3 text-right">{fmtNum(m.clicks)}</td>
                    <td className="px-4 py-3 text-right">{fmt$2(m.clicks > 0 ? m.adSpend / m.clicks : 0)}</td>
                    <td className="px-4 py-3 text-right">{Number(m.blendedConvPlatform || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                    <td className="px-4 py-3 text-right">{m.blendedConvPlatform > 0 ? fmt$2(m.adSpend / m.blendedConvPlatform) : '—'}</td>
                    <td className="px-4 py-3 text-right">{m.blendedRoasPlatform > 0 ? fmtRoas(m.blendedRoasPlatform) : '—'}</td>
                    <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.blendedConvCH}</td>
                    <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.blendedConvCH > 0 ? fmt$2(m.adSpend / m.blendedConvCH) : '—'}</td>
                    <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.blendedRoas > 0 ? fmtRoas(m.blendedRoas) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* Google Ads */}
          <Section id="google" icon={platformIcon.google} name="Google Ads" count={`${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`} open={open.google} onToggle={toggle}
            action={<LastUpdated syncedAt={googleSynced} syncing={googleSyncing} onRefresh={handleGoogleRefresh} />}
            kpis={open.google ? [] : [
              { label: 'Spend', value: fmt$(m.googleSpend) },
              { label: 'Clicks', value: fmtNum(m.googleClicks) },
              { label: 'Conv', value: fmtNum(m.gConvGoogle) },
              { label: 'Conv (CH)', value: fmtNum(m.gConv), ch: true },
              { label: 'ROAS (CH)', value: fmtRoas(m.gRoas), ch: true },
            ]}>
            {campaigns.length === 0 ? (
              <p className="text-sm text-gray-400 p-6">No Google campaign data in range.</p>
            ) : (
              <>
              <TrendChart dates={trend.dates} a={trend.google} primaryColor={googleColor} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap table-fixed min-w-[900px]">
                  <PaidColGroup />
                  <thead className="bg-gray-50 dark:bg-[#0d1020]">
                    <tr>
                      {['Campaign', 'Status', 'Budget/Day', 'Cost', 'Impr', 'CTR', 'Clicks', 'CPC', 'Conv', 'Cost/Conv'].map((h, i) => (
                        <th key={h} className={`${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'} px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}>{h}</th>
                      ))}
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ROAS</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">Conv (CH)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">Cost/Conv (CH)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">ROAS (CH)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-white/[0.06]">
                    {/* Aligned totals row */}
                    <tr className="bg-gray-100 dark:bg-[#0d1020] font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-white/10">
                      <td className="px-4 py-3">Totals</td>
                      <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">—</td>
                      <td className="px-4 py-3 text-right">{fmt$(m.googleBudget)}</td>
                      <td className="px-4 py-3 text-right">{fmt$2(m.googleSpend)}</td>
                      <td className="px-4 py-3 text-right">{fmtNum(m.googleImpr)}</td>
                      <td className="px-4 py-3 text-right">{fmtPct(m.googleImpr > 0 ? m.googleClicks / m.googleImpr : 0)}</td>
                      <td className="px-4 py-3 text-right">{fmtNum(m.googleClicks)}</td>
                      <td className="px-4 py-3 text-right">{fmt$2(m.googleClicks > 0 ? m.googleSpend / m.googleClicks : 0)}</td>
                      <td className="px-4 py-3 text-right">{Number(m.gConvGoogle || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right">{m.gConvGoogle > 0 ? fmt$2(m.googleSpend / m.gConvGoogle) : '—'}</td>
                      <td className="px-4 py-3 text-right">{m.gRoasPlatform > 0 ? fmtRoas(m.gRoasPlatform) : '—'}</td>
                      <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.gConv}</td>
                      <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.gConv > 0 ? fmt$2(m.googleSpend / m.gConv) : '—'}</td>
                      <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.gRoas > 0 ? fmtRoas(m.gRoas) : '—'}</td>
                    </tr>
                    {campaigns.map(c => {
                      const a = campaignAttr[c.campaign_id] || { count: 0, revenue: 0 }
                      const cpc = c.clicks > 0 ? c.cost / c.clicks : 0
                      const ctr = c.impressions > 0 ? c.clicks / c.impressions : 0
                      const cpConv = c.conversions > 0 ? c.cost / c.conversions : 0
                      const chCost = a.count > 0 ? c.cost / a.count : 0
                      const roas = c.cost > 0 ? a.revenue / c.cost : 0
                      const enabled = c.status === 'ENABLED'
                      return (
                        <tr key={c.campaign_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800 dark:text-white truncate max-w-[260px]">{c.campaign_name}</div>
                            <div className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">ID: {c.campaign_id}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${enabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                              {enabled ? 'Enabled' : 'Paused'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$(c.budget)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(c.cost)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(c.impressions)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtPct(ctr)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(c.clicks)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(cpc)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{Number(c.conversions || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{c.conversions > 0 ? fmt$2(cpConv) : '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{c.cost > 0 && Number(c.conversions_value) > 0 ? fmtRoas(Number(c.conversions_value) / c.cost) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count > 0 ? fmt$2(chCost) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count > 0 ? fmtRoas(roas) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </Section>

          {/* Meta (Facebook) */}
          <Section id="meta" icon={platformIcon.meta} name="Meta Ads"
            count={metaCampaigns.length ? `${metaCampaigns.length} campaign${metaCampaigns.length === 1 ? '' : 's'}` : null}
            open={open.meta} onToggle={toggle}
            action={<LastUpdated syncedAt={metaSynced} syncing={metaSyncing} onRefresh={handleMetaRefresh} />}
            kpis={open.meta ? [] : (metaCampaigns.length ? [
              { label: 'Spend', value: fmt$(m.metaSpend) },
              { label: 'Clicks', value: fmtNum(m.metaClicks) },
              { label: 'Conv', value: fmtNum(m.mConvPlatform) },
              { label: 'Conv (CH)', value: fmtNum(m.mConv), ch: true },
              { label: 'ROAS (CH)', value: fmtRoas(m.mRoas), ch: true },
            ] : [{ label: 'Not connected', value: '—' }])}>
            {metaCampaigns.length === 0 ? (
              <div className="px-5 py-5">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">No Meta data in range</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Connect Meta or widen the date range. Spend matches to CH-attributed orders via the captured campaign IDs.</p>
              </div>
            ) : (
              <>
              <TrendChart dates={trend.dates} a={trend.meta} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap table-fixed min-w-[900px]">
                  <PaidColGroup />
                  <thead className="bg-gray-50 dark:bg-[#0d1020]">
                    <tr>
                      {['Campaign', 'Status', 'Budget/Day', 'Cost', 'Impr', 'CTR', 'Clicks', 'CPC', 'Conv', 'Cost/Conv'].map((h, i) => (
                        <th key={h} className={`${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'} px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}>{h}</th>
                      ))}
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ROAS</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">Conv (CH)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">Cost/Conv (CH)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">ROAS (CH)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-white/[0.06]">
                    {/* Aligned totals row */}
                    <tr className="bg-gray-100 dark:bg-[#0d1020] font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-white/10">
                      <td className="px-4 py-3">Totals</td>
                      <td className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">—</td>
                      <td className="px-4 py-3 text-right">{m.metaBudget > 0 ? fmt$(m.metaBudget) : '—'}</td>
                      <td className="px-4 py-3 text-right">{fmt$2(m.metaSpend)}</td>
                      <td className="px-4 py-3 text-right">{fmtNum(m.metaImpr)}</td>
                      <td className="px-4 py-3 text-right">{fmtPct(m.metaImpr > 0 ? m.metaClicks / m.metaImpr : 0)}</td>
                      <td className="px-4 py-3 text-right">{fmtNum(m.metaClicks)}</td>
                      <td className="px-4 py-3 text-right">{fmt$2(m.metaClicks > 0 ? m.metaSpend / m.metaClicks : 0)}</td>
                      <td className="px-4 py-3 text-right">{Number(m.mConvPlatform || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right">{m.mConvPlatform > 0 ? fmt$2(m.metaSpend / m.mConvPlatform) : '—'}</td>
                      <td className="px-4 py-3 text-right">{m.mRoasPlatform > 0 ? fmtRoas(m.mRoasPlatform) : '—'}</td>
                      <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.mConv}</td>
                      <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.mConv > 0 ? fmt$2(m.metaSpend / m.mConv) : '—'}</td>
                      <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.mRoas > 0 ? fmtRoas(m.mRoas) : '—'}</td>
                    </tr>
                    {metaCampaigns.map(c => {
                      const a = campaignAttr[c.campaign_id] || { count: 0, revenue: 0 }
                      const cpc = c.clicks > 0 ? c.spend / c.clicks : 0
                      const ctr = c.impressions > 0 ? c.clicks / c.impressions : 0
                      const cpConv = c.conversions > 0 ? c.spend / c.conversions : 0
                      const chCost = a.count > 0 ? c.spend / a.count : 0
                      const roas = c.spend > 0 ? a.revenue / c.spend : 0
                      const enabled = c.status === 'ENABLED'
                      return (
                        <tr key={c.campaign_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800 dark:text-white truncate max-w-[260px]">{c.campaign_name}</div>
                            <div className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">ID: {c.campaign_id}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.status ? (
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${enabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                {enabled ? 'Enabled' : 'Paused'}
                              </span>
                            ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{c.budget > 0 ? fmt$(c.budget) : '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(c.spend)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(c.impressions)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtPct(ctr)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(c.clicks)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(cpc)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{Number(c.conversions || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{c.conversions > 0 ? fmt$2(cpConv) : '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{c.spend > 0 && Number(c.conversions_value) > 0 ? fmtRoas(Number(c.conversions_value) / c.spend) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count > 0 ? fmt$2(chCost) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count > 0 ? fmtRoas(roas) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </Section>

          {/* Orders */}
          <Section id="orders" icon={platformIcon.orders} name="Orders" count={`${fmtNum(m.orderCount)} total`} open={open.orders} onToggle={toggle}
            kpis={[
              { label: 'Revenue', value: fmt$(m.revenue) },
              { label: 'AOV', value: fmt$2(m.aov) },
              { label: 'Tracked (CH)', value: fmtNum(m.trackedCount), ch: true },
              { label: 'Attributed', value: fmtPct(m.attrRate), ch: true },
            ]}>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-400 p-6">No orders in range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-[#0d1020]">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Order</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Channel</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Payment</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fulfillment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-white/[0.06]">
                    {orders.slice(0, 25).map(o => (
                      <tr key={o.lead_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{o.shopify_data?.order_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{o.created_at ? new Date(o.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{o.first_name} {o.last_name}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{deriveChannel(o)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{fmt$2(o.sale_amount)}</td>
                        <td className="px-4 py-3 text-center"><Pill status={o.shopify_data?.financial_status} /></td>
                        <td className="px-4 py-3 text-center"><Pill status={o.shopify_data?.fulfillment_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length > 25 && <p className="text-xs text-gray-400 px-4 py-3">Showing 25 of {fmtNum(orders.length)} orders.</p>}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}
