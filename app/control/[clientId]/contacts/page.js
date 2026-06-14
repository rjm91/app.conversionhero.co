'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const RANGE_OPTIONS = [
  ['last_7',    'Last 7 Days'],
  ['last_14',   'Last 14 Days'],
  ['last_30',   'Last 30 Days'],
  ['last_90',   'Last 90 Days'],
  ['this_year', 'This Year'],
  ['last_year', 'Last Year'],
  ['all_time',  'All Time'],
]

function rangeBounds(range) {
  const now = new Date()
  const day = 86400000
  switch (range) {
    case 'last_7':    return { start: new Date(now - 7 * day),  end: now }
    case 'last_14':   return { start: new Date(now - 14 * day), end: now }
    case 'last_90':   return { start: new Date(now - 90 * day), end: now }
    case 'this_year': return { start: new Date(now.getFullYear(), 0, 1), end: now }
    case 'last_year': return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59) }
    case 'all_time':  return { start: null, end: now }
    case 'last_30':
    default:          return { start: new Date(now - 30 * day), end: now }
  }
}

const statusColors = {
  // Lead Status — yellow = leads, purple = appt set
  'New / Not Yet Contacted': 'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  'Contacted / Working':     'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  'Appt Set':                'bg-[#846CC5]/10 text-[#6b52b0] dark:bg-[#846CC5]/10 dark:text-[#846CC5]',
  'Lost':                    'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  'Disqualified':            'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  'Out of Area':             'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  // Appt Status — purple = confirmed, teal = complete
  'NA':                      'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  'Appt Confirmed':          'bg-[#846CC5]/10 text-[#6b52b0] dark:bg-[#846CC5]/10 dark:text-[#846CC5]',
  'Appt Complete':           'bg-[#22cbe3]/10 text-[#0f9aad] dark:bg-[#22cbe3]/10 dark:text-[#22cbe3]',
  'Appt Lost':               'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  'Appt Disqualified':       'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  // Sale Status — green = sold
  'Proposal Sent':           'bg-[#5b97e6]/10 text-[#3a72c4] dark:bg-[#5b97e6]/10 dark:text-[#5b97e6]',
  'Sold':                    'bg-[#34CC93]/10 text-[#1a9e6e] dark:bg-[#34CC93]/10 dark:text-[#34CC93]',
  'Sale Lost':               'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
}

// Shopify order status → pill colors (Contacts page in ecom mode)
const SHOPIFY_STATUS_STYLES = {
  PAID:                'bg-[#34CC93]/10 text-[#1a9e6e] dark:bg-[#34d399]/10 dark:text-[#34d399]',
  PARTIALLY_PAID:      'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  PENDING:             'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  AUTHORIZED:          'bg-[#5b97e6]/10 text-[#3a72c4] dark:bg-[#5b97e6]/10 dark:text-[#5b97e6]',
  REFUNDED:            'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  PARTIALLY_REFUNDED:  'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  VOIDED:              'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  FULFILLED:           'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
  UNFULFILLED:         'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  PARTIALLY_FULFILLED: 'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  RESTOCKED:           'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
}

function ShopifyPill({ status }) {
  if (!status) return <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ')
  const cls = SHOPIFY_STATUS_STYLES[status] || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>{label}</span>
}

function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '—'
  return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Human-readable labels for meta_key names
const META_LABELS = {
  reason:      'Outage Frequency',
  fuel:        'Fuel Type',
  size:        'Home Size',
  intent:      'Intent',
  system_type: 'System Type',
  system_age:  'System Age',
  city:        'City',
}

// Human-readable labels for meta_value IDs (survey option id → label)
const VALUE_LABELS = {
  // Generator — reason
  rarely:   'Rarely (once every few years)',
  '1_2x':   '1–2x a year',
  several:  'Several times a year',
  recent:   'Major outage recently',
  // Generator — fuel
  gas:      'Natural gas',
  propane:  'Propane',
  electric: 'Neither / electric only',
  unsure:   'Not sure',
  // Generator — size
  small:    'Under 1,500 sq ft',
  mid:      '1,500 – 2,500 sq ft',
  large:    '2,500 – 4,000 sq ft',
  xl:       '4,000+ sq ft',
  // HVAC — intent
  fix:      'Fix System (If Possible)',
  replace:  'Replace System',
  // HVAC — system_type
  heat_pump:  'Heat Pump',
  furnace_ac: 'Furnace + AC',
  mini_split: 'Ductless / Mini-Split',
  // HVAC — system_age
  under_3:  'Under 3 years',
  '3_7':    '3–7 years',
  '7_12':   '7–12 years',
  '12_plus': '12+ years',
  unknown:  "I don't know",
}

async function deleteLeads(leadIds) {
  // Delete child rows first, then parent
  await supabase.from('client_lead_meta').delete().in('lead_id', leadIds)
  const { error } = await supabase.from('client_lead').delete().in('lead_id', leadIds)
  if (error) throw error
}

export default function ContactsPage() {
  const { clientId } = useParams()
  const [leads,       setLeads]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [checked,     setChecked]     = useState(new Set())   // multi-select
  const [deleting,    setDeleting]    = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)   // confirm in panel
  const [resending,   setResending]   = useState(false)
  const [resendResult, setResendResult] = useState(null)      // 'sent' | 'error'
  const [leadMeta,    setLeadMeta]    = useState([])           // client_lead_meta rows
  const [chartRange,  setChartRange]  = useState('last_30')    // orders-over-time range
  const [chartMetric, setChartMetric] = useState('orders')     // 'orders' | 'sales'
  const [chartSeries, setChartSeries] = useState({ labels: [], counts: [], sales: [] })

  useEffect(() => { fetchLeads() }, [clientId])

  useEffect(() => {
    if (!selected?.lead_id) { setLeadMeta([]); return }
    supabase
      .from('client_lead_meta')
      .select('meta_key, meta_value')
      .eq('lead_id', selected.lead_id)
      .then(({ data }) => setLeadMeta(data || []))
  }, [selected?.lead_id])

  async function fetchLeads() {
    const { data, error } = await supabase
      .from('client_lead')
      .select('*')
      .eq('client_id', clientId)
      .neq('lead_status', 'in_progress')
      .order('created_at', { ascending: false })
    if (error) console.error('Error fetching leads:', error)
    else setLeads(data || [])
    setLoading(false)
  }

  // Open the panel for a brand-new, manually-entered lead
  function openNew() {
    setConfirmDelete(false)
    setSelected({
      lead_id:     null,            // null marks this as unsaved → handleSave inserts
      client_id:   clientId,
      first_name: '', last_name: '', email: '', phone: '',
      address: '', city: '', state: '', zip_code: '',
      lead_status: 'New / Not Yet Contacted',
      appt_status: '', sale_status: '', sale_amount: null,
      appt_date: '', appt_time: '', ch_notes: '',
    })
  }

  async function handleSave() {
    setSaving(true)

    // ─── Create a new lead ───
    if (!selected.lead_id) {
      const leadId = crypto.randomUUID()
      const row = {
        lead_id:     leadId,
        client_id:   clientId,
        first_name:  selected.first_name || null,
        last_name:   selected.last_name || null,
        email:       selected.email || null,
        phone:       selected.phone || null,
        address:     selected.address || null,
        city:        selected.city || null,
        state:       selected.state || null,
        zip_code:    selected.zip_code || null,
        lead_status: selected.lead_status || 'New / Not Yet Contacted',
        appt_status: selected.appt_status || null,
        sale_status: selected.sale_status || null,
        sale_amount: selected.sale_amount ?? null,
        appt_date:   selected.appt_date || null,
        appt_time:   selected.appt_time || null,
        ch_notes:    selected.ch_notes || null,
        created_at:  new Date().toISOString(),
      }
      const { data, error } = await supabase.from('client_lead').insert(row).select().single()
      if (!error) {
        const saved = data || row
        setLeads(prev => [saved, ...prev])
        setSelected(saved)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      } else {
        console.error('Error creating lead:', error)
      }
      setSaving(false)
      return
    }

    // ─── Update an existing lead ───
    const { error } = await supabase
      .from('client_lead')
      .update({
        first_name:  selected.first_name,
        last_name:   selected.last_name,
        email:       selected.email,
        phone:       selected.phone,
        address:     selected.address,
        city:        selected.city,
        state:       selected.state,
        zip_code:    selected.zip_code,
        lead_status:  selected.lead_status,
        appt_status:  selected.appt_status,
        sale_status:  selected.sale_status,
        sale_amount:  selected.sale_amount,
        appt_date:    selected.appt_date,
        appt_time:    selected.appt_time,
        ch_notes:     selected.ch_notes,
      })
      .eq('lead_id', selected.lead_id)

    if (!error) {
      setLeads(prev => prev.map(l => l.lead_id === selected.lead_id ? selected : l))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    }
    setSaving(false)
  }

  // Delete single lead from panel
  async function handleDeleteOne() {
    setDeleting(true)
    try {
      await deleteLeads([selected.lead_id])
      setLeads(prev => prev.filter(l => l.lead_id !== selected.lead_id))
      setSelected(null)
      setConfirmDelete(false)
    } catch (e) {
      console.error('Delete failed:', e)
    }
    setDeleting(false)
  }

  // Delete all checked leads
  async function handleDeleteChecked() {
    setDeleting(true)
    const ids = [...checked]
    try {
      await deleteLeads(ids)
      setLeads(prev => prev.filter(l => !ids.includes(l.lead_id)))
      setChecked(new Set())
    } catch (e) {
      console.error('Delete failed:', e)
    }
    setDeleting(false)
  }

  async function handleResendNotification() {
    if (!selected) return
    setResending(true)
    setResendResult(null)
    try {
      const res = await fetch('/api/client-leads/resend-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selected.lead_id, clientId }),
      })
      if (res.ok) {
        setResendResult('sent')
        setTimeout(() => setResendResult(null), 3000)
      } else {
        setResendResult('error')
      }
    } catch {
      setResendResult('error')
    }
    setResending(false)
  }

  function toggleCheck(leadId, e) {
    e.stopPropagation()
    setChecked(prev => {
      const next = new Set(prev)
      next.has(leadId) ? next.delete(leadId) : next.add(leadId)
      return next
    })
  }

  function toggleAll() {
    if (checked.size === filtered.length) {
      setChecked(new Set())
    } else {
      setChecked(new Set(filtered.map(l => l.lead_id)))
    }
  }

  // Ecom (Shopify-connected) account → render the Shopify Orders-style columns.
  const isEcom = leads.some(l => String(l.lead_id || '').startsWith('shopify_'))

  // Orders-over-time chart: pull daily order counts for the selected range
  // straight from the DB (the loaded list is capped at 1,000 rows).
  useEffect(() => {
    if (!isEcom) return
    let cancelled = false
    ;(async () => {
      const { start, end } = rangeBounds(chartRange)
      const all = []
      for (let from = 0; ; from += 1000) {
        let q = supabase
          .from('client_lead')
          .select('created_at, sale_amount')
          .eq('client_id', clientId)
          .neq('lead_status', 'in_progress')
          .order('created_at', { ascending: true })
          .range(from, from + 999)
        if (start) q = q.gte('created_at', start.toISOString())
        if (end)   q = q.lte('created_at', end.toISOString())
        const { data, error } = await q
        if (error || !data?.length) break
        all.push(...data)
        if (data.length < 1000) break
      }
      if (cancelled) return
      const byDay = {}
      const bySales = {}
      for (const o of all) {
        if (!o.created_at) continue
        const key = new Date(o.created_at).toISOString().slice(0, 10)
        byDay[key] = (byDay[key] || 0) + 1
        bySales[key] = (bySales[key] || 0) + (Number(o.sale_amount) || 0)
      }
      const days = Object.keys(byDay).sort()
      setChartSeries({
        labels: days.map(d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        counts: days.map(d => byDay[d]),
        sales: days.map(d => Math.round((bySales[d] || 0) * 100) / 100),
      })
    })()
    return () => { cancelled = true }
  }, [isEcom, chartRange, clientId])

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    return (
      l.first_name?.toLowerCase().includes(q) ||
      l.last_name?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.city?.toLowerCase().includes(q) ||
      l.shopify_data?.order_name?.toLowerCase().includes(q)
    )
  })

  const allChecked = filtered.length > 0 && checked.size === filtered.length
  const someChecked = checked.size > 0

  return (
    <div className="p-8 relative">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{isEcom ? 'Customers' : 'Contacts'}</h1>
          <p className="text-gray-400 text-sm mt-0.5">{leads.length} total {isEcom ? 'orders' : 'leads'}</p>
        </div>
        <div className="flex items-center gap-3">
          {someChecked && (
            <button
              onClick={handleDeleteChecked}
              disabled={deleting}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {deleting ? 'Deleting…' : `Delete ${checked.size} ${isEcom ? 'order' : 'lead'}${checked.size > 1 ? 's' : ''}`}
            </button>
          )}
          <input
            type="text"
            placeholder="Search by name, email, phone, city..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2 w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500"
          />
          {!isEcom && (
            <button
              onClick={openNew}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Lead
            </button>
          )}
        </div>
      </div>

      {/* Orders over time (ecom) */}
      {isEcom && (
        <div className="mb-5 bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{chartMetric === 'sales' ? 'Daily Sales' : 'Orders Over Time'}</p>
              <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
                <button
                  onClick={() => setChartMetric('orders')}
                  className={`px-2.5 py-1 text-[11px] font-semibold transition ${chartMetric === 'orders' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                >Orders</button>
                <button
                  onClick={() => setChartMetric('sales')}
                  className={`px-2.5 py-1 text-[11px] font-semibold transition ${chartMetric === 'sales' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                >Sales $</button>
              </div>
            </div>
            <select
              value={chartRange}
              onChange={e => setChartRange(e.target.value)}
              className="text-xs font-medium border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-200 bg-white dark:bg-[#161b30] outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {RANGE_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          </div>
          {chartSeries.labels.length === 0 ? (
            <div style={{ height: 180 }} className="flex items-center justify-center text-sm text-gray-400">No orders in this range.</div>
          ) : (
          <div style={{ height: 180 }}>
            <Line
              data={{
                labels: chartSeries.labels,
                datasets: [{
                  label: chartMetric === 'sales' ? 'Sales' : 'Orders',
                  data: chartMetric === 'sales' ? chartSeries.sales : chartSeries.counts,
                  borderColor: chartMetric === 'sales' ? '#5b97e6' : '#34CC93',
                  backgroundColor: (ctx) => {
                    const { ctx: c } = ctx.chart
                    const g = c.createLinearGradient(0, 0, 0, 180)
                    if (chartMetric === 'sales') {
                      g.addColorStop(0, 'rgba(91,151,230,0.28)')
                      g.addColorStop(1, 'rgba(91,151,230,0)')
                    } else {
                      g.addColorStop(0, 'rgba(52,204,147,0.28)')
                      g.addColorStop(1, 'rgba(52,204,147,0)')
                    }
                    return g
                  },
                  borderWidth: 2.5,
                  fill: true,
                  tension: 0.4,
                  pointRadius: chartSeries.labels.length > 40 ? 0 : 2.5,
                  pointBackgroundColor: chartMetric === 'sales' ? '#5b97e6' : '#34CC93',
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                scales: {
                  x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 16 }, border: { display: false } },
                  y: {
                    grid: { color: 'rgba(107,114,128,0.1)' },
                    ticks: {
                      color: '#6b7280', font: { size: 11 }, precision: 0,
                      callback: v => chartMetric === 'sales' ? '$' + Number(v).toLocaleString() : v,
                    },
                    border: { display: false }, beginAtZero: true,
                  },
                },
                plugins: {
                  tooltip: { callbacks: { label: ctx => chartMetric === 'sales'
                    ? ` $${Number(ctx.parsed.y).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : ` ${ctx.parsed.y} order${ctx.parsed.y === 1 ? '' : 's'}` } },
                },
              }}
            />
          </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="text-gray-400 text-sm p-8">Loading contacts...</p>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400 text-sm mb-4">{leads.length === 0 ? (isEcom ? 'No orders yet.' : 'No leads yet.') : `No ${isEcom ? 'orders' : 'contacts'} match your search.`}</p>
            {!isEcom && (
              <button
                onClick={openNew}
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Lead
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                {isEcom ? (
                  <>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Order</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Customer</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Channel</th>
                    <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Total</th>
                    <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Payment</th>
                    <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Fulfillment</th>
                    <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Items</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Delivery method</th>
                  </>
                ) : (
                  <>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Phone</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Location</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Lead Status</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Appt Status</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Sale Status</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Date</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="whitespace-nowrap">
              {filtered.map((lead, i) => (
                <tr
                  key={lead.lead_id}
                  onClick={() => { setSelected({ ...lead }); setConfirmDelete(false) }}
                  className={`border-b border-gray-50 dark:border-white/5 hover:bg-blue-50 dark:hover:bg-white/5 cursor-pointer transition ${
                    checked.has(lead.lead_id) ? 'bg-red-50/40 dark:bg-red-500/5' :
                    selected?.lead_id === lead.lead_id ? 'bg-blue-50 dark:bg-white/5' : ''
                  } ${i === filtered.length - 1 ? 'border-0' : ''}`}
                >
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked.has(lead.lead_id)}
                      onChange={e => toggleCheck(lead.lead_id, e)}
                      className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  {isEcom ? (
                    <>
                      <td className="px-4 py-3.5 text-sm font-bold text-gray-900 dark:text-white">{lead.shopify_data?.order_name || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-400 dark:text-gray-500">
                        {lead.created_at ? new Date(lead.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-700 dark:text-blue-400 text-xs font-semibold">
                              {(lead.first_name?.[0] || '') + (lead.last_name?.[0] || '')}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{lead.first_name} {lead.last_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{lead.shopify_data?.channel || '—'}</td>
                      <td className="px-4 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">{fmtMoney(lead.sale_amount)}</td>
                      <td className="px-4 py-3.5 text-center"><ShopifyPill status={lead.shopify_data?.financial_status} /></td>
                      <td className="px-4 py-3.5 text-center"><ShopifyPill status={lead.shopify_data?.fulfillment_status} /></td>
                      <td className="px-4 py-3.5 text-center text-sm text-gray-500 dark:text-gray-400">{lead.shopify_data?.item_count ?? '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{lead.shopify_data?.delivery_method || '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-700 dark:text-blue-400 text-xs font-semibold">
                              {(lead.first_name?.[0] || '') + (lead.last_name?.[0] || '')}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {lead.first_name} {lead.last_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{lead.email || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{lead.phone || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                        {lead.city && lead.state ? `${lead.city}, ${lead.state}` : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        {lead.lead_status ? (
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusColors[lead.lead_status] || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                            {lead.lead_status}
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {lead.appt_status ? (
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusColors[lead.appt_status] || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                            {lead.appt_status}
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {lead.sale_status ? (
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusColors[lead.sale_status] || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                            {lead.sale_status}
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-400 dark:text-gray-500">
                        {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-out Panel */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-30 animate-[fadeIn_0.2s_ease]" onClick={() => setSelected(null)} />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col overflow-hidden border-l border-transparent dark:border-white/5 animate-[slideIn_0.25s_ease]">

            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 dark:text-blue-400 font-semibold text-sm">
                    {(selected.first_name?.[0] || '') + (selected.last_name?.[0] || '')}
                  </span>
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    {(selected.first_name || selected.last_name) ? `${selected.first_name} ${selected.last_name}` : 'New Contact'}
                  </h2>
                  <p className="text-xs text-gray-400">{selected.lead_id || 'Unsaved lead'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Contact Info</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">First Name</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.first_name || ''} onChange={e => setSelected(p => ({ ...p, first_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Last Name</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.last_name || ''} onChange={e => setSelected(p => ({ ...p, last_name: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Email</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.email || ''} onChange={e => setSelected(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Phone</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.phone || ''} onChange={e => setSelected(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Address</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.address || ''} onChange={e => setSelected(p => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">City</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.city || ''} onChange={e => setSelected(p => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">State</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.state || ''} onChange={e => setSelected(p => ({ ...p, state: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Zip Code</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.zip_code || ''} onChange={e => setSelected(p => ({ ...p, zip_code: e.target.value }))} />
                  </div>
                </div>
              </div>

              {leadMeta.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Survey Responses</p>
                  <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 space-y-2 text-xs text-gray-500">
                    {leadMeta.map(({ meta_key, meta_value }) => (
                      <div key={meta_key} className="flex justify-between gap-2">
                        <span className="text-gray-400">{META_LABELS[meta_key] || meta_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                        <span className="text-gray-600 dark:text-gray-300 text-right">{VALUE_LABELS[meta_value] || meta_value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Lead Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                      value={selected.lead_status || ''} onChange={e => setSelected(p => ({ ...p, lead_status: e.target.value }))}>
                      <option value="">—</option>
                      <option>New / Not Yet Contacted</option>
                      <option>Contacted / Working</option>
                      <option>Appt Set</option>
                      <option>Lost</option>
                      <option>Disqualified</option>
                      <option>Out of Area</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Appt Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                      value={selected.appt_status || ''} onChange={e => setSelected(p => ({ ...p, appt_status: e.target.value }))}>
                      <option value="">—</option>
                      <option>NA</option>
                      <option>Appt Confirmed</option>
                      <option>Appt Complete</option>
                      <option>Appt Lost</option>
                      <option>Appt Disqualified</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sale Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                      value={selected.sale_status || ''} onChange={e => {
                        const val = e.target.value
                        setSelected(p => ({
                          ...p,
                          sale_status:  val,
                          ...(val === 'Sold' && {
                            lead_status: 'Appt Set',
                            appt_status: 'Appt Complete',
                          }),
                        }))
                      }}>
                      <option value="">—</option>
                      <option>NA</option>
                      <option>Proposal Sent</option>
                      <option>Sold</option>
                      <option>Sale Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sale Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg pl-6 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                        value={selected.sale_amount ?? ''}
                        onChange={e => setSelected(p => ({ ...p, sale_amount: e.target.value === '' ? null : Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Appointment</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Appt Date</label>
                    <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.appt_date || ''} onChange={e => setSelected(p => ({ ...p, appt_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Appt Time</label>
                    <input type="time" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.appt_time || ''} onChange={e => setSelected(p => ({ ...p, appt_time: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
                <textarea rows={4} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500"
                  placeholder="Add notes about this contact..."
                  value={selected.ch_notes || ''} onChange={e => setSelected(p => ({ ...p, ch_notes: e.target.value }))} />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Source</p>
                <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 space-y-2 text-xs text-gray-500">
                  {[
                    ['UTM Source',   selected.utm_source],
                    ['UTM Medium',   selected.utm_medium],
                    ['UTM Campaign', selected.utm_campaign],
                    ['UTM Content',  selected.utm_content],
                    ['UTM Term',     selected.utm_term],
                    ['UTM Ad Group', selected.utm_adgroup],
                    ['Device',       selected.device],
                    ['LP URL',       selected.lp_url],
                  ].map(([label, val]) => val ? (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-gray-400">{label}</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate max-w-[260px] text-right">{val}</span>
                    </div>
                  ) : null)}
                </div>
              </div>

              {selected.lead_id && (
                <>
              {/* Resend Notification */}
              <div className="border border-blue-100 dark:border-blue-500/20 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Notification</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleResendNotification}
                    disabled={resending}
                    className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-60"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {resending ? 'Sending…' : 'Resend Notification'}
                  </button>
                  {resendResult === 'sent' && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">Sent!</span>
                  )}
                  {resendResult === 'error' && (
                    <span className="text-xs text-red-500 font-medium">Failed — check automation config</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">Re-sends the lead notification email to all recipients configured in this client's automations.</p>
              </div>

              {/* Danger zone */}
              <div className="border border-red-100 dark:border-red-500/20 rounded-xl p-4">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-2">Danger Zone</p>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400 transition font-medium"
                  >
                    Delete this lead…
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-red-600 dark:text-red-400">This will permanently delete the lead and all related data. Are you sure?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteOne}
                        disabled={deleting}
                        className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-50"
                      >
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-3 py-1.5 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
                </>
              )}

            </div>

            {/* Panel Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
              <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : saveSuccess ? '✓ Saved!' : selected.lead_id ? 'Save Changes' : 'Create Lead'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
