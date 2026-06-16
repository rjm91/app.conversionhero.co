'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'
import ClientProjectsTasks from './ClientProjectsTasks'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const fmt$   = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
const fmt$2  = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n) => Number(n || 0).toLocaleString()
const fmtPct = (n) => (Math.round((n || 0) * 1000) / 10) + '%'

// Lead-status buckets for home-service pipeline rollups.
const isBooked = (s) => /appt/i.test(s || '')
const isSold   = (s) => /^sold$/i.test((s || '').trim())

function defaultDates() {
  const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30)
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
}
const RANGE_OPTIONS = [
  ['last_7', 'Last 7 Days'], ['last_14', 'Last 14 Days'], ['last_30', 'Last 30 Days'],
  ['last_90', 'Last 90 Days'], ['this_year', 'This Year'], ['last_year', 'Last Year'],
  ['all_time', 'All Time'], ['custom', 'Custom'],
]
function rangeFor(preset) {
  const today = new Date()
  const end = today.toISOString().slice(0, 10)
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
  switch (preset) {
    case 'last_7':    return { start: daysAgo(7),  end }
    case 'last_14':   return { start: daysAgo(14), end }
    case 'last_30':   return { start: daysAgo(30), end }
    case 'last_90':   return { start: daysAgo(90), end }
    case 'this_year': return { start: `${today.getFullYear()}-01-01`, end }
    case 'last_year': { const y = today.getFullYear() - 1; return { start: `${y}-01-01`, end: `${y}-12-31` } }
    case 'all_time':  return { start: '2000-01-01', end }
    default:          return null
  }
}

// ⓘ tooltip — fixed-positioned so it escapes the section's overflow clipping.
function InfoTip({ text }) {
  const [pos, setPos] = useState(null)
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(r.left + r.width / 2, 120), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 120)
    setPos({ x, y: r.bottom + 6 })
  }
  return (
    <span tabIndex={0} onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex align-middle ml-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 cursor-help outline-none">
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
      {pos && (
        <span style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateX(-50%)', zIndex: 60 }}
          className="pointer-events-none w-56 rounded-lg bg-gray-900 dark:bg-black/95 text-white text-[11px] font-normal normal-case tracking-normal leading-snug px-3 py-2 shadow-xl ring-1 ring-white/10">{text}</span>
      )}
    </span>
  )
}

