'use client'

import { useEffect, useState } from 'react'

const STATUS_OPTIONS = ['All Status', 'New', 'Contacted', 'Replied', 'Bounced', 'Unsubscribed']

export default function ProspectingPage() {
  const [leads, setLeads] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [stats, setStats] = useState({ totalLeads: 0, sent: 0, replies: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [campaign, setCampaign] = useState('All Campaigns')
  const [state, setState] = useState('All States')
  const [industry, setIndustry] = useState('All Industries')
  const [market, setMarket] = useState('All Markets')
  const [status, setStatus] = useState('All Status')
  const [convertedIds, setConvertedIds] = useState(new Set())
  const [converting, setConverting] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [summaryRes, leadsRes, campaignsRes, agencyLeadsRes] = await Promise.all([
          fetch('/api/blaztr?action=summary'),
          fetch('/api/blaztr?action=leads'),
          fetch('/api/blaztr?action=campaigns'),
          fetch('/api/agency-leads'),
        ])
        const [summaryData, leadsData, campaignsData, agencyLeadsData] = await Promise.all([
          summaryRes.json(),
          leadsRes.json(),
          campaignsRes.json(),
          agencyLeadsRes.json(),
        ])

        if (summaryData.success) {
          const d = summaryData.data
          setStats({ totalLeads: d.total_leads, sent: d.total_sent, replies: d.total_replies })
        }
        if (leadsData.success) setLeads(leadsData.data)
        if (campaignsData.success) setCampaigns(campaignsData.data)
        if (agencyLeadsData.leads) {
          const ids = new Set(agencyLeadsData.leads.map(l => l.blaztr_id).filter(Boolean))
          setConvertedIds(ids)
        }
      } catch (e) {
        setError('Failed to load Blaztr data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleCreateLead(prospect) {
    setConverting(prospect.id)
    try {
      const res = await fetch('/api/agency-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blaztr_id: prospect.id,
          first_name: prospect.first_name,
          last_name: prospect.last_name,
          email: prospect.email,
          company: prospect.company_name,
          meta: {
            source: 'blaztr',
            blaztr_status: prospect.status,
            industry: prospect.industry || null,
            state: prospect.state || null,
            market: prospect.market || null,
          },
        }),
      })
      if (res.ok) {
        setConvertedIds(prev => new Set([...prev, prospect.id]))
      }
    } finally {
      setConverting(null)
    }
  }

  const campaignMap = Object.fromEntries(campaigns.map(c => [c.leads_group_id, c.name]))
  const campaignOptions = ['All Campaigns', ...campaigns.map(c => c.name)]
  const selectedCampaign = campaigns.find(c => c.name === campaign)

  const stateOptions = ['All States', ...Array.from(new Set(leads.map(l => l.state).filter(Boolean))).sort()]
  const industryOptions = ['All Industries', ...Array.from(new Set(leads.map(l => l.industry).filter(Boolean))).sort()]
  const marketOptions = ['All Markets', ...Array.from(new Set(leads.map(l => l.market).filter(Boolean))).sort()]

  const filtered = leads.filter(l => {
    const name = `${l.first_name} ${l.last_name}`
    if (search && !`${name} ${l.email} ${l.company_name}`.toLowerCase().includes(search.toLowerCase())) return false
    if (campaign !== 'All Campaigns' && selectedCampaign && l.group_id !== selectedCampaign.leads_group_id) return false
    if (state !== 'All States' && l.state !== state) return false
    if (industry !== 'All Industries' && l.industry !== industry) return false
    if (market !== 'All Markets' && l.market !== market) return false
    if (status !== 'All Status' && l.status !== status) return false
    return true
  })

  function handleExport() {
    if (!filtered.length) return
    const headers = ['Name', 'Email', 'Company', 'State', 'Industry', 'Market', 'Status']
    const rows = filtered.map(l => [
      `${l.first_name} ${l.last_name}`,
      l.email,
      l.company_name,
      l.state || '',
      l.industry || '',
      l.market || '',
      l.status,
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'blaztr-leads.csv'
    a.click()
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard icon={<PeopleIcon />} value={stats.totalLeads} label="Total Prospects" />
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
          <FilterSelect value={state} onChange={setState} options={stateOptions} />
          <FilterSelect value={industry} onChange={setIndustry} options={industryOptions} />
          <FilterSelect value={market} onChange={setMarket} options={marketOptions} />
          <FilterSelect value={campaign} onChange={setCampaign} options={campaignOptions} />
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider whitespace-nowrap w-px"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-red-400">{error}</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">No leads found.</td>
                </tr>
              ) : filtered.map(lead => {
                const isConverted = convertedIds.has(lead.id)
                const isConverting = converting === lead.id
                return (
                  <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{lead.first_name} {lead.last_name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.company_name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.state || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.industry || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{lead.market || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap w-px">
                      {isConverted ? (
                        <span className="text-xs text-green-500 dark:text-green-400 font-medium">✓ Lead Created</span>
                      ) : (
                        <button
                          onClick={() => handleCreateLead(lead)}
                          disabled={isConverting}
                          className="px-3 py-1 text-xs font-medium rounded-lg border border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isConverting ? 'Creating…' : 'Create Lead'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
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
    New: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    Contacted: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400',
    Replied: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
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
