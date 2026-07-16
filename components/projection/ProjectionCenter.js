'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAllRows } from '../../lib/fetch-all'
import { buildCostBook, buildSkuIndex, orderCogs } from '../../lib/cogs'
import { isPaidOrder } from '../EcomControlCenter'
import { projectSeries, applyScenario, isNeutralScenario, defaultScenario } from './forecast'
import InfoTip from './InfoTip'
import ScenarioPanel from './ScenarioPanel'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const fmt$    = (n) => { const v = Math.round(Number(n) || 0); return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString() }
const fmt$2   = (n) => { const v = Number(n) || 0; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
const fmtNum  = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
const fmtRoas = (n) => (Math.round((n || 0) * 100) / 100) + 'x'
const fmtDelta = (n) => (Number(n) >= 0 ? '+$' : '-$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString()
const sum     = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0)

// 8 weeks of history feeds the weekday-weighted forecast; the charts draw the
// trailing 30 actual days before the projected curve so the seam is visible.
const HISTORY_DAYS = 56
const CHART_HISTORY = 30

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

const gradIcon = (glyph) => (
  <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgb(var(--blue-400)), rgb(var(--blue-700)))' }}>{glyph}</div>
)
const sectionIcon = {
  scenario: gradIcon('⚡'),
  overview: gradIcon('∑'),
  blended:  gradIcon('∑'),
  orders:   gradIcon('🛍'),
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
// metrics: [{ key, label, color, axis, hist: [], proj: [], base?: [], on }]
// `base` (optional) draws the pre-scenario baseline as a faint dotted line.
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
    const bridge = (arr) => [...Array(Math.max(0, md.hist.length - 1)).fill(null), md.hist[md.hist.length - 1] ?? null, ...arr]
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
      data: bridge(md.proj),
      borderDash: [5, 4],
      fill: false,
    })
    if (md.base) {
      datasets.push({
        ...shared,
        label: `${md.label} · baseline`,
        data: bridge(md.base),
        borderColor: md.color + '55',
        borderWidth: 1.5,
        borderDash: [2, 3],
        fill: false,
      })
    }
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
  const [open, setOpen] = useState({ scenario: true, overview: true, blended: true, orders: true })
  const toggle = useCallback((id) => setOpen(o => ({ ...o, [id]: !o[id] })), [])

  // Scenario is saved per client in this browser (localStorage) — it's a
  // planning sketch, not shared data.
  const [scenario, setScenario] = useState(() => {
    if (typeof window === 'undefined') return defaultScenario()
    try {
      const saved = JSON.parse(localStorage.getItem(`projection_scenario_${clientId}`) || 'null')
      return saved ? { ...defaultScenario(), ...saved, budget: { ...defaultScenario().budget, ...saved.budget } } : defaultScenario()
    } catch { return defaultScenario() }
  })
  useEffect(() => {
    try { localStorage.setItem(`projection_scenario_${clientId}`, JSON.stringify(scenario)) } catch {}
  }, [scenario, clientId])
  const neutral = isNeutralScenario(scenario)

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
      // Paginated — PostgREST's 1,000-row cap silently truncates busy ranges.
      fetchAllRows((from, to) => supabase.from('client_orders')
        .select('lead_id:order_id, sale_amount, utm_campaign, utm_source, utm_medium, utm_content, shopify_data, created_at')
        .eq('client_id', clientId)
        .gte('created_at', dayStartISO)
        .lte('created_at', dayEndISO)
        .order('created_at', { ascending: false })
        .range(from, to)).then(rows => ({ data: rows })).catch(() => ({ data: [] })),
      supabase.from('client_google_campaigns')
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

  // COGS scales with revenue, so it projects as the historical margin rate
  // applied to projected revenue rather than as an independent series.
  const cogsRate = useMemo(() => {
    const histRev = sum(hist.revenue)
    return hasCogs && histRev > 0 ? sum(hist.cogsDaily) / histRev : null
  }, [hist, hasCogs])

  // Baseline projection → scenario-adjusted projection → derived money metrics.
  const proj = useMemo(() => {
    const dates = Array.from({ length: horizon }, (_, i) => addDays(histEnd, i + 1))
    // Spend is a controlled input, not an outcome: it projects flat from the
    // current run-rate (weekday-weighted, last 2 weeks, no trend). Only the
    // scenario levers move it. Revenue/orders keep the growth trend.
    const SPEND_OPTS = { trend: false, maxSamples: 2, decay: 0.5 }
    const basis = {
      dates,
      revenue: projectSeries(hist.revenue, horizon),
      orderCount: projectSeries(hist.orderCount, horizon),
      paidRevenue: projectSeries(hist.paidRevenue, horizon),
      gSpend: projectSeries(hist.gSpend, horizon, SPEND_OPTS),
      mSpend: projectSeries(hist.mSpend, horizon, SPEND_OPTS),
      tSpend: projectSeries(hist.tSpend, horizon, SPEND_OPTS),
    }
    const derive = (p) => {
      const spend = p.revenue.map((_, i) => p.gSpend[i] + p.mSpend[i] + p.tSpend[i])
      const cogs = cogsRate != null ? p.revenue.map(v => v * cogsRate) : null
      const netProfit = cogs ? p.revenue.map((v, i) => v - cogs[i] - spend[i]) : null
      const totals = {
        revenue: sum(p.revenue), orders: sum(p.orderCount), spend: sum(spend),
        gSpend: sum(p.gSpend), mSpend: sum(p.mSpend), tSpend: sum(p.tSpend),
        cogs: cogs ? sum(cogs) : null,
        netProfit: netProfit ? sum(netProfit) : null,
        // Paid-only, margin-aware ROAS — organic revenue never inflates it.
        trueRoas: cogsRate != null && sum(spend) > 0 ? (sum(p.paidRevenue) * (1 - cogsRate)) / sum(spend) : null,
      }
      return { ...p, spend, cogs, netProfit, totals }
    }
    const baseline = derive(basis)
    const scen = derive(applyScenario(basis, scenario))
    return { dates, baseline, scen }
  }, [hist, horizon, cogsRate, histEnd, scenario])

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

  const t = proj.scen.totals
  const bt = proj.baseline.totals
  const delta = {
    revenue: t.revenue - bt.revenue,
    spend: t.spend - bt.spend,
    netProfit: t.netProfit != null && bt.netProfit != null ? t.netProfit - bt.netProfit : null,
  }

  // Horizon options include "through Dec 31" so Black Friday planning fits.
  const horizonOptions = useMemo(() => {
    const now = new Date()
    const eoy = Math.max(7, Math.round((new Date(now.getFullYear(), 11, 31) - now) / 86400000))
    return [[7, 'Next 7 Days'], [30, 'Next 30 Days'], [90, 'Next 90 Days'], [eoy, 'Through Dec 31']]
  }, [])
  const horizonLabel = horizonOptions.find(([v]) => v === horizon)?.[1] || `Next ${horizon} Days`

  const googleColor = isDark ? '#ffffff' : '#171717'
  const hasTiktok = sum(hist.tSpend) > 0
  const platforms = [
    { key: 'google', label: 'Google', hasSpend: sum(hist.gSpend) > 0 },
    { key: 'meta', label: 'Meta', hasSpend: sum(hist.mSpend) > 0 },
    ...(hasTiktok ? [{ key: 'tiktok', label: 'TikTok', hasSpend: true }] : []),
  ]

  // Baseline comparison lines only appear once the scenario changes something.
  const base = (arr) => (neutral ? null : arr)

  const scenarioKpis = neutral ? [
    { label: 'Status', value: 'Baseline', info: 'No scenario changes applied — the projection is pure history extrapolation. Push a budget lever or add an event to see the impact.' },
  ] : [
    { label: 'Δ Revenue', value: fmtDelta(delta.revenue), ch: delta.revenue >= 0, info: 'Scenario revenue minus baseline revenue over the horizon.' },
    { label: 'Δ Ad Spend', value: fmtDelta(delta.spend), tone: 'cost', info: 'Scenario spend minus baseline spend over the horizon.' },
    { label: 'Δ Net Profit', value: delta.netProfit != null ? fmtDelta(delta.netProfit) : '—', ch: delta.netProfit != null && delta.netProfit >= 0, tone: delta.netProfit != null && delta.netProfit < 0 ? 'bad' : undefined, info: 'The bottom line of the plan: extra revenue minus extra COGS minus extra ad spend. Negative = the push loses money under these assumptions.' },
    { label: 'Scenario ROAS', value: t.trueRoas != null ? fmtRoas(t.trueRoas) : '—', ch: true, info: 'Projected True ROAS (paid-only, margin-aware) with the scenario applied. Compare against the baseline in the Overview tooltip.' },
  ]

  const overviewKpis = [
    { label: 'Proj Revenue', value: fmt$(t.revenue), info: `Projected gross revenue over the ${horizonLabel.toLowerCase()} — every channel, paid and organic.${neutral ? '' : ` Includes your scenario (baseline: ${fmt$(bt.revenue)}).`}` },
    { label: 'Proj COGS', value: t.cogs != null ? fmt$(t.cogs) : '—', tone: 'cost', info: 'Projected cost of goods sold = projected revenue × your real historical margin rate (from the BOM).' },
    { label: 'Proj Ad Spend', value: fmt$(t.spend), tone: 'cost', info: `Projected blended ad spend.${neutral ? '' : ` Includes your budget push (baseline: ${fmt$(bt.spend)}).`}` },
    { label: 'Proj Net Profit', value: t.netProfit != null ? fmt$(t.netProfit) : '—', ch: t.netProfit != null && t.netProfit >= 0, tone: t.netProfit != null && t.netProfit < 0 ? 'bad' : undefined, info: `Projected revenue − projected COGS − projected ad spend.${neutral || t.netProfit == null ? '' : ` Baseline: ${fmt$(bt.netProfit)}.`}` },
    { label: 'Proj True ROAS', value: t.trueRoas != null ? fmtRoas(t.trueRoas) : '—', ch: true, info: `Projected paid-only, margin-aware ROAS = projected paid contribution ÷ projected ad spend. Organic sales are excluded.${neutral || t.trueRoas == null ? '' : ` Baseline: ${fmtRoas(bt.trueRoas)} — pushing budget usually lowers ROAS while raising total profit; watch Δ Net Profit.`}` },
    { label: 'Proj Orders', value: fmtNum(t.orders), info: `Projected order count over the ${horizonLabel.toLowerCase()}.` },
  ]

  const overviewMetrics = [
    { key: 'revenue', label: 'Revenue', color: '#34CC93', axis: 'money', hist: chart.revenue, proj: proj.scen.revenue, base: base(proj.baseline.revenue), on: true },
    { key: 'spend', label: 'Ad Spend', color: '#3b82f6', axis: 'money', hist: chart.spend, proj: proj.scen.spend, base: base(proj.baseline.spend), on: true },
    ...(proj.scen.netProfit ? [{ key: 'net', label: 'Net Profit', color: '#a855f7', axis: 'money', hist: chart.net, proj: proj.scen.netProfit, base: base(proj.baseline.netProfit), on: true }] : []),
    { key: 'orders', label: 'Orders', color: '#f59e0b', axis: 'count', hist: chart.orders, proj: proj.scen.orderCount, base: base(proj.baseline.orderCount), on: false },
  ]

  const blendedMetrics = [
    { key: 'google', label: 'Google', color: googleColor, axis: 'money', hist: chart.gSpend, proj: proj.scen.gSpend, base: base(proj.baseline.gSpend), on: true },
    { key: 'meta', label: 'Meta', color: '#0866FF', axis: 'money', hist: chart.mSpend, proj: proj.scen.mSpend, base: base(proj.baseline.mSpend), on: true },
    ...(hasTiktok ? [{ key: 'tiktok', label: 'TikTok', color: '#8b5cf6', axis: 'money', hist: chart.tSpend, proj: proj.scen.tSpend, base: base(proj.baseline.tSpend), on: true }] : []),
  ]

  const ordersMetrics = [
    { key: 'orders', label: 'Orders', color: '#f59e0b', axis: 'count', hist: chart.orders, proj: proj.scen.orderCount, base: base(proj.baseline.orderCount), on: true },
    { key: 'revenue', label: 'Revenue', color: '#34CC93', axis: 'money', hist: chart.revenue, proj: proj.scen.revenue, base: base(proj.baseline.revenue), on: true },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <span className="inline-block text-[10px] font-bold text-[#846CC5] bg-[#846CC5]/12 rounded px-2 py-0.5 mb-1.5">FORECAST</span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projections</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {clientName || clientId} — {horizonLabel.toLowerCase()} projected from weighted averages of the last 8 weeks{neutral ? '' : ', with your scenario applied'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!neutral && (
            <button
              onClick={() => setScenario(defaultScenario())}
              className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 transition"
              title="Clear all scenario changes"
            >
              Reset scenario
            </button>
          )}
          <select
            value={horizon}
            onChange={e => setHorizon(Number(e.target.value))}
            className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {horizonOptions.map(([val, label]) => <option key={label} value={val}>{label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <ProjectionSkeleton />
      ) : (
        <div>
          {/* Scenario planner */}
          <Section id="scenario" icon={sectionIcon.scenario} name="Scenario" count={neutral ? 'what-if planning' : 'active'} kpis={scenarioKpis} open={open.scenario} onToggle={toggle}>
            <ScenarioPanel scenario={scenario} setScenario={setScenario} platforms={platforms} />
            <p className="px-5 pb-4 -mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              Faint dotted lines on the charts show the baseline (no-scenario) projection for comparison. Scenario settings are saved in this browser per client.
            </p>
          </Section>

          {/* Overview */}
          <Section id="overview" icon={sectionIcon.overview} name="Overview" count={horizonLabel + (neutral ? '' : ' · scenario applied')} kpis={overviewKpis} open={open.overview} onToggle={toggle}>
            <ForecastChart labels={chart.labels} histLen={chart.histLen} metrics={overviewMetrics} />
            <p className="px-5 pb-4 -mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              Method: revenue &amp; orders project as a weighted average of the same weekday over the last 8 weeks (recent weeks weighted heavier), scaled by the 28-day growth trend. Ad spend projects flat from your current run-rate (last 2 weeks) — budgets are decisions, not forecasts, so only your scenario levers move them{neutral ? '' : '; your scenario is applied on top'}. Solid = actual, dashed = projected{neutral ? '' : ', dotted = baseline'}.
            </p>
          </Section>

          {/* Blended Ads */}
          <Section id="blended" icon={sectionIcon.blended} name="Blended Ads" count={hasTiktok ? 'Google + Meta + TikTok' : 'Google + Meta'} open={open.blended} onToggle={toggle}
            kpis={[
              { label: 'Proj Spend', value: fmt$(t.spend), tone: 'cost', info: 'Total projected ad spend across platforms, including any budget push.' },
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
              { label: 'Proj AOV', value: t.orders > 0 ? fmt$2(t.revenue / t.orders) : '—', info: 'Projected revenue ÷ projected orders. Scenarios assume AOV holds steady.' },
              { label: 'Proj Revenue', value: fmt$(t.revenue), info: 'Projected gross revenue, all channels.' },
            ]}>
            <ForecastChart labels={chart.labels} histLen={chart.histLen} metrics={ordersMetrics} height={220} />
          </Section>
        </div>
      )}
    </div>
  )
}
