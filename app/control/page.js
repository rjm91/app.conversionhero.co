'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { nights as planNights, catTotal as planCatTotal, amount as planAmount, money as planMoney, isEvent as planIsEvent, PLAN_TYPE_META, fmtTime as planFmtTime } from '../../components/PlanGantt'
import PlanCalendar from '../../components/PlanCalendar'
import AgencyRevenueChannels from '../../components/AgencyRevenueChannels'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

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
function tenure(d) {
  if (!d) return '—'
  const mo = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / (30.44 * 86400000)))
  if (mo < 1) return 'new'
  if (mo < 12) return `${mo} mo`
  return `${(mo / 12).toFixed(1)} yr`
}

const PIPELINE_ORDER = ['clients', 'onboarding', 'sales', 'appointments', 'leads']
const SALES_PIPELINE_KEYS = ['onboarding', 'sales', 'appointments', 'leads']

/* ─── Status dropdown options (values = DB values, labels = display) ─── */
const LEAD_STATUSES = ['New / Not Yet Contacted', 'Contacted / Working', 'Appt Set', 'Lost', 'Disqualified', 'Out of Area']
const APPT_STATUSES = ['Appt Confirmed', 'Appt Complete', 'Appt Lost', 'Appt Disqualified']
const SALE_STATUSES = ['Agreement Pending', 'Agreement Drafted', 'Agreement Sent', 'Agreement Viewed', 'Agreement Signed', 'Invoice Sent', 'Invoice Paid', 'Sold', 'Sale Lost']
const ONBOARDING_STATUSES = ['Account Setup', 'Campaign Build', 'Review / QA', 'Ready to Launch']

function displayStatus(s) { return (s || '').replace(/Appt/g, 'Appointment') }

/* ─── Stage badge color map ─── */
const STAGE_COLORS = {
  green: 'bg-emerald-500/15 text-emerald-400',
  blue: 'bg-blue-500/15 text-blue-400',
  purple: 'bg-violet-500/15 text-violet-400',
  yellow: 'bg-amber-500/15 text-amber-400',
  gray: 'bg-gray-500/15 text-gray-500 dark:text-gray-400',
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
    .select('campaign_id, cost, date')
    .eq('client_id', clientId)
  if (start) campsQ = campsQ.gte('date', start)
  if (end) campsQ = campsQ.lte('date', end)

  // Payments
  let paysQ = supabase
    .from('client_payments')
    .select('amount, date_created, description, invoice_link')
    .eq('client_id', clientId)
  if (start) paysQ = paysQ.gte('date_created', start)
  if (end) paysQ = paysQ.lte('date_created', end + 'T23:59:59-12:00')

  // Client business revenue — every client_lead row carrying a sale_amount
  // (Shopify orders for ecom, sold jobs for home service). No lead_status
  // filter so null-status Shopify orders aren't dropped by `!= in_progress`.
  let ordersQ = supabase
    .from('client_lead')
    .select('sale_amount, created_at')
    .eq('client_id', clientId)
    .gt('sale_amount', 0)
    .limit(10000)
  if (start) ordersQ = ordersQ.gte('created_at', start)
  if (end) ordersQ = ordersQ.lte('created_at', end + 'T23:59:59-12:00')

  const [{ data: leads }, { data: campaigns }, { data: payments }, { data: orders }] = await Promise.all([
    leadsQ, campsQ, paysQ, ordersQ,
  ])

  return {
    leads: leads || [],
    campaigns: campaigns || [],
    payments: payments || [],
    orders: orders || [],
  }
}

