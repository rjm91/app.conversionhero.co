'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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

const PIPELINE_ORDER = ['clients', 'onboarding', 'sales', 'appointments', 'leads', 'prospects']

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
  if (s.includes('proposal') || s.includes('contacted') || s.includes('set') || s.includes('outreach') || s.includes('appt confirmed')) return 'blue'
  if (s.includes('negotiation')) return 'yellow'
  if (s.includes('lost') || s.includes('disqualified')) return 'gray'
  return 'blue'
}

/* ─── Build pipeline data from Supabase results ─── */
function buildPipelines(clients, payments, campaigns, leads, salesDeals) {
  // ── Active Clients ──
  const activeClients = clients.filter(c => c.status === 'Active')
  const clientRows = activeClients.map(c => {
    const cid = c.client_id
    const clientPayments = payments.filter(p => p.client_id === cid)
    const clientCampaigns = campaigns.filter(ca => ca.client_id === cid)
    const clientLeads = leads.filter(l => l.client_id === cid && l.lead_status !== 'in_progress')

    const cashCollected = clientPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const uniqueCampaigns = new Set(clientCampaigns.map(ca => ca.campaign_id)).size
    const adSpend = clientCampaigns.reduce((s, ca) => s + (Number(ca.cost) || 0), 0)
    const leadCount = clientLeads.length
    const appts = clientLeads.filter(l => l.appt_status === 'Appt Complete').length
    const customers = clientLeads.filter(l => l.sale_status === 'Sold').length
    const cpl = leadCount > 0 ? adSpend / leadCount : 0
    const cpa = appts > 0 ? adSpend / appts : 0
    const cac = customers > 0 ? adSpend / customers : 0

    const icons = { 'HVAC': '❄️', 'Funeral': '⚶', 'E-comm': '💻', 'Dental': '🦷', 'Legal': '⚖️', 'Auto': '🚗' }
    const icon = icons[c.industry] || '🏢'
    const iconColors = { 'HVAC': 'rgba(34,197,94,0.15)', 'Funeral': 'rgba(96,165,250,0.15)', 'E-comm': 'rgba(167,139,250,0.15)' }
    const iconBg = iconColors[c.industry] || 'rgba(96,165,250,0.15)'

    return [
      fmtDate(c.created_at),
      { badge: 'Active', color: 'green' },
      { client: c.client_name, icon, iconBg },
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
      { link: 'View Dashboard →', href: `/control/${cid}/dashboard` },
    ]
  })

  // Summary totals for Active Clients
  const totalCash = activeClients.reduce((s, c) => {
    return s + payments.filter(p => p.client_id === c.client_id).reduce((ss, p) => ss + (Number(p.amount) || 0), 0)
  }, 0)
  const totalCampaigns = new Set(campaigns.filter(ca => activeClients.some(c => c.client_id === ca.client_id)).map(ca => ca.campaign_id)).size
  const totalAdSpend = campaigns.filter(ca => activeClients.some(c => c.client_id === ca.client_id)).reduce((s, ca) => s + (Number(ca.cost) || 0), 0)
  const allActiveLeads = leads.filter(l => activeClients.some(c => c.client_id === l.client_id) && l.lead_status !== 'in_progress')
  const totalLeads = allActiveLeads.length
  const totalAppts = allActiveLeads.filter(l => l.appt_status === 'Appt Complete').length
  const totalCustomers = allActiveLeads.filter(l => l.sale_status === 'Sold').length

  const clientsPipeline = {
    title: 'Active Clients',
    count: activeClients.length,
    columns: ['Submitted','Status','Company Name','Industry','Location','Cash Collected','Campaigns','Total Ad Spend','Leads','Cost Per Lead','Completed Appts','Cost Per Appt','Customers','CAC',''],
    summaryMap: {
      5: { value: fmt$(totalCash), color: 'green' },
      6: { value: String(totalCampaigns) },
      7: { value: fmt$(totalAdSpend) },
      8: { value: String(totalLeads) },
      9: { value: totalLeads > 0 ? fmt$(totalAdSpend / totalLeads) : '—', dim: true },
      10: { value: String(totalAppts) },
      11: { value: totalAppts > 0 ? fmt$(totalAdSpend / totalAppts) : '—', dim: true },
      12: { value: String(totalCustomers) },
      13: { value: totalCustomers > 0 ? fmt$(totalAdSpend / totalCustomers) : '—', dim: true },
    },
    rows: clientRows,
  }

  // ── Onboarding ──
  const onboardingClients = clients.filter(c => c.status === 'Onboarding')
  const onboardingRows = onboardingClients.map(c => {
    const billing = c.client_billing?.[0]
    const retainer = billing ? (Number(billing.retainer_amount) || Number(billing.monthly_budget) || 0) : 0
    return [
      fmtDate(c.created_at),
      { stage: c.onboarding_stage || 'Account Setup', color: 'purple' },
      c.client_name,
      c.industry || '—',
      c.city && c.state ? `${c.city}, ${c.state}` : '—',
      c.contact_name || '—',
      { value: retainer > 0 ? `$${retainer.toLocaleString()}/mo` : '—', bold: true },
      c.service_type || '—',
      fmtDate(c.created_at),
      c.next_milestone || '—',
      { link: 'View →', href: `/control/${c.client_id}/dashboard` },
    ]
  })
  const totalOnboardVal = onboardingClients.reduce((s, c) => {
    const billing = c.client_billing?.[0]
    return s + (billing ? (Number(billing.retainer_amount) || Number(billing.monthly_budget) || 0) : 0)
  }, 0)

  const onboardingPipeline = {
    title: 'Onboarding',
    count: onboardingClients.length,
    columns: ['Submitted','Status','Company Name','Industry','Location','Contact','Deal Value','Service','Started','Next Milestone',''],
    summaryMap: totalOnboardVal > 0 ? { 6: { value: `$${totalOnboardVal.toLocaleString()}/mo`, color: 'green' } } : {},
    rows: onboardingRows,
  }

  // ── Sales (from sales_deals) ──
  const activeSalesDeals = salesDeals.filter(d => d.stage && !['Closed Won', 'Closed Lost'].includes(d.stage))
  const salesRows = activeSalesDeals.map(d => [
    fmtDate(d.created_at),
    { stage: d.lead_status || 'New', color: statusColor(d.lead_status || 'New') },
    { stage: d.appt_status || '—', color: statusColor(d.appt_status) },
    { stage: d.sale_status || d.stage || '—', color: statusColor(d.sale_status || d.stage) },
    d.company || d.prospect || '—',
    d.industry || '—',
    d.location || '—',
    d.prospect || '—',
    d.email || '—',
    d.phone || '—',
    '—',
    { value: d.value ? `$${Number(d.value).toLocaleString()}/mo` : '—', bold: true },
    d.service || '—',
    { link: 'View →' },
  ])
  const totalSalesValue = activeSalesDeals.reduce((s, d) => s + (Number(d.value) || 0), 0)

  const salesPipeline = {
    title: 'Sales',
    count: activeSalesDeals.length,
    columns: ['Submitted','Lead Status','Appt Status','Sale Status','Company Name','Industry','Location','Contact','Email','Phone','Funnel','Deal Value','Service',''],
    summaryMap: totalSalesValue > 0 ? { 11: { value: `$${totalSalesValue.toLocaleString()}/mo`, color: 'green' } } : {},
    rows: salesRows,
  }

  // ── Appointments (leads with appt_status set) ──
  const apptLeads = leads.filter(l => l.appt_status && l.appt_status !== 'NA' && l.lead_status !== 'in_progress')
  const apptRows = apptLeads.slice(0, 50).map(l => [
    fmtDate(l.created_at),
    { stage: l.lead_status || '—', color: statusColor(l.lead_status) },
    { stage: l.appt_status, color: statusColor(l.appt_status) },
    { stage: l.sale_status || '—', color: statusColor(l.sale_status) },
    l.company || '—',
    l.industry || '—',
    l.city && l.state ? `${l.city}, ${l.state}` : (l.city || l.state || '—'),
    [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
    l.email || '—',
    l.phone || '—',
    '—',
    l.appt_type || '—',
    l.appt_date ? fmtDate(l.appt_date) : '—',
    { link: 'View →' },
  ])
  const completeAppts = apptLeads.filter(l => l.appt_status === 'Appt Complete').length
  const upcomingAppts = apptLeads.filter(l => l.appt_status === 'Appt Set' || l.appt_status === 'Appt Confirmed').length

  const appointmentsPipeline = {
    title: 'Appointments',
    count: apptLeads.length,
    columns: ['Submitted','Lead Status','Appt Status','Sale Status','Company Name','Industry','Location','Contact','Email','Phone','Funnel','Type','Date & Time',''],
    summaryMap: { 11: { value: `${completeAppts} Complete, ${upcomingAppts} Upcoming` } },
    rows: apptRows,
  }

  // ── Leads ──
  const allLeads = leads.filter(l => l.lead_status !== 'in_progress')
  const leadRows = allLeads.slice(0, 50).map(l => [
    fmtDate(l.created_at),
    { stage: l.lead_status || '—', color: statusColor(l.lead_status) },
    { stage: l.appt_status || '—', color: statusColor(l.appt_status) },
    { stage: l.sale_status || '—', color: statusColor(l.sale_status) },
    l.company || '—',
    l.industry || '—',
    l.city && l.state ? `${l.city}, ${l.state}` : (l.city || l.state || '—'),
    [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
    l.email || '—',
    l.phone || '—',
    '—',
    { link: 'View →' },
  ])
  // Count statuses for summary
  const leadStatusCounts = {}
  allLeads.forEach(l => {
    const st = l.lead_status || 'Unknown'
    leadStatusCounts[st] = (leadStatusCounts[st] || 0) + 1
  })
  const leadSummaryParts = Object.entries(leadStatusCounts).slice(0, 3).map(([k, v]) => `${v} ${k}`)

  const leadsPipeline = {
    title: 'Leads',
    count: allLeads.length,
    columns: ['Submitted','Lead Status','Appt Status','Sale Status','Company Name','Industry','Location','Contact','Email','Phone','Funnel',''],
    summaryMap: leadSummaryParts.length ? { 10: { value: leadSummaryParts.join(', ') } } : {},
    rows: leadRows,
  }

  // ── Prospects (sales_deals in early stages) ──
  const prospectDeals = salesDeals.filter(d => {
    const stage = (d.stage || '').toLowerCase()
    return stage.includes('prospect') || stage.includes('research') || stage.includes('outreach') || stage === 'new' || stage === ''
  })
  const prospectRows = prospectDeals.map(d => [
    fmtDate(d.created_at),
    { stage: d.stage || 'New', color: statusColor(d.stage) },
    d.company || d.prospect || '—',
    d.industry || '—',
    d.location || '—',
    d.prospect || '—',
    d.last_activity || '—',
    { link: 'View →' },
  ])
  // Stage summary
  const prospectStageCounts = {}
  prospectDeals.forEach(d => {
    const st = d.stage || 'New'
    prospectStageCounts[st] = (prospectStageCounts[st] || 0) + 1
  })
  const prospectSummaryParts = Object.entries(prospectStageCounts).slice(0, 3).map(([k, v]) => `${v} ${k}`)

  const prospectsPipeline = {
    title: 'Prospects',
    count: prospectDeals.length,
    columns: ['Submitted','Status','Company Name','Industry','Location','Contact','Last Activity',''],
    summaryMap: prospectSummaryParts.length ? { 6: { value: prospectSummaryParts.join(', ') } } : {},
    rows: prospectRows,
  }

  return {
    clients: clientsPipeline,
    onboarding: onboardingPipeline,
    sales: salesPipeline,
    appointments: appointmentsPipeline,
    leads: leadsPipeline,
    prospects: prospectsPipeline,
  }
}

/* ─── Cell renderer ─── */
function CellContent({ cell }) {
  if (cell === null || cell === undefined) return null
  if (typeof cell === 'string') return cell

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
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${STAGE_COLORS[cell.color] || STAGE_COLORS.gray}`}>
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
function useColumnResize(tableRef, isCollapsed) {
  const initialized = useRef(false)

  useEffect(() => {
    if (isCollapsed || initialized.current) return
    const table = tableRef.current
    if (!table) return

    const colHeaderRow = table.querySelector('.col-headers')
    if (!colHeaderRow) return

    const ths = Array.from(colHeaderRow.querySelectorAll('th'))
    if (!ths.length) return

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

    initialized.current = true
  }, [isCollapsed, tableRef])
}

/* ─── Accordion Pipeline Component ─── */
function PipelineAccordion({ id, pipeline, defaultCollapsed = true }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const tableRef = useRef(null)

  useColumnResize(tableRef, collapsed)

  const toggle = useCallback(() => setCollapsed(c => !c), [])

  const { title, count, columns, summaryMap, rows } = pipeline
  const titleColspan = 5

  return (
    <div className="mb-3 border border-white/[0.06] rounded-xl bg-[#1a1f36] overflow-hidden">
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
        <table ref={tableRef} className="w-full border-collapse" style={{ minWidth: columns.length > 10 ? '1200px' : undefined }}>
          <thead>
            <tr
              className="cursor-pointer select-none group"
              onClick={toggle}
            >
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
                  <tr key={ri} className="hover:bg-white/[0.02] transition-colors">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="py-3.5 px-4 text-[13px] text-gray-400 border-b border-white/[0.04] overflow-hidden text-ellipsis"
                      >
                        <CellContent cell={cell} />
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

/* ─── Main Page ─── */
export default function ControlPage() {
  const router = useRouter()
  const [pipelines, setPipelines] = useState(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

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

    // Build date-filtered queries for payments, campaigns, leads
    let paymentsQuery = supabase.from('client_payments').select('client_id, amount, date_created')
    if (start) paymentsQuery = paymentsQuery.gte('date_created', start)
    if (end) paymentsQuery = paymentsQuery.lte('date_created', end + 'T23:59:59')

    let campaignsQuery = supabase.from('client_yt_campaigns').select('client_id, campaign_id, campaign_name, status, cost, date')
    if (start) campaignsQuery = campaignsQuery.gte('date', start)
    if (end) campaignsQuery = campaignsQuery.lte('date', end)

    let leadsQuery = supabase.from('client_lead').select('client_id, lead_id, lead_status, appt_status, sale_status, first_name, last_name, email, phone, company, industry, city, state, created_at, appt_date, appt_type')
    if (start) leadsQuery = leadsQuery.gte('created_at', start)
    if (end) leadsQuery = leadsQuery.lte('created_at', end + 'T23:59:59')

    const [
      clientRes,
      paymentRes,
      campaignRes,
      leadRes,
      salesRes,
    ] = await Promise.all([
      supabase.from('client').select('client_id, client_name, industry, city, state, status, created_at, contact_name, service_type, onboarding_stage, next_milestone'),
      paymentsQuery,
      campaignsQuery,
      leadsQuery,
      supabase.from('sales_deals').select('*'),
    ])

    // Debug logging — check browser console
    console.log('[Control] client:', clientRes.data?.length, 'rows, error:', clientRes.error)
    console.log('[Control] payments:', paymentRes.data?.length, 'rows, error:', paymentRes.error)
    console.log('[Control] campaigns:', campaignRes.data?.length, 'rows, error:', campaignRes.error)
    console.log('[Control] leads:', leadRes.data?.length, 'rows, error:', leadRes.error)
    console.log('[Control] sales_deals:', salesRes.data?.length, 'rows, error:', salesRes.error)
    if (clientRes.data?.length) {
      console.log('[Control] client statuses:', [...new Set(clientRes.data.map(c => c.status))])
      console.log('[Control] first client:', clientRes.data[0])
    }

    const clients = clientRes.data
    const payments = paymentRes.data
    const campaignData = campaignRes.data
    const leadData = leadRes.data
    const salesDeals = salesRes.data

    // Fetch billing for onboarding clients
    const onboardingIds = (clients || []).filter(c => c.status === 'Onboarding').map(c => c.client_id)
    let billingData = []
    if (onboardingIds.length > 0) {
      const { data: billing } = await supabase
        .from('client_billing')
        .select('client_id, retainer_amount, monthly_budget')
        .in('client_id', onboardingIds)
      billingData = billing || []
    }

    const enrichedClients = (clients || []).map(c => ({
      ...c,
      client_billing: billingData.filter(b => b.client_id === c.client_id),
    }))

    const result = buildPipelines(
      enrichedClients,
      payments || [],
      campaignData || [],
      leadData || [],
      salesDeals || [],
    )
    setPipelines(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) { router.push('/login'); return }
    fetchData(preset, customStart, customEnd)
  }, [router, preset, customStart, customEnd, fetchData])

  function handlePresetChange(key) {
    setPreset(key)
    if (key === 'custom') {
      // Set defaults for custom if not already set
      if (!customStart || !customEnd) {
        const range = getDateRange('30d')
        setCustomStart(range.start)
        setCustomEnd(range.end)
      }
    }
  }

  function handleCustomChange(s, e) {
    setCustomStart(s)
    setCustomEnd(e)
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
        <div className="pt-6">
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
      ) : (
        <div className="mt-6">
          {PIPELINE_ORDER.map((key, i) => (
            <PipelineAccordion
              key={key}
              id={key}
              pipeline={pipelines[key]}
              defaultCollapsed={i !== 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
