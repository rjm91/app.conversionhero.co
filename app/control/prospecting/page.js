'use client'

import { useEffect, useState } from 'react'

const STATUS_OPTIONS = ['All Status', 'Active', 'Paused', 'Completed', 'Bounced', 'Unsubscribed']
const STATE_OPTIONS = ['All States', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']
const INDUSTRY_OPTIONS = ['All Industries', 'HVAC', 'Plumbing', 'Roofing', 'Solar', 'Funeral', 'Landscaping', 'Pest Control', 'Electrical', 'Remodeling', 'Other']
const MARKET_OPTIONS = ['All Markets']

export default function ProspectingPage() {
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState({ totalLeads: 0, sent: 0, replies: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [state, setState] = useState('All States')
  const [industry, setIndustry] = useState('All Industries')
  const [market, setMarket] = useState('All Markets')
  const [status, setStatus] = useState('All Status')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    // Will be wired to Blaztr API once credentials are available
    setLoading(false)
  }, [])

  const filtered = leads.filter(l => {
    if (search && !`${l.name} ${l.email} ${l.company}`.toLowerCase().includes(search.toLowerCase())) return false
    if (state !== 'All States' && l.state !== state) return false
    if (industry !== 'All Industries' && l.industry !== industry) return false
    if (market !== 'All Markets' && l.market !== market) return false
    if (status !== 'All Status' && l.status !== status) return false
    return true
  })

  function handleExport() {
    if (!filtered.length) return
    const headers = ['Name', 'Email', 'Company', 'State', 'Industry', 'Market', 'Status']
    const rows = filtered.map(l => [l.name, l.email, l.company, l.state, l.industry, l.market, l.status])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'leads.csv'
    a.click()
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard icon={<PeopleIcon />} value={stats.totalLeads} label="Total Leads" />
        <StatCard icon={<SendIcon />} value={stats.sent} label="Sent" />
        <StatCard icon={<ReplyIcon />} value={stats.replies} label="Replies" />
      </div>

      {/* Leads Table */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
        {/* Filters */}
        <div className="p-4 flex flex-wrap gap-3 border-b border-gray-100 dark:border-white/5">
          <div className="flex-1 min-w-[200px] relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <FilterSelect value={state} onChange={setState} options={STATE_OPTIONS} />
          <FilterSelect value={industry} onChange={setIndustry} options={INDUSTRY_OPTIONS} />
          <FilterSelect value={market} onChange={setMarket} options={MARKET_OPTIONS} />
          <FilterSelect value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5">
                {['NAME', 'EMAIL', 'COMPANY', 'STATE', 'INDUSTRY', 'MARKET', 'STATUS'].map(col => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    {!connected ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                          <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Connect Blaztr to see your leads</p>
                        <p className="text-xs text-gray-400">API integration coming soon — leads will appear here automatically</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No leads found.</p>
                    )}
                  </td>
                </tr>
              ) : filtered.map((lead, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-white/5 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{lead.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.email}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.company}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.state}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.industry}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.market}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
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

function StatCard({ icon, value, label }) {
  return (
    <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value.toLocaleString()}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  )
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function StatusBadge({ status }) {
  const colors = {
    Active: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400',
    Paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400',
    Completed: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    Bounced: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    Unsubscribed: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function PeopleIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  )
}

function ReplyIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  )
}
