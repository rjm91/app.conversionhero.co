'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
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

const METHODS = ['Zelle', 'Venmo', 'Cash', 'Check', 'Wire', 'PayPal', 'Other']

function AddPaymentModal({ clients, supabase, onClose, onSuccess }) {
  const [form, setForm] = useState({ clientId: '', amount: '', date: new Date().toISOString().slice(0, 10), method: 'Zelle', customerName: '', description: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [listening, setListening] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recogRef = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const onClient = (id) => { const c = clients.find(x => x.client_id === id); setForm(f => ({ ...f, clientId: id, customerName: f.customerName || c?.client_name || '' })) }

  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

  async function parseTranscript(text) {
    setParsing(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/parse-payment', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ transcript: text, clients }) })
      const p = await res.json()
      if (p.error && !p.clientId) { setError("Couldn't read that — try again or type it in."); setParsing(false); return }
      const c = clients.find(x => x.client_id === p.clientId)
      setForm(f => ({
        clientId: p.clientId || f.clientId,
        amount: p.amount != null ? String(p.amount) : f.amount,
        date: p.date || f.date,
        method: METHODS.includes(p.method) ? p.method : f.method,
        customerName: c?.client_name || f.customerName,
        description: p.memo || f.description,
      }))
    } catch (e) { setError('Voice parse failed — type it in.') }
    setParsing(false)
  }

  function toggleVoice() {
    if (!SR) { setError('Voice input isn\'t supported in this browser. Try Chrome or Safari.'); return }
    if (listening) { recogRef.current?.stop(); return }
    const r = new SR()
    r.lang = 'en-US'; r.interimResults = true; r.continuous = false
    let finalText = ''
    r.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; finalText = t; setTranscript(t) }
    r.onerror = () => { setListening(false); setError('Mic error — check permissions.') }
    r.onend = () => { setListening(false); if (finalText.trim()) parseTranscript(finalText.trim()) }
    recogRef.current = r
    setTranscript(''); setError(''); setListening(true); r.start()
  }

  async function submit(e) {
    e.preventDefault(); setError('')
    if (!form.clientId) return setError('Choose a client.')
    if (!(Number(form.amount) > 0)) return setError('Enter an amount.')
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/manual-payment', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save')
      onSuccess()
    } catch (err) { setError(err.message); setSaving(false) }
  }

  const field = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#0d1020] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <form onClick={e => e.stopPropagation()} onSubmit={submit} className="relative bg-white dark:bg-[#171B33] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Record a payment</h2><p className="text-xs text-gray-400 mt-0.5">For payments not from a connected provider (cash, check, Zelle…).</p></div>

        {/* Voice entry */}
        <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/[0.06] p-3">
          <button type="button" onClick={toggleVoice} disabled={parsing}
            className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-60`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3z" /><path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.92V21a1 1 0 102 0v-3.08A7 7 0 0019 11z" /></svg>
            {listening ? 'Listening… tap to stop' : parsing ? 'Reading…' : 'Record by voice'}
          </button>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 text-center">Try: <i>"Five hundred dollars from Synergy Home via Zelle yesterday for the May retainer."</i></p>
          {transcript && <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 italic">“{transcript}”</p>}
        </div>

        {error && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
        <div><label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Client</label><select value={form.clientId} onChange={e => onClient(e.target.value)} className={field}><option value="">Select a client…</option>{clients.map(c => <option key={c.client_id} value={c.client_id}>{c.client_name}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Amount</label><input type="number" step="0.01" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" className={field} /></div>
          <div><label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Date</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={field} /></div>
        </div>
        <div><label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Method</label><select value={form.method} onChange={e => set('method', e.target.value)} className={field}>{METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
        <div><label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Memo <span className="text-gray-300">(optional)</span></label><input value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. May retainer" className={field} /></div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5">{saving ? 'Saving…' : 'Record payment'}</button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
        </div>
      </form>
    </div>
  )
}

export default function PaymentsPage() {
  const [payments, setPayments]   = useState([])
  const [clients,  setClients]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [qbConnected, setQbConnected] = useState(null)
  const [qbBanner,    setQbBanner]    = useState(null)
  const [showAdd,     setShowAdd]     = useState(false)

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
    fetch('/api/quickbooks/status', { cache: 'no-store' }).then(r => r.json()).then(d => setQbConnected(d.connected))
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('qb') === 'error') setQbBanner({ type: 'error', text: sp.get('msg') || 'QuickBooks connection failed.' })
    else if (sp.get('qb') === 'connected') { setQbBanner({ type: 'ok', text: 'QuickBooks connected.' }); setQbConnected(true) }
  }, [])


  async function deleteManual(id) {
    if (!window.confirm('Delete this manual payment?')) return
    const { data: { session } } = await supabaseRef.auth.getSession()
    await fetch('/api/manual-payment', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ id }) })
    loadPayments()
  }

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
  const arrow = col => sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ↓'

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payments</h1>
          <p className="text-sm text-gray-400 mt-1">All client payment records</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Record payment
          </button>
          {qbConnected === false && (
            <a href="/api/quickbooks/connect" className="flex items-center gap-2 px-4 py-2 bg-[#2CA01C] hover:bg-[#228016] text-white text-sm font-medium rounded-lg transition">Connect QuickBooks</a>
          )}
        </div>
      </div>

      {showAdd && <AddPaymentModal clients={clients} supabase={supabaseRef} onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); loadPayments() }} />}

      {qbBanner && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm border ${qbBanner.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-green-500/10 border-green-500/30 text-green-300'}`}>
          {qbBanner.type === 'error' ? 'QuickBooks connection failed: ' : ''}{qbBanner.text}
        </div>
      )}

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
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No payments found</td></tr>
              ) : filtered.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(row.date_created)}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium whitespace-nowrap">{clientName(row.client_id)}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900 dark:text-white">{row.customer_name || '—'}</p>
                    {row.customer_email && <p className="text-xs text-gray-400">{row.customer_email}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {row.merchant || '—'}
                    {row.is_manual && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-100 dark:bg-blue-500/15 dark:text-blue-400 rounded px-1.5 py-0.5">Manual</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs max-w-[120px] truncate" title={row.invoice_id || ''}>{row.invoice_id || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    {row.amount ? fmt(parseFloat(row.amount)) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.is_manual && (
                      <button onClick={() => deleteManual(row.id)} title="Delete manual payment" className="text-gray-300 hover:text-red-500 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" /></svg>
                      </button>
                    )}
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
