'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../lib/supabase-browser'

function fmt(n) {
  if (!n) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PaymentsPage() {
  const [payments, setPayments]   = useState([])
  const [clients,  setClients]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [qbConnected, setQbConnected] = useState(null)

  const [search,         setSearch]         = useState('')
  const [clientFilter,   setClientFilter]   = useState('all')
  const [merchantFilter, setMerchantFilter] = useState('all')
  const [sortCol,        setSortCol]        = useState('date_created')
  const [sortDir,        setSortDir]        = useState('desc')
  const [dateRange,      setDateRange]      = useState('all')

  const supabaseRef = createClient()

  function loadPayments() {
    return Promise.all([
      supabaseRef.from('client_payments').select('*').order('date_created', { ascending: false }),
      supabaseRef.from('client').select('client_id, client_name').order('client_name'),
    ]).then(([{ data: p }, { data: c }]) => {
      setPayments(p || [])
      setClients(c || [])
      setLoading(false)
    })
  }

  useEffect(() => {
    loadPayments()
    fetch('/api/quickbooks/status').then(r => r.json()).then(d => setQbConnected(d.connected))
  }, [])


  const merchants = useMemo(() => [...new Set(payments.map(p => p.merchant).filter(Boolean))].sort(), [payments])

  // Build dynamic date range options
  const dateRangeOptions = useMemo(() => {
    const now = new Date()
    const thisYear = now.getFullYear()
    const opts = [
      { value: 'last7', label: 'Last 7 Days' },
      { value: 'last14', label: 'Last 14 Days' },
      { value: 'last30', label: 'Last 30 Days' },
      { value: 'last90', label: 'Last 90 Days' },
      { value: `year_${thisYear}`, label: 'This Year' },
      { value: `year_${thisYear - 1}`, label: 'Last Year' },
    ]
    // Add earlier years dynamically (down to 2021)
    for (let y = thisYear - 2; y >= 2021; y--) {
      opts.push({ value: `year_${y}`, label: String(y) })
    }
    opts.push({ value: 'all', label: 'All Time' })
    return opts
  }, [])

  // Compute start/end from dateRange
  const { startDate, endDate } = useMemo(() => {
    if (dateRange === 'all') return { startDate: '', endDate: '' }
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    if (dateRange.startsWith('last')) {
      const days = parseInt(dateRange.replace('last', ''), 10)
      const d = new Date(now)
      d.setDate(d.getDate() - days)
      return { startDate: d.toISOString().split('T')[0], endDate: today }
    }
    if (dateRange.startsWith('year_')) {
      const y = parseInt(dateRange.replace('year_', ''), 10)
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` }
    }
    return { startDate: '', endDate: '' }
  }, [dateRange])

  const clientName = id => clients.find(c => c.client_id === id)?.client_name || id

  const filtered = useMemo(() => {
    let rows = payments
    if (clientFilter !== 'all') rows = rows.filter(r => r.client_id === clientFilter)
    if (merchantFilter !== 'all') rows = rows.filter(r => r.merchant === merchantFilter)
    if (startDate) rows = rows.filter(r => r.date_created && r.date_created.slice(0, 10) >= startDate)
    if (endDate)   rows = rows.filter(r => r.date_created && r.date_created.slice(0, 10) <= endDate)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.customer_name?.toLowerCase().includes(q) ||
        r.customer_email?.toLowerCase().includes(q) ||
        r.invoice_id?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      )
    }
    const sorted = [...rows].sort((a, b) => {
      let va, vb
      switch (sortCol) {
        case 'date_created':
          va = new Date(a.date_created || 0); vb = new Date(b.date_created || 0)
          return sortDir === 'desc' ? vb - va : va - vb
        case 'client':
          va = clientName(a.client_id).toLowerCase(); vb = clientName(b.client_id).toLowerCase()
          break
        case 'customer':
          va = (a.customer_name || '').toLowerCase(); vb = (b.customer_name || '').toLowerCase()
          break
        case 'merchant':
          va = (a.merchant || '').toLowerCase(); vb = (b.merchant || '').toLowerCase()
          break
        case 'invoice':
          va = (a.invoice_id || '').toLowerCase(); vb = (b.invoice_id || '').toLowerCase()
          break
        case 'amount':
          va = parseFloat(a.amount) || 0; vb = parseFloat(b.amount) || 0
          return sortDir === 'desc' ? vb - va : va - vb
        default:
          return 0
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [payments, clients, clientFilter, merchantFilter, search, sortCol, sortDir, startDate, endDate, dateRange])

  const total = useMemo(() => filtered.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0), [filtered])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('asc') }
  }
  const arrow = col => sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ↑↓'

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payments</h1>
          <p className="text-sm text-gray-400 mt-1">All client payment records</p>
        </div>
        {qbConnected === false && (
          <a
            href="/api/quickbooks/connect"
            className="flex items-center gap-2 px-4 py-2 bg-[#2CA01C] hover:bg-[#228016] text-white text-sm font-medium rounded-lg transition"
          >
            Connect QuickBooks
          </a>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Total (filtered)</p>
          <p className="text-3xl font-bold text-[#0ea5c8]">{loading ? '—' : fmt(total)}</p>
        </div>
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Transactions</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{loading ? '—' : filtered.length}</p>
        </div>
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Avg Transaction</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {loading || !filtered.length ? '—' : fmt(total / filtered.length)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search name, email, invoice…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#171B33] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#171B33] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Clients</option>
          {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.client_name}</option>)}
        </select>
        <select
          value={merchantFilter}
          onChange={e => setMerchantFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#171B33] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Merchants</option>
          {merchants.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={dateRange}
          onChange={e => setDateRange(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#171B33] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {dateRangeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5">
                {[
                  { key: 'date_created', label: 'Date', align: 'left' },
                  { key: 'client', label: 'Client', align: 'left' },
                  { key: 'customer', label: 'Customer', align: 'left' },
                  { key: 'merchant', label: 'Merchant', align: 'left' },
                  { key: 'invoice', label: 'Invoice', align: 'left' },
                  { key: 'amount', label: 'Amount', align: 'right' },
                ].map(col => (
                  <th
                    key={col.key}
                    className={`text-${col.align} px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none hover:text-gray-300 transition`}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}{arrow(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No payments found</td></tr>
              ) : filtered.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(row.date_created)}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium whitespace-nowrap">{clientName(row.client_id)}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900 dark:text-white">{row.customer_name || '—'}</p>
                    {row.customer_email && <p className="text-xs text-gray-400">{row.customer_email}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{row.merchant || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs max-w-[120px] truncate" title={row.invoice_id || ''}>{row.invoice_id || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    {row.amount ? fmt(parseFloat(row.amount)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
