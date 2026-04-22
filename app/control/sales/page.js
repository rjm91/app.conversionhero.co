'use client'

import { useState, useEffect, useCallback } from 'react'
import MetricCard from '../../components/MetricCard'

const STAGES = ['Prospect', 'Appt Set', 'Showed', 'Closed Won', 'Closed Lost']

const TEAM = [
  { email: 'brett@conversionhero.co', name: 'Brett Maynard', role: 'setter' },
  { email: 'brian@conversionhero.co', name: 'Brian Smoot',   role: 'closer' },
  { email: 'ryan@conversionhero.co',  name: 'Ryan Maynard',  role: 'closer' },
]

const SETTERS = TEAM.filter(t => t.role === 'setter')
const CLOSERS = TEAM.filter(t => t.role === 'closer')

function fmt$(n) { return '$' + Math.round(n || 0).toLocaleString() }
function fmtPct(n) { return (Math.round((n || 0) * 10) / 10) + '%' }
function shortName(email) { return TEAM.find(t => t.email === email)?.name?.split(' ')[0] || email || '—' }

function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
}

const EMPTY_FORM = { prospect: '', company: '', email: '', phone: '', stage: 'Prospect', setter_email: '', closer_email: '', value: '', notes: '' }

export default function SalesPage() {
  const defaults = defaultDates()
  const [startDate, setStartDate] = useState(defaults.start)
  const [endDate, setEndDate] = useState(defaults.end)
  const [appliedStart, setAppliedStart] = useState(defaults.start)
  const [appliedEnd, setAppliedEnd] = useState(defaults.end)

  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'add' | deal object
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const fetchDeals = useCallback(async (start, end) => {
    setLoading(true)
    const res = await fetch(`/api/sales-deals?start=${start}&end=${end}`)
    const data = await res.json()
    setDeals(data.deals || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchDeals(appliedStart, appliedEnd) }, [fetchDeals, appliedStart, appliedEnd])

  function handleApply() {
    setAppliedStart(startDate)
    setAppliedEnd(endDate)
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setModal('add')
  }

  function openEdit(deal) {
    setForm({
      prospect: deal.prospect || '',
      company: deal.company || '',
      email: deal.email || '',
      phone: deal.phone || '',
      stage: deal.stage || 'Prospect',
      setter_email: deal.setter_email || '',
      closer_email: deal.closer_email || '',
      value: deal.value || '',
      notes: deal.notes || '',
    })
    setModal(deal)
  }

  async function handleSave() {
    if (!form.prospect.trim()) return
    setSaving(true)
    const payload = { ...form, value: parseFloat(form.value) || 0 }
    if (modal === 'add') {
      await fetch('/api/sales-deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch(`/api/sales-deals/${modal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false)
    setModal(null)
    fetchDeals(appliedStart, appliedEnd)
  }

  async function handleDelete(id) {
    setDeleting(id)
    await fetch(`/api/sales-deals/${id}`, { method: 'DELETE' })
    setDeleting(null)
    fetchDeals(appliedStart, appliedEnd)
  }

  // Metrics
  const prospects   = deals.length
  const apptSet     = deals.filter(d => ['Appt Set','Showed','Closed Won'].includes(d.stage)).length
  const showed      = deals.filter(d => ['Showed','Closed Won'].includes(d.stage)).length
  const closedWon   = deals.filter(d => d.stage === 'Closed Won').length
  const closedLost  = deals.filter(d => d.stage === 'Closed Lost').length
  const revenue     = deals.filter(d => d.stage === 'Closed Won').reduce((s, d) => s + (Number(d.value) || 0), 0)
  const pipeline    = deals.filter(d => !['Closed Won','Closed Lost'].includes(d.stage)).reduce((s, d) => s + (Number(d.value) || 0), 0)
  const bookingRate = prospects > 0 ? (apptSet / prospects) * 100 : 0
  const showRate    = apptSet   > 0 ? (showed  / apptSet)   * 100 : 0
  const closeRate   = showed    > 0 ? (closedWon / showed)  * 100 : 0
  const avgDeal     = closedWon > 0 ? revenue / closedWon : 0

  const metricCards = [
    { label: 'Prospects',     value: prospects,            color: 'text-blue-600',   darkColor: 'dark:text-[#5b97e6]' },
    { label: 'Appt Set',      value: apptSet,              color: 'text-purple-600', darkColor: 'dark:text-[#846CC5]' },
    { label: 'Booking Rate',  value: fmtPct(bookingRate),  color: 'text-purple-600', darkColor: 'dark:text-[#846CC5]' },
    { label: 'Shows',         value: showed,               color: 'text-indigo-500', darkColor: 'dark:text-[#22CBE3]' },
    { label: 'Show Rate',     value: fmtPct(showRate),     color: 'text-indigo-500', darkColor: 'dark:text-[#22CBE3]' },
    { label: 'Closes',        value: closedWon,            color: 'text-green-600',  darkColor: 'dark:text-[#34CC93]' },
    { label: 'Revenue',       value: fmt$(revenue),        color: 'text-green-600',  darkColor: 'dark:text-[#34CC93]' },
    { label: 'Avg Deal',      value: fmt$(avgDeal),        color: 'text-green-600',  darkColor: 'dark:text-[#34CC93]' },
    { label: 'Close Rate',    value: fmtPct(closeRate),    color: 'text-green-600',  darkColor: 'dark:text-[#34CC93]' },
    { label: 'Pipeline',      value: fmt$(pipeline),       color: 'text-orange-500', darkColor: 'dark:text-[#FFD024]' },
    { label: 'Lost',          value: closedLost,           color: 'text-red-500',    darkColor: 'dark:text-red-400' },
    { label: 'Active Deals',  value: prospects - closedWon - closedLost, color: 'text-blue-600', darkColor: 'dark:text-[#5b97e6]' },
  ]

  // Chart: closes per month (last 7 months)
  const months = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - (6 - i))
    return {
      label: d.toLocaleString('default', { month: 'short' }),
      start: d.toISOString().split('T')[0],
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0],
    }
  })

  const allDealsForChart = deals
  const chartData = months.map(m => ({
    label: m.label,
    closes: allDealsForChart.filter(d => d.stage === 'Closed Won' && d.closed_at >= m.start && d.closed_at <= m.end + 'T23:59:59').length,
  }))
  const maxCloses = Math.max(...chartData.map(c => c.closes), 1)

  const stageBadge = (stage) => {
    const map = {
      'Prospect':    'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400',
      'Appt Set':    'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
      'Showed':      'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
      'Closed Won':  'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400',
      'Closed Lost': 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    }
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[stage] || ''}`}>{stage}</span>
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sales</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-0.5">Agency pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm shadow-sm dark:shadow-none">
            <span className="text-gray-400 dark:text-gray-500 text-xs">From</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-gray-700 dark:bg-gray-800 dark:text-gray-100 outline-none text-sm" />
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm shadow-sm dark:shadow-none">
            <span className="text-gray-400 dark:text-gray-500 text-xs">To</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-gray-700 dark:bg-gray-800 dark:text-gray-100 outline-none text-sm" />
          </div>
          <button onClick={handleApply} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm">Apply</button>
          <button onClick={openAdd} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm">+ Add Deal</button>
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

          {/* Deals Table */}
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pipeline</h3>
              <span className="text-xs text-gray-400">{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/5">
                    {['PROSPECT', 'COMPANY', 'STAGE', 'SETTER', 'CLOSER', 'VALUE', 'CREATED', ''].map(col => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {deals.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">No deals yet — click + Add Deal to start tracking</td></tr>
                  ) : deals.map(deal => (
                    <tr key={deal.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{deal.prospect}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{deal.company || '—'}</td>
                      <td className="px-4 py-3">{stageBadge(deal.stage)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{shortName(deal.setter_email)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{shortName(deal.closer_email)}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{deal.value ? fmt$(deal.value) : '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(deal.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(deal)} className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition">Edit</button>
                          <button
                            onClick={() => handleDelete(deal.id)}
                            disabled={deleting === deal.id}
                            className="text-xs px-2 py-1 rounded border border-red-200 dark:border-red-500/20 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/5 transition disabled:opacity-40"
                          >
                            {deleting === deal.id ? '…' : 'Del'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Closes Over Time Chart */}
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-6">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Closes Over Time</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last 7 months</p>
            </div>
            <div className="flex items-end gap-3" style={{ height: '140px' }}>
              {chartData.map((m, i) => {
                const pct = Math.round((m.closes / maxCloses) * 100)
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{m.closes}</span>
                    <div className="w-full bg-green-500 rounded-t-lg transition-all hover:bg-green-600" style={{ height: `${Math.max(pct, 2)}%` }} />
                    <span className="text-xs text-gray-400 dark:text-gray-500">{m.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-[#171B33] rounded-2xl border border-gray-100 dark:border-white/10 shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">
              {modal === 'add' ? 'Add Deal' : `Edit — ${modal.prospect}`}
            </h2>

            <div className="space-y-3">
              <Row label="Prospect *">
                <Input value={form.prospect} onChange={v => setForm(f => ({ ...f, prospect: v }))} placeholder="Jane Smith" />
              </Row>
              <Row label="Company">
                <Input value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="Acme HVAC" />
              </Row>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Email">
                  <Input value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="jane@acme.com" type="email" />
                </Row>
                <Row label="Phone">
                  <Input value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="(555) 000-0000" />
                </Row>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Stage">
                  <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))} className={inputCls}>
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Row>
                <Row label="Value ($)">
                  <Input value={form.value} onChange={v => setForm(f => ({ ...f, value: v }))} placeholder="5000" type="number" />
                </Row>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Setter">
                  <select value={form.setter_email} onChange={e => setForm(f => ({ ...f, setter_email: e.target.value }))} className={inputCls}>
                    <option value="">— None —</option>
                    {SETTERS.map(t => <option key={t.email} value={t.email}>{t.name}</option>)}
                  </select>
                </Row>
                <Row label="Closer">
                  <select value={form.closer_email} onChange={e => setForm(f => ({ ...f, closer_email: e.target.value }))} className={inputCls}>
                    <option value="">— None —</option>
                    {CLOSERS.map(t => <option key={t.email} value={t.email}>{t.name}</option>)}
                  </select>
                </Row>
              </div>
              <Row label="Notes">
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any context..."
                  rows={2}
                  className={inputCls + ' resize-none'}
                />
              </Row>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.prospect.trim()} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition">
                {saving ? 'Saving…' : 'Save Deal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full text-sm px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

function Input({ value, onChange, placeholder, type = 'text' }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
}

function Row({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}
