'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../../lib/supabase'
import MetricCard from '../../../components/MetricCard'

function fmt$(n) { return '$' + Math.round(n || 0).toLocaleString() }
function fmtPct(n) { return (Math.round((n || 0) * 10) / 10) + '%' }

function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    start: start.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
  }
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

  const [clientName, setClientName] = useState('')
  const [loading,    setLoading]    = useState(true)
  const [metrics,    setMetrics]    = useState(null)
  const [chartData,  setChartData]  = useState({ labels: [], leads: [] })

  function updateURL(start, end) {
    const params = new URLSearchParams({ start, end })
    router.replace(`?${params.toString()}`, { scroll: false })
    localStorage.setItem(`dashboard_${clientId}`, JSON.stringify({ start, end }))
  }

  useEffect(() => {
    supabase
      .from('client')
      .select('client_name')
      .eq('client_id', clientId)
      .single()
      .then(({ data }) => { if (data) setClientName(data.client_name) })
  }, [clientId])

  const fetchData = useCallback(async (start, end) => {
    setLoading(true)

    // Leads within date range (only fields needed for metrics)
    const { data: leads } = await supabase
      .from('client_lead')
      .select('lead_id, created_at, appt_status, sale_status')
      .eq('client_id', clientId)
      .gte('created_at', start)
      .lte('created_at', end + 'T23:59:59')

    // Ad spend: sum daily cost rows within date range
    const { data: campaigns } = await supabase
      .from('client_yt_campaigns')
      .select('cost')
      .eq('client_id', clientId)
      .gte('date', start)
      .lte('date', end)

    const adSpend      = (campaigns || []).reduce((sum, c) => sum + (Number(c.cost) || 0), 0)
    const totalLeads   = leads?.length || 0
    // Appt Set = lead_status is 'Appt Set' OR appt_status is set (not null/NA)
    const apptSet      = leads?.filter(l => l.lead_status === 'Appt Set' || (l.appt_status && l.appt_status !== 'NA')).length || 0
    // Appointments run = Appt Complete
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

    // Chart: rolling 7 months (independent of the date filter)
    const months = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - (6 - i))
      return {
        label: d.toLocaleString('default', { month: 'short' }),
        start: d.toISOString().split('T')[0],
        end:   new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0],
      }
    })

    const { data: allLeads } = await supabase
      .from('client_lead')
      .select('created_at')
      .eq('client_id', clientId)
      .gte('created_at', months[0].start)
      .lte('created_at', months[6].end + 'T23:59:59')

    setChartData({
      labels: months.map(m => m.label),
      leads:  months.map(m =>
        (allLeads || []).filter(l => l.created_at >= m.start && l.created_at <= m.end + 'T23:59:59').length
      ),
    })

    setLoading(false)
  }, [clientId])

  useEffect(() => {
    fetchData(appliedStart, appliedEnd)
  }, [fetchData, appliedStart, appliedEnd])

  function handleApply() {
    setAppliedStart(startDate)
    setAppliedEnd(endDate)
    updateURL(startDate, endDate)
  }

  const metricCards = metrics ? [
    { label: 'Ad Spend',      value: fmt$(metrics.adSpend),         color: 'text-blue-600',   darkColor: 'dark:text-[#5b97e6]' },
    { label: 'Leads',         value: metrics.totalLeads,             color: 'text-orange-500', darkColor: 'dark:text-[#FFD024]' },
    { label: 'Cost / Lead',   value: fmt$(metrics.costPerLead),      color: 'text-orange-500', darkColor: 'dark:text-[#FFD024]' },
    { label: 'Appt Set',      value: metrics.apptSet,                color: 'text-purple-600', darkColor: 'dark:text-[#846CC5]' },
    { label: 'Cost / Set',    value: fmt$(metrics.costPerSet),       color: 'text-purple-600', darkColor: 'dark:text-[#846CC5]' },
    { label: 'Appt Set Rate', value: fmtPct(metrics.apptSetRate),    color: 'text-purple-600', darkColor: 'dark:text-[#846CC5]' },
    { label: 'Appointments',  value: metrics.appointments,           color: 'text-indigo-500', darkColor: 'dark:text-[#22CBE3]' },
    { label: 'Cost / Appt',   value: fmt$(metrics.costPerAppt),      color: 'text-teal-500',   darkColor: 'dark:text-[#22CBE3]' },
    { label: 'Appt Run Rate', value: fmtPct(metrics.apptRunRate),    color: 'text-teal-500',   darkColor: 'dark:text-[#22CBE3]' },
    { label: 'Customers',     value: metrics.customers,              color: 'text-green-600',  darkColor: 'dark:text-[#34CC93]' },
    { label: 'CAC',           value: fmt$(metrics.cac),              color: 'text-green-600',  darkColor: 'dark:text-[#34CC93]' },
    { label: 'Close Rate',    value: fmtPct(metrics.closeRate),      color: 'text-green-600',  darkColor: 'dark:text-[#34CC93]' },
  ] : []

  const maxLeads = chartData.leads.length > 0 ? Math.max(...chartData.leads, 1) : 1

  return (
    <div className="p-8">

      {/* Page Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-0.5">{clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm shadow-sm dark:shadow-none">
            <span className="text-gray-400 dark:text-gray-500 text-xs">From</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-gray-700 dark:bg-gray-800 dark:text-gray-100 outline-none text-sm"
            />
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm shadow-sm dark:shadow-none">
            <span className="text-gray-400 dark:text-gray-500 text-xs">To</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="text-gray-700 dark:bg-gray-800 dark:text-gray-100 outline-none text-sm"
            />
          </div>
          <button
            onClick={handleApply}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm"
          >
            Apply
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            {metricCards.map((m, i) => (
              <MetricCard key={i} label={m.label} value={m.value} color={m.color} darkColor={m.darkColor} />
            ))}
          </div>

          {/* Bar Chart */}
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-6">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Leads Over Time</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last 7 months</p>
            </div>
            <div className="flex items-end gap-3" style={{ height: '140px' }}>
              {chartData.labels.map((label, i) => {
                const pct = Math.round((chartData.leads[i] / maxLeads) * 100)
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{chartData.leads[i]}</span>
                    <div
                      className="w-full bg-blue-500 rounded-t-lg transition-all hover:bg-blue-600"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

    </div>
  )
}