function Section({ id, icon, name, count, kpis = [], open, onToggle, children, action }) {
  return (
    <div className="border border-gray-100 dark:border-white/[0.06] rounded-xl mb-3 bg-white dark:bg-[#111528] overflow-hidden">
      <div onClick={() => onToggle(id)} className="flex items-center gap-3.5 px-4 py-4 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-[#161b30] transition">
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
        {icon}
        <div className="min-w-0">
          <span className="text-[15px] font-bold text-gray-900 dark:text-white">{name}</span>
          {count != null && <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{count}</span>}
        </div>
        <div className="flex-1" />
        {action}
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

const TREND_METRICS = [
  { key: 'leads', label: 'Leads',  axis: 'count', color: '#34CC93' },
  { key: 'spend', label: 'Spend',  axis: 'money', color: '#3b82f6' },
  { key: 'clicks', label: 'Clicks', axis: 'count', color: '#f59e0b' },
  { key: 'conversions', label: 'Conv', axis: 'count', color: '#06b6d4' },
]
function TrendChart({ dates, series }) {
  const [active, setActive] = useState({ leads: true, spend: true })
  if (!dates.length) return null
  const labels = dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
  const fillGrad = (color) => (ctx) => {
    const area = ctx.chart.chartArea; if (!area) return color + '00'
    const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
    g.addColorStop(0, color + '59'); g.addColorStop(1, color + '00'); return g
  }
  const datasets = TREND_METRICS.filter(m => active[m.key]).map(m => ({
    label: m.label, data: series[m.key], borderColor: m.color, backgroundColor: fillGrad(m.color), fill: true,
    yAxisID: m.axis === 'money' ? 'y1' : 'y', tension: 0.3, borderWidth: 2, pointRadius: 0, pointHoverRadius: 3,
  }))
  const anyMoney = TREND_METRICS.some(m => active[m.key] && m.axis === 'money')
  const anyCount = TREND_METRICS.some(m => active[m.key] && m.axis === 'count')
  return (
    <div className="px-5 pt-5 pb-1">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TREND_METRICS.map(m => {
          const on = !!active[m.key]
          return (
            <button key={m.key} onClick={() => setActive(s => ({ ...s, [m.key]: !s[m.key] }))}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition ${on ? 'text-white border-transparent' : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'}`}
              style={on ? { background: m.color } : undefined}>{m.label}</button>
          )
        })}
      </div>
      <div className="h-52">
        {datasets.length === 0 ? <div className="h-full grid place-items-center text-sm text-gray-400">Select a metric to plot.</div> : (
          <Line data={{ labels, datasets }} options={{
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${/Spend/.test(c.dataset.label) ? '$' + Math.round(c.parsed.y).toLocaleString() : c.parsed.y.toLocaleString()}` } },
            },
            scales: {
              x:  { grid: { display: true, color: 'rgba(148,163,184,0.14)' }, ticks: { color: '#9aa4bf', maxTicksLimit: 8, font: { size: 10 } } },
              y:  { display: anyCount, position: 'left',  grid: { color: 'rgba(148,163,184,0.14)' }, ticks: { color: '#9aa4bf', font: { size: 10 }, precision: 0, count: 8 } },
              y1: { display: anyMoney, position: 'right', grid: { drawOnChartArea: !anyCount, color: 'rgba(148,163,184,0.14)' }, ticks: { color: '#9aa4bf', font: { size: 10 }, count: 8, callback: (v) => '$' + v.toLocaleString() } },
            },
          }} />
        )}
      </div>
    </div>
  )
}

function StatusPill({ enabled }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${enabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-gray-400'}`} />{enabled ? 'Enabled' : 'Paused'}
    </span>
  )
}

const APP_ICON = <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgb(var(--blue-400)), rgb(var(--blue-700)))' }}>∑</div>
const ICON = {
  overview: APP_ICON,
  google: <div className="w-7 h-7 rounded-lg grid place-items-center bg-white border border-gray-200 text-sm font-extrabold text-[#4285F4] flex-shrink-0">G</div>,
  video:  <div className="w-7 h-7 rounded-lg grid place-items-center bg-[#FF0000] text-white flex-shrink-0"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23 12s0-3.9-.5-5.8a3 3 0 00-2.1-2.1C18.5 3.5 12 3.5 12 3.5s-6.5 0-8.4.6A3 3 0 001.5 6.2C1 8.1 1 12 1 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 8.4.6 8.4.6s6.5 0 8.4-.6a3 3 0 002.1-2.1C23 15.9 23 12 23 12zM9.8 15.5v-7l6 3.5-6 3.5z"/></svg></div>,
  funnels: <div className="w-7 h-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgb(var(--blue-400)), rgb(var(--blue-700)))' }}><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18l-7 8v6l-4 2v-8L3 4z"/></svg></div>,
  leads: <div className="w-7 h-7 rounded-lg grid place-items-center bg-[#34CC93] text-white flex-shrink-0"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z"/></svg></div>,
  projects: <div className="w-7 h-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #a78bfa, #6d28d9)' }}><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg></div>,
}

export default function HomeServiceControlCenter({ clientId, clientName }) {
  const defaults = defaultDates()
  const [startDate, setStartDate] = useState(defaults.start)
  const [endDate, setEndDate]     = useState(defaults.end)
  const [appliedStart, setAppliedStart] = useState(defaults.start)
  const [appliedEnd, setAppliedEnd]     = useState(defaults.end)
  const [preset, setPreset] = useState('last_30')

  const [leads, setLeads]         = useState([])
  const [campDaily, setCampDaily] = useState([])
  const [adDaily, setAdDaily]     = useState([])
  const [funnels, setFunnels]     = useState([])
  const [steps, setSteps]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [firstLoad, setFirstLoad] = useState(true)
  const [open, setOpen] = useState({ overview: true, google: true, video: false, funnels: false, leads: false, projects: false })
  const [funnelOpen, setFunnelOpen] = useState({})
  const toggle = useCallback((id) => setOpen(o => ({ ...o, [id]: !o[id] })), [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [leadRes, campRes, adRes, funnelRes] = await Promise.all([
      supabase.from('client_lead').select('lead_id, first_name, last_name, email, phone, lead_status, utm_campaign, utm_source, created_at, ch_notes')
        .eq('client_id', clientId).gte('created_at', appliedStart).lte('created_at', appliedEnd + 'T23:59:59-12:00').order('created_at', { ascending: false }),
      supabase.from('client_yt_campaigns').select('*').eq('client_id', clientId).gte('date', appliedStart).lte('date', appliedEnd),
      supabase.from('client_yt_ads').select('*').eq('client_id', clientId).gte('date', appliedStart).lte('date', appliedEnd),
      supabase.from('client_funnels').select('*').eq('client_id', clientId),
    ])
    setLeads(leadRes.data || [])
    setCampDaily(campRes.data || [])
    setAdDaily(adRes.data || [])
    const fl = funnelRes.data || []
    setFunnels(fl)
    if (fl.length) {
      const { data: st } = await supabase.from('client_funnel_steps').select('*').in('funnel_id', fl.map(f => f.id)).order('step_order')
      setSteps(st || [])
    } else setSteps([])
    setLoading(false); setFirstLoad(false)
  }, [clientId, appliedStart, appliedEnd])

  useEffect(() => { fetchData() }, [fetchData])
  function applyDates() { setPreset('custom'); setAppliedStart(startDate); setAppliedEnd(endDate) }
  function onPresetChange(key) {
    setPreset(key); if (key === 'custom') return
    const r = rangeFor(key); if (!r) return
    setStartDate(r.start); setEndDate(r.end); setAppliedStart(r.start); setAppliedEnd(r.end)
  }

  // Lead attribution by campaign id (utm_campaign → count)
  const leadsByCampaign = useMemo(() => {
    const m = {}
    for (const l of leads) { const c = (l.utm_campaign || '').trim(); if (c) m[c] = (m[c] || 0) + 1 }
    return m
  }, [leads])

  // Aggregate Google campaigns per campaign_id
  const campaigns = useMemo(() => {
    const map = {}
    for (const r of campDaily) {
      const id = r.campaign_id
      if (!map[id]) map[id] = { campaign_id: id, campaign_name: r.campaign_name, status: r.status, budget: r.budget, cost: 0, impressions: 0, clicks: 0, conversions: 0, synced_at: r.synced_at }
      map[id].cost += Number(r.cost) || 0; map[id].impressions += Number(r.impressions) || 0
      map[id].clicks += Number(r.clicks) || 0; map[id].conversions += Number(r.conversions) || 0
      if (r.synced_at > map[id].synced_at) { map[id].status = r.status; map[id].budget = r.budget; map[id].synced_at = r.synced_at }
    }
    return Object.values(map).sort((a, b) => b.cost - a.cost)
  }, [campDaily])

  // Aggregate video ads per ad_id
  const videoAds = useMemo(() => {
    const map = {}
    for (const r of adDaily) {
      const id = r.ad_id
      if (!map[id]) map[id] = { ad_id: id, ad_name: r.ad_name, ad_type: r.ad_type, status: r.status, youtube_video_id: r.youtube_video_id, cost: 0, clicks: 0, conversions: 0, synced_at: r.synced_at }
      map[id].cost += Number(r.cost) || 0; map[id].clicks += Number(r.clicks) || 0; map[id].conversions += Number(r.conversions) || 0
      if (r.youtube_video_id && !map[id].youtube_video_id) map[id].youtube_video_id = r.youtube_video_id
      if (r.synced_at > map[id].synced_at) { map[id].status = r.status; map[id].synced_at = r.synced_at }
    }
    return Object.values(map).sort((a, b) => b.cost - a.cost)
  }, [adDaily])

  const stepsByFunnel = useMemo(() => {
    const m = {}
    for (const s of steps) { (m[s.funnel_id] = m[s.funnel_id] || []).push(s) }
    for (const k in m) m[k].sort((a, b) => (a.step_order - b.step_order))
    return m
  }, [steps])

  const m = useMemo(() => {
    const leadCount = leads.length
    const booked = leads.filter(l => isBooked(l.lead_status)).length
    const sold = leads.filter(l => isSold(l.lead_status)).length
    const attributed = leads.filter(l => (l.utm_campaign || '').trim()).length
    const spend = campDaily.reduce((s, r) => s + (Number(r.cost) || 0), 0)
    const clicks = campDaily.reduce((s, r) => s + (Number(r.clicks) || 0), 0)
    const impressions = campDaily.reduce((s, r) => s + (Number(r.impressions) || 0), 0)
    const conversions = campDaily.reduce((s, r) => s + (Number(r.conversions) || 0), 0)
    return {
      leadCount, booked, sold, attributed, spend, clicks, impressions, conversions,
      costPerLead: leadCount ? spend / leadCount : 0,
      bookRate: leadCount ? booked / leadCount : 0,
      closeRate: leadCount ? sold / leadCount : 0,
      attrRate: leadCount ? attributed / leadCount : 0,
    }
  }, [leads, campDaily])

  // Daily series for the Overview chart
  const trend = useMemo(() => {
    const dates = []
    const d1 = new Date(appliedEnd + 'T00:00:00')
    for (let d = new Date(appliedStart + 'T00:00:00'); d <= d1; d.setDate(d.getDate() + 1)) dates.push(d.toISOString().slice(0, 10))
    const idx = Object.fromEntries(dates.map((d, i) => [d, i]))
    const series = { leads: Array(dates.length).fill(0), spend: Array(dates.length).fill(0), clicks: Array(dates.length).fill(0), conversions: Array(dates.length).fill(0) }
    for (const l of leads) { const i = idx[String(l.created_at).slice(0, 10)]; if (i != null) series.leads[i] += 1 }
    for (const r of campDaily) {
      const i = idx[String(r.date).slice(0, 10)]; if (i == null) continue
      series.spend[i] += Number(r.cost) || 0; series.clicks[i] += Number(r.clicks) || 0; series.conversions[i] += Number(r.conversions) || 0
    }
    return { dates, series }
  }, [appliedStart, appliedEnd, leads, campDaily])

  // Leads by funnel (matches funnel slug/service via utm_source? use lead utm_campaign mapping is platform; group by utm_source for channel)
  const leadsBySource = useMemo(() => {
    const m = {}
    for (const l of leads) { const s = (l.utm_source || 'Direct / Other'); m[s] = (m[s] || 0) + 1 }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [leads])
  const sourceMax = Math.max(1, ...leadsBySource.map(([, v]) => v))

  const ytSpend = videoAds.reduce((s, a) => s + a.cost, 0)
  const enabledOf = (s) => s === 'ENABLED'

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <span className="inline-block text-[10px] font-bold text-blue-500 bg-blue-500/12 rounded px-2 py-0.5 mb-1.5">HOME SERVICE</span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Control Center</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{clientName || clientId} at a glance. Click any section to expand.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={preset} onChange={e => onPresetChange(e.target.value)}
            className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
            {RANGE_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
          {preset === 'custom' && (
            <>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={applyDates} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition">Apply</button>
            </>
          )}
        </div>
      </div>

      {firstLoad ? <p className="text-gray-400 text-sm p-8">Loading…</p> : (
        <div className={`transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>

          {/* Overview */}
          <Section id="overview" icon={ICON.overview} name="Overview" open={open.overview} onToggle={toggle}
            kpis={[
              { label: 'Leads', value: fmtNum(m.leadCount), info: 'All leads captured in this date range, across every source.' },
              { label: 'Ad Spend', value: fmt$(m.spend), info: 'Total Google Ads spend in range.' },
              { label: 'Cost / Lead', value: fmt$2(m.costPerLead), info: 'Ad spend ÷ total leads.' },
              { label: 'Booked', value: fmtNum(m.booked), info: 'Leads that reached an appointment stage.' },
              { label: 'Sold', value: fmtNum(m.sold), ch: true, info: 'Leads marked Sold.' },
            ]}>
            <TrendChart dates={trend.dates} series={trend.series} />
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-100 dark:border-white/[0.06]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Leads by Source</p>
                {leadsBySource.length === 0 ? <p className="text-sm text-gray-400">No leads in range.</p> : leadsBySource.map(([name, val]) => (
                  <div key={name} className="flex items-center gap-3 py-1.5">
                    <span className="w-28 text-xs text-gray-500 dark:text-gray-400 truncate capitalize">{name}</span>
                    <div className="flex-1 h-2 rounded bg-gray-100 dark:bg-[#161b30] overflow-hidden"><div className="h-full rounded bg-blue-500" style={{ width: `${(val / sourceMax) * 100}%` }} /></div>
                    <span className="w-8 text-right text-xs font-semibold text-gray-700 dark:text-gray-200">{val}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Efficiency</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    ['Cost / Lead', fmt$2(m.costPerLead), false, 'Ad spend ÷ total leads.'],
                    ['Booking Rate', fmtPct(m.bookRate), false, 'Booked leads ÷ total leads.'],
                    ['Close Rate', fmtPct(m.closeRate), false, 'Sold ÷ total leads.'],
                    ['Attributed', fmtPct(m.attrRate), true, 'Leads carrying a campaign ID we can match to Google Ads.'],
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

          {/* Google Ads */}
          <Section id="google" icon={ICON.google} name="Google Ads" count={`${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`} open={open.google} onToggle={toggle}
            kpis={open.google ? [] : [
              { label: 'Spend', value: fmt$(m.spend) }, { label: 'Clicks', value: fmtNum(m.clicks) },
              { label: 'Conv', value: fmtNum(m.conversions) }, { label: 'Leads (CH)', value: fmtNum(m.attributed), ch: true },
            ]}>
            {campaigns.length === 0 ? <p className="text-sm text-gray-400 p-6">No Google campaign data in range.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap min-w-[860px]">
                  <thead className="bg-gray-50 dark:bg-[#0d1020]">
                    <tr>
                      {['Campaign', 'Status', 'Budget/Day', 'Cost', 'Impr', 'CTR', 'Clicks', 'CPC', 'Conv', 'Cost/Conv'].map((h, i) => (
                        <th key={h} className={`${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'} px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}>{h}</th>
                      ))}
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">Leads (CH)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#34CC93] uppercase tracking-wide bg-[#34CC93]/[0.06]">Cost/Lead (CH)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-white/[0.06]">
                    <tr className="bg-gray-100 dark:bg-[#0d1020] font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-white/10">
                      <td className="px-4 py-3">Totals</td>
                      <td className="px-4 py-3 text-center text-gray-400">—</td>
                      <td className="px-4 py-3 text-right">{fmt$(campaigns.reduce((s, c) => s + (Number(c.budget) || 0), 0))}</td>
                      <td className="px-4 py-3 text-right">{fmt$2(m.spend)}</td>
                      <td className="px-4 py-3 text-right">{fmtNum(m.impressions)}</td>
                      <td className="px-4 py-3 text-right">{fmtPct(m.impressions ? m.clicks / m.impressions : 0)}</td>
                      <td className="px-4 py-3 text-right">{fmtNum(m.clicks)}</td>
                      <td className="px-4 py-3 text-right">{fmt$2(m.clicks ? m.spend / m.clicks : 0)}</td>
                      <td className="px-4 py-3 text-right">{Number(m.conversions).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-3 text-right">{m.conversions ? fmt$2(m.spend / m.conversions) : '—'}</td>
                      <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.attributed}</td>
                      <td className="px-4 py-3 text-right text-[#34CC93] bg-[#34CC93]/[0.1]">{m.attributed ? fmt$2(m.spend / m.attributed) : '—'}</td>
                    </tr>
                    {campaigns.map(c => {
                      const chLeads = leadsByCampaign[c.campaign_id] || 0
                      return (
                        <tr key={c.campaign_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                          <td className="px-4 py-3"><div className="font-medium text-gray-800 dark:text-white truncate max-w-[260px]">{c.campaign_name}</div><div className="text-[11px] text-gray-400 font-mono">ID: {c.campaign_id}</div></td>
                          <td className="px-4 py-3 text-center"><StatusPill enabled={enabledOf(c.status)} /></td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$(c.budget)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(c.cost)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(c.impressions)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtPct(c.impressions ? c.clicks / c.impressions : 0)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmtNum(c.clicks)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$2(c.clicks ? c.cost / c.clicks : 0)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{Number(c.conversions || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{c.conversions ? fmt$2(c.cost / c.conversions) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{chLeads}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{chLeads ? fmt$2(c.cost / chLeads) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* YouTube Ad Videos */}
          <Section id="video" icon={ICON.video} name="YouTube Ad Videos" count={videoAds.length ? `${videoAds.length} ad${videoAds.length === 1 ? '' : 's'}` : null} open={open.video} onToggle={toggle}
            kpis={open.video ? [] : [{ label: 'Spend', value: fmt$(ytSpend) }, { label: 'Video Ads', value: fmtNum(videoAds.length) }]}>
            {videoAds.length === 0 ? <p className="text-sm text-gray-400 p-6">No video ad data in range.</p> : (
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {videoAds.map(a => {
                  const thumb = a.youtube_video_id ? `https://i.ytimg.com/vi/${a.youtube_video_id}/mqdefault.jpg` : null
                  const href = a.youtube_video_id ? `https://www.youtube.com/watch?v=${a.youtube_video_id}` : null
                  const cpc = a.clicks ? a.cost / a.clicks : 0
                  const cpConv = a.conversions ? a.cost / a.conversions : 0
                  const Card = href ? 'a' : 'div'
                  return (
                    <Card key={a.ad_id} {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="group block rounded-xl border border-gray-100 dark:border-white/[0.06] bg-white dark:bg-[#161b30] overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition">
                      <div className="relative aspect-video bg-gray-100 dark:bg-black/40">
                        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} /> : <div className="w-full h-full grid place-items-center text-gray-300 dark:text-gray-600"><svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M23 12s0-3.9-.5-5.8a3 3 0 00-2.1-2.1C18.5 3.5 12 3.5 12 3.5s-6.5 0-8.4.6A3 3 0 001.5 6.2C1 8.1 1 12 1 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 8.4.6 8.4.6s6.5 0 8.4-.6a3 3 0 002.1-2.1C23 15.9 23 12 23 12zM9.8 15.5v-7l6 3.5-6 3.5z"/></svg></div>}
                        {href && <span className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition bg-black/30"><svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>}
                        <span className="absolute top-2 right-2"><StatusPill enabled={enabledOf(a.status)} /></span>
                      </div>
                      <div className="p-3.5">
                        <p className="font-semibold text-sm text-gray-800 dark:text-white truncate">{a.ad_name || '(unnamed video ad)'}</p>
                        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                          <div><div className="text-[13px] font-bold text-gray-900 dark:text-white">{fmt$(a.cost)}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">Spend</div></div>
                          <div><div className="text-[13px] font-bold text-gray-900 dark:text-white">{fmtNum(a.clicks)}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">Clicks</div></div>
                          <div><div className="text-[13px] font-bold text-gray-900 dark:text-white">{fmt$2(cpc)}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">CPC</div></div>
                          <div><div className="text-[13px] font-bold text-gray-900 dark:text-white">{Number(a.conversions || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">Conv</div></div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Funnels (nested steps) */}
          <Section id="funnels" icon={ICON.funnels} name="Funnels" count={funnels.length ? `${funnels.length} funnel${funnels.length === 1 ? '' : 's'}` : null} open={open.funnels} onToggle={toggle}>
            {funnels.length === 0 ? <p className="text-sm text-gray-400 p-6">No funnels yet.</p> : (
              <div className="p-4 space-y-3">
                {funnels.map(f => {
                  const fsteps = stepsByFunnel[f.id] || []
                  const visitors = Math.max(0, ...fsteps.map(s => Number(s.visitors) || 0))
                  const fLeads = fsteps.reduce((s, x) => s + (Number(x.leads) || 0), 0)
                  const conv = visitors ? fLeads / visitors : 0
                  const fopen = !!funnelOpen[f.id]
                  return (
                    <div key={f.id} className="border border-gray-100 dark:border-white/[0.06] rounded-lg overflow-hidden bg-gray-50/50 dark:bg-[#0d1020]/40">
                      <div onClick={() => setFunnelOpen(o => ({ ...o, [f.id]: !o[f.id] }))} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${fopen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800 dark:text-white truncate">{f.name}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${f.status === 'live' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-gray-400/10 text-gray-400'}`}>{f.status || 'draft'}</span>
                          </div>
                          <div className="text-[11px] text-gray-400">{fsteps.length} step{fsteps.length === 1 ? '' : 's'} · /{f.slug}</div>
                        </div>
                        <div className="flex items-center gap-5 text-right">
                          <div><div className="text-sm font-bold text-gray-900 dark:text-white">{fmtNum(visitors)}</div><div className="text-[10px] text-gray-400 uppercase">Visitors</div></div>
                          <div><div className="text-sm font-bold text-gray-900 dark:text-white">{fmtNum(fLeads)}</div><div className="text-[10px] text-gray-400 uppercase">Leads</div></div>
                          <div><div className="text-sm font-bold text-[#34CC93]">{fmtPct(conv)}</div><div className="text-[10px] text-gray-400 uppercase">Conv</div></div>
                        </div>
                      </div>
                      {fopen && (
                        <div className="border-t border-gray-100 dark:border-white/[0.06] bg-white dark:bg-[#111528]">
                          <table className="w-full text-sm">
                            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-white/[0.06]">
                              <th className="px-4 py-2 font-semibold">Step</th><th className="px-4 py-2 font-semibold">Type</th>
                              <th className="px-4 py-2 font-semibold text-right">Visitors</th><th className="px-4 py-2 font-semibold text-right">Leads</th><th className="px-4 py-2 font-semibold text-right">Step Conv</th>
                            </tr></thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.06]">
                              {fsteps.map(s => {
                                const sv = Number(s.visitors) || 0, sl = Number(s.leads) || 0
                                return (
                                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="grid place-items-center w-5 h-5 rounded bg-blue-500/10 text-blue-500 text-[11px] font-bold">{s.step_order}</span><span className="font-medium text-gray-700 dark:text-gray-200">{s.name || '(untitled)'}{s.variant ? ` · ${s.variant}` : ''}</span></span></td>
                                    <td className="px-4 py-2.5 text-gray-400 capitalize">{(s.step_type || '').replace(/_/g, ' ')}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{fmtNum(sv)}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{fmtNum(sl)}</td>
                                    <td className="px-4 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-200">{sv ? fmtPct(sl / sv) : '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-white/[0.06]">
                            <a href={`/control/${clientId}/funnels/${f.id}`} className="text-xs font-semibold text-blue-500 hover:text-blue-400">Open funnel builder →</a>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Leads */}
          <Section id="leads" icon={ICON.leads} name="Leads" count={`${fmtNum(m.leadCount)} total`} open={open.leads} onToggle={toggle}
            kpis={open.leads ? [] : [{ label: 'Booked', value: fmtNum(m.booked) }, { label: 'Sold', value: fmtNum(m.sold), ch: true }]}>
            {leads.length === 0 ? <p className="text-sm text-gray-400 p-6">No leads in range.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap min-w-[720px]">
                  <thead className="bg-gray-50 dark:bg-[#0d1020]"><tr>
                    {['Name', 'Date', 'Status', 'Source', 'Phone', 'Email'].map((h, i) => <th key={h} className={`${i === 0 ? 'text-left' : 'text-left'} px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}>{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-white/[0.06]">
                    {leads.slice(0, 30).map(l => (
                      <tr key={l.lead_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{[l.first_name, l.last_name].filter(Boolean).join(' ') || '—'}</td>
                        <td className="px-4 py-3 text-gray-400">{l.created_at ? new Date(l.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</td>
                        <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">{l.lead_status || '—'}</span></td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 capitalize">{l.utm_source || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{l.phone || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{l.email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {leads.length > 30 && <p className="px-4 py-3 text-xs text-gray-400">Showing 30 of {leads.length}. <a href={`/control/${clientId}/contacts`} className="text-blue-500 hover:underline">See all →</a></p>}
              </div>
            )}
          </Section>

          {/* Projects & Tasks */}
          <Section id="projects" icon={ICON.projects} name="Projects & Tasks" open={open.projects} onToggle={toggle}>
            <ClientProjectsTasks clientId={clientId} />
          </Section>

        </div>
      )}
    </div>
  )
}
