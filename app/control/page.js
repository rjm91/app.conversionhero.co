'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

/* ─── Date range presets ─── */
const DATE_PRESETS = [
  { label: 'Today', key: 'today' },
  { label: 'Last 7 Days', key: '7d' },
  { label: 'Last 14 Days', key: '14d' },
  { label: 'Last 30 Days', key: '30d' },
  { label: 'Last 90 Days', key: '90d' },
  { label: 'This Year', key: 'ytd' },
  { label: 'Last Year', key: 'ly' },
  { label: 'All Time', key: 'all' },
  { label: 'Custom', key: 'custom' },
]

function getDateRange(preset) {
  const now = new Date()
  const end = now.toISOString().split('T')[0]
  let start

  switch (preset) {
    case 'today':
      start = end
      break
    case '7d':
      start = new Date(now - 7 * 86400000).toISOString().split('T')[0]
      break
    case '14d':
      start = new Date(now - 14 * 86400000).toISOString().split('T')[0]
      break
    case '30d':
      start = new Date(now - 30 * 86400000).toISOString().split('T')[0]
      break
    case '90d':
      start = new Date(now - 90 * 86400000).toISOString().split('T')[0]
      break
    case 'ytd':
      start = `${now.getFullYear()}-01-01`
      break
    case 'ly': {
      const y = now.getFullYear() - 1
      return { start: `${y}-01-01`, end: `${y}-12-31` }
    }
    case 'all':
      return { start: null, end: null }
    default:
      start = new Date(now - 30 * 86400000).toISOString().split('T')[0]
  }
  return { start, end }
}

