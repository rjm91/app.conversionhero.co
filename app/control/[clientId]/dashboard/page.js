'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../../lib/supabase'
import MetricCard from '../../../../components/MetricCard'

function fmt$(n) { return '$' + Math.round(n || 0).toLocaleString() }
function fmtPct(n) { return (Math.round((n || 0) * 10) / 10) + '%' }
function fmtViews(n) { return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n||0) }

function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
}

const STATUS_COLORS = {
  'New / Not Yet Contacted': 'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  'Contacted / Working':     'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  'New Lead':                'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  'Appt Set':                'bg-[#846CC5]/10 text-[#6b52b0] dark:bg-[#846CC5]/10 dark:text-[#846CC5]',
  'Lost':                    'bg-orange-500/10 text-orange-400',
  'Disqualified':            'bg-red-500/10 text-red-400',
  'Out of Area':             'bg-white/10 text-gray-400',
  'NA':                      'bg-white/10 text-gray-400',
  'Appt Confirmed':          'bg-[#846CC5]/10 text-[#6b52b0] dark:bg-[#846CC5]/10 dark:text-[#846CC5]',
  'Appt Complete':           'bg-[#22cbe3]/10 text-[#0f9aad] dark:bg-[#22cbe3]/10 dark:text-[#22cbe3]',
  'Appt Lost':               'bg-orange-500/10 text-orange-400',
  'Appt Disqualified':       'bg-red-500/10 text-red-400',
  'Proposal Sent':           'bg-[#5b97e6]/10 text-[#3a72c4] dark:bg-[#5b97e6]/10 dark:text-[#5b97e6]',
  'Sold':                    'bg-[#34CC93]/10 text-[#1a9e6e] dark:bg-[#34CC93]/10 dark:text-[#34CC93]',
  'Sale Lost':               'bg-orange-500/10 text-orange-400',
}
const SCRIPT_STATUS_COLORS = {
  approved: 'bg-green-500/10 text-green-400 border border-green-500/20',
  pending:  'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  draft:    'bg-gray-500/10 text-gray-400 border border-gray-500/20',
  revision: 'bg-red-500/10 text-red-400 border border-red-500/20',
}

export default function DashboardPage() {
  const { clientId }  = useParams()
  const router        = useRouter()
  const searchParams  = useSearchParams()

  const defaults = defaultDates()
  const saved    = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(`dashboard_${clientId}`) || '{}') : {}

  const initStart = searchParams.get('start') || saved.start || defaults.start
  const initEnd   = searchParams.get('end')   || saved.end   || defaults.end

  const [startDate,    setStartDate]    = useState(initStart)
  const [endDate,      setEndDate]      = useState(initEnd)
  const [appliedStart, setAppliedStart] = useState(initStart)
  const [appliedEnd,   setAppliedEnd]   = useState(initEnd)

  const [clientName,     setClientName]     = useState('')
  const [loading,        setLoading]        = useState(true)
  const [metrics,        setMetrics]        = useState(null)
  const [chartData,      setChartData]      = useState({ labels: [], leads: [] })
  const [recentLeads,    setRecentLeads]    = useState([])
  const [recentScripts,  setRecentScripts]  = useState([])
  const [funnels,        setFunnels]        = useState([])
  const [campaignRows,   setCampaignRows]   = useState([])
  const [recentVideos,   setRecentVideos]   = useState([])

  function updateURL(start, end) {
    const params = new URLSearchParams({ start, end })
    router.replace(`?${params.toString()}`, { scroll: false })
    localStorage.setItem(`dashboard_${clientId}`, JSON.stringify({ start, end }))
  }

  useEffect(() => {
    supabase.from('client').select('client_name').eq('client_id', clientId).single()
      .then(({ data }) => { if (data) setClientName(data.client_name) })
  }, [clientId])

  const fetchData = useCallback(async (start, end) => {
    setLoading(true)

    const [
      { data: leads },
      { data: campaigns },
      { data: allLeadsRaw },
      { data: recentLeadsRaw },
      { data: scripts },
      { data: funnelRows },
      { data: campaignData },
    ] = await Promise.all([
      // Metrics: leads in date range
      supabase.from('client_lead')
        .select('lead_id, created_at, appt_status, sale_status')
        .eq('client_id', clientId)
        .neq('lead_status', 'in_progress')
        .gte('created_at', start)
        .lte('created_at', end + 'T23:59:59-12:00'),

      // Metrics: ad spend in date range
      supabase.from('client_yt_campaigns')
        .select('cost')
        .eq('client_id', clientId)
        .ilike('campaign_name', `%${clientId}%`)
        .gte('date', start)
        .lte('date', end),

      // Chart: all leads for rolling 7 months
      supabase.from('client_lead')
        .select('created_at')
        .eq('client_id', clientId)
        .neq('lead_status', 'in_progress'),

      // Panel: 5 most recent leads (exclude partial/in-progress submissions)
      supabase.from('client_lead')
        .select('lead_id, first_name, last_name, created_at, lead_status, appt_status, sale_status, city, zip_code')
        .eq('client_id', clientId)
        .neq('lead_status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(5),

      // Panel: 5 most recent scripts
      supabase.from('client_video_scripts')
        .select('id, vscript_title, vscript_status, vscript_approval_status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(5),

      // Panel: funnels
      supabase.from('client_funnels')
        .select('id, name, slug, custom_domain, status, visitors, leads')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),

      // Panel: campaign summary
      supabase.from('client_yt_campaigns')
        .select('campaign_id, campaign_name, status, cost, conversions')
        .eq('client_id', clientId)
        .ilike('campaign_name', `%${clientId}%`)
        .gte('date', start)
        .lte('date', end),
    ])

    // Metrics
    const adSpend      = (campaigns || []).reduce((s, c) => s + (Number(c.cost) || 0), 0)
    const totalLeads   = leads?.length || 0
    const apptSet      = leads?.filter(l => l.appt_status && l.appt_status !== 'NA').length || 0
    const appointments = leads?.filter(l => l.appt_status === 'Appt Complete').length || 0
    const customers    = leads?.filter(l => l.sale_status === 'Sold').length || 0

    setMetrics({
      adSpend,
      totalLeads,
      costPerLead:  totalLeads   > 0 ? adSpend / totalLeads   : 0,
      apptSet,
      costPerSet:   apptSet      > 0 ? adSpend / apptSet      : 0,
      apptSetRate:  totalLeads   > 0 ? (apptSet / totalLeads) * 100 : 0,
      appointments,
      costPerAppt:  appointments > 0 ? adSpend / appointments : 0,
      apptRunRate:  apptSet      > 0 ? (appointments / apptSet) * 100 : 0,
      customers,
      cac:          customers    > 0 ? adSpend / customers    : 0,
      closeRate:    appointments > 0 ? (customers / appointments) * 100 : 0,
    })

    // Chart
    const months = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (6 - i))
      return {
        label: d.toLocaleString('default', { month: 'short' }),
        start: d.toISOString().split('T')[0],
        end:   new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0],
      }
    })
    setChartData({
      labels: months.map(m => m.label),
      leads:  months.map(m =>
        (allLeadsRaw || []).filter(l => new Date(l.created_at) >= new Date(m.start) && new Date(l.created_at) <= new Date(m.end + 'T23:59:59-12:00')).length
      ),
    })

    // Campaign panel — aggregate daily rows by campaign_id
    const cmap = {}
    for (const row of (campaignData || [])) {
      if (!cmap[row.campaign_id]) {
        cmap[row.campaign_id] = { name: row.campaign_name, status: row.status, cost: 0, conversions: 0 }
      }
      cmap[row.campaign_id].cost        += Number(row.cost)        || 0
      cmap[row.campaign_id].conversions += Number(row.conversions) || 0
    }
    setCampaignRows(Object.values(cmap).filter(c => c.status === 'ENABLED').sort((a, b) => b.cost - a.cost))

    setRecentLeads(recentLeadsRaw || [])
    setRecentScripts(scripts || [])
    setFunnels(funnelRows || [])

    // Fetch latest 5 YouTube videos (non-blocking)
    fetch(`/api/youtube-videos?clientId=${clientId}`)
      .then(r => r.json())
      .then(d => { if (d.videos) setRecentVideos(d.videos.slice(0, 5)) })
      .catch(() => {})

    setLoading(false)
  }, [clientId])

  useEffect(() => { fetchData(appliedStart, appliedEnd) }, [fetchData, appliedStart, appliedEnd])

  function handleApply() {
    setAppliedStart(startDate); setAppliedEnd(endDate); updateURL(startDate, endDate)
  }

  const metricCards = metrics ? [
    { label: 'Ad Spend',      value: fmt$(metrics.adSpend),        color: 'text-blue-600',   darkColor: 'dark:text-[#5b97e6]' },
    { label: 'Leads',         value: metrics.totalLeads,            color: 'text-orange-500', darkColor: 'dark:text-[#FFD024]' },
    { label: 'Cost / Lead',   value: fmt$(metrics.costPerLead),     color: 'text-orange-500', darkColor: 'dark:text-[#FFD024]' },
    { label: 'Appt Set',      value: metrics.apptSet,               color: 'text-purple-600', darkColor: 'dark:text-[#846CC5]' },
    { label: 'Cost / Set',    value: fmt$(metrics.costPerSet),      color: 'text-purple-600', darkColor: 'dark:text-[#846CC5]' },
    { label: 'Appt Set Rate', value: fmtPct(metrics.apptSetRate),   color: 'text-purple-600', darkColor: 'dark:text-[#846CC5]' },
    { label: 'Appointments',  value: metrics.appointments,          color: 'text-indigo-500', darkColor: 'dark:text-[#22CBE3]' },
    { label: 'Cost / Appt',   value: fmt$(metrics.costPerAppt),     color: 'text-teal-500',   darkColor: 'dark:text-[#22CBE3]' },
    { label: 'Customers',     value: metrics.customers,             color: 'text-green-600',  darkColor: 'dark:text-[#34CC93]' },
    { label: 'Close Rate',    value: fmtPct(metrics.closeRate),     color: 'text-green-600',  darkColor: 'dark:text-[#34CC93]' },
  ] : []

  const maxLeads = Math.max(...chartData.leads, 1)

  function statusBadge(value) {
    if (!value || value === 'NA' || value === 'in_progress') return null
    return (
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[value] || 'bg-white/10 text-gray-400'}`}>
        {value}
      </span>
    )
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="p-6">

      {/* Page Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-0.5">{clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/50 rounded-lg px-3 py-2 shadow-sm dark:shadow-none">
            <span className="text-gray-400 dark:text-gray-500 text-xs">From</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="text-gray-700 dark:bg-gray-800 dark:text-gray-100 outline-none text-sm" />
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/50 rounded-lg px-3 py-2 shadow-sm dark:shadow-none">
            <span className="text-gray-400 dark:text-gray-500 text-xs">To</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="text-gray-700 dark:bg-gray-800 dark:text-gray-100 outline-none text-sm" />
          </div>
          <button onClick={handleApply}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm">
            Apply
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
      ) : (
        <div className="flex flex-col gap-3">

          {/* Metric Cards — 5 across × 2 rows */}
          <div className="grid grid-cols-5 gap-3">
            {metricCards.map((m, i) => (
              <MetricCard key={i} label={m.label} value={m.value} color={m.color} darkColor={m.darkColor} />
            ))}
          </div>

          {/* Preview Panels — 3 columns */}
          <div className="grid grid-cols-3 gap-3">

            {/* Recent Leads */}
            <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Recent Leads</span>
                <a href={`/control/${clientId}/contacts`} className="text-xs text-blue-500 hover:text-blue-400">See all →</a>
              </div>
              {recentLeads.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-500 text-center">No leads yet</p>
              ) : recentLeads.map(lead => (
                <div key={lead.lead_id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 dark:border-white/[0.03] last:border-0 gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {lead.first_name} {lead.last_name}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {lead.city || lead.zip_code || '—'} · {fmtDate(lead.created_at)}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {statusBadge(lead.sale_status) || statusBadge(lead.appt_status) || statusBadge(lead.lead_status)}
                  </div>
                </div>
              ))}
            </div>

            {/* Active Campaigns */}
            <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Active Campaigns</span>
                <a href={`/control/${clientId}/youtube-ads`} className="text-xs text-blue-500 hover:text-blue-400">See all →</a>
              </div>
              {campaignRows.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-500 text-center">No active campaigns — ads may be paused</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-50 dark:border-white/[0.03]">
                      <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Campaign</th>
                      <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Spend</th>
                      <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignRows.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-white/[0.03] last:border-0">
                        <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${c.status === 'ENABLED' ? 'bg-green-400' : 'bg-gray-400'}`} />
                          {c.name.replace(new RegExp(`^.*?${clientId}\\s*[·\\-]?\\s*`, 'i'), '').slice(0, 22) || c.name.slice(0, 22)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-medium text-gray-700 dark:text-gray-200">{fmt$(c.cost)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-500 dark:text-gray-400">{Math.round(c.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Funnels */}
            <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Funnels</span>
                <a href={`/control/${clientId}/funnels`} className="text-xs text-blue-500 hover:text-blue-400">See all →</a>
              </div>
              {funnels.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-500 text-center">No funnels yet</p>
              ) : funnels.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-white/[0.03] last:border-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${f.status === 'live' ? 'bg-green-400' : 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{f.name}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{f.custom_domain || `/${f.slug}`}</div>
                  </div>
                  <div className="flex gap-3 text-right flex-shrink-0">
                    <div>
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{(f.visitors || 0).toLocaleString()}</div>
                      <div className="text-[10px] text-gray-400 uppercase">Visits</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        {f.visitors > 0 ? fmtPct(((f.leads || 0) / f.visitors) * 100) : '—'}
                      </div>
                      <div className="text-[10px] text-gray-400 uppercase">Conv.</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom row — latest videos | scripts | chart */}
          <div className="grid grid-cols-3 gap-3">

            {/* Latest Videos */}
            <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Latest Videos</span>
                <a href={`/control/${clientId}/videos`} className="text-xs text-blue-500 hover:text-blue-400">See all →</a>
              </div>
              {recentVideos.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-500 text-center">No videos yet</p>
              ) : recentVideos.map(v => (
                <a key={v.videoId} href={v.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-white/[0.03] last:border-0 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition group">
                  <div className="relative flex-shrink-0 w-20 aspect-video bg-gray-100 dark:bg-white/5 rounded overflow-hidden">
                    {v.thumbnail && <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />}
                    <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[9px] font-semibold px-1 py-0.5 rounded leading-none">
                      {v.duration}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition line-clamp-2 leading-snug">
                      {v.title}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{fmtDate(v.publishedAt)}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 tabular-nums">{fmtViews(v.views)}</div>
                    <div className="text-[10px] text-gray-400 uppercase">Views</div>
                  </div>
                </a>
              ))}
            </div>

            {/* Video Scripts */}
            <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Video Scripts</span>
                <a href={`/control/${clientId}/videos/scripts`} className="text-xs text-blue-500 hover:text-blue-400">See all →</a>
              </div>
              {recentScripts.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-500 text-center">No scripts yet</p>
              ) : recentScripts.map(s => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 dark:border-white/[0.03] last:border-0">
                  <div className="min-w-0 mr-2">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.vscript_title || '—'}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">YouTube Short · {fmtDate(s.created_at)}</div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${SCRIPT_STATUS_COLORS[s.vscript_approval_status] || SCRIPT_STATUS_COLORS.draft}`}>
                    {s.vscript_approval_status || 'draft'}
                  </span>
                </div>
              ))}
            </div>

            {/* Leads Over Time */}
            <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Leads Over Time</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last 7 months</p>
              </div>
              <div className="flex items-end gap-3" style={{ height: '120px' }}>
                {chartData.labels.map((label, i) => {
                  const pct = Math.round((chartData.leads[i] / maxLeads) * 100)
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{chartData.leads[i]}</span>
                      <div className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                        style={{ height: `${Math.max(pct, 2)}%` }} />
                      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  )
}
