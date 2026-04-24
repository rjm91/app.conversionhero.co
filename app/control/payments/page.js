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
  const [loading,  setLoading]    = useState(true)
  const [search,         setSearch]         = useState('')
  const [clientFilter,   setClientFilter]   = useState('all')
  const [merchantFilter, setMerchantFilter] = useState('all')
  const [sortDir,        setSortDir]        = useState('desc')

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

  useEffect(() => { loadPayments() }, [])


  const merchants = useMemo(() => [...new Set(payments.map(p => p.merchant).filter(Boolean))].sort(), [payments])

  const filtered = useMemo(() => {
    let rows = payments
    if (clientFilter !== 'all') rows = rows.filter(r => r.client_id === clientFilter)
    if (merchantFilter !== 'all') rows = rows.filter(r => r.merchant === merchantFilter)
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
      const da = new Date(a.date_created), db = new Date(b.date_created)
      return sortDir === 'desc' ? db - da : da - db
    })
    return sorted
  }, [payments, clientFilter, merchantFilter, search, sortDir])

  const total = useMemo(() => filtered.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0), [filtered])

  const clientName = id => clients.find(c => c.client_id === id)?.client_name || id

  return (
    <div className="p-8">

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payments</h1>
        <p className="text-sm text-gray-400 mt-1">All client payment records</p>
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
        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#171B33] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition"
        >
          Date {sortDir === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Merchant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Invoice</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Amount</th>
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
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{row.invoice_id || '—'}</td>
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
