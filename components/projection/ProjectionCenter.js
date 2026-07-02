'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { buildCostBook, buildSkuIndex, orderCogs } from '../../lib/cogs'
import { isPaidOrder } from '../EcomControlCenter'
import { projectSeries } from './forecast'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const fmt$    = (n) => { const v = Math.round(Number(n) || 0); return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString() }
const fmt$2   = (n) => { const v = Number(n) || 0; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
const fmtNum  = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
const fmtRoas = (n) => (Math.round((n || 0) * 100) / 100) + 'x'
const sum     = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0)

// 8 weeks of history feeds the weekday-weighted forecast; the charts draw the
// trailing 30 actual days before the projected curve so the seam is visible.
const HISTORY_DAYS = 56
const CHART_HISTORY = 30

const HORIZON_OPTIONS = [[7, 'Next 7 Days'], [30, 'Next 30 Days'], [90, 'Next 90 Days']]

function localDay(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(day, n) {
  const d = new Date(day + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDay(d)
}

function isLightHex(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 180
}

// Small ⓘ icon revealing an explanation on hover/focus (same as the dashboard).
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

// Accordion section with inline KPI summary in the header bar (dashboard twin).
function Section({ id, icon, name, count, kpis, open, onToggle, children }) {
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
        <div className="flex items-center gap-6 flex-shrink-0">
          {kpis.map((k, i) => (
            <div key={i} className="text-right">
              <div className={`text-base font-bold leading-tight ${k.tone === 'bad' ? 'text-rose-500 dark:text-rose-400' : k.tone === 'cost' ? 'text-amber-500 dark:text-amber-400' : k.ch ? 'text-[#34CC93]' : 'text-gray-900 dark:text-white'}`}>{k.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-0.5">{k.label}{k.info && <InfoTip text={k.info} />}</div>
            </div>
          ))}
        </div>
      </div>
      {open && <div className="border-t border-gray-100 dark:border-white/[0.06]">{children}</div>}
    </div>
  )
}

const sectionIcon = {
  overview: <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgb(var(--blue-400)), rgb(var(--blue-700)))' }}>∑</div>,
  blended:  <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgb(var(--blue-400)), rgb(var(--blue-700)))' }}>∑</div>,
  orders:   <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgb(var(--blue-400)), rgb(var(--blue-700)))' }}>🛍</div>,
}

// Dashed vertical divider where actuals end and the projection begins.
const projectionDivider = {
  id: 'projectionDivider',
  afterDatasetsDraw(chart, args, opts) {
    if (opts?.index == null) return
    const x = chart.scales.x.getPixelForValue(opts.index)
    const { top, bottom } = chart.chartArea
    const ctx = chart.ctx
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(148,163,184,0.5)'
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#9aa4bf'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Projected →', x + 6, top + 12)
    ctx.restore()
  },
}