/* ─── Build pipeline data ─── */
function buildPipelines(clientsWithData, agencyLeads, showDemo = false, clientFilter = 'active') {
  // A client "has data" in the selected period if there's any cash, campaign,
  // ad spend, or lead activity within the date-scoped data we fetched.
  const hasPeriodData = c =>
    c._payments.some(p => Number(p.amount) > 0) ||
    c._campaigns.length > 0 ||
    c._leads.length > 0

  const activeClients = clientsWithData.filter(c => {
    if (c.status === 'Demo' && !showDemo) return false
    if (clientFilter === 'active') return c.status === 'Active' || c.status === 'Demo'
    if (clientFilter === 'inactive') return c.status === 'Past' || c.status === 'Inactive'
    // 'all' → any status, but only clients with actual activity in the period
    return hasPeriodData(c)
  })

  // ── Active Clients rows ──
  const clientRows = activeClients.map(c => {
    const agencyRev = c._payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)  // QuickBooks fees/commission (our revenue)
    const clientRev = (c._orders || []).reduce((s, o) => s + (Number(o.sale_amount) || 0), 0)  // client's business sales
    const adSpend = c._campaigns.reduce((s, ca) => s + (Number(ca.cost) || 0), 0)
    const customers = (c._orders || []).length  // paying orders/customers (works for ecom + home service)
    const roas = adSpend > 0 ? clientRev / adSpend : null  // client revenue ÷ spend
    const cac = customers > 0 ? adSpend / customers : 0

    const row = [
      tenure(c.created_at),
      c.status === 'Demo' ? { badge: 'Demo', color: 'yellow' } : c.status === 'Past' || c.status === 'Inactive' ? { badge: c.status, color: 'gray' } : { badge: 'Active', color: 'green' },
      c.client_name,
      c.industry || '—',
      fmt$(adSpend),
      { value: fmt$(clientRev), color: 'green' },
      roas != null ? { value: roas.toFixed(1) + 'x', color: 'green', bold: true } : '—',
      { value: String(customers), bold: true },
      customers > 0 ? fmt$(cac) : '—',
      { value: fmt$(agencyRev), color: 'blue' },
      { link: 'View Dashboard →', href: `/control/${c.client_id}/dashboard` },
    ]
    row._clientId = c.client_id
    row._clientName = c.client_name
    return row
  })

  // Summary totals
  let totalAgencyRev = 0, totalClientRev = 0, totalAdSpend = 0, totalCustomers = 0
  activeClients.forEach(c => {
    totalAgencyRev += c._payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    totalClientRev += (c._orders || []).reduce((s, o) => s + (Number(o.sale_amount) || 0), 0)
    c._campaigns.forEach(ca => { totalAdSpend += (Number(ca.cost) || 0) })
    totalCustomers += (c._orders || []).length
  })

  const blendedRoas = totalAdSpend > 0 ? (totalClientRev / totalAdSpend).toFixed(1) + 'x' : '—'
  // Daily time series across the whole portfolio, bucketed by date for the
  // trend line. Tracks Client Rev (orders), Ad Spend (campaigns), Customers
  // (order count) and Agency Rev (payments) — plus a per-client breakdown on
  // the same date axis so clicking a client row drills the chart into just it.
  const EMPTY = () => ({ rev: 0, spend: 0, cust: 0, agency: 0 })
  const dayMap = {}
  const perClientDay = {}
  const bump = (day, key, val) => { if (!day) return; (dayMap[day] || (dayMap[day] = EMPTY()))[key] += val }
  const bumpC = (cid, day, key, val) => { if (!day) return; const m = perClientDay[cid] || (perClientDay[cid] = {}); (m[day] || (m[day] = EMPTY()))[key] += val }
  activeClients.forEach(c => {
    const cid = c.client_id
    ;(c._orders || []).forEach(o => { const d = String(o.created_at || '').slice(0, 10); const v = Number(o.sale_amount) || 0; bump(d, 'rev', v); bump(d, 'cust', 1); bumpC(cid, d, 'rev', v); bumpC(cid, d, 'cust', 1) })
    ;(c._campaigns || []).forEach(ca => { const d = String(ca.date || '').slice(0, 10); const v = Number(ca.cost) || 0; bump(d, 'spend', v); bumpC(cid, d, 'spend', v) })
    ;(c._payments || []).forEach(p => { const d = String(p.date_created || '').slice(0, 10); const v = Number(p.amount) || 0; bump(d, 'agency', v); bumpC(cid, d, 'agency', v) })
  })
  const trendDates = Object.keys(dayMap).sort()
  const pick = (m, key) => trendDates.map(d => (m[d] || EMPTY())[key])
  const clientsTrend = {
    dates: trendDates,
    rev: trendDates.map(d => dayMap[d].rev),
    spend: trendDates.map(d => dayMap[d].spend),
    cust: trendDates.map(d => dayMap[d].cust),
    agency: trendDates.map(d => dayMap[d].agency),
    perClient: Object.fromEntries(activeClients.map(c => [c.client_id, {
      name: c.client_name,
      rev: pick(perClientDay[c.client_id] || {}, 'rev'),
      spend: pick(perClientDay[c.client_id] || {}, 'spend'),
      cust: pick(perClientDay[c.client_id] || {}, 'cust'),
      agency: pick(perClientDay[c.client_id] || {}, 'agency'),
    }])),
    // Raw payment rows behind the Agency Rev series — the chart's click-to-list.
    payments: activeClients.flatMap(c => (c._payments || []).map(p => ({
      date: String(p.date_created || '').slice(0, 10),
      client: c.client_name,
      client_id: c.client_id,
      amount: Number(p.amount) || 0,
      description: p.description || '',
      invoice_link: p.invoice_link || null,
    }))).sort((a, b) => b.date.localeCompare(a.date)),
  }
  const clientsPipeline = {
    title: clientFilter === 'active' ? 'Active Clients' : clientFilter === 'inactive' ? 'Inactive Clients' : 'All Clients',
    count: activeClients.length,
    chart: clientsTrend,
    columns: ['Tenure','Status','Company Name','Industry','Ad Spend','Client Rev','ROAS','Customers','CAC','Agency Rev',''],
    summaryMap: {
      4: { value: fmt$(totalAdSpend) },
      5: { value: fmt$(totalClientRev), color: 'green' },
      6: { value: blendedRoas, color: 'green' },
      7: { value: String(totalCustomers) },
      8: { value: totalCustomers > 0 ? fmt$(totalAdSpend / totalCustomers) : '—', dim: true },
      9: { value: fmt$(totalAgencyRev), color: 'blue' },
    },
    headerStats: [
      { value: fmt$(totalClientRev), label: 'Client Rev', color: 'text-emerald-400' },
      { value: fmt$(totalAdSpend), label: 'Ad Spend', color: totalAdSpend > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500' },
      { value: blendedRoas, label: 'Blended ROAS', color: 'text-emerald-400' },
      { value: String(totalCustomers), label: 'Customers', color: totalCustomers > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500' },
      { value: fmt$(totalAgencyRev), label: 'Agency Rev', color: 'text-blue-400' },
    ],
    rows: clientRows,
  }

  // Exclude agency leads that already appear as Active Clients — UNLESS the lead
  // is an in-progress deal still being worked (an agreement/invoice that hasn't
  // closed yet). This covers the "backwards" case where a client account was set
  // up before the deal was formally closed: the deal stays in the Sales pipeline
  // until it's Sold/Lost/Paid, even though a matching client already exists.
  const ACTIVE_DEAL_STATUSES = new Set([
    'Agreement Pending', 'Agreement Drafted', 'Agreement Sent',
    'Agreement Viewed', 'Agreement Signed', 'Invoice Sent',
  ])
  const clientNames = new Set(clientsWithData.map(c => (c.client_name || '').toLowerCase().trim()))
  const remainingLeads = agencyLeads.filter(l => {
    if (!clientNames.has((l.company || '').toLowerCase().trim())) return true
    return ACTIVE_DEAL_STATUSES.has(l.sale_status)
  })

  // ── Agency Leads (from agency_leads table) for all pipeline sections below Active Clients ──
  function agencyLeadRow(l) {
    const funnel = l.agency_funnels?.name || ''
    return [
      { notes: true, leadId: l.id, value: l.ch_notes || '' },
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
      { notes: true, leadId: l.id, value: l.ch_notes || '' },
      fmtDate(l.created_at),
      { select: true, leadId: l.id, field: 'onboarding_status', value: l.onboarding_status || '', options: ONBOARDING_STATUSES, color: statusColor(l.onboarding_status) },
      [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
      l.company || funnel || '—',
      l.email || '—',
      l.phone || '—',
      l.appt_date ? fmtDate(l.appt_date) : '—',
      l.sale_amount ? fmt$(l.sale_amount) : '—',
      { link: 'View →' },
    ]
    r._lead = l
    return r
  })

  const onboardingPipeline = {
    title: 'Onboarding',
    count: onboardingLeads.length,
    columns: ['Notes','Submitted','Onboarding Status','Contact Name','Company','Email','Phone','Appointment Date','Deal Value',''],
    summaryMap: {},
    rows: onboardingRows,
  }

  // ── Sales ──
  const salesRows = salesLeads.map(l => { const r = [...agencyLeadRow(l), l.appt_date ? fmtDate(l.appt_date) : '—', { link: 'View →' }]; r._lead = l; return r })
  const proposalCount = salesLeads.filter(l => l.sale_status === 'Agreement Sent').length

  const salesPipeline = {
    title: 'Sales',
    count: salesLeads.length,
    columns: ['Notes','Submitted','Lead Status','Appointment Status','Sale Status','Contact Name','Company','Email','Phone','Appointment Date',''],
    summaryMap: proposalCount ? { 4: { value: `${proposalCount} Agreement Sent` } } : {},
    rows: salesRows,
  }

  // ── Appointments (excluding leads already in Sales) ──
  const apptRows = apptLeads.map(l => { const r = [...agencyLeadRow(l), l.appt_date ? fmtDate(l.appt_date) : '—', { link: 'View →' }]; r._lead = l; return r })
  const completeAppts = apptLeads.filter(l => l.appt_status === 'Appt Complete').length
  const upcomingAppts = apptLeads.filter(l => l.appt_status === 'Appt Set' || l.appt_status === 'Appt Confirmed').length

  const appointmentsPipeline = {
    title: 'Appointments',
    count: apptLeads.length,
    columns: ['Notes','Submitted','Lead Status','Appointment Status','Sale Status','Contact Name','Company','Email','Phone','Appointment Date',''],
    summaryMap: { 3: { value: `${completeAppts} Complete, ${upcomingAppts} Upcoming` } },
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
    columns: ['Notes','Submitted','Lead Status','Appointment Status','Sale Status','Contact Name','Company','Email','Phone',''],
    summaryMap: leadSummaryParts.length ? { 2: { value: leadSummaryParts.join(', ') } } : {},
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
function CellContent({ cell, onStatusChange, notesApi }) {
  if (cell === null || cell === undefined) return null
  if (typeof cell === 'string') return cell

  if (cell.notes !== undefined) {
    const has = !!(cell.value && String(cell.value).trim())
    return (
      <button
        type="button"
        onClick={e => { e.stopPropagation(); notesApi?.open(cell.leadId, cell.value, e) }}
        onMouseEnter={e => has && notesApi?.hover(cell.value, e)}
        onMouseLeave={() => notesApi?.hoverOut()}
        title={has ? '' : 'Add note'}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition ${has ? 'text-blue-400 hover:bg-blue-500/10' : 'text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    )
  }

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
        <option value="" className="bg-white dark:bg-[#1a1f36] text-gray-500 dark:text-gray-400">—</option>
        {cell.options.map(opt => (
          <option key={opt} value={opt} className="bg-white dark:bg-[#1a1f36] text-gray-600 dark:text-gray-300">{displayStatus(opt)}</option>
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
        <span className="font-semibold text-gray-900 dark:text-white">{cell.client}</span>
      </div>
    )
  }

  if (cell.value) {
    const colorCls = cell.color === 'green' ? 'text-emerald-400' : cell.color === 'blue' ? 'text-blue-400' : ''
    const boldCls = cell.bold || cell.color ? 'font-semibold' : ''
    return <span className={`${colorCls} ${boldCls}`}>{cell.value}</span>
  }

  if (cell.link) {
    if (cell.href) {
      return <a href={cell.href} onClick={e => { e.stopPropagation(); window.location.href = cell.href }} className="text-blue-400 font-medium text-[13px] whitespace-nowrap cursor-pointer hover:text-blue-300">{cell.link}</a>
    }
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

/* ─── Smooth collapse wrapper (animates any content height via grid-rows) ─── */
function Collapse({ open, children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 280ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>{children}</div>
    </div>
  )
}

/* ─── Active-Clients trend chart (metric tabs + per-client drill-in) ───
   Lives inside the Active Clients accordion. Treats each client like an ad
   campaign: tabs switch the plotted metric, clicking a client row drills the
   chart into just that client. Data is already date-scoped by the page's
   date-range picker, so this chart auto-respects the selected range. */
const CLIENT_CHART_METRICS = [
  { key: 'revspend', label: 'Rev vs Spend', dual: true },
  { key: 'rev', label: 'Client Rev', color: '#34CC93', bg: 'rgba(52,204,147,0.12)', money: true },
  { key: 'spend', label: 'Ad Spend', color: '#64748b', bg: 'rgba(100,116,139,0.12)', money: true },
  { key: 'roas', label: 'ROAS', color: '#34CC93', bg: 'rgba(52,204,147,0.12)', ratio: 'roas' },
  { key: 'cust', label: 'Customers', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  { key: 'cac', label: 'CAC', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', money: true, ratio: 'cac' },
  { key: 'agency', label: 'Agency Rev', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', money: true },
]

function ActiveClientsChart({ chart, metric, setMetric, selClient, setSelClient }) {
  // Agency Rev click-to-list: click the chart → underlying client payments.
  // {day} filters to the clicked point's date; {day: null} = all in range.
  const [payDrill, setPayDrill] = useState(null)
  if (!chart || !chart.dates || chart.dates.length === 0) return null
  const m = CLIENT_CHART_METRICS.find(x => x.key === metric) || CLIENT_CHART_METRICS[0]
  const src = (selClient && chart.perClient?.[selClient]) ? chart.perClient[selClient] : chart
  const who = (selClient && chart.perClient?.[selClient]?.name) || 'All Clients'
  const labels = chart.dates.map(d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))

  const roasArr = src.rev.map((r, i) => src.spend[i] > 0 ? r / src.spend[i] : 0)
  const cacArr = src.spend.map((s, i) => src.cust[i] > 0 ? s / src.cust[i] : 0)
  const seriesFor = k => k === 'roas' ? roasArr : k === 'cac' ? cacArr : src[k]

  const fmtMoney = v => '$' + Math.round(v).toLocaleString()
  const fmtAxis = v => m.ratio === 'roas' ? v + 'x' : m.money ? '$' + (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'k' : Math.round(v)) : Math.round(v).toLocaleString()
  const fmtTip = v => m.ratio === 'roas' ? v.toFixed(1) + 'x' : m.money ? fmtMoney(v) : Math.round(v).toLocaleString()

  const sum = arr => arr.reduce((a, b) => a + b, 0)
  let headline
  if (m.key === 'revspend') headline = fmtMoney(sum(src.rev))
  else if (m.ratio === 'roas') { const s = sum(src.spend); headline = s > 0 ? (sum(src.rev) / s).toFixed(1) + 'x' : '—' }
  else if (m.ratio === 'cac') { const c = sum(src.cust); headline = c > 0 ? fmtMoney(sum(src.spend) / c) : '—' }
  else if (m.money) headline = fmtMoney(sum(src[m.key]))
  else headline = Math.round(sum(src[m.key])).toLocaleString()

  const datasets = m.dual
    ? [
        { label: 'Client Rev', data: src.rev, borderColor: '#34CC93', backgroundColor: 'rgba(52,204,147,0.12)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
        { label: 'Ad Spend', data: src.spend, borderColor: '#64748b', backgroundColor: 'rgba(100,116,139,0.10)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
      ]
    : [{ label: m.label, data: seriesFor(m.key), borderColor: m.color, backgroundColor: m.bg, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }]

  return (
    <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.06] bg-gray-50/40 dark:bg-white/[0.015]" onClick={e => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CLIENT_CHART_METRICS.map(x => (
          <button key={x.key} onClick={() => { setMetric(x.key); setPayDrill(null) }}
            className={`text-[12.5px] px-3 py-1.5 rounded-lg transition ${metric === x.key ? 'bg-gray-200 dark:bg-white/[0.08] text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex items-baseline gap-2.5 mb-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{headline}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{m.label} · {who}</span>
        {selClient && (
          <button onClick={() => setSelClient(null)} className="text-xs text-blue-500 hover:text-blue-400">× clear</button>
        )}
        {m.dual && (
          <span className="ml-auto flex gap-3.5 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><i className="inline-block w-2 h-2 rounded-sm" style={{ background: '#34CC93' }} />Client Rev</span>
            <span className="flex items-center gap-1.5"><i className="inline-block w-2 h-2 rounded-sm" style={{ background: '#64748b' }} />Ad Spend</span>
          </span>
        )}
      </div>
      <div style={{ height: 230 }}>
        <Line
          data={{ labels, datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (evt, elements) => {
              if (m.key !== 'agency') return
              setPayDrill({ day: elements?.length ? chart.dates[elements[0].index] : null })
            },
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtTip(ctx.parsed.y)}` } },
            },
            scales: {
              x: { ticks: { color: '#9ca3af', font: { size: 11 }, maxTicksLimit: 8 }, grid: { display: false } },
              y: { ticks: { color: '#9ca3af', font: { size: 11 }, callback: fmtAxis }, grid: { color: 'rgba(148,163,184,0.12)' }, beginAtZero: true },
            },
          }}
        />
      </div>
      {m.key === 'agency' && !payDrill && (
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Click a spike for that day&apos;s payments · click anywhere else on the chart for the full list</p>
      )}
      {m.key === 'agency' && payDrill && (() => {
        const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        const list = (chart.payments || []).filter(p =>
          (!selClient || p.client_id === selClient) && (!payDrill.day || p.date === payDrill.day))
        const total = list.reduce((s, p) => s + p.amount, 0)
        return (
          <div className="mt-3 rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[#111528]">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-[#0d1020] border-b border-gray-100 dark:border-white/[0.06]">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#60a5fa' }} />
              <span className="text-sm font-bold text-gray-900 dark:text-white">Client payments{selClient ? ` · ${who}` : ''}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{list.length} · {fmt$(total)}</span>
              {payDrill.day && (
                <button onClick={() => setPayDrill({ day: null })}
                  className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-0.5 bg-blue-500/10 text-blue-500 dark:text-blue-300 hover:bg-blue-500/20 transition">
                  {fmtDay(payDrill.day)} <span className="opacity-60">✕</span>
                </button>
              )}
              <button onClick={() => setPayDrill(null)} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
            </div>
            {list.length === 0 ? <p className="p-4 text-sm text-gray-400">No payments{payDrill.day ? ` on ${fmtDay(payDrill.day)}` : ' in range'}.</p> : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-[#0d1020] sticky top-0"><tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Client</th>
                    <th className="px-4 py-2 font-semibold">Description</th>
                    <th className="px-4 py-2 font-semibold text-right">Amount</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-white/[0.06]">
                    {list.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDay(p.date)}</td>
                        <td className="px-4 py-2 font-medium text-gray-800 dark:text-white">{p.client}</td>
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400 max-w-[280px] truncate">
                          {p.invoice_link
                            ? <a href={p.invoice_link} target="_blank" rel="noreferrer" className="hover:text-blue-500 hover:underline">{p.description || 'Invoice'}</a>
                            : (p.description || '—')}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-blue-500 dark:text-blue-300">{fmt$(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t border-gray-200 dark:border-white/10 font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-[#0d1020]">
                    <td className="px-4 py-2">Total</td><td /><td />
                    <td className="px-4 py-2 text-right">{fmt$(total)}</td>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

/* ─── Accordion Pipeline Component ─── */
function PipelineAccordion({ id, pipeline, defaultCollapsed = true, onStatusChange, onRowClick, nested, headerAction, selectable, onDeleteLeads, notesApi }) {
  const { title, count, columns, summaryMap, rows, headerStats } = pipeline
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [metric, setMetric] = useState('revspend')   // Active Clients trend-chart metric tab
  const [selClient, setSelClient] = useState(null)    // Active Clients drill-in (client_id)
  const tableRef = useRef(null)

  useColumnResize(tableRef, collapsed, rows.length)

  const toggle = useCallback(() => setCollapsed(c => !c), [])
  const titleColspan = 5

  // ── Row selection (checkbox column) ──
  const [checked, setChecked] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const selectableIds = useMemo(() => rows.filter(r => r._lead).map(r => r._lead.id), [rows])
  const allChecked = selectableIds.length > 0 && selectableIds.every(id => checked.has(id))
  function toggleAll(e) {
    e.stopPropagation()
    setChecked(allChecked ? new Set() : new Set(selectableIds))
  }
  function toggleRow(id, e) {
    e.stopPropagation()
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  async function handleDelete(e) {
    e.stopPropagation()
    if (!onDeleteLeads || checked.size === 0) return
    if (!window.confirm(`Delete ${checked.size} record${checked.size > 1 ? 's' : ''}? This can't be undone.`)) return
    setDeleting(true)
    try { await onDeleteLeads([...checked]); setChecked(new Set()) } finally { setDeleting(false) }
  }
  const colSpanAll = columns.length + (selectable ? 1 : 0)

  return (
    <div className={nested ? 'border-b border-gray-100 dark:border-white/[0.04]' : 'mb-3 border border-gray-100 dark:border-white/[0.06] rounded-xl bg-white dark:bg-[#111528] overflow-hidden'}>
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
        <table ref={tableRef} className="w-full border-collapse" style={{ minWidth: columns.length > 10 ? '1200px' : undefined }}>
          <thead>
            <tr
              className="cursor-pointer select-none group"
              onClick={toggle}
            >
              {headerStats ? (
                <td colSpan={columns.length} className="py-4 px-4 border-b border-gray-100 dark:border-white/[0.06]">
                  <div className="flex items-center gap-3.5">
                    <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="w-7 h-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" /></svg>
                    </div>
                    <span className="text-[15px] font-bold text-gray-900 dark:text-white">{title}</span>
                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-gray-100 dark:bg-white/[0.08] text-xs font-bold text-gray-500 dark:text-gray-400">
                      {count}
                    </span>
                    <div className="flex-1" />
                    <div className="flex items-center gap-6 flex-shrink-0">
                      {headerStats.map((stat, si) => (
                        <div key={si} className="text-right hidden sm:block">
                          <div className={`text-base font-bold leading-tight ${stat.color || 'text-gray-900 dark:text-white'}`}>{stat.value}</div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-0.5">{stat.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </td>
              ) : (
                <>
                  {selectable && <td className="w-10 px-4 border-b border-gray-200 dark:border-white/[0.06]" />}
                  <td
                    colSpan={Math.min(titleColspan, columns.length)}
                    className="py-3.5 px-5 border-b border-gray-200 dark:border-white/[0.06] whitespace-nowrap"
                  >
                    <span className={`inline-block text-xs text-gray-500 transition-transform duration-200 mr-2 ${collapsed ? '-rotate-90' : ''}`}>
                      ▾
                    </span>
                    <span className="text-[15px] font-bold text-gray-900 dark:text-white">{title}</span>
                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 ml-2 rounded-full bg-gray-100 dark:bg-white/[0.08] text-xs font-bold text-gray-500 dark:text-gray-400 align-middle">
                      {count}
                    </span>
                  </td>
                  {columns.slice(titleColspan).map((_, i) => {
                    const colIdx = titleColspan + i
                    const isLast = colIdx === columns.length - 1
                    if (isLast && (headerAction || selectable)) {
                      return (
                        <td key={colIdx} className="py-3.5 px-4 border-b border-gray-200 dark:border-white/[0.06] text-right">
                          {selectable && checked.size > 0 ? (
                            <button onClick={handleDelete} disabled={deleting}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition whitespace-nowrap disabled:opacity-50">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              {deleting ? 'Deleting…' : `Delete ${checked.size}`}
                            </button>
                          ) : (headerAction || null)}
                        </td>
                      )
                    }
                    const summary = summaryMap[colIdx]
                    if (!summary) return <td key={colIdx} className="py-3.5 px-4 border-b border-gray-200 dark:border-white/[0.06]" />
                    const colorCls = summary.color ? (SUMMARY_COLORS[summary.color] || 'text-gray-600 dark:text-gray-300') : (summary.dim ? 'text-gray-500' : 'text-gray-700 dark:text-gray-200')
                    return (
                      <td key={colIdx} className={`py-3.5 px-4 border-b border-gray-200 dark:border-white/[0.06] text-[13px] font-bold whitespace-nowrap ${colorCls}`}>
                        {summary.value}
                      </td>
                    )
                  })}
                </>
              )}
            </tr>

            {!collapsed && pipeline.chart && (
              <tr>
                <td colSpan={colSpanAll} className="p-0">
                  <ActiveClientsChart chart={pipeline.chart} metric={metric} setMetric={setMetric} selClient={selClient} setSelClient={setSelClient} />
                </td>
              </tr>
            )}

            {!collapsed && (
              <tr className="col-headers">
                {selectable && (
                  <th className="w-10 px-4 py-3 border-b border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/5 accent-blue-600 cursor-pointer align-middle" />
                  </th>
                )}
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className="text-left py-3 px-4 text-[11px] text-gray-500 uppercase tracking-wide font-semibold border-b border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] relative"
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
                  <td colSpan={colSpanAll} className="py-8 px-5 text-center text-gray-500 text-sm">
                    No data yet
                  </td>
                </tr>
              ) : (
                rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={`hover:bg-gray-100 dark:hover:bg-white/[0.02] transition-colors ${(onRowClick && row._lead) || row._clientId ? 'cursor-pointer' : ''} ${row._lead && checked.has(row._lead.id) ? 'bg-red-500/[0.06]' : ''} ${row._clientId && selClient === row._clientId ? 'bg-blue-500/[0.06]' : ''}`}
                    onClick={() => {
                      if (row._clientId) setSelClient(s => s === row._clientId ? null : row._clientId)
                      else if (onRowClick && row._lead) onRowClick(row._lead)
                    }}
                  >
                    {selectable && (
                      <td className="px-4 py-3.5 border-b border-gray-100 dark:border-white/[0.04]" onClick={e => e.stopPropagation()}>
                        {row._lead && (
                          <input type="checkbox" checked={checked.has(row._lead.id)} onChange={e => toggleRow(row._lead.id, e)}
                            className="h-4 w-4 rounded border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/5 accent-blue-600 cursor-pointer align-middle" />
                        )}
                      </td>
                    )}
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="py-3.5 px-4 text-[13px] text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/[0.04]"
                      >
                        <CellContent cell={cell} onStatusChange={onStatusChange} notesApi={notesApi} />
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
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.08] transition"
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
        <div className="absolute right-0 top-full mt-1.5 bg-white dark:bg-[#1a1f36] border border-gray-200 dark:border-white/10 rounded-xl p-1.5 min-w-[200px] z-50 shadow-xl">
          {DATE_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => {
                onPresetChange(p.key)
                if (p.key !== 'custom') setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-[13px] rounded-lg transition ${
                preset === p.key ? 'bg-blue-600 text-white font-medium' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="border-t border-gray-200 dark:border-white/[0.06] mt-1.5 pt-2 px-2 pb-1 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-500 w-10">From</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => onCustomChange(e.target.value, customEnd)}
                  className="flex-1 bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-600 dark:text-gray-300 outline-none focus:border-blue-500/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-500 w-10">To</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => onCustomChange(customStart, e.target.value)}
                  className="flex-1 bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-600 dark:text-gray-300 outline-none focus:border-blue-500/50"
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
  low:      { label: 'Low',      cls: 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400' },
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
  todo:        'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400',
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
  const criticalCount = projects.filter(p => p.priority === 'critical' && p.status === 'active').length
  const highCount = projects.filter(p => p.priority === 'high' && p.status === 'active').length
  const totalTasks = projects.reduce((sum, p) => sum + (p.project_tasks || []).length, 0)
  const doneTasks = projects.reduce((sum, p) => sum + (p.project_tasks || []).filter(t => t.status === 'done').length, 0)

  return (
    <>
      {/* Top-level Projects accordion */}
      <div className="bg-white dark:bg-[#171B33] rounded-2xl border border-gray-200 dark:border-white/5 mt-4 overflow-hidden">
        <button onClick={() => setProjectsOpen(o => !o)}
          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/[0.02] transition">
          <svg className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${projectsOpen ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-[15px] font-bold text-gray-900 dark:text-white">Projects</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold bg-gray-100 dark:bg-white/5 px-2.5 py-0.5 rounded-full">{projects.length}</span>
          {criticalCount > 0 && (
            <span className="flex items-center gap-1.5 ml-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-[11px] font-bold text-red-400">Critical {criticalCount}</span>
            </span>
          )}
          {highCount > 0 && (
            <span className="flex items-center gap-1.5 ml-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500" />
              </span>
              <span className="text-[11px] font-bold text-pink-400">High {highCount}</span>
            </span>
          )}
          <div className="flex-1" />
          {!loading && (
            <div className="flex items-center">
              <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-gray-200 dark:border-white/5">
                <span className={`text-[15px] font-extrabold leading-tight ${activeCount > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{activeCount}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Active</span>
              </div>
              <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-gray-200 dark:border-white/5">
                <span className={`text-[15px] font-extrabold leading-tight ${onHoldCount > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{onHoldCount}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">On Hold</span>
              </div>
              <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-gray-200 dark:border-white/5">
                <span className={`text-[15px] font-extrabold leading-tight ${completedCount > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{completedCount}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Completed</span>
              </div>
              <div className="flex flex-col items-center px-3.5 min-w-[70px]">
                <span className={`text-[15px] font-extrabold leading-tight ${doneTasks > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{doneTasks}/{totalTasks}</span>
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

        <Collapse open={projectsOpen}>
          <div className="border-t border-gray-200 dark:border-white/5">
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
                      className="w-full flex items-center gap-3 px-5 py-3 pl-10 hover:bg-gray-100 dark:hover:bg-white/[0.02] transition border-b border-gray-100 dark:border-white/[0.03]">
                      <svg className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      <div className={`w-2 h-2 rounded-full ${sm.dot}`} />
                      <span className="text-sm font-semibold text-gray-900 dark:text-white text-left">{sm.label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold bg-gray-100 dark:bg-white/5 px-2.5 py-0.5 rounded-full">{group.length}</span>
                    </button>

                    {isOpen && group.map(p => {
                      const tasks_ = p.project_tasks || []
                      const done_ = tasks_.filter(t => t.status === 'done').length
                      const pct_ = tasks_.length ? Math.round((done_ / tasks_.length) * 100) : 0
                      const pm = PROJ_PRIORITY_META[p.priority] || PROJ_PRIORITY_META.medium
                      const isExpanded = expandedProjectId === p.id
                      return (
                        <div key={p.id}>
                          <div className={`flex items-center gap-3 px-5 py-3 pl-[72px] cursor-pointer transition border-b border-gray-100 dark:border-white/[0.03] hover:bg-gray-100 dark:hover:bg-white/[0.02] ${isExpanded ? 'bg-blue-500/[0.04]' : ''}`}
                            onClick={() => toggleProject(p)}>
                            {editingNameId === p.id ? (
                              <input
                                autoFocus
                                className="text-sm font-semibold text-gray-900 dark:text-white flex-1 min-w-0 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                                value={editingNameVal}
                                onClick={e => e.stopPropagation()}
                                onChange={e => setEditingNameVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveInlineName(p.id); if (e.key === 'Escape') setEditingNameId(null) }}
                                onBlur={() => saveInlineName(p.id)}
                              />
                            ) : (
                              <span
                                className="text-sm font-semibold text-gray-900 dark:text-white flex-1 min-w-0 truncate hover:text-blue-300 transition"
                                onDoubleClick={e => { e.stopPropagation(); setEditingNameId(p.id); setEditingNameVal(p.name) }}
                                title="Double-click to rename"
                              >{p.name}</span>
                            )}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pm.cls}`}>{pm.label}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400">{PROJ_TYPE_LABELS[p.type] || p.type}</span>
                              {p.owner && <span className="text-[11px] text-gray-500 dark:text-gray-400">{p.owner}</span>}
                              {p.due_date && <span className="text-[11px] text-gray-500 dark:text-gray-400">Due {new Date(p.due_date).toLocaleDateString()}</span>}
                              {tasks_.length > 0 && (
                                <>
                                  <div className="w-14 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct_}%` }} />
                                  </div>
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold w-8 text-right">{done_}/{tasks_.length}</span>
                                </>
                              )}
                              <button onClick={e => { e.stopPropagation(); setEditProject(p) }}
                                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" title="Edit project">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <svg className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="bg-black/15">
                              {tasksLoading ? (
                                <p className="pl-24 py-4 text-xs text-gray-500 dark:text-gray-400">Loading tasks...</p>
                              ) : expandedTasks.length === 0 && !addingTaskFor ? (
                                <div className="pl-24 py-4 flex items-center gap-3">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">No tasks yet</span>
                                  <button onClick={() => { setAddingTaskFor(p.id); setTaskForm(emptyTask) }}
                                    className="text-xs text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-white/10 px-3 py-1 rounded hover:text-blue-500 hover:border-blue-500 transition">
                                    + Add task
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {expandedTasks.map(task => (
                                    <div key={task.id}
                                      className={`flex items-center gap-3 px-5 py-2.5 pl-24 border-b border-gray-100 dark:border-white/[0.03] hover:bg-gray-100 dark:hover:bg-white/5 transition cursor-pointer ${task.status === 'done' ? 'opacity-60' : ''}`}
                                      onClick={() => setEditingTask(task)}>
                                      <button onClick={e => { e.stopPropagation(); cycleTaskStatus(task) }}
                                        className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${task.status === 'done' ? 'bg-green-500 border-green-500' : task.status === 'in_progress' ? 'border-blue-500' : 'border-gray-300 dark:border-white/20'}`}>
                                        {task.status === 'done' && <svg className="w-2.5 h-2.5 text-gray-900 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        {task.status === 'in_progress' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                      </button>
                                      <span className={`text-sm flex-1 text-gray-600 dark:text-gray-300 ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</span>
                                      {task.assignee && <span className="text-[11px] text-gray-500 dark:text-gray-400">{task.assignee}</span>}
                                      {task.due_date && <span className="text-[11px] text-gray-500 dark:text-gray-400">{new Date(task.due_date).toLocaleDateString()}</span>}
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${PROJ_TASK_STATUS_CLS[task.status]}`}>{PROJ_TASK_STATUS_LABEL[task.status]}</span>
                                    </div>
                                  ))}
                                  {addingTaskFor === p.id ? (
                                    <div className="pl-24 pr-5 py-3">
                                      <input autoFocus placeholder="Task title"
                                        className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                                        value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') addTask(p.id); if (e.key === 'Escape') setAddingTaskFor(null) }} />
                                      <div className="flex gap-2 justify-end">
                                        <button onClick={() => { setAddingTaskFor(null); setTaskForm(emptyTask) }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition">Cancel</button>
                                        <button onClick={() => addTask(p.id)} disabled={taskSaving || !taskForm.title.trim()} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-60">
                                          {taskSaving ? 'Saving...' : 'Add Task'}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="pl-24 py-2">
                                      <button onClick={() => { setAddingTaskFor(p.id); setTaskForm(emptyTask) }}
                                        className="text-[11px] text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-white/10 px-3 py-1 rounded hover:text-blue-500 hover:border-blue-500 transition">
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
        </Collapse>
      </div>

      {/* Edit project drawer */}
      {editProject && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setEditProject(null)} />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-gray-200 dark:border-white/5">
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 dark:border-white/5">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className="font-semibold text-gray-900 dark:text-white text-base">{editProject.name}</h2>
                {editProject.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{editProject.description}</p>}
              </div>
              <button onClick={() => setEditProject(null)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition flex-shrink-0">
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
                  <div key={field} className="bg-gray-100 dark:bg-white/5 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                    {type === 'select' ? (
                      <select className="w-full text-xs bg-transparent text-gray-900 dark:text-white focus:outline-none"
                        value={editProject[field] || ''}
                        onChange={e => patchProject(editProject.id, { [field]: e.target.value })}>
                        {options.map(o => <option key={o} value={o}>{o.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</option>)}
                      </select>
                    ) : (
                      <input type={type} className="w-full text-xs bg-transparent text-gray-900 dark:text-white focus:outline-none"
                        value={editProject[field] || ''}
                        onChange={e => setEditProject(p => ({ ...p, [field]: e.target.value }))}
                        onBlur={e => patchProject(editProject.id, { [field]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white resize-none"
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
          <div className="fixed top-0 right-0 h-full w-[380px] bg-white dark:bg-[#1a1f3a] shadow-2xl z-40 flex flex-col border-l border-gray-200 dark:border-white/5">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Edit Task</h3>
              <button onClick={() => setEditingTask(null)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Title</label>
                <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                  value={editingTask.title} onChange={e => setEditingTask(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white resize-none"
                  value={editingTask.description || ''} onChange={e => setEditingTask(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Status</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white"
                    value={editingTask.status} onChange={e => setEditingTask(p => ({ ...p, status: e.target.value }))}>
                    <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Priority</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white"
                    value={editingTask.priority} onChange={e => setEditingTask(p => ({ ...p, priority: e.target.value }))}>
                    <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Assignee</label>
                  <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                    value={editingTask.assignee || ''} onChange={e => setEditingTask(p => ({ ...p, assignee: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Due Date</label>
                  <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                    value={editingTask.due_date || ''} onChange={e => setEditingTask(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-white/5 flex items-center justify-between">
              <button onClick={() => deleteTask(editingTask.id)} className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition">Delete</button>
              <div className="flex items-center gap-2">
                {taskSaveMsg && <span className="text-xs text-green-400">{taskSaveMsg}</span>}
                <button onClick={() => setEditingTask(null)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition">Cancel</button>
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
          <div className="fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-gray-200 dark:border-white/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-white/5">
              <div><h2 className="font-semibold text-gray-900 dark:text-white">New Project</h2><p className="text-xs text-gray-500 dark:text-gray-400">Fill in the details below</p></div>
              <button onClick={() => setCreating(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-sm">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Project Name *</label>
                <input autoFocus className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                  value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') handleCreate() }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white resize-none"
                  value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Type</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white"
                    value={newForm.type} onChange={e => setNewForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="internal">Internal</option><option value="client">Client</option><option value="dev">Dev</option><option value="marketing">Marketing</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Priority</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white"
                    value={newForm.priority} onChange={e => setNewForm(p => ({ ...p, priority: e.target.value }))}>
                    <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Owner</label>
                  <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                    placeholder="e.g. Ryan" value={newForm.owner} onChange={e => setNewForm(p => ({ ...p, owner: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Created By</label>
                  <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                    placeholder="e.g. Ryan" value={newForm.created_by} onChange={e => setNewForm(p => ({ ...p, created_by: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Due Date</label>
                  <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                    value={newForm.due_date} onChange={e => setNewForm(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>
              {newError && <p className="text-xs text-red-500">{newError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-white/5 flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition">Cancel</button>
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

/* ─── Plans Section (personal forward planner) ─── */
function PlansSection() {
  const router = useRouter()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState(null)        // active calendar period for KPI scope
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState(STAY_EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const savedTimer = useRef(null)

  useEffect(() => { loadPlans() }, [])
  useEffect(() => () => clearTimeout(savedTimer.current), [])

  async function loadPlans() {
    try {
      const res = await fetch('/api/plans')
      const json = await res.json()
      setPlans(json.plans || [])
    } catch (err) {
      console.error('[PlansSection] fetch error:', err)
    }
    setLoading(false)
  }

  function openStay(plan) { setForm(stayFormFromPlan(plan)); setError(null); setSaved(false); setDrawerOpen(true) }
  function openNew(type = 'stay') { setForm({ ...STAY_EMPTY_FORM, type }); setError(null); setSaved(false); setDrawerOpen(true) }
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function payloadFrom(f) {
    const stay = (f.type || 'stay') === 'stay'
    return {
      name: f.name, type: f.type || 'stay', city: f.city, url: f.url, color: f.color,
      start_date: f.start_date,
      end_date: stay ? f.end_date : f.start_date,   // events are single-day
      start_time: stay ? null : (f.start_time || null),
      cost: stay ? 0 : (Number(f.cost) || 0),
      categories: {
        airbnb: Number(f.airbnb) || 0, food: Number(f.food) || 0,
        personal: Number(f.personal) || 0, fun: Number(f.fun) || 0,
      },
      flight_route: f.flight_route || null,
      flight_date: stay ? (f.flight_date || null) : null,
      notes: f.notes || null,
    }
  }

  function validate(f) {
    if (!f.name.trim()) return 'Name is required'
    if ((f.type || 'stay') === 'stay') {
      if (!f.start_date || !f.end_date) return 'Check-in and check-out dates are required'
      if (f.end_date <= f.start_date) return 'Check-out must be after check-in'
    } else {
      if (!f.start_date) return 'A date is required'
    }
    return null
  }

  // Persist a stay. Used both by inline auto-save (existing) and "Add stay" (new).
  async function commit(f = form) {
    const v = validate(f)
    if (v) { setError(v); return false }
    setError(null); setSaving(true)
    try {
      const url = f.id ? `/api/plans/${f.id}` : '/api/plans'
      const method = f.id ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadFrom(f)) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setPlans(prev => f.id ? prev.map(p => p.id === json.plan.id ? json.plan : p) : [...prev, json.plan])
      if (!f.id) setForm(prev => ({ ...prev, id: json.plan.id }))   // adopt id → future edits auto-save
      setSaved(true)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 1500)
      return true
    } catch (e) { setError(e.message); return false }
    finally { setSaving(false) }
  }

  // Auto-save on blur — only for stays that already exist.
  function autosave() { if (form.id) commit(form) }
  // Set + immediately save (for instant controls like the color swatch).
  function setAndSave(k, v) {
    const next = { ...form, [k]: v }
    setForm(next)
    if (next.id) commit(next)
  }

  async function remove() {
    if (!form.id) { setDrawerOpen(false); return }
    if (!confirm('Delete this stay?')) return
    setSaving(true)
    try {
      await fetch(`/api/plans/${form.id}`, { method: 'DELETE' })
      setPlans(prev => prev.filter(p => p.id !== form.id))
      setDrawerOpen(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // KPIs scope to the period in view (a plan counts in the period it starts)
  const inView = range ? plans.filter(s => s.start_date >= range.startStr && s.start_date <= range.endStr) : plans
  const budget = inView.reduce((a, s) => a + planAmount(s), 0)
  const nts = inView.reduce((a, s) => a + (planIsEvent(s) ? 0 : planNights(s)), 0)
  const planCount = inView.length
  const perDay = range ? (range.days ? budget / range.days : 0) : (nts ? budget / nts : 0)
  const next = [...plans]
    .filter(s => new Date(s.start_date) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))[0]
    || [...plans].sort((a, b) => new Date(a.start_date) - new Date(b.start_date))[0]

  return (
    <div className="bg-white dark:bg-[#171B33] rounded-2xl border border-gray-200 dark:border-white/5 mt-4 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/[0.02] transition">
        <svg className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-[15px] font-bold text-gray-900 dark:text-white">Plans</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold bg-gray-100 dark:bg-white/5 px-2.5 py-0.5 rounded-full">{plans.length}</span>
        {next && (
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 ml-2 hidden sm:inline">
            ✈ Next: {next.name} · {new Date(next.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {range && (
          <span className="text-[11px] font-semibold text-blue-300/90 bg-blue-500/10 px-2 py-0.5 rounded-full ml-1 hidden md:inline">{range.label}</span>
        )}
        <div className="flex-1" />
        {!loading && (
          <div className="flex items-center">
            <div className="flex flex-col items-center px-3.5 min-w-[80px] border-r border-gray-200 dark:border-white/5">
              <span className={`text-[15px] font-extrabold leading-tight ${budget > 0 ? 'text-green-400' : 'text-gray-500'}`}>{planMoney(budget)}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Budget</span>
            </div>
            <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-gray-200 dark:border-white/5">
              <span className={`text-[15px] font-extrabold leading-tight ${nts > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{nts}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Nights</span>
            </div>
            <div className="flex flex-col items-center px-3.5 min-w-[70px] border-r border-gray-200 dark:border-white/5">
              <span className={`text-[15px] font-extrabold leading-tight ${planCount > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{planCount}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Plans</span>
            </div>
            <div className="flex flex-col items-center px-3.5 min-w-[70px]">
              <span className={`text-[15px] font-extrabold leading-tight ${perDay > 0 ? 'text-indigo-400' : 'text-gray-500'}`}>{planMoney(perDay)}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mt-0.5">Avg/Day</span>
            </div>
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); setOpen(true); openNew('stay') }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition ml-3">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New
        </button>
      </button>

      <Collapse open={open}>
        <div className="border-t border-gray-200 dark:border-white/5 p-5">
          {loading ? (
            <div className="text-sm text-gray-500">Loading plans…</div>
          ) : plans.length === 0 ? (
            <div className="text-sm text-gray-500">No stays yet. Click New Stay to plan one.</div>
          ) : (
            <>
              <PlanCalendar stays={plans} today={new Date()} onSelect={openStay} onRangeChange={setRange} />
              <div className="mt-3 text-right">
                <button onClick={() => router.push('/control/plans')} className="text-xs font-semibold text-blue-400 hover:text-blue-300">Open full planner →</button>
              </div>
            </>
          )}
        </div>
      </Collapse>

      {drawerOpen && (
        <PlanPanel
          form={form}
          set={set}
          setAndSave={setAndSave}
          autosave={autosave}
          onCreate={() => commit(form)}
          saving={saving}
          saved={saved}
          error={error}
          onDelete={remove}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  )
}

/* ─── Stay Panel (single inline-editing panel for the control Plans timeline) ─── */
const STAY_COLORS = ['#7c5cff', '#2dd4bf', '#fb923c', '#818cf8', '#38bdf8', '#f472b6', '#34d399', '#f5c542']
const STAY_CATS = [
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'food', label: 'Food' },
  { key: 'personal', label: 'Personal' },
  { key: 'fun', label: 'Fun' },
]
const STAY_EMPTY_FORM = { id: null, type: 'stay', name: '', city: '', url: '', color: STAY_COLORS[0], start_date: '', end_date: '', start_time: '', cost: '', airbnb: '', food: '', personal: '', fun: '', flight_route: '', flight_date: '', notes: '' }

const PLAN_TYPE_ORDER = ['stay', 'dinner', 'hangout', 'flight', 'event']

function stayFormFromPlan(p) {
  const c = p.categories || {}
  return {
    id: p.id, type: p.type || 'stay', name: p.name || '', city: p.city || '', url: p.url || '', color: p.color || STAY_COLORS[0],
    start_date: p.start_date || '', end_date: p.end_date || '',
    start_time: p.start_time || '', cost: p.cost ?? '',
    airbnb: c.airbnb ?? '', food: c.food ?? '', personal: c.personal ?? '', fun: c.fun ?? '',
    flight_route: p.flight_route || '', flight_date: p.flight_date || '', notes: p.notes || '',
  }
}

const stayInputCls = 'w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#171B33] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 [color-scheme:dark]'

function StayField({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function PlanPanel({ form, set, setAndSave, autosave, onCreate, saving, saved, error, onDelete, onClose }) {
  const isNew = !form.id
  const type = form.type || 'stay'
  const isStay = type === 'stay'
  const meta = PLAN_TYPE_META[type] || PLAN_TYPE_META.event
  const liveTotal = STAY_CATS.reduce((a, c) => a + (Number(form[c.key]) || 0), 0)
  const total = isStay ? liveTotal : (Number(form.cost) || 0)
  const datesValid = form.start_date && form.end_date && form.end_date > form.start_date
  const nts = isStay && datesValid ? planNights(form) : 0
  const urlValid = /^https?:\/\//i.test(form.url || '')

  // Existing rows auto-save on blur; new ones wait for the "Add" press.
  const blurSave = isNew ? undefined : autosave
  function pickType(t) { isNew ? set('type', t) : setAndSave('type', t) }

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white dark:bg-[#111528] border-l border-gray-200 dark:border-white/10 shadow-2xl overflow-y-auto">

        {/* Header — editable name + location */}
        <div className="flex items-start gap-3 px-6 py-5 border-b border-gray-200 dark:border-white/5">
          <span className="w-3.5 h-3.5 rounded-full mt-2 flex-shrink-0" style={{ background: form.color }} />
          <div className="min-w-0 flex-1">
            <input value={form.name} onChange={e => set('name', e.target.value)} onBlur={blurSave} placeholder={isStay ? 'Lodging name' : 'Title'}
              className="w-full bg-transparent text-lg font-bold text-gray-900 dark:text-white placeholder-gray-600 focus:outline-none focus:bg-gray-100 dark:focus:bg-white/5 rounded px-1.5 -mx-1.5 py-0.5" />
            <input value={form.city} onChange={e => set('city', e.target.value)} onBlur={blurSave} placeholder={isStay ? 'City' : 'Location'}
              className="w-full bg-transparent text-sm text-gray-500 dark:text-gray-400 placeholder-gray-600 focus:outline-none focus:bg-gray-100 dark:focus:bg-white/5 rounded px-1.5 -mx-1.5 mt-0.5" />
          </div>
          {/* Save status */}
          <span className="text-[11px] font-semibold flex-shrink-0 mt-1 min-w-[46px] text-right">
            {saving ? <span className="text-gray-500 dark:text-gray-400">Saving…</span> : saved ? <span className="text-green-400">Saved ✓</span> : null}
          </span>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Type picker */}
          <div className="flex gap-1.5 flex-wrap">
            {PLAN_TYPE_ORDER.map(t => {
              const m = PLAN_TYPE_META[t]
              const active = type === t
              return (
                <button key={t} onClick={() => pickType(t)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'}`}>
                  <span className="leading-none">{m.emoji}</span>{m.label}
                </button>
              )
            })}
          </div>

          {/* Summary */}
          {isStay ? (
            <div className="flex gap-6">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Nights</p>
                <p className="text-lg font-extrabold text-gray-900 dark:text-white">{nts}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Total</p>
                <p className="text-lg font-extrabold text-green-400">{planMoney(total)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Avg / Day</p>
                <p className="text-lg font-extrabold text-indigo-400">{nts ? planMoney(total / nts) : '$0'}</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-8">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Cost</p>
                <p className="text-lg font-extrabold text-green-400">{planMoney(total)}</p>
              </div>
              {form.start_time && (
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Time</p>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-white">{planFmtTime(form.start_time)}</p>
                </div>
              )}
            </div>
          )}

          {/* Date(s) */}
          {isStay ? (
            <div className="grid grid-cols-2 gap-3">
              <StayField label="Check-in"><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} onBlur={blurSave} className={stayInputCls} /></StayField>
              <StayField label="Check-out"><input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} onBlur={blurSave} className={stayInputCls} /></StayField>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StayField label="Date"><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} onBlur={blurSave} className={stayInputCls} /></StayField>
              <StayField label="Time"><input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} onBlur={blurSave} className={stayInputCls} /></StayField>
            </div>
          )}

          {/* Color */}
          <StayField label="Color">
            <div className="flex gap-2 flex-wrap">
              {STAY_COLORS.map(c => (
                <button key={c} onClick={() => setAndSave('color', c)}
                  className={`w-7 h-7 rounded-lg ${form.color === c ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#111528] ring-white' : ''}`} style={{ background: c }} />
              ))}
            </div>
          </StayField>

          {/* Budget (stay) or single Cost (event) */}
          {isStay ? (
            <StayField label="Budget">
              <div className="grid grid-cols-2 gap-3">
                {STAY_CATS.map(c => (
                  <div key={c.key}>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">{c.label}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">$</span>
                      <input type="number" min="0" value={form[c.key]} onChange={e => set(c.key, e.target.value)} onBlur={blurSave} placeholder="0" className={stayInputCls + ' pl-7'} />
                    </div>
                  </div>
                ))}
              </div>
            </StayField>
          ) : (
            <StayField label="Cost">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">$</span>
                <input type="number" min="0" value={form.cost} onChange={e => set('cost', e.target.value)} onBlur={blurSave} placeholder="0" className={stayInputCls + ' pl-7'} />
              </div>
            </StayField>
          )}

          {/* Flight fields — stays (in + date) or flight-type events (route only) */}
          {isStay ? (
            <div className="grid grid-cols-2 gap-3">
              <StayField label="Flight in (route)"><input value={form.flight_route} onChange={e => set('flight_route', e.target.value)} onBlur={blurSave} placeholder="SAN → PHX" className={stayInputCls} /></StayField>
              <StayField label="Flight date"><input type="date" value={form.flight_date} onChange={e => set('flight_date', e.target.value)} onBlur={blurSave} className={stayInputCls} /></StayField>
            </div>
          ) : type === 'flight' ? (
            <StayField label="Route"><input value={form.flight_route} onChange={e => set('flight_route', e.target.value)} onBlur={blurSave} placeholder="SAN → PHX" className={stayInputCls} /></StayField>
          ) : null}

          {/* Link — editable URL + clickable open button */}
          <StayField label={isStay ? 'Airbnb / listing link' : 'Link'}>
            <div className="flex gap-2">
              <input value={form.url} onChange={e => set('url', e.target.value)} onBlur={blurSave} placeholder={isStay ? 'https://airbnb.com/rooms/…' : 'https://…'} className={stayInputCls} />
              {urlValid && (
                <a href={form.url} target="_blank" rel="noopener noreferrer" title="Open link"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Open
                </a>
              )}
            </div>
          </StayField>

          {/* Notes */}
          <StayField label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} onBlur={blurSave} rows={3} className={stayInputCls} />
          </StayField>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Footer actions */}
          {isNew ? (
            <div className="flex items-center gap-2 pt-1">
              <button onClick={onCreate} disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition">
                {saving ? 'Saving…' : `Add ${meta.label.toLowerCase()}`}
              </button>
              <button onClick={onClose} disabled={saving}
                className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <button onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 rounded-lg transition">Done</button>
              <button onClick={onDelete} disabled={saving}
                className="px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 rounded-lg transition">Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
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

  // ── Inline pipeline-row notes (hover preview + click-to-edit popover) ──
  const [notesPopover, setNotesPopover] = useState(null) // { leadId, value, x, y }
  const [notesHover, setNotesHover] = useState(null)     // { text, x, y }
  const [notesSaving, setNotesSaving] = useState(false)
  const notesApi = useMemo(() => ({
    open: (leadId, value, e) => { setNotesHover(null); setNotesPopover({ leadId, value: value || '', x: e.clientX, y: e.clientY }) },
    hover: (text, e) => setNotesHover({ text, x: e.clientX, y: e.clientY }),
    hoverOut: () => setNotesHover(null),
  }), [])
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerSaveSuccess, setDrawerSaveSuccess] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [createClientLead, setCreateClientLead] = useState(null)
  const [clientSaving, setClientSaving] = useState(false)
  const [clientError, setClientError] = useState(null)
  const [showDemo, setShowDemo] = useState(false)
  const [clientFilter, setClientFilter] = useState('active')

  // Manual create: unified New (lead, optionally with appointment) modal
  const emptyNew = { first_name: '', last_name: '', email: '', phone: '', company: '', withAppt: false, appt_date: '', appt_time: '' }
  const [newOpen, setNewOpen] = useState(false)
  const [newRecord, setNewRecord] = useState(emptyNew)
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState(null)

  // Create a lead (and optionally set appointment fields), then refresh pipelines
  async function createLead(fields, apptFields) {
    setCreateSaving(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/agency-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, notify: false }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create lead')
      let lead = json.lead
      if (apptFields) {
        const res2 = await fetch(`/api/agency-leads/${lead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appt_status: 'Appt Set', ...apptFields }),
        })
        const json2 = await res2.json()
        if (res2.ok && json2.lead) lead = json2.lead
      }
      const updated = [lead, ...agencyLeads]
      setAgencyLeads(updated)
      setPipelines(buildPipelines(clientsData, updated, showDemo, clientFilter))
      return true
    } catch (err) {
      setCreateError(err.message)
      return false
    } finally {
      setCreateSaving(false)
    }
  }

  async function submitNew() {
    const { withAppt, appt_date, appt_time, ...contact } = newRecord
    const apptFields = withAppt && appt_date ? { appt_date, appt_time } : null
    const ok = await createLead(contact, apptFields)
    if (ok) { setNewOpen(false); setNewRecord(emptyNew) }
  }

  // Bulk-delete leads selected via the accordion checkboxes
  async function deleteLeads(ids) {
    await Promise.all(ids.map(id => fetch(`/api/agency-leads/${id}`, { method: 'DELETE' })))
    const updated = agencyLeads.filter(l => !ids.includes(l.id))
    setAgencyLeads(updated)
    setPipelines(buildPipelines(clientsData, updated, showDemo, clientFilter))
  }

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

    // Step 1: Get the clients this user may see. Scope to their accessible set
    // (agency-subtree aware). `all` → no filter (root-agency admins). Falls back
    // to unfiltered on any hiccup so the dashboard never blanks.
    let allowedClientIds = null
    try {
      const scopeRes = await fetch('/api/access/clients', { cache: 'no-store' })
      if (scopeRes.ok) {
        const scope = await scopeRes.json()
        if (!scope.all && Array.isArray(scope.clientIds)) allowedClientIds = scope.clientIds
      }
    } catch {}

    let clientQuery = supabase
      .from('client')
      .select('client_id, client_name, industry, city, state, status, created_at')
    if (allowedClientIds) clientQuery = clientQuery.in('client_id', allowedClientIds)
    const { data: clients, error: clientErr } = await clientQuery

    if (clientErr) {
      console.error('[Control] client query error:', clientErr)
      setLoading(false)
      return
    }

    // Refresh agreement statuses (paid invoices) before loading leads. Guarded
    // so a QuickBooks hiccup never blocks the dashboard.
    await fetch('/api/agreements/sync-status', { cache: 'no-store' }).catch(() => {})

    // Step 2: Fetch per-client data AND agency leads in parallel
    const [clientsWithData, agencyLeadsRes] = await Promise.all([
      Promise.all(
        (clients || []).map(async (c) => {
          const { leads, campaigns, payments, orders } = await fetchClientData(c.client_id, start, end)
          return { ...c, _leads: leads, _campaigns: campaigns, _payments: payments, _orders: orders }
        })
      ),
      fetch('/api/agency-leads', { cache: 'no-store' }).then(r => r.json()),
    ])

    const fetchedLeads = agencyLeadsRes.leads || []
    setAgencyLeads(fetchedLeads)
    setClientsData(clientsWithData)
    // Pipelines are built by the effect below — reading showDemo/clientFilter
    // here would capture stale values (empty-dep useCallback) and silently
    // reset the filter on every date-range change.
    setLoading(false)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) { router.push('/login'); return }
    fetchData(preset, customStart, customEnd)
  }, [router, preset, customStart, customEnd, fetchData])

  // Build pipelines whenever the data or the filters change — this is the one
  // place that owns the build, so a refetch can never clobber the filter.
  useEffect(() => {
    if (clientsData.length > 0) {
      setPipelines(buildPipelines(clientsData, agencyLeads, showDemo, clientFilter))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientsData, agencyLeads, showDemo, clientFilter])

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
        setPipelines(buildPipelines(clientsData, updated, showDemo, clientFilter))
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
      setPipelines(buildPipelines(clientsData, updated, showDemo, clientFilter))
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
        account_type: document.getElementById('create-client-account-type')?.value || 'home_service',
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
    setPipelines(buildPipelines(clientsData, updated, showDemo, clientFilter))

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
        setPipelines(buildPipelines(clientsData, synced, showDemo, clientFilter))
        // Prompt to create client when marking as Sold
        if (field === 'sale_status' && value === 'Sold') {
          setCreateClientLead(json.lead)
        }
      }
    } catch (err) {
      console.error('[Control] status update failed:', err)
    }
  }

  async function saveNote() {
    if (!notesPopover) return
    const { leadId, value } = notesPopover
    setNotesSaving(true)
    // Optimistic update
    const updated = agencyLeads.map(l => l.id === leadId ? { ...l, ch_notes: value } : l)
    setAgencyLeads(updated)
    setPipelines(buildPipelines(clientsData, updated, showDemo, clientFilter))
    setSelectedLead(p => (p && p.id === leadId ? { ...p, ch_notes: value } : p))
    try {
      await fetch(`/api/agency-leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ch_notes: value }),
      })
    } catch (err) {
      console.error('[Control] note save failed:', err)
    } finally {
      setNotesSaving(false)
      setNotesPopover(null)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-blue-600/10 text-blue-400">
            Agency Control
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowDemo(d => !d)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-medium transition ${showDemo ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${showDemo ? 'border-yellow-400 bg-yellow-400' : 'border-gray-500'}`}>
              {showDemo && <svg className="w-2 h-2 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </div>
            Demo accounts
          </button>
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="appearance-none px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.08] transition cursor-pointer outline-none"
            style={{ backgroundImage: 'none' }}
          >
            <option value="active" className="bg-white dark:bg-[#1a1f36] text-gray-600 dark:text-gray-300">Active Clients</option>
            <option value="inactive" className="bg-white dark:bg-[#1a1f36] text-gray-600 dark:text-gray-300">Inactive Clients</option>
            <option value="all" className="bg-white dark:bg-[#1a1f36] text-gray-600 dark:text-gray-300">All Clients</option>
          </select>
          <DateRangePicker
            preset={preset}
            onPresetChange={handlePresetChange}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={handleCustomChange}
          />
        </div>
      </div>

      {/* ═══════════════ Zone 1 · Client Portfolio ═══════════════ */}
      <div className="flex items-center gap-3 mt-2 mb-4">
        <div className="w-1.5 h-9 rounded-full bg-blue-500 flex-shrink-0" />
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">Client Portfolio</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Your clients’ businesses — acquisition, pipeline &amp; revenue across every industry. Open a client to drill into its dashboard.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-12 text-center text-gray-500">Loading pipeline data...</div>
      ) : !pipelines ? (
        <div className="mt-12 text-center text-gray-500">Failed to load data. Check console.</div>
      ) : (
        <div className="mt-6">
          {/* Active Clients — the portfolio (opens by default; it's the lead zone).
              The Rev-vs-Spend chart now lives inside this accordion with metric
              tabs + per-client drill-in (see ActiveClientsChart). */}
          <PipelineAccordion
            id="clients"
            pipeline={pipelines.clients}
            defaultCollapsed={false}
          />

          {/* ═══════════════ Zone 2 · My Agency ═══════════════ */}
          <div className="flex items-center gap-3 mt-10 mb-4">
            <div className="w-1.5 h-9 rounded-full flex-shrink-0" style={{ background: '#34CC93' }} />
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">My Agency</h2>
            </div>
          </div>

          <AgencyRevenueChannels />

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
              <div className="mb-3 border border-gray-100 dark:border-white/[0.06] rounded-xl bg-white dark:bg-[#111528] overflow-hidden">
                <div
                  className="flex items-center gap-3.5 px-4 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#161b30] transition select-none"
                  onClick={() => setSalesPipelineOpen(o => !o)}
                >
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${salesPipelineOpen ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                  <div className="w-7 h-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>
                  </div>
                  <span className="text-[15px] font-bold text-gray-900 dark:text-white">Sales Pipeline</span>
                  <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-gray-100 dark:bg-white/[0.08] text-xs font-bold text-gray-500 dark:text-gray-400">
                    {totalLeads}
                  </span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-6 flex-shrink-0">
                    {[
                      { label: 'Leads', value: leadCount, on: leadCount > 0 },
                      { label: 'Appts', value: apptCount, on: apptCount > 0 },
                      { label: 'In Sales', value: salCount, on: salCount > 0 },
                      { label: 'Onboarding', value: onbCount, on: onbCount > 0 },
                      { label: 'Pipeline', value: fmt$(pipelineValue), green: true },
                    ].map((s, i) => (
                      <div key={i} className="text-right hidden sm:block">
                        <div className={`text-base font-bold leading-tight ${s.green ? 'text-[#34CC93]' : s.on ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{s.value}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setCreateError(null); setNewRecord(emptyNew); setNewOpen(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition ml-3 whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    New
                  </button>
                </div>

                <Collapse open={salesPipelineOpen}>
                  <div className="border-t border-gray-200 dark:border-white/[0.06]">
                    {SALES_PIPELINE_KEYS.map(key => (
                      <PipelineAccordion
                        key={key}
                        id={key}
                        pipeline={pipelines[key]}
                        defaultCollapsed={true}
                        onStatusChange={handleStatusChange}
                        onRowClick={(lead) => { setSelectedLead(lead); setConfirmDelete(false) }}
                        nested
                        selectable
                        onDeleteLeads={deleteLeads}
                        notesApi={notesApi}
                      />
                    ))}
                  </div>
                </Collapse>
              </div>
            )
          })()}

          <ProjectsSection />

          <PlansSection />
        </div>
      )}

      {/* ─── New record modal (lead, optionally with appointment) ─── */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setNewOpen(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#171B33] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">New Lead</h2>
              <button onClick={() => setNewOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">First name</label>
                  <input autoFocus value={newRecord.first_name} onChange={e => setNewRecord(p => ({ ...p, first_name: e.target.value }))}
                    className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Last name</label>
                  <input value={newRecord.last_name} onChange={e => setNewRecord(p => ({ ...p, last_name: e.target.value }))}
                    className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Email</label>
                <input type="email" value={newRecord.email} onChange={e => setNewRecord(p => ({ ...p, email: e.target.value }))}
                  className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Phone</label>
                  <input value={newRecord.phone} onChange={e => setNewRecord(p => ({ ...p, phone: e.target.value }))}
                    className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Company</label>
                  <input value={newRecord.company} onChange={e => setNewRecord(p => ({ ...p, company: e.target.value }))}
                    className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white" />
                </div>
              </div>

              {/* Optional appointment */}
              <div className="mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] p-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={newRecord.withAppt} onChange={e => setNewRecord(p => ({ ...p, withAppt: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/5 accent-blue-600 cursor-pointer" />
                  <span className="text-sm text-gray-900 dark:text-white font-medium">Schedule an appointment</span>
                </label>
                {newRecord.withAppt && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date</label>
                      <input type="date" value={newRecord.appt_date} onChange={e => setNewRecord(p => ({ ...p, appt_date: e.target.value }))}
                        className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Time</label>
                      <input type="time" value={newRecord.appt_time} onChange={e => setNewRecord(p => ({ ...p, appt_time: e.target.value }))}
                        className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="text-[11px] text-gray-500 mt-3">
              {newRecord.withAppt
                ? <>Will be added to <span className="text-blue-400 font-medium">Appointments</span> (status: Appt Set).</>
                : <>Will be added to <span className="text-blue-400 font-medium">Leads</span> (status: New / Not Yet Contacted).</>}
            </p>
            {createError && <p className="text-xs text-red-400 mt-2">{createError}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setNewOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition">Cancel</button>
              <button onClick={submitNew}
                disabled={createSaving || !(newRecord.first_name.trim() || newRecord.last_name.trim() || newRecord.email.trim() || newRecord.company.trim()) || (newRecord.withAppt && !newRecord.appt_date)}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
                {createSaving ? 'Saving…' : (newRecord.withAppt ? 'Create & Schedule' : 'Create Lead')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Lead Detail Drawer ─── */}
      {/* ── Pipeline-row note: hover preview tooltip ── */}
      {notesHover && !notesPopover && (
        <div className="fixed z-[70] max-w-xs bg-gray-800 dark:bg-[#0c0e18] border border-gray-200 dark:border-white/10 rounded-lg shadow-xl px-3 py-2 text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap pointer-events-none"
          style={{ left: Math.min(notesHover.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 280), top: notesHover.y + 14 }}>
          {notesHover.text}
        </div>
      )}

      {/* ── Pipeline-row note: click-to-edit popover ── */}
      {notesPopover && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setNotesPopover(null)} />
          <div className="fixed z-[71] w-72 bg-white dark:bg-[#1a1f36] border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl p-3"
            style={{ left: Math.min(notesPopover.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 300), top: Math.min(notesPopover.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 200) }}
            onClick={e => e.stopPropagation()}>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Note</p>
            <textarea autoFocus rows={4} value={notesPopover.value}
              onChange={e => setNotesPopover(p => ({ ...p, value: e.target.value }))}
              placeholder="Add a note…"
              className="w-full text-sm rounded-lg bg-white dark:bg-[#111528] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white p-2 outline-none focus:border-blue-500 resize-none" />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setNotesPopover(null)} className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancel</button>
              <button onClick={saveNote} disabled={notesSaving}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {notesSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}

      {selectedLead && (
        <>
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSelectedLead(null)} />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col overflow-hidden border-l border-gray-200 dark:border-white/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-white/5">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{selectedLead.first_name} {selectedLead.last_name}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">{selectedLead.agency_funnels?.name || 'Agency Lead'}</p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Contact</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">First Name</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                      value={selectedLead.first_name || ''} onChange={e => setSelectedLead(p => ({ ...p, first_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Last Name</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                      value={selectedLead.last_name || ''} onChange={e => setSelectedLead(p => ({ ...p, last_name: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Email</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                      value={selectedLead.email || ''} onChange={e => setSelectedLead(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Phone</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                      value={selectedLead.phone || ''} onChange={e => setSelectedLead(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Company</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                      value={selectedLead.company || ''} onChange={e => setSelectedLead(p => ({ ...p, company: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Lead Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white"
                      value={selectedLead.lead_status || ''} onChange={e => setSelectedLead(p => ({ ...p, lead_status: e.target.value }))}>
                      <option value="">—</option>
                      {LEAD_STATUSES.map(s => <option key={s} value={s}>{displayStatus(s)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Appointment Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white"
                      value={selectedLead.appt_status || ''} onChange={e => setSelectedLead(p => ({ ...p, appt_status: e.target.value }))}>
                      <option value="">—</option>
                      {APPT_STATUSES.map(s => <option key={s} value={s}>{displayStatus(s)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sale Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white"
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
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sale Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg pl-6 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                        value={selectedLead.sale_amount ?? ''}
                        onChange={e => setSelectedLead(p => ({ ...p, sale_amount: e.target.value === '' ? null : Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {selectedLead.sale_status && (
                <button
                  onClick={() => router.push(`/control/agreement/${selectedLead.id}`)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  {selectedLead.meta?.agreement ? 'Open Agreement' : 'Build Agreement'}
                </button>
              )}

              {selectedLead.sale_status === 'Sold' && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Onboarding</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Onboarding Status</label>
                      <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white"
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
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Appointment</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Appointment Date</label>
                    <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                      value={selectedLead.appt_date || ''} onChange={e => setSelectedLead(p => ({ ...p, appt_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Appointment Time</label>
                    <input type="time" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white"
                      value={selectedLead.appt_time || ''} onChange={e => setSelectedLead(p => ({ ...p, appt_time: e.target.value }))} />
                  </div>
                </div>
                {(selectedLead.selected_date || selectedLead.selected_time) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Lead requested: {[selectedLead.selected_date, selectedLead.selected_time].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Notes</p>
                <textarea rows={4} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-500"
                  placeholder="Add notes about this lead..."
                  value={selectedLead.ch_notes || ''} onChange={e => setSelectedLead(p => ({ ...p, ch_notes: e.target.value }))} />
              </div>

              {selectedLead.meta && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Source</p>
                  <pre className="bg-gray-100 dark:bg-white/5 rounded-lg p-3 text-[11px] text-gray-600 dark:text-gray-300 overflow-x-auto">
{JSON.stringify(selectedLead.meta, null, 2)}
                  </pre>
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Submitted {selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleString() : '—'}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-white/5 flex items-center justify-end gap-2">
              {drawerSaveSuccess && (
                <span className="text-xs text-green-400 mr-auto">Saved ✓</span>
              )}
              {confirmDelete ? (
                <>
                  <span className="text-xs text-red-400 mr-auto">Delete this lead?</span>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition"
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
                    className="px-4 py-2 text-sm font-medium text-red-400 bg-gray-100 dark:bg-white/5 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition mr-auto"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedLead(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition"
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
            <div className="bg-white dark:bg-[#1a1a2e] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create Client from Lead</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This will create a new active client record for <span className="text-gray-900 dark:text-white font-medium">{createClientLead.company || `${createClientLead.first_name} ${createClientLead.last_name}`}</span>.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Client Name</label>
                  <input
                    type="text"
                    defaultValue={createClientLead.company || `${createClientLead.first_name} ${createClientLead.last_name}`}
                    id="create-client-name"
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Industry</label>
                  <input
                    type="text"
                    defaultValue={createClientLead.meta?.industry || ''}
                    id="create-client-industry"
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Account Type</label>
                  <select
                    id="create-client-account-type"
                    defaultValue="home_service"
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="home_service">Home Service</option>
                    <option value="ecom">Ecommerce</option>
                  </select>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Ecom accounts get the Shopify Control Center + Customers/Orders. Home Service gets the leads/appointments setup.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">City</label>
                    <input
                      type="text"
                      defaultValue={createClientLead.meta?.city || ''}
                      id="create-client-city"
                      className="w-full px-3 py-2 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">State</label>
                    <input
                      type="text"
                      defaultValue={createClientLead.meta?.state || ''}
                      id="create-client-state"
                      className="w-full px-3 py-2 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setCreateClientLead(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition"
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