/* ─── Formatting helpers ─── */
function fmt$(n) { return '$' + Math.round(n || 0).toLocaleString() }
function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`
}

const PIPELINE_ORDER = ['clients', 'onboarding', 'sales', 'appointments', 'leads']
const SALES_PIPELINE_KEYS = ['onboarding', 'sales', 'appointments', 'leads']

/* ─── Status dropdown options (values = DB values, labels = display) ─── */
const LEAD_STATUSES = ['New / Not Yet Contacted', 'Contacted / Working', 'Appt Set', 'Lost', 'Disqualified', 'Out of Area']
const APPT_STATUSES = ['Appt Confirmed', 'Appt Complete', 'Appt Lost', 'Appt Disqualified']
const SALE_STATUSES = ['Agreement Pending', 'Agreement Sent', 'Agreement Signed', 'Invoice Sent', 'Invoice Paid', 'Sold', 'Sale Lost']
const ONBOARDING_STATUSES = ['Account Setup', 'Campaign Build', 'Review / QA', 'Ready to Launch']

function displayStatus(s) { return (s || '').replace(/Appt/g, 'Appointment') }

/* ─── Stage badge color map ─── */
const STAGE_COLORS = {
  green: 'bg-emerald-500/15 text-emerald-400',
  blue: 'bg-blue-500/15 text-blue-400',
  purple: 'bg-violet-500/15 text-violet-400',
  yellow: 'bg-amber-500/15 text-amber-400',
  gray: 'bg-gray-500/15 text-gray-400',
}

const SUMMARY_COLORS = {
  green: 'text-emerald-400',
  blue: 'text-blue-400',
}

/* ─── Map lead/appt/sale statuses to badge colors ─── */
function statusColor(status) {
  if (!status || status === '—' || status === 'NA') return 'gray'
  const s = status.toLowerCase()
  if (s.includes('sold') || s.includes('complete') || s.includes('active') || s === 'new') return 'green'
  if (s.includes('qualified') || s.includes('account setup') || s.includes('campaign build')) return 'purple'
  if (s.includes('invoice paid')) return 'green'
  if (s.includes('pending')) return 'yellow'
  if (s.includes('agreement') || s.includes('invoice') || s.includes('proposal') || s.includes('contacted') || s.includes('set') || s.includes('outreach') || s.includes('appt confirmed')) return 'blue'
  if (s.includes('negotiation')) return 'yellow'
  if (s.includes('lost') || s.includes('disqualified')) return 'gray'
  return 'blue'
}

/* ─── Fetch data for one client (same pattern as the working dashboard page) ─── */
async function fetchClientData(clientId, start, end) {
  // Leads
  let leadsQ = supabase
    .from('client_lead')
    .select('lead_id, lead_status, appt_status, sale_status, first_name, last_name, email, phone, company, city, state, created_at, appt_date')
    .eq('client_id', clientId)
    .neq('lead_status', 'in_progress')
  if (start) leadsQ = leadsQ.gte('created_at', start)
  if (end) leadsQ = leadsQ.lte('created_at', end + 'T23:59:59-12:00')

  // Campaigns
  let campsQ = supabase
    .from('client_yt_campaigns')
    .select('campaign_id, cost')
    .eq('client_id', clientId)
  if (start) campsQ = campsQ.gte('date', start)
  if (end) campsQ = campsQ.lte('date', end)

  // Payments
  let paysQ = supabase
    .from('client_payments')
    .select('amount, date_created')
    .eq('client_id', clientId)
  if (start) paysQ = paysQ.gte('date_created', start)
  if (end) paysQ = paysQ.lte('date_created', end + 'T23:59:59-12:00')

  const [{ data: leads }, { data: campaigns }, { data: payments }] = await Promise.all([
    leadsQ, campsQ, paysQ,
  ])

  return {
    leads: leads || [],
    campaigns: campaigns || [],
    payments: payments || [],
  }
}

/* ─── Build pipeline data ─── */
function buildPipelines(clientsWithData, agencyLeads, showDemo = false) {
  const activeClients = clientsWithData.filter(c => c.status === 'Active' || (showDemo && c.status === 'Demo'))

  // ── Active Clients rows ──
  const clientRows = activeClients.map(c => {
    const cashCollected = c._payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const uniqueCampaigns = new Set(c._campaigns.map(ca => ca.campaign_id)).size
    const adSpend = c._campaigns.reduce((s, ca) => s + (Number(ca.cost) || 0), 0)
    const leadCount = c._leads.length
    const appts = c._leads.filter(l => l.appt_status === 'Appt Complete').length
    const customers = c._leads.filter(l => l.sale_status === 'Sold').length
    const cpl = leadCount > 0 ? adSpend / leadCount : 0
    const cpa = appts > 0 ? adSpend / appts : 0
    const cac = customers > 0 ? adSpend / customers : 0

    return [
      fmtDate(c.created_at),
      c.status === 'Demo' ? { badge: 'Demo', color: 'yellow' } : { badge: 'Active', color: 'green' },
      c.client_name,
      c.industry || '—',
      c.city && c.state ? `${c.city}, ${c.state}` : (c.city || c.state || '—'),
      { value: fmt$(cashCollected), color: 'green' },
      String(uniqueCampaigns),
      fmt$(adSpend),
      { value: String(leadCount), bold: true },
      leadCount > 0 ? fmt$(cpl) : '—',
      String(appts),
      appts > 0 ? fmt$(cpa) : '—',
      { value: String(customers), bold: true },
      customers > 0 ? fmt$(cac) : '—',
      { link: 'View Dashboard →', href: `/control/${c.client_id}/dashboard` },
    ]
  })

  // Summary totals
  let totalCash = 0, totalAdSpend = 0, totalCampaignIds = new Set(), totalLeads = 0, totalAppts = 0, totalCustomers = 0
  activeClients.forEach(c => {
    totalCash += c._payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    c._campaigns.forEach(ca => { totalCampaignIds.add(ca.campaign_id); totalAdSpend += (Number(ca.cost) || 0) })
    totalLeads += c._leads.length
    totalAppts += c._leads.filter(l => l.appt_status === 'Appt Complete').length
    totalCustomers += c._leads.filter(l => l.sale_status === 'Sold').length
  })

  const clientsPipeline = {
    title: 'Active Clients',
    count: activeClients.length,
    columns: ['Submitted','Status','Company Name','Industry','Location','Cash Collected','Campaigns','Total Ad Spend','Leads','Cost Per Lead','Completed Appointments','Cost Per Appointment','Customers','CAC',''],
    summaryMap: {
      5: { value: fmt$(totalCash), color: 'green' },
      6: { value: String(totalCampaignIds.size) },
      7: { value: fmt$(totalAdSpend) },
      8: { value: String(totalLeads) },
      9: { value: totalLeads > 0 ? fmt$(totalAdSpend / totalLeads) : '—', dim: true },
      10: { value: String(totalAppts) },
      11: { value: totalAppts > 0 ? fmt$(totalAdSpend / totalAppts) : '—', dim: true },
      12: { value: String(totalCustomers) },
      13: { value: totalCustomers > 0 ? fmt$(totalAdSpend / totalCustomers) : '—', dim: true },
    },
    headerStats: [
      { value: fmt$(totalCash), label: 'Revenue', color: 'text-emerald-400' },
      { value: String(totalCampaignIds.size), label: 'Campaigns', color: 'text-white' },
      { value: fmt$(totalAdSpend), label: 'Ad Spend', color: 'text-white' },
      { value: String(totalLeads), label: 'Leads', color: totalLeads > 0 ? 'text-white' : 'text-gray-500' },
      { value: String(totalAppts), label: 'Appts', color: totalAppts > 0 ? 'text-white' : 'text-gray-500' },
      { value: String(totalCustomers), label: 'Customers', color: totalCustomers > 0 ? 'text-white' : 'text-gray-500' },
    ],
    rows: clientRows,
  }

  // Exclude agency leads that already appear as Active Clients
  const clientNames = new Set(clientsWithData.map(c => (c.client_name || '').toLowerCase().trim()))
  const remainingLeads = agencyLeads.filter(l => !clientNames.has((l.company || '').toLowerCase().trim()))

  // ── Agency Leads (from agency_leads table) for all pipeline sections below Active Clients ──
  function agencyLeadRow(l) {
    const funnel = l.agency_funnels?.name || ''
    return [
      fmtDate(l.created_at),
      { select: true, leadId: l.id, field: 'lead_status', value: l.lead_status || '', options: LEAD_STATUSES, color: statusColor(l.lead_status) },
      { select: true, leadId: l.id, field: 'appt_status', value: l.appt_status || '', options: APPT_STATUSES, color: statusColor(l.appt_status) },
      { select: true, leadId: l.id, field: 'sale_status', value: l.sale_status || '', options: SALE_STATUSES, color: statusColor(l.sale_status) },
      [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
      l.company || funnel || '—',
      l.email || '—',
      l.phone || '—',
    ]
  }

  // ── Waterfall: each lead appears in only its furthest pipeline stage ──
  // Onboarding: sale_status = 'Sold' (deal closed, now onboarding as client)
  const onboardingLeads = remainingLeads.filter(l => l.sale_status === 'Sold')
  const onboardingIds = new Set(onboardingLeads.map(l => l.id))

  // Sales: has sale_status (not Sold) OR appt is Confirmed/Complete
  const salesLeads = remainingLeads.filter(l => !onboardingIds.has(l.id) && (
    (l.sale_status && l.sale_status !== 'NA') ||
    l.appt_status === 'Appt Confirmed' ||
    l.appt_status === 'Appt Complete'
  ))
  const salesIds = new Set(salesLeads.map(l => l.id))

  // Appointments: lead_status is Appt Set, or has other appt_status (Lost, Disqualified, etc)
  const apptLeads = remainingLeads.filter(l => !onboardingIds.has(l.id) && !salesIds.has(l.id) && (
    (l.appt_status && l.appt_status !== 'NA') || l.lead_status === 'Appt Set'
  ))
  const apptIds = new Set(apptLeads.map(l => l.id))

  const onlyLeads = remainingLeads.filter(l => !onboardingIds.has(l.id) && !salesIds.has(l.id) && !apptIds.has(l.id))

  // ── Onboarding ──
  const onboardingRows = onboardingLeads.map(l => {
    const funnel = l.agency_funnels?.name || ''
    const r = [
      fmtDate(l.created_at),
      { select: true, leadId: l.id, field: 'onboarding_status', value: l.onboarding_status || '', options: ONBOARDING_STATUSES, color: statusColor(l.onboarding_status) },
      [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
      l.company || funnel || '—',
      l.email || '—',
      l.phone || '—',
      l.sale_amount ? fmt$(l.sale_amount) : '—',
      { link: 'View →' },
    ]
    r._lead = l
    return r
  })

  const onboardingPipeline = {
    title: 'Onboarding',
    count: onboardingLeads.length,
    columns: ['Submitted','Onboarding Status','Contact','Company','Email','Phone','Deal Value',''],
    summaryMap: {},
    rows: onboardingRows,
  }

  // ── Sales ──
  const salesRows = salesLeads.map(l => { const r = [...agencyLeadRow(l), { link: 'View →' }]; r._lead = l; return r })
  const proposalCount = salesLeads.filter(l => l.sale_status === 'Agreement Sent').length

  const salesPipeline = {
    title: 'Sales',
    count: salesLeads.length,
    columns: ['Submitted','Lead Status','Appointment Status','Sale Status','Contact','Company','Email','Phone',''],
    summaryMap: proposalCount ? { 3: { value: `${proposalCount} Agreement Sent` } } : {},
    rows: salesRows,
  }

  // ── Appointments (excluding leads already in Sales) ──
  const apptRows = apptLeads.map(l => { const r = [...agencyLeadRow(l), l.appt_date ? fmtDate(l.appt_date) : '—', { link: 'View →' }]; r._lead = l; return r })
  const completeAppts = apptLeads.filter(l => l.appt_status === 'Appt Complete').length
  const upcomingAppts = apptLeads.filter(l => l.appt_status === 'Appt Set' || l.appt_status === 'Appt Confirmed').length

  const appointmentsPipeline = {
    title: 'Appointments',
    count: apptLeads.length,
    columns: ['Submitted','Lead Status','Appointment Status','Sale Status','Contact','Company','Email','Phone','Appointment Date',''],
    summaryMap: { 2: { value: `${completeAppts} Complete, ${upcomingAppts} Upcoming` } },
    rows: apptRows,
  }

  // ── Leads (only those not in Sales or Appointments) ──
  const leadRows = onlyLeads.map(l => { const r = [...agencyLeadRow(l), { link: 'View →' }]; r._lead = l; return r })
  const leadStatusCounts = {}
  onlyLeads.forEach(l => {
    const st = l.lead_status || 'Unknown'
    leadStatusCounts[st] = (leadStatusCounts[st] || 0) + 1
  })
  const leadSummaryParts = Object.entries(leadStatusCounts).slice(0, 3).map(([k, v]) => `${v} ${k}`)

  const leadsPipeline = {
    title: 'Leads',
    count: onlyLeads.length,
    columns: ['Submitted','Lead Status','Appointment Status','Sale Status','Contact','Company','Email','Phone',''],
    summaryMap: leadSummaryParts.length ? { 1: { value: leadSummaryParts.join(', ') } } : {},
    rows: leadRows,
  }

  return {
    clients: clientsPipeline,
    onboarding: onboardingPipeline,
    sales: salesPipeline,
    appointments: appointmentsPipeline,
    leads: leadsPipeline,
  }
}

/* ─── Cell renderer ─── */
function CellContent({ cell, onStatusChange }) {
  if (cell === null || cell === undefined) return null
  if (typeof cell === 'string') return cell

  if (cell.select) {
    const colorCls = STAGE_COLORS[cell.color] || STAGE_COLORS.gray
    return (
      <select
        value={cell.value}
        onClick={e => e.stopPropagation()}
        onChange={e => {
          e.stopPropagation()
          onStatusChange?.(cell.leadId, cell.field, e.target.value)
        }}
        className={`appearance-none cursor-pointer px-3 py-1 rounded-full text-[11px] font-semibold border-0 outline-none ${colorCls} bg-transparent`}
        style={{ backgroundImage: 'none' }}
      >
        <option value="" className="bg-[#1a1f36] text-gray-400">—</option>
        {cell.options.map(opt => (
          <option key={opt} value={opt} className="bg-[#1a1f36] text-gray-300">{displayStatus(opt)}</option>
        ))}
      </select>
    )
  }

  if (cell.badge) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold ${STAGE_COLORS[cell.color] || STAGE_COLORS.gray}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cell.color === 'green' ? 'bg-emerald-400' : cell.color === 'yellow' ? 'bg-amber-400' : 'bg-blue-400'}`} />
        {cell.badge}
      </span>
    )
  }

  if (cell.stage) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold ${STAGE_COLORS[cell.color] || STAGE_COLORS.gray}`}>
        {cell.stage}
      </span>
    )
  }

  if (cell.client) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: cell.iconBg }}>
          {cell.icon}
        </div>
        <span className="font-semibold text-white">{cell.client}</span>
      </div>
    )
  }

  if (cell.value) {
    const colorCls = cell.color === 'green' ? 'text-emerald-400' : ''
    const boldCls = cell.bold || cell.color ? 'font-semibold' : ''
    return <span className={`${colorCls} ${boldCls}`}>{cell.value}</span>
  }

  if (cell.link) {
    return <span className="text-blue-400 font-medium text-[13px] whitespace-nowrap cursor-pointer hover:text-blue-300">{cell.link}</span>
  }

  return null
}

/* ─── Column Resize Hook ─── */
function useColumnResize(tableRef, isCollapsed, rowCount) {
  useEffect(() => {
    if (isCollapsed) return
    const table = tableRef.current
    if (!table) return

    const colHeaderRow = table.querySelector('.col-headers')
    if (!colHeaderRow) return

    const ths = Array.from(colHeaderRow.querySelectorAll('th'))
    if (!ths.length) return

    // Skip if already set up with same column count
    if (table.querySelector('.col-resize-handle') && table.dataset.resizeCols === String(ths.length)) return
    table.dataset.resizeCols = String(ths.length)

    const widths = ths.map(th => th.getBoundingClientRect().width)

    const existing = table.querySelector('colgroup')
    if (existing) existing.remove()

    const colgroup = document.createElement('colgroup')
    widths.forEach(w => {
      const col = document.createElement('col')
      col.style.width = w + 'px'
      colgroup.appendChild(col)
    })
    table.insertBefore(colgroup, table.firstChild)

    ths.forEach(th => { th.style.width = ''; th.style.minWidth = '' })
    table.style.tableLayout = 'fixed'
    table.style.width = widths.reduce((a, b) => a + b, 0) + 'px'

    const cols = Array.from(colgroup.querySelectorAll('col'))

    ths.forEach((th, i) => {
      if (i === ths.length - 1) return
      if (th.querySelector('.col-resize-handle')) return

      const handle = document.createElement('div')
      handle.className = 'col-resize-handle'
      handle.style.cssText = 'position:absolute;right:0;top:25%;bottom:25%;width:7px;cursor:col-resize;z-index:10;border-right:1px solid rgba(255,255,255,0.15);'
      th.style.position = 'relative'
      th.appendChild(handle)

      handle.addEventListener('mousedown', function (e) {
        e.preventDefault()
        e.stopPropagation()
        const startX = e.pageX
        const startColW = parseFloat(cols[i].style.width)
        const startTableW = parseFloat(table.style.width)
        handle.style.borderRightColor = 'rgba(59,130,246,0.7)'
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        function onMove(ev) {
          const dx = ev.pageX - startX
          const newW = Math.max(40, startColW + dx)
          const delta = newW - startColW
          cols[i].style.width = newW + 'px'
          table.style.width = (startTableW + delta) + 'px'
        }
        function onUp() {
          handle.style.borderRightColor = 'rgba(255,255,255,0.15)'
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      })
    })
  }, [isCollapsed, tableRef, rowCount])
}

/* ─── Accordion Pipeline Component ─── */
function PipelineAccordion({ id, pipeline, defaultCollapsed = true, onStatusChange, onRowClick, nested }) {
  const { title, count, columns, summaryMap, rows, headerStats } = pipeline
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const tableRef = useRef(null)

  useColumnResize(tableRef, collapsed, rows.length)

  const toggle = useCallback(() => setCollapsed(c => !c), [])
  const titleColspan = 5

  return (
    <div className={nested ? 'border-b border-white/[0.04]' : 'mb-3 border border-white/[0.06] rounded-xl bg-[#1a1f36] overflow-hidden'}>
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
        <table ref={tableRef} className="w-full border-collapse" style={{ minWidth: columns.length > 10 ? '1200px' : undefined }}>
          <thead>
            <tr
              className="cursor-pointer select-none group"
              onClick={toggle}
            >
              {headerStats ? (
                <td colSpan={columns.length} className="py-3.5 px-5 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block text-xs text-gray-500 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}>
                      ▾
                    </span>
                    <span className="text-[15px] font-bold text-white">{title}</span>
                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-white/[0.08] text-xs font-bold text-gray-400">
                      {count}
                    </span>
                    <div className="flex-1" />
                    <div className="flex items-center">
                      {headerStats.map((stat, si) => (
                        <div key={si} className={`flex flex-col items-center px-3.5 min-w-[70px] ${si < headerStats.length - 1 ? 'border-r border-white/5' : ''}`}>
                          <span className={`text-[15px] font-extrabold leading-tight ${stat.color}`}>{stat.value}</span>
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">{stat.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </td>
              ) : (
                <>
                  <td
                    colSpan={Math.min(titleColspan, columns.length)}
                    className="py-3.5 px-5 border-b border-white/[0.06] whitespace-nowrap"
                  >
                    <span className={`inline-block text-xs text-gray-500 transition-transform duration-200 mr-2 ${collapsed ? '-rotate-90' : ''}`}>
                      ▾
                    </span>
                    <span className="text-[15px] font-bold text-white">{title}</span>
                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 ml-2 rounded-full bg-white/[0.08] text-xs font-bold text-gray-400 align-middle">
                      {count}
                    </span>
                  </td>
                  {columns.slice(titleColspan).map((_, i) => {
                    const colIdx = titleColspan + i
                    const summary = summaryMap[colIdx]
                    if (!summary) return <td key={colIdx} className="py-3.5 px-4 border-b border-white/[0.06]" />
                    const colorCls = summary.color ? (SUMMARY_COLORS[summary.color] || 'text-gray-300') : (summary.dim ? 'text-gray-500' : 'text-gray-200')
                    return (
                      <td key={colIdx} className={`py-3.5 px-4 border-b border-white/[0.06] text-[13px] font-bold whitespace-nowrap ${colorCls}`}>
                        {summary.value}
                      </td>
                    )
                  })}
                </>
              )}
            </tr>

            {!collapsed && (
              <tr className="col-headers">
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className="text-left py-3 px-4 text-[11px] text-gray-500 uppercase tracking-wide font-semibold border-b border-white/[0.06] bg-white/[0.02] relative"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            )}
          </thead>

          {!collapsed && (
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-8 px-5 text-center text-gray-500 text-sm">
                    No data yet
                  </td>
                </tr>
              ) : (
                rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={`hover:bg-white/[0.02] transition-colors ${onRowClick && row._lead ? 'cursor-pointer' : ''}`}
                    onClick={() => onRowClick && row._lead && onRowClick(row._lead)}
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="py-3.5 px-4 text-[13px] text-gray-400 border-b border-white/[0.04]"
                      >
                        <CellContent cell={cell} onStatusChange={onStatusChange} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>
    </div>
  )
}

/* ─── Date Range Picker ─── */
function DateRangePicker({ preset, onPresetChange, customStart, customEnd, onCustomChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const activeLabel = DATE_PRESETS.find(p => p.key === preset)?.label || 'Last 30 Days'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-white/10 bg-white/[0.04] text-[13px] font-medium text-gray-300 hover:bg-white/[0.08] transition"
      >
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {activeLabel}
        {preset === 'custom' && customStart && customEnd && (
          <span className="text-gray-500 text-[11px] ml-1">({customStart} — {customEnd})</span>
        )}
        <span className="text-[8px] opacity-50 ml-0.5">&#9662;</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-[#1a1f36] border border-white/10 rounded-xl p-1.5 min-w-[200px] z-50 shadow-xl">
          {DATE_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => {
                onPresetChange(p.key)
                if (p.key !== 'custom') setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-[13px] rounded-lg transition ${
                preset === p.key ? 'bg-blue-600 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="border-t border-white/[0.06] mt-1.5 pt-2 px-2 pb-1 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-500 w-10">From</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => onCustomChange(e.target.value, customEnd)}
                  className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-300 outline-none focus:border-blue-500/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-500 w-10">To</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => onCustomChange(customStart, e.target.value)}
                  className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-300 outline-none focus:border-blue-500/50"
                />
              </div>
              <button
                onClick={() => setOpen(false)}
                className="mt-1 py-1.5 bg-blue-600 text-white text-[12px] font-medium rounded-lg hover:bg-blue-500 transition"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Projects Section ─── */
const PROJ_PRIORITY_META = {
  critical: { label: 'Critical', cls: 'bg-red-500/10 text-red-400' },
  high:     { label: 'High',     cls: 'bg-orange-500/10 text-orange-400' },
  medium:   { label: 'Medium',   cls: 'bg-yellow-500/10 text-yellow-400' },
  low:      { label: 'Low',      cls: 'bg-white/10 text-gray-400' },
}
const PROJ_STATUS_META = {
  active:    { label: 'Active',    dot: 'bg-green-500' },
  on_hold:   { label: 'On Hold',   dot: 'bg-yellow-400' },
  completed: { label: 'Completed', dot: 'bg-indigo-400' },
  archived:  { label: 'Archived',  dot: 'bg-gray-400' },
}
const PROJ_STATUS_ORDER = ['active', 'on_hold', 'completed', 'archived']
const PROJ_TYPE_LABELS = { client: 'Client', dev: 'Dev', internal: 'Internal', marketing: 'Marketing' }
const PROJ_TASK_STATUS = ['todo', 'in_progress', 'done']
const PROJ_TASK_STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
const PROJ_TASK_STATUS_CLS = {
  todo:        'bg-white/10 text-gray-400',
  in_progress: 'bg-blue-500/10 text-blue-400',
  done:        'bg-green-500/10 text-green-400',
}
const emptyNewProject = { name: '', description: '', type: 'internal', priority: 'medium', owner: '', created_by: '', due_date: '' }
const emptyTask = { title: '', priority: 'medium', assignee: '', due_date: '' }

function ProjectsSection() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState(new Set(['active']))
  const [expandedProjectId, setExpandedProjectId] = useState(null)
  const [expandedTasks, setExpandedTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)

  // New project drawer
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState(emptyNewProject)
  const [newSaving, setNewSaving] = useState(false)
  const [newError, setNewError] = useState(null)

  // Edit project drawer
  const [editProject, setEditProject] = useState(null)

  // Add task inline
  const [addingTaskFor, setAddingTaskFor] = useState(null)
  const [taskForm, setTaskForm] = useState(emptyTask)
  const [taskSaving, setTaskSaving] = useState(false)

  // Inline rename
  const [editingNameId, setEditingNameId] = useState(null)
  const [editingNameVal, setEditingNameVal] = useState('')

  // Edit task panel
  const [editingTask, setEditingTask] = useState(null)
  const [taskSaveMsg, setTaskSaveMsg] = useState(null)

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects')
      const json = await res.json()
      console.log('[ProjectsSection] loaded', json.projects?.length, 'projects')
      setProjects(json.projects || [])
    } catch (err) {
      console.error('[ProjectsSection] fetch error:', err)
    }
    setLoading(false)
  }

  const grouped = useMemo(() => {
    const g = {}
    PROJ_STATUS_ORDER.forEach(s => { g[s] = [] })
    projects.forEach(p => { const s = g[p.status] ? p.status : 'active'; g[s].push(p) })
    return g
  }, [projects])

  function toggleGroup(status) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
      return next
    })
  }

  async function toggleProject(p) {
    if (expandedProjectId === p.id) {
      setExpandedProjectId(null); setExpandedTasks([]); setAddingTaskFor(null); return
    }
    setExpandedProjectId(p.id); setExpandedTasks([]); setTasksLoading(true); setAddingTaskFor(null)
    const res = await fetch(`/api/projects/${p.id}`)
    const json = await res.json()
    const proj = json.project
    if (proj) {
      setExpandedTasks((proj.project_tasks || []).sort((a, b) => a.sort_order - b.sort_order))
      setProjects(prev => prev.map(x => x.id === proj.id ? { ...x, ...proj } : x))
    }
    setTasksLoading(false)
  }

  async function handleCreate() {
    if (!newForm.name.trim()) return
    setNewSaving(true); setNewError(null)
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newForm) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setProjects(prev => [{ ...json.project, project_tasks: [] }, ...prev])
      setCreating(false); setNewForm(emptyNewProject)
    } catch (e) { setNewError(e.message) }
    finally { setNewSaving(false) }
  }

  async function patchProject(id, updates) {
    const res = await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
    const json = await res.json()
    if (res.ok) {
      setEditProject(json.project)
      setProjects(prev => prev.map(p => p.id === json.project.id ? { ...p, ...json.project } : p))
    }
  }

  async function addTask(projectId) {
    if (!taskForm.title.trim()) return
    setTaskSaving(true)
    const res = await fetch('/api/project-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...taskForm, project_id: projectId, sort_order: expandedTasks.length }) })
    const json = await res.json()
    if (res.ok) {
      setExpandedTasks(prev => [...prev, json.task])
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, project_tasks: [...(p.project_tasks || []), json.task] } : p))
      setTaskForm(emptyTask); setAddingTaskFor(null)
    }
    setTaskSaving(false)
  }

  async function patchTask(taskId, updates) {
    const res = await fetch(`/api/project-tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
    const json = await res.json()
    if (res.ok) {
      setExpandedTasks(prev => prev.map(t => t.id === taskId ? json.task : t))
      if (editingTask?.id === taskId) setEditingTask(json.task)
      setTaskSaveMsg('Saved'); setTimeout(() => setTaskSaveMsg(null), 1800)
      setProjects(prev => prev.map(p => p.id === expandedProjectId ? { ...p, project_tasks: (p.project_tasks || []).map(t => t.id === taskId ? json.task : t) } : p))
    }
  }

  async function deleteTask(taskId) {
    await fetch(`/api/project-tasks/${taskId}`, { method: 'DELETE' })
    setExpandedTasks(prev => prev.filter(t => t.id !== taskId))
    if (editingTask?.id === taskId) setEditingTask(null)
    setProjects(prev => prev.map(p => p.id === expandedProjectId ? { ...p, project_tasks: (p.project_tasks || []).filter(t => t.id !== taskId) } : p))
  }

  async function saveInlineName(projectId) {
    const trimmed = editingNameVal.trim()
    if (trimmed && trimmed !== projects.find(p => p.id === projectId)?.name) {
      await patchProject(projectId, { name: trimmed })
    }
    setEditingNameId(null)
  }

  async function cycleTaskStatus(task) {
    const next = PROJ_TASK_STATUS[(PROJ_TASK_STATUS.indexOf(task.status) + 1) % PROJ_TASK_STATUS.length]
    await patchTask(task.id, { status: next })
  }

  const activeCount = (grouped.active || []).length
  const onHoldCount = (grouped.on_hold || []).length
  const completedCount = (grouped.completed || []).length
  const totalTasks = projects.reduce((sum, p) => sum + (p.project_tasks || []).length, 0)
  const doneTasks = projects.reduce((sum, p) => sum + (p.project_tasks || []).filter(t => t.status === 'done').length, 0)

  return (
    <>
      {/* Top-level Projects accordion */}
      <div className="bg-[#171B33] rounded-2xl border border-white/5 mt-4 overflow-hidden">
        <button onClick={() => setProjectsOpen(o => !o)}
          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition">
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${projectsOpen ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-[15px] font-bold text-white">Projects</span>
          <span className="text-xs text-gray-400 font-semibold bg-white/5 px-2.5 py-0.5 rounded-full">{projects.length}</span>
          <div className="flex-1" />
          {!loading && (
            <div className="flex items-center">
              <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-white/5">
                <span className="text-[15px] font-extrabold leading-tight text-green-400">{activeCount}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Active</span>
              </div>
              <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-white/5">
                <span className="text-[15px] font-extrabold leading-tight text-yellow-400">{onHoldCount}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">On Hold</span>
              </div>
              <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-white/5">
                <span className="text-[15px] font-extrabold leading-tight text-indigo-400">{completedCount}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Completed</span>
              </div>
              <div className="flex flex-col items-center px-3.5 min-w-[70px]">
                <span className="text-[15px] font-extrabold leading-tight text-white">{doneTasks}/{totalTasks}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Tasks Done</span>
              </div>
            </div>
          )}
          <button onClick={e => { e.stopPropagation(); setCreating(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition ml-3">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New
          </button>
        </button>

        {projectsOpen && (
          <div className="border-t border-white/5">
            {loading ? (
              <div className="px-5 py-4 text-sm text-gray-500">Loading projects...</div>
            ) : projects.length === 0 ? (
              <div className="px-5 py-4 text-sm text-gray-500">No projects yet. Click New to create one.</div>
            ) : (
              PROJ_STATUS_ORDER.map(status => {
                const group = grouped[status] || []
                if (group.length === 0) return null
                const sm = PROJ_STATUS_META[status]
                const isOpen = openGroups.has(status)
                return (
                  <div key={status}>
                    <button onClick={() => toggleGroup(status)}
                      className="w-full flex items-center gap-3 px-5 py-3 pl-10 hover:bg-white/[0.02] transition border-b border-white/[0.03]">
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      <div className={`w-2 h-2 rounded-full ${sm.dot}`} />
                      <span className="text-sm font-semibold text-white text-left">{sm.label}</span>
                      <span className="text-xs text-gray-400 font-semibold bg-white/5 px-2.5 py-0.5 rounded-full">{group.length}</span>
                    </button>

                    {isOpen && group.map(p => {
                      const tasks_ = p.project_tasks || []
                      const done_ = tasks_.filter(t => t.status === 'done').length
                      const pct_ = tasks_.length ? Math.round((done_ / tasks_.length) * 100) : 0
                      const pm = PROJ_PRIORITY_META[p.priority] || PROJ_PRIORITY_META.medium
                      const isExpanded = expandedProjectId === p.id
                      return (
                        <div key={p.id}>
                          <div className={`flex items-center gap-3 px-5 py-3 pl-[72px] cursor-pointer transition border-b border-white/[0.03] hover:bg-white/[0.02] ${isExpanded ? 'bg-blue-500/[0.04]' : ''}`}
                            onClick={() => toggleProject(p)}>
                            {editingNameId === p.id ? (
                              <input
                                autoFocus
                                className="text-sm font-semibold text-white flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                                value={editingNameVal}
                                onClick={e => e.stopPropagation()}
                                onChange={e => setEditingNameVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveInlineName(p.id); if (e.key === 'Escape') setEditingNameId(null) }}
                                onBlur={() => saveInlineName(p.id)}
                              />
                            ) : (
                              <span
                                className="text-sm font-semibold text-white flex-1 min-w-0 truncate hover:text-blue-300 transition"
                                onDoubleClick={e => { e.stopPropagation(); setEditingNameId(p.id); setEditingNameVal(p.name) }}
                                title="Double-click to rename"
                              >{p.name}</span>
                            )}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pm.cls}`}>{pm.label}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/10 text-gray-400">{PROJ_TYPE_LABELS[p.type] || p.type}</span>
                              {p.owner && <span className="text-[11px] text-gray-400">{p.owner}</span>}
                              {p.due_date && <span className="text-[11px] text-gray-400">Due {new Date(p.due_date).toLocaleDateString()}</span>}
                              {tasks_.length > 0 && (
                                <>
                                  <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct_}%` }} />
                                  </div>
                                  <span className="text-[10px] text-gray-400 font-semibold w-8 text-right">{done_}/{tasks_.length}</span>
                                </>
                              )}
                              <button onClick={e => { e.stopPropagation(); setEditProject(p) }}
                                className="p-1 rounded hover:bg-white/10 transition text-gray-400 hover:text-gray-200" title="Edit project">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="bg-black/15">
                              {tasksLoading ? (
                                <p className="pl-24 py-4 text-xs text-gray-400">Loading tasks...</p>
                              ) : expandedTasks.length === 0 && !addingTaskFor ? (
                                <div className="pl-24 py-4 flex items-center gap-3">
                                  <span className="text-xs text-gray-400">No tasks yet</span>
                                  <button onClick={() => { setAddingTaskFor(p.id); setTaskForm(emptyTask) }}
                                    className="text-xs text-gray-400 border border-dashed border-white/10 px-3 py-1 rounded hover:text-blue-500 hover:border-blue-500 transition">
                                    + Add task
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {expandedTasks.map(task => (
                                    <div key={task.id}
                                      className={`flex items-center gap-3 px-5 py-2.5 pl-24 border-b border-white/[0.03] hover:bg-white/5 transition cursor-pointer ${task.status === 'done' ? 'opacity-60' : ''}`}
                                      onClick={() => setEditingTask(task)}>
                                      <button onClick={e => { e.stopPropagation(); cycleTaskStatus(task) }}
                                        className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${task.status === 'done' ? 'bg-green-500 border-green-500' : task.status === 'in_progress' ? 'border-blue-500' : 'border-white/20'}`}>
                                        {task.status === 'done' && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        {task.status === 'in_progress' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                      </button>
                                      <span className={`text-sm flex-1 text-gray-300 ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</span>
                                      {task.assignee && <span className="text-[11px] text-gray-400">{task.assignee}</span>}
                                      {task.due_date && <span className="text-[11px] text-gray-400">{new Date(task.due_date).toLocaleDateString()}</span>}
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${PROJ_TASK_STATUS_CLS[task.status]}`}>{PROJ_TASK_STATUS_LABEL[task.status]}</span>
                                    </div>
                                  ))}
                                  {addingTaskFor === p.id ? (
                                    <div className="pl-24 pr-5 py-3">
                                      <input autoFocus placeholder="Task title"
                                        className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                                        value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') addTask(p.id); if (e.key === 'Escape') setAddingTaskFor(null) }} />
                                      <div className="flex gap-2 justify-end">
                                        <button onClick={() => { setAddingTaskFor(null); setTaskForm(emptyTask) }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition">Cancel</button>
                                        <button onClick={() => addTask(p.id)} disabled={taskSaving || !taskForm.title.trim()} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-60">
                                          {taskSaving ? 'Saving...' : 'Add Task'}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="pl-24 py-2">
                                      <button onClick={() => { setAddingTaskFor(p.id); setTaskForm(emptyTask) }}
                                        className="text-[11px] text-gray-400 border border-dashed border-white/10 px-3 py-1 rounded hover:text-blue-500 hover:border-blue-500 transition">
                                        + Add task
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Edit project drawer */}
      {editProject && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setEditProject(null)} />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-white/5">
            <div className="flex items-start justify-between px-6 py-5 border-b border-white/5">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className="font-semibold text-white text-base">{editProject.name}</h2>
                {editProject.description && <p className="text-xs text-gray-400 mt-1">{editProject.description}</p>}
              </div>
              <button onClick={() => setEditProject(null)} className="text-gray-400 hover:text-gray-200 p-1.5 rounded-lg hover:bg-white/10 transition flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Status', field: 'status', type: 'select', options: ['active', 'on_hold', 'completed', 'archived'] },
                  { label: 'Priority', field: 'priority', type: 'select', options: ['critical', 'high', 'medium', 'low'] },
                  { label: 'Owner', field: 'owner', type: 'text' },
                  { label: 'Due Date', field: 'due_date', type: 'date' },
                ].map(({ label, field, type, options }) => (
                  <div key={field} className="bg-white/5 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                    {type === 'select' ? (
                      <select className="w-full text-xs bg-transparent text-white focus:outline-none"
                        value={editProject[field] || ''}
                        onChange={e => patchProject(editProject.id, { [field]: e.target.value })}>
                        {options.map(o => <option key={o} value={o}>{o.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</option>)}
                      </select>
                    ) : (
                      <input type={type} className="w-full text-xs bg-transparent text-white focus:outline-none"
                        value={editProject[field] || ''}
                        onChange={e => setEditProject(p => ({ ...p, [field]: e.target.value }))}
                        onBlur={e => patchProject(editProject.id, { [field]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-xs text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white resize-none"
                  value={editProject.description || ''} onChange={e => setEditProject(p => ({ ...p, description: e.target.value }))}
                  onBlur={e => patchProject(editProject.id, { description: e.target.value })} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Task edit panel */}
      {editingTask && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setEditingTask(null)} />
          <div className="fixed top-0 right-0 h-full w-[380px] bg-[#1a1f3a] shadow-2xl z-40 flex flex-col border-l border-white/5">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white">Edit Task</h3>
              <button onClick={() => setEditingTask(null)} className="text-gray-400 hover:text-gray-200 p-1 rounded-lg hover:bg-white/10 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Title</label>
                <input className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                  value={editingTask.title} onChange={e => setEditingTask(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white resize-none"
                  value={editingTask.description || ''} onChange={e => setEditingTask(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Status</label>
                  <select className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#1e2340] text-white"
                    value={editingTask.status} onChange={e => setEditingTask(p => ({ ...p, status: e.target.value }))}>
                    <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Priority</label>
                  <select className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#1e2340] text-white"
                    value={editingTask.priority} onChange={e => setEditingTask(p => ({ ...p, priority: e.target.value }))}>
                    <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Assignee</label>
                  <input className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                    value={editingTask.assignee || ''} onChange={e => setEditingTask(p => ({ ...p, assignee: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Due Date</label>
                  <input type="date" className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                    value={editingTask.due_date || ''} onChange={e => setEditingTask(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <button onClick={() => deleteTask(editingTask.id)} className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition">Delete</button>
              <div className="flex items-center gap-2">
                {taskSaveMsg && <span className="text-xs text-green-400">{taskSaveMsg}</span>}
                <button onClick={() => setEditingTask(null)} className="px-3 py-1.5 text-xs text-gray-500 border border-white/10 rounded-lg hover:bg-white/5 transition">Cancel</button>
                <button onClick={() => patchTask(editingTask.id, { title: editingTask.title, description: editingTask.description, status: editingTask.status, priority: editingTask.priority, assignee: editingTask.assignee, due_date: editingTask.due_date })}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">Save</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* New project drawer */}
      {creating && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setCreating(false)} />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-white/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div><h2 className="font-semibold text-white">New Project</h2><p className="text-xs text-gray-400">Fill in the details below</p></div>
              <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-200 p-1.5 rounded-lg hover:bg-white/10 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-sm">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Project Name *</label>
                <input autoFocus className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                  value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') handleCreate() }} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white resize-none"
                  value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Type</label>
                  <select className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#1e2340] text-white"
                    value={newForm.type} onChange={e => setNewForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="internal">Internal</option><option value="client">Client</option><option value="dev">Dev</option><option value="marketing">Marketing</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Priority</label>
                  <select className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#1e2340] text-white"
                    value={newForm.priority} onChange={e => setNewForm(p => ({ ...p, priority: e.target.value }))}>
                    <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Owner</label>
                  <input className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                    placeholder="e.g. Ryan" value={newForm.owner} onChange={e => setNewForm(p => ({ ...p, owner: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Created By</label>
                  <input className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                    placeholder="e.g. Ryan" value={newForm.created_by} onChange={e => setNewForm(p => ({ ...p, created_by: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">Due Date</label>
                  <input type="date" className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                    value={newForm.due_date} onChange={e => setNewForm(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>
              {newError && <p className="text-xs text-red-500">{newError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition">Cancel</button>
              <button onClick={handleCreate} disabled={newSaving || !newForm.name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
                {newSaving ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

/* ─── Main Page ─── */
export default function ControlPage() {
  const router = useRouter()
  const [pipelines, setPipelines] = useState(null)
  const [loading, setLoading] = useState(true)
  const [salesPipelineOpen, setSalesPipelineOpen] = useState(false)
  const [preset, setPreset] = useState('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [agencyLeads, setAgencyLeads] = useState([])
  const [clientsData, setClientsData] = useState([])
  const [selectedLead, setSelectedLead] = useState(null)
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerSaveSuccess, setDrawerSaveSuccess] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [createClientLead, setCreateClientLead] = useState(null)
  const [clientSaving, setClientSaving] = useState(false)
  const [clientError, setClientError] = useState(null)
  const [showDemo, setShowDemo] = useState(false)

  const fetchData = useCallback(async (datePreset, cStart, cEnd) => {
    setLoading(true)

    // Resolve date range
    let start, end
    if (datePreset === 'custom') {
      start = cStart || null
      end = cEnd || null
    } else {
      const range = getDateRange(datePreset)
      start = range.start
      end = range.end
    }

    // Step 1: Get all clients (this works — we've seen 4 clients load)
    const { data: clients, error: clientErr } = await supabase
      .from('client')
      .select('client_id, client_name, industry, city, state, status, created_at')

    if (clientErr) {
      console.error('[Control] client query error:', clientErr)
      setLoading(false)
      return
    }

    // Step 2: Fetch per-client data AND agency leads in parallel
    const [clientsWithData, agencyLeadsRes] = await Promise.all([
      Promise.all(
        (clients || []).map(async (c) => {
          const { leads, campaigns, payments } = await fetchClientData(c.client_id, start, end)
          return { ...c, _leads: leads, _campaigns: campaigns, _payments: payments }
        })
      ),
      fetch('/api/agency-leads', { cache: 'no-store' }).then(r => r.json()),
    ])

    const fetchedLeads = agencyLeadsRes.leads || []
    setAgencyLeads(fetchedLeads)
    setClientsData(clientsWithData)

    // Step 3: Build pipelines from enriched data
    const result = buildPipelines(clientsWithData, fetchedLeads, showDemo)
    setPipelines(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) { router.push('/login'); return }
    fetchData(preset, customStart, customEnd)
  }, [router, preset, customStart, customEnd, fetchData])

  // Rebuild pipelines when showDemo toggles
  useEffect(() => {
    if (clientsData.length > 0) {
      setPipelines(buildPipelines(clientsData, agencyLeads, showDemo))
    }
  }, [showDemo])

  function handlePresetChange(key) {
    setPreset(key)
    if (key === 'custom' && (!customStart || !customEnd)) {
      const range = getDateRange('30d')
      setCustomStart(range.start)
      setCustomEnd(range.end)
    }
  }

  function handleCustomChange(s, e) {
    setCustomStart(s)
    setCustomEnd(e)
  }

  async function handleDrawerSave() {
    if (!selectedLead) return
    setDrawerSaving(true)
    setDrawerSaveSuccess(false)
    const payload = {
      first_name: selectedLead.first_name,
      last_name: selectedLead.last_name,
      email: selectedLead.email,
      phone: selectedLead.phone,
      company: selectedLead.company,
      lead_status: selectedLead.lead_status,
      appt_status: selectedLead.appt_status,
      sale_status: selectedLead.sale_status,
      sale_amount: selectedLead.sale_amount,
      appt_date: selectedLead.appt_date,
      appt_time: selectedLead.appt_time,
      ch_notes: selectedLead.ch_notes,
      onboarding_status: selectedLead.onboarding_status,
    }
    try {
      const res = await fetch(`/api/agency-leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const json = await res.json()
        const updated = agencyLeads.map(l => l.id === selectedLead.id ? json.lead : l)
        setAgencyLeads(updated)
        setPipelines(buildPipelines(clientsData, updated, showDemo))
        setSelectedLead(json.lead)
        setDrawerSaveSuccess(true)
        setTimeout(() => setDrawerSaveSuccess(false), 1800)
        // Prompt to create client when marking as Sold via drawer
        if (selectedLead.sale_status !== 'Sold' && json.lead.sale_status === 'Sold') {
          setCreateClientLead(json.lead)
        }
      }
    } catch (err) {
      console.error('[Control] drawer save failed:', err)
    }
    setDrawerSaving(false)
  }

  async function handleDrawerDelete() {
    if (!selectedLead) return
    setDeleting(true)
    try {
      await fetch(`/api/agency-leads/${selectedLead.id}`, { method: 'DELETE' })
      const updated = agencyLeads.filter(l => l.id !== selectedLead.id)
      setAgencyLeads(updated)
      setPipelines(buildPipelines(clientsData, updated, showDemo))
      setSelectedLead(null)
      setConfirmDelete(false)
    } catch (err) {
      console.error('[Control] drawer delete failed:', err)
    }
    setDeleting(false)
  }

  function openCreateClient(lead) {
    setClientError(null)
    setCreateClientLead(lead)
  }

  async function handleCreateClient() {
    setClientSaving(true)
    setClientError(null)
    try {
      const payload = {
        client_name: document.getElementById('create-client-name')?.value || '',
        industry: document.getElementById('create-client-industry')?.value || '',
        city: document.getElementById('create-client-city')?.value || '',
        state: document.getElementById('create-client-state')?.value || '',
      }
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create client')
      setCreateClientLead(null)
      // Refetch all data so the lead moves from Onboarding to Active Clients via dedup
      fetchData(preset, customStart, customEnd)
      setSelectedLead(null)
    } catch (err) {
      setClientError(err.message)
    } finally {
      setClientSaving(false)
    }
  }

  async function handleStatusChange(leadId, field, value) {
    // Auto-cascade: fill in earlier pipeline defaults when a later status is set
    const lead = agencyLeads.find(l => l.id === leadId)
    const cascadeUpdates = { [field]: value || null }
    if (lead) {
      if (field === 'sale_status' && value && value !== 'Sale Lost') {
        if (!lead.lead_status) cascadeUpdates.lead_status = 'Appt Set'
        if (!lead.appt_status) cascadeUpdates.appt_status = 'Appt Complete'
      }
      if (field === 'appt_status' && value) {
        if (!lead.lead_status) cascadeUpdates.lead_status = 'Appt Set'
      }
    }

    // Optimistic update: update local state immediately
    const updated = agencyLeads.map(l =>
      l.id === leadId ? { ...l, ...cascadeUpdates } : l
    )
    setAgencyLeads(updated)
    setPipelines(buildPipelines(clientsData, updated, showDemo))

    // Persist to API
    try {
      const res = await fetch(`/api/agency-leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cascadeUpdates),
      })
      if (res.ok) {
        const json = await res.json()
        const synced = updated.map(l => l.id === leadId ? json.lead : l)
        setAgencyLeads(synced)
        setPipelines(buildPipelines(clientsData, synced, showDemo))
        // Prompt to create client when marking as Sold
        if (field === 'sale_status' && value === 'Sold') {
          setCreateClientLead(json.lead)
        }
      }
    } catch (err) {
      console.error('[Control] status update failed:', err)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-blue-600/10 text-blue-400 mb-3">
            Agency Mode
          </span>
          <h1 className="text-2xl font-bold text-white">Agency Control Center</h1>
          <p className="text-gray-500 text-sm mt-1">Your agency pipeline at a glance. Click any section to expand.</p>
        </div>
        <div className="pt-6 flex items-center gap-4">
          <button
            onClick={() => setShowDemo(d => !d)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-medium transition ${showDemo ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' : 'border-white/10 bg-white/[0.04] text-gray-500 hover:text-gray-300'}`}
          >
            <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${showDemo ? 'border-yellow-400 bg-yellow-400' : 'border-gray-500'}`}>
              {showDemo && <svg className="w-2 h-2 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </div>
            Demo accounts
          </button>
          <DateRangePicker
            preset={preset}
            onPresetChange={handlePresetChange}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={handleCustomChange}
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-12 text-center text-gray-500">Loading pipeline data...</div>
      ) : !pipelines ? (
        <div className="mt-12 text-center text-gray-500">Failed to load data. Check console.</div>
      ) : (
        <div className="mt-6">
          {/* Active Clients — standalone */}
          <PipelineAccordion
            id="clients"
            pipeline={pipelines.clients}
            defaultCollapsed={false}
          />

          {/* Sales Pipeline — wraps Onboarding, Sales, Appointments, Leads */}
          {(() => {
            const totalLeads = SALES_PIPELINE_KEYS.reduce((s, k) => s + (pipelines[k]?.count || 0), 0)
            const onbCount = pipelines.onboarding?.count || 0
            const salCount = pipelines.sales?.count || 0
            const apptCount = pipelines.appointments?.count || 0
            const leadCount = pipelines.leads?.count || 0
            const pipelineValue = agencyLeads
              .filter(l => l.sale_amount && l.sale_status !== 'Sale Lost')
              .reduce((s, l) => s + (Number(l.sale_amount) || 0), 0)
            return (
              <div className="mb-3 border border-white/[0.06] rounded-xl bg-[#1a1f36] overflow-hidden">
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition select-none"
                  onClick={() => setSalesPipelineOpen(o => !o)}
                >
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${salesPipelineOpen ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <span className="text-[15px] font-bold text-white">Sales Pipeline</span>
                  <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-white/[0.08] text-xs font-bold text-gray-400">
                    {totalLeads}
                  </span>
                  <div className="flex-1" />
                  <div className="flex items-center">
                    <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-white/5">
                      <span className="text-[15px] font-extrabold leading-tight text-white">{leadCount}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Leads</span>
                    </div>
                    <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-white/5">
                      <span className="text-[15px] font-extrabold leading-tight text-blue-400">{apptCount}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Appts</span>
                    </div>
                    <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-white/5">
                      <span className="text-[15px] font-extrabold leading-tight text-yellow-400">{salCount}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">In Sales</span>
                    </div>
                    <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-white/5">
                      <span className="text-[15px] font-extrabold leading-tight text-green-400">{onbCount}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Onboarding</span>
                    </div>
                    <div className="flex flex-col items-center px-3.5 min-w-[70px]">
                      <span className="text-[15px] font-extrabold leading-tight text-emerald-400">{fmt$(pipelineValue)}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Pipeline</span>
                    </div>
                  </div>
                </div>

                {salesPipelineOpen && (
                  <div className="border-t border-white/[0.06]">
                    {SALES_PIPELINE_KEYS.map(key => (
                      <PipelineAccordion
                        key={key}
                        id={key}
                        pipeline={pipelines[key]}
                        defaultCollapsed={true}
                        onStatusChange={handleStatusChange}
                        onRowClick={(lead) => { setSelectedLead(lead); setConfirmDelete(false) }}
                        nested
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          <ProjectsSection />
        </div>
      )}

      {/* ─── Lead Detail Drawer ─── */}
      {selectedLead && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSelectedLead(null)} />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-[#171B33] shadow-2xl z-40 flex flex-col overflow-hidden border-l border-white/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div>
                <h2 className="font-semibold text-white">{selectedLead.first_name} {selectedLead.last_name}</h2>
                <p className="text-xs text-gray-400">{selectedLead.agency_funnels?.name || 'Agency Lead'}</p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-gray-400 hover:text-gray-200 transition p-1.5 rounded-lg hover:bg-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Contact</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">First Name</label>
                    <input className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                      value={selectedLead.first_name || ''} onChange={e => setSelectedLead(p => ({ ...p, first_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Last Name</label>
                    <input className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                      value={selectedLead.last_name || ''} onChange={e => setSelectedLead(p => ({ ...p, last_name: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 mb-1 block">Email</label>
                    <input className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                      value={selectedLead.email || ''} onChange={e => setSelectedLead(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Phone</label>
                    <input className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                      value={selectedLead.phone || ''} onChange={e => setSelectedLead(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Company</label>
                    <input className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                      value={selectedLead.company || ''} onChange={e => setSelectedLead(p => ({ ...p, company: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Lead Status</label>
                    <select className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#1e2340] text-white"
                      value={selectedLead.lead_status || ''} onChange={e => setSelectedLead(p => ({ ...p, lead_status: e.target.value }))}>
                      <option value="">—</option>
                      {LEAD_STATUSES.map(s => <option key={s} value={s}>{displayStatus(s)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Appointment Status</label>
                    <select className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#1e2340] text-white"
                      value={selectedLead.appt_status || ''} onChange={e => setSelectedLead(p => ({ ...p, appt_status: e.target.value }))}>
                      <option value="">—</option>
                      {APPT_STATUSES.map(s => <option key={s} value={s}>{displayStatus(s)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Sale Status</label>
                    <select className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#1e2340] text-white"
                      value={selectedLead.sale_status || ''} onChange={e => {
                        const val = e.target.value
                        setSelectedLead(p => ({
                          ...p,
                          sale_status: val,
                          ...(val === 'Sold' && {
                            lead_status: 'Appt Set',
                            appt_status: 'Appt Complete',
                          }),
                        }))
                      }}>
                      <option value="">—</option>
                      {SALE_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Sale Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full text-sm border border-white/10 rounded-lg pl-6 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                        value={selectedLead.sale_amount ?? ''}
                        onChange={e => setSelectedLead(p => ({ ...p, sale_amount: e.target.value === '' ? null : Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {selectedLead.sale_status === 'Sold' && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Onboarding</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Onboarding Status</label>
                      <select className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#1e2340] text-white"
                        value={selectedLead.onboarding_status || ''} onChange={e => setSelectedLead(p => ({ ...p, onboarding_status: e.target.value }))}>
                        <option value="">—</option>
                        {ONBOARDING_STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => openCreateClient(selectedLead)}
                        className="w-full px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
                      >
                        Create Client
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Appointment</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Appointment Date</label>
                    <input type="date" className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                      value={selectedLead.appt_date || ''} onChange={e => setSelectedLead(p => ({ ...p, appt_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Appointment Time</label>
                    <input type="time" className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/5 text-white"
                      value={selectedLead.appt_time || ''} onChange={e => setSelectedLead(p => ({ ...p, appt_time: e.target.value }))} />
                  </div>
                </div>
                {(selectedLead.selected_date || selectedLead.selected_time) && (
                  <p className="text-xs text-gray-400 mt-2">
                    Lead requested: {[selectedLead.selected_date, selectedLead.selected_time].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
                <textarea rows={4} className="w-full text-sm border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white/5 text-white placeholder-gray-500"
                  placeholder="Add notes about this lead..."
                  value={selectedLead.ch_notes || ''} onChange={e => setSelectedLead(p => ({ ...p, ch_notes: e.target.value }))} />
              </div>

              {selectedLead.meta && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Source</p>
                  <pre className="bg-white/5 rounded-lg p-3 text-[11px] text-gray-300 overflow-x-auto">
{JSON.stringify(selectedLead.meta, null, 2)}
                  </pre>
                </div>
              )}

              <p className="text-xs text-gray-400">
                Submitted {selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleString() : '—'}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-2">
              {drawerSaveSuccess && (
                <span className="text-xs text-green-400 mr-auto">Saved ✓</span>
              )}
              {confirmDelete ? (
                <>
                  <span className="text-xs text-red-400 mr-auto">Delete this lead?</span>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDrawerDelete}
                    disabled={deleting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-60"
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-4 py-2 text-sm font-medium text-red-400 bg-white/5 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition mr-auto"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedLead(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleDrawerSave}
                    disabled={drawerSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
                  >
                    {drawerSaving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Create Client Modal */}
      {createClientLead && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setCreateClientLead(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Create Client from Lead</h3>
              <p className="text-sm text-gray-400">
                This will create a new active client record for <span className="text-white font-medium">{createClientLead.company || `${createClientLead.first_name} ${createClientLead.last_name}`}</span>.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Client Name</label>
                  <input
                    type="text"
                    defaultValue={createClientLead.company || `${createClientLead.first_name} ${createClientLead.last_name}`}
                    id="create-client-name"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Industry</label>
                  <input
                    type="text"
                    defaultValue={createClientLead.meta?.industry || ''}
                    id="create-client-industry"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">City</label>
                    <input
                      type="text"
                      defaultValue={createClientLead.meta?.city || ''}
                      id="create-client-city"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">State</label>
                    <input
                      type="text"
                      defaultValue={createClientLead.meta?.state || ''}
                      id="create-client-state"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setCreateClientLead(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateClient}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
                >
                  Create Client
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