// History (solid, gradient fill) + projection (dashed) chart with toggle chips.
// metrics: [{ key, label, color, axis: 'money'|'count', hist: [], proj: [], on }]
function ForecastChart({ labels, histLen, metrics, height = 264 }) {
  const [on, setOn] = useState({})
  const active = (md) => on[md.key] ?? (md.on !== false)

  const gradient = (ctx, color) => {
    const area = ctx.chart.chartArea
    if (!area) return color + '00'
    const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
    g.addColorStop(0, color + '33')
    g.addColorStop(1, color + '00')
    return g
  }

  const datasets = []
  for (const md of metrics) {
    if (!active(md)) continue
    const yAxisID = md.axis === 'money' ? 'y1' : 'y'
    const shared = { borderColor: md.color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 3, tension: 0.35, yAxisID }
    datasets.push({
      ...shared,
      label: md.label,
      data: [...md.hist, ...Array(md.proj.length).fill(null)],
      backgroundColor: (ctx) => gradient(ctx, md.color),
      fill: true,
    })
    datasets.push({
      ...shared,
      label: `${md.label} · projected`,
      // Repeat the last actual point so the dashed curve connects to the solid one.
      data: [...Array(Math.max(0, md.hist.length - 1)).fill(null), md.hist[md.hist.length - 1] ?? null, ...md.proj],
      borderDash: [5, 4],
      fill: false,
    })
  }
  const anyMoney = metrics.some(md => active(md) && md.axis === 'money')
  const anyCount = metrics.some(md => active(md) && md.axis === 'count')

  return (
    <div className="px-5 pt-4 pb-5">
      <div className="flex flex-wrap gap-1.5 pb-3">
        {metrics.map(md => (
          <button
            key={md.key}
            onClick={() => setOn(o => ({ ...o, [md.key]: !active(md) }))}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${active(md) ? 'border-transparent' : 'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/10 hover:text-gray-600 dark:hover:text-gray-300'}`}
            style={active(md) ? { background: md.color, color: isLightHex(md.color) ? '#111' : '#fff' } : {}}
          >
            {md.label}
          </button>
        ))}
      </div>
      <div style={{ height }}>
        <Line
          plugins={[projectionDivider]}
          data={{ labels, datasets }}
          options={{
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              projectionDivider: { index: histLen - 1 },
              tooltip: {
                callbacks: {
                  label: (c) => ` ${c.dataset.label}: ${c.dataset.yAxisID === 'y1' ? fmt$2(c.parsed.y) : fmtNum(c.parsed.y)}`,
                },
              },
            },
            scales: {
              x:  { grid: { display: false }, ticks: { color: '#9aa4bf', font: { size: 10 }, maxTicksLimit: 14 } },
              y:  { display: anyCount, position: 'left', grid: { drawOnChartArea: !anyMoney, color: 'rgba(148,163,184,0.14)' }, ticks: { color: '#9aa4bf', font: { size: 10 } } },
              y1: { display: anyMoney, position: 'right', grid: { drawOnChartArea: true, color: 'rgba(148,163,184,0.14)' }, ticks: { color: '#9aa4bf', font: { size: 10 }, callback: (v) => '$' + Number(v).toLocaleString() } },
            },
          }}
        />
      </div>
    </div>
  )
}

function ProjectionSkeleton() {
  const bar = 'bg-gray-200/70 dark:bg-white/[0.06] animate-pulse rounded'
  return (
    <div className="space-y-3">
      {[0, 1, 2].map(i => (
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

export default function ProjectionCenter({ clientId, clientName }) {
  const [horizon, setHorizon] = useState(30)
  const [orders, setOrders] = useState([])
  const [googleDaily, setGoogleDaily] = useState([])
  const [metaDaily, setMetaDaily] = useState([])
  const [tiktokDaily, setTiktokDaily] = useState([])
  const [mfg, setMfg] = useState({ materials: [], skus: [] })
  const [loading, setLoading] = useState(true)
  const [isDark, setIsDark] = useState(false)
  const [open, setOpen] = useState({ overview: true, blended: true, orders: true })
  const toggle = useCallback((id) => setOpen(o => ({ ...o, [id]: !o[id] })), [])

  // History window = the last 56 FULL days (through yesterday). Today is a
  // partial day — including it would drag every weighted average down.
  const histEnd = useMemo(() => addDays(localDay(), -1), [])
  const histStart = useMemo(() => addDays(histEnd, -(HISTORY_DAYS - 1)), [histEnd])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const dayStartISO = new Date(`${histStart}T00:00:00`).toISOString()
    const dayEndISO = new Date(`${histEnd}T23:59:59.999`).toISOString()
    Promise.all([
      supabase.from('client_lead')
        .select('lead_id, sale_amount, utm_campaign, utm_source, utm_medium, utm_content, shopify_data, created_at')
        .eq('client_id', clientId)
        .like('lead_id', 'shopify_%')
        .gte('created_at', dayStartISO)
        .lte('created_at', dayEndISO),
      supabase.from('client_yt_campaigns')
        .select('date, cost')
        .eq('client_id', clientId)
        .ilike('campaign_name', `%${clientId}%`)
        .gte('date', histStart)
        .lte('date', histEnd),
      supabase.from('client_meta_campaigns')
        .select('date, spend')
        .eq('client_id', clientId)
        .gte('date', histStart)
        .lte('date', histEnd),
      supabase.from('client_tiktok_campaigns')
        .select('date, spend')
        .eq('client_id', clientId)
        .gte('date', histStart)
        .lte('date', histEnd),
    ]).then(([ordersRes, gRes, mRes, tRes]) => {
      if (cancelled) return
      setOrders(ordersRes.data || [])
      setGoogleDaily(gRes.data || [])
      setMetaDaily(mRes.data || [])
      setTiktokDaily(tRes.data || [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [clientId, histStart, histEnd])

  // Manufacturing BOM → real COGS (same margin math the dashboard uses).
  useEffect(() => {
    fetch(`/api/manufacturing?client_id=${clientId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { materials: [], skus: [] })
      .then(d => setMfg(d || { materials: [], skus: [] })).catch(() => {})
  }, [clientId])
  const costBook = useMemo(() => buildCostBook(mfg.materials), [mfg])
  const skuIndex = useMemo(() => buildSkuIndex(mfg.skus), [mfg])
  const hasCogs = (mfg.skus?.length || 0) > 0

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Daily history series (oldest → newest, one slot per calendar day).
  const hist = useMemo(() => {
    const dates = []
    for (let d = histStart; d <= histEnd; d = addDays(d, 1)) dates.push(d)
    const idx = Object.fromEntries(dates.map((d, i) => [d, i]))
    const zeros = () => Array(dates.length).fill(0)
    const revenue = zeros(), orderCount = zeros(), paidRevenue = zeros(), cogsDaily = zeros()
    const gSpend = zeros(), mSpend = zeros(), tSpend = zeros()
    for (const o of orders) {
      const i = idx[localDay(new Date(o.created_at))]
      if (i == null) continue
      const rev = Number(o.sale_amount) || 0
      revenue[i] += rev
      orderCount[i] += 1
      if (isPaidOrder(o)) paidRevenue[i] += rev
      if (hasCogs) cogsDaily[i] += orderCogs(o.shopify_data?.line_items || [], skuIndex, costBook).cogs
    }
    for (const r of googleDaily) { const i = idx[String(r.date).slice(0, 10)]; if (i != null) gSpend[i] += Number(r.cost) || 0 }
    for (const r of metaDaily)   { const i = idx[String(r.date).slice(0, 10)]; if (i != null) mSpend[i] += Number(r.spend) || 0 }
    for (const r of tiktokDaily) { const i = idx[String(r.date).slice(0, 10)]; if (i != null) tSpend[i] += Number(r.spend) || 0 }
    const spend = dates.map((_, i) => gSpend[i] + mSpend[i] + tSpend[i])
    return { dates, revenue, orderCount, paidRevenue, cogsDaily, gSpend, mSpend, tSpend, spend }
  }, [orders, googleDaily, metaDaily, tiktokDaily, histStart, histEnd, hasCogs, skuIndex, costBook])

  // Project every base series forward; derive money metrics from them.
  const proj = useMemo(() => {
    const revenue = projectSeries(hist.revenue, horizon)
    const orderCount = projectSeries(hist.orderCount, horizon)
    const paidRevenue = projectSeries(hist.paidRevenue, horizon)
    const gSpend = projectSeries(hist.gSpend, horizon)
    const mSpend = projectSeries(hist.mSpend, horizon)
    const tSpend = projectSeries(hist.tSpend, horizon)
    const spend = revenue.map((_, i) => gSpend[i] + mSpend[i] + tSpend[i])

    // COGS scales with revenue, so project it as the historical margin rate
    // applied to projected revenue rather than as an independent series.
    const histRev = sum(hist.revenue)
    const cogsRate = hasCogs && histRev > 0 ? sum(hist.cogsDaily) / histRev : null
    const cogs = cogsRate != null ? revenue.map(v => v * cogsRate) : null
    const netProfit = cogs ? revenue.map((v, i) => v - cogs[i] - spend[i]) : null

    const dates = Array.from({ length: horizon }, (_, i) => addDays(histEnd, i + 1))
    const totals = {
      revenue: sum(revenue), orders: sum(orderCount), spend: sum(spend),
      gSpend: sum(gSpend), mSpend: sum(mSpend), tSpend: sum(tSpend),
      cogs: cogs ? sum(cogs) : null,
      netProfit: netProfit ? sum(netProfit) : null,
      // Paid-only, margin-aware ROAS — organic revenue never inflates it.
      trueRoas: cogsRate != null && sum(spend) > 0 ? (sum(paidRevenue) * (1 - cogsRate)) / sum(spend) : null,
    }
    return { dates, revenue, orderCount, paidRevenue, gSpend, mSpend, tSpend, spend, cogs, netProfit, cogsRate, totals }
  }, [hist, horizon, hasCogs, histEnd])

  // Chart window: trailing 30 actual days + the projected horizon.
  const chart = useMemo(() => {
    const cut = Math.max(0, hist.dates.length - CHART_HISTORY)
    const slice = (arr) => arr.slice(cut)
    const dates = [...slice(hist.dates), ...proj.dates]
    const labels = dates.map(d => { const [, m, dd] = d.split('-'); return `${Number(m)}/${Number(dd)}` })
    const histNet = hist.dates.map((_, i) => hist.revenue[i] - hist.cogsDaily[i] - hist.spend[i])
    return {
      labels,
      histLen: hist.dates.length - cut,
      revenue: slice(hist.revenue), spend: slice(hist.spend), net: slice(histNet),
      orders: slice(hist.orderCount), gSpend: slice(hist.gSpend), mSpend: slice(hist.mSpend), tSpend: slice(hist.tSpend),
    }
  }, [hist, proj.dates])

  const t = proj.totals
  const horizonLabel = HORIZON_OPTIONS.find(([v]) => v === horizon)?.[1] || `Next ${horizon} Days`
  const googleColor = isDark ? '#ffffff' : '#171717'
  const hasTiktok = sum(hist.tSpend) > 0

  const overviewKpis = [
    { label: 'Proj Revenue', value: fmt$(t.revenue), info: `Projected gross revenue over the ${horizonLabel.toLowerCase()} — every channel, paid and organic.` },
    { label: 'Proj COGS', value: t.cogs != null ? fmt$(t.cogs) : '—', tone: 'cost', info: 'Projected cost of goods sold = projected revenue × your real historical margin rate (from the BOM).' },
    { label: 'Proj Ad Spend', value: fmt$(t.spend), tone: 'cost', info: 'Projected blended Google + Meta + TikTok spend, continuing recent daily spend patterns.' },
    { label: 'Proj Net Profit', value: t.netProfit != null ? fmt$(t.netProfit) : '—', ch: t.netProfit != null && t.netProfit >= 0, tone: t.netProfit != null && t.netProfit < 0 ? 'bad' : undefined, info: 'Projected revenue − projected COGS − projected ad spend.' },
    { label: 'Proj True ROAS', value: t.trueRoas != null ? fmtRoas(t.trueRoas) : '—', ch: true, info: 'Projected paid-only, margin-aware ROAS = projected paid contribution ÷ projected ad spend. Organic sales are excluded.' },
    { label: 'Proj Orders', value: fmtNum(t.orders), info: `Projected order count over the ${horizonLabel.toLowerCase()}.` },
  ]

  const overviewMetrics = [
    { key: 'revenue', label: 'Revenue', color: '#34CC93', axis: 'money', hist: chart.revenue, proj: proj.revenue, on: true },
    { key: 'spend', label: 'Ad Spend', color: '#3b82f6', axis: 'money', hist: chart.spend, proj: proj.spend, on: true },
    ...(proj.netProfit ? [{ key: 'net', label: 'Net Profit', color: '#a855f7', axis: 'money', hist: chart.net, proj: proj.netProfit, on: true }] : []),
    { key: 'orders', label: 'Orders', color: '#f59e0b', axis: 'count', hist: chart.orders, proj: proj.orderCount, on: false },
  ]

  const blendedMetrics = [
    { key: 'google', label: 'Google', color: googleColor, axis: 'money', hist: chart.gSpend, proj: proj.gSpend, on: true },
    { key: 'meta', label: 'Meta', color: '#0866FF', axis: 'money', hist: chart.mSpend, proj: proj.mSpend, on: true },
    ...(hasTiktok ? [{ key: 'tiktok', label: 'TikTok', color: '#8b5cf6', axis: 'money', hist: chart.tSpend, proj: proj.tSpend, on: true }] : []),
  ]

  const ordersMetrics = [
    { key: 'orders', label: 'Orders', color: '#f59e0b', axis: 'count', hist: chart.orders, proj: proj.orderCount, on: true },
    { key: 'revenue', label: 'Revenue', color: '#34CC93', axis: 'money', hist: chart.revenue, proj: proj.revenue, on: true },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <span className="inline-block text-[10px] font-bold text-[#846CC5] bg-[#846CC5]/12 rounded px-2 py-0.5 mb-1.5">FORECAST</span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projections</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {clientName || clientId} — {horizonLabel.toLowerCase()} projected from weighted averages of the last 8 weeks.
          </p>
        </div>
        <select
          value={horizon}
          onChange={e => setHorizon(Number(e.target.value))}
          className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {HORIZON_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </select>
      </div>

      {loading ? (
        <ProjectionSkeleton />
      ) : (
        <div>
          {/* Overview */}
          <Section id="overview" icon={sectionIcon.overview} name="Overview" count={horizonLabel} kpis={overviewKpis} open={open.overview} onToggle={toggle}>
            <ForecastChart labels={chart.labels} histLen={chart.histLen} metrics={overviewMetrics} />
            <p className="px-5 pb-4 -mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              Method: each projected day is a weighted average of the same weekday over the last 8 weeks (recent weeks weighted heavier), scaled by the 28-day growth trend. Solid = actual, dashed = projected.
            </p>
          </Section>

          {/* Blended Ads */}
          <Section id="blended" icon={sectionIcon.blended} name="Blended Ads" count={hasTiktok ? 'Google + Meta + TikTok' : 'Google + Meta'} open={open.blended} onToggle={toggle}
            kpis={[
              { label: 'Proj Spend', value: fmt$(t.spend), tone: 'cost', info: 'Total projected ad spend across platforms.' },
              { label: 'Proj Google', value: fmt$(t.gSpend), info: 'Projected Google Ads spend.' },
              { label: 'Proj Meta', value: fmt$(t.mSpend), info: 'Projected Meta spend.' },
              ...(hasTiktok ? [{ label: 'Proj TikTok', value: fmt$(t.tSpend), info: 'Projected TikTok spend.' }] : []),
              { label: 'Proj True ROAS', value: t.trueRoas != null ? fmtRoas(t.trueRoas) : '—', ch: true, info: 'Projected paid contribution ÷ projected blended spend.' },
            ]}>
            <ForecastChart labels={chart.labels} histLen={chart.histLen} metrics={blendedMetrics} height={220} />
          </Section>

          {/* Orders */}
          <Section id="orders" icon={sectionIcon.orders} name="Orders" count={horizonLabel} open={open.orders} onToggle={toggle}
            kpis={[
              { label: 'Proj Orders', value: fmtNum(t.orders), info: `Projected orders over the ${horizonLabel.toLowerCase()}.` },
              { label: 'Proj AOV', value: t.orders > 0 ? fmt$2(t.revenue / t.orders) : '—', info: 'Projected revenue ÷ projected orders.' },
              { label: 'Proj Revenue', value: fmt$(t.revenue), info: 'Projected gross revenue, all channels.' },
            ]}>
            <ForecastChart labels={chart.labels} histLen={chart.histLen} metrics={ordersMetrics} height={220} />
          </Section>
        </div>
      )}
    </div>
  )
}
