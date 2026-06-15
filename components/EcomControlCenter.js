'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const fmt$    = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
const fmt$2   = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum  = (n) => Number(n || 0).toLocaleString()
const fmtPct  = (n) => (Math.round((n || 0) * 1000) / 10) + '%'
const fmtRoas = (n) => (Math.round((n || 0) * 100) / 100) + 'x'

function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
}

// One accordion section with inline KPI summary in the header bar.
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
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-0.5">{k.label}</div>
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
const PAID_COL_WIDTHS = ['20%', '8%', '7%', '7%', '7%', '5%', '6%', '6%', '6%', '7%', '7%', '8%', '6%']
function PaidColGroup() {
  return <colgroup>{PAID_COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
}

const platformIcon = {
  overview: <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg,#3b82f6,#34CC93)' }}>∑</div>,
  google:   <div className="w-7 h-7 rounded-lg grid place-items-center bg-white border border-gray-200 text-[#4285F4] text-xs font-extrabold flex-shrink-0">G</div>,
  meta:     <div className="w-7 h-7 rounded-lg grid place-items-center bg-[#0866FF] text-white text-sm font-extrabold flex-shrink-0">f</div>,
  orders:   <div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg,#34CC93,#22CBE3)' }}>🛍</div>,
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

export default function EcomControlCenter({ clientId, clientName }) {
  const defaults = defaultDates()
  const [startDate, setStartDate]   = useState(defaults.start)
  const [endDate, setEndDate]       = useState(defaults.end)
  const [appliedStart, setAppliedStart] = useState(defaults.start)
  const [appliedEnd, setAppliedEnd]     = useState(defaults.end)

  const [orders, setOrders]       = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [metaCampaigns, setMetaCampaigns] = useState([])
  const [loading, setLoading]     = useState(true)
  const [googleSyncing, setGoogleSyncing] = useState(false)
  const [metaSyncing, setMetaSyncing] = useState(false)
  const [open, setOpen] = useState({ overview: true, blended: true, google: true, meta: false, orders: false })
  const toggle = useCallback((id) => setOpen(o => ({ ...o, [id]: !o[id] })), [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [ordersRes, campRes, metaRes] = await Promise.all([
      supabase.from('client_lead')
        .select('lead_id, sale_amount, utm_campaign, shopify_data, created_at, first_name, last_name')
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

    // Aggregate Google campaign rows per campaign_id
    const map = {}
    for (const row of (campRes.data || [])) {
      const id = row.campaign_id
      if (!map[id]) map[id] = { campaign_id: id, campaign_name: row.campaign_name, status: row.status, budget: row.budget, cost: 0, impressions: 0, clicks: 0, conversions: 0, synced_at: row.synced_at }
      map[id].cost += Number(row.cost) || 0
      map[id].impressions += Number(row.impressions) || 0
      map[id].clicks += Number(row.clicks) || 0
      map[id].conversions += Number(row.conversions) || 0
      if (row.synced_at > map[id].synced_at) { map[id].status = row.status; map[id].budget = row.budget; map[id].synced_at = row.synced_at }
    }
    setCampaigns(Object.values(map).sort((a, b) => b.cost - a.cost))

    // Aggregate Meta campaign rows per campaign_id
    const mmap = {}
    for (const row of (metaRes.data || [])) {
      const id = row.campaign_id
      if (!mmap[id]) mmap[id] = { campaign_id: id, campaign_name: row.campaign_name, status: row.status, budget: row.budget, spend: 0, impressions: 0, clicks: 0, conversions: 0, synced_at: row.synced_at }
      mmap[id].spend += Number(row.spend) || 0
      mmap[id].impressions += Number(row.impressions) || 0
      mmap[id].clicks += Number(row.clicks) || 0
      mmap[id].conversions += Number(row.conversions) || 0
      if (row.synced_at > mmap[id].synced_at) { mmap[id].status = row.status; mmap[id].budget = row.budget; mmap[id].synced_at = row.synced_at }
    }
    setMetaCampaigns(Object.values(mmap).sort((a, b) => b.spend - a.spend))
    setLoading(false)
  }, [clientId, appliedStart, appliedEnd])

  useEffect(() => { fetchData() }, [fetchData])

  function applyDates() { setAppliedStart(startDate); setAppliedEnd(endDate) }

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
      const ch = o.shopify_data?.channel || 'Other'
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
      // Blended (Google + Meta)
      blendedConvPlatform: gConvGoogle + mConvPlatform,
      blendedConvCH: gConv + mConv,
      blendedRevCH: gRev + mRev,
      blendedRoas: (googleSpend + metaSpend) ? (gRev + mRev) / (googleSpend + metaSpend) : 0,
    }
  }, [orders, campaigns, metaCampaigns, campaignAttr])

  const channelMax = Math.max(1, ...m.byChannel.map(([, v]) => v))
  const channelColor = (name) => name === 'Facebook' ? '#0866FF' : name === 'Online Store' ? '#4b5563' : name === 'Google' ? '#4285F4' : '#7a8bb5'

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <span className="inline-block text-[10px] font-bold text-[#34CC93] bg-[#34CC93]/12 rounded px-2 py-0.5 mb-1.5">ECOM</span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Control Center</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{clientName || clientId} at a glance. Click any section to expand.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={applyDates} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition">Apply</button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm p-8">Loading…</p>
      ) : (
        <>
          {/* Overview */}
          <Section id="overview" icon={platformIcon.overview} name="Overview" open={open.overview} onToggle={toggle}
            kpis={[
              { label: 'Revenue', value: fmt$(m.revenue) },
              { label: 'Ad Spend', value: fmt$(m.adSpend) },
              { label: 'Blended ROAS', value: fmtRoas(m.roas) },
              { label: 'Orders', value: fmtNum(m.orderCount) },
              { label: 'Attributed', value: fmtPct(m.attrRate), ch: true },
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
                    ['AOV', fmt$2(m.aov)],
                    ['Cost / Order', fmt$2(m.costPerOrder)],
                    ['Conversion Rate', fmtPct(m.convRate)],
                    ['Tracked Revenue (CH)', fmt$(m.trackedRevenue), true],
                  ].map(([label, value, ch]) => (
                    <div key={label} className="bg-gray-50 dark:bg-[#161b30] rounded-lg px-3.5 py-3">
                      <div className={`text-xl font-bold ${ch ? 'text-[#34CC93]' : 'text-gray-900 dark:text-white'}`}>{value}</div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Blended Paid Ads (Google + Meta) */}
          <Section
            id="blended"
            icon={<div className="w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg,#4285F4,#0866FF)' }}>∑</div>}
            name="Paid Ads — Blended"
            count="Google + Meta"
            open={open.blended} onToggle={toggle}
            kpis={open.blended ? [] : [
              { label: 'Spend', value: fmt$(m.adSpend) },
              { label: 'Clicks', value: fmtNum(m.clicks) },
              { label: 'Conv', value: fmtNum(m.blendedConvPlatform) },
              { label: 'Conv (CH)', value: fmtNum(m.blendedConvCH), ch: true },
              { label: 'ROAS (CH)', value: fmtRoas(m.blendedRoas), ch: true },
            ]}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap table-fixed min-w-[900px]">
                <PaidColGroup />
                <thead className="bg-gray-50 dark:bg-[#0d1020]">
                  <tr>
                    {['Platform', 'Status', 'Budget/Day', 'Cost', 'Impr', 'CTR', 'Clicks', 'CPC', 'Conv', 'Cost/Conv'].map((h, i) => (
                      <th key={h} className={`${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'} px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}>{h}</th>
                    ))}
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
            action={
              <button
                onClick={(e) => { e.stopPropagation(); handleGoogleRefresh() }}
                disabled={googleSyncing}
                title="Pull the latest Google Ads data for this client"
                className="flex items-center gap-2 border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] hover:bg-gray-100 dark:hover:bg-white/[0.08] text-gray-600 dark:text-gray-300 text-xs font-medium px-2.5 py-1.5 rounded-lg transition disabled:opacity-50 flex-shrink-0"
              >
                <span className="w-4 h-4 rounded bg-white border border-gray-200 grid place-items-center text-[10px] font-extrabold text-[#4285F4] leading-none">G</span>
                <svg className={`w-3.5 h-3.5 ${googleSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {googleSyncing ? 'Syncing…' : 'Refresh'}
              </button>
            }
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap table-fixed min-w-[900px]">
                  <PaidColGroup />
                  <thead className="bg-gray-50 dark:bg-[#0d1020]">
                    <tr>
                      {['Campaign', 'Status', 'Budget/Day', 'Cost', 'Impr', 'CTR', 'Clicks', 'CPC', 'Conv', 'Cost/Conv'].map((h, i) => (
                        <th key={h} className={`${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'} px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}>{h}</th>
                      ))}
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
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count > 0 ? fmt$2(chCost) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count > 0 ? fmtRoas(roas) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Meta (Facebook) */}
          <Section id="meta" icon={platformIcon.meta} name="Meta Ads"
            count={metaCampaigns.length ? `${metaCampaigns.length} campaign${metaCampaigns.length === 1 ? '' : 's'}` : null}
            open={open.meta} onToggle={toggle}
            action={
              <button
                onClick={(e) => { e.stopPropagation(); handleMetaRefresh() }}
                disabled={metaSyncing}
                title="Pull the latest Meta (Facebook) data for this client"
                className="flex items-center gap-2 border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] hover:bg-gray-100 dark:hover:bg-white/[0.08] text-gray-600 dark:text-gray-300 text-xs font-medium px-2.5 py-1.5 rounded-lg transition disabled:opacity-50 flex-shrink-0"
              >
                <span className="w-4 h-4 rounded bg-[#0866FF] grid place-items-center text-[10px] font-extrabold text-white leading-none">f</span>
                <svg className={`w-3.5 h-3.5 ${metaSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {metaSyncing ? 'Syncing…' : 'Refresh'}
              </button>
            }
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap table-fixed min-w-[900px]">
                  <PaidColGroup />
                  <thead className="bg-gray-50 dark:bg-[#0d1020]">
                    <tr>
                      {['Campaign', 'Status', 'Budget/Day', 'Cost', 'Impr', 'CTR', 'Clicks', 'CPC', 'Conv', 'Cost/Conv'].map((h, i) => (
                        <th key={h} className={`${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'} px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}>{h}</th>
                      ))}
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
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count > 0 ? fmt$2(chCost) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#34CC93] bg-[#34CC93]/[0.05]">{a.count > 0 ? fmtRoas(roas) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{o.shopify_data?.channel || '—'}</td>
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
        </>
      )}
    </div>
  )
}
