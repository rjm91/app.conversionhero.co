'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

const industryEmoji = {
  HVAC: '❄️',
  Roofing: '🏠',
  Solar: '☀️',
  Funeral: '🕊️',
  Restaurant: '🍽️',
  'E-comm': '🛒',
  Other: '📊',
}

const INDUSTRIES = ['HVAC', 'Roofing', 'Solar', 'Funeral', 'Restaurant', 'E-comm', 'Other']

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [updating, setUpdating] = useState(null)
  const [adsAccounts, setAdsAccounts] = useState({})
  const [editingAds, setEditingAds] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [savingAds, setSavingAds] = useState(null)
  const [sortCol, setSortCol] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerClient, setDrawerClient] = useState(null)
  const [drawerForm, setDrawerForm] = useState({})
  const [drawerSaving, setDrawerSaving] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) { router.push('/login'); return }
  }, [router])

  useEffect(() => {
    fetchClients()
    fetchAdsAccounts()
  }, [])

  async function fetchClients() {
    const { data, error } = await supabase
      .from('client')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) console.error('Error fetching clients:', error)
    else setClients(data)
    setLoading(false)
  }

  async function fetchAdsAccounts() {
    const { data } = await supabase
      .from('client_google_ads_account')
      .select('client_id, customer_id, is_active')
    if (data) {
      const map = {}
      for (const row of data) map[row.client_id] = row
      setAdsAccounts(map)
    }
  }

  function startEditAds(clientId) {
    setEditingAds(clientId)
    setEditValue(adsAccounts[clientId]?.customer_id || '')
  }

  async function saveAdsAccount(client) {
    const cleaned = editValue.replace(/[^0-9]/g, '').trim()
    setSavingAds(client.client_id)

    if (!cleaned) {
      if (adsAccounts[client.client_id]) {
        await supabase
          .from('client_google_ads_account')
          .delete()
          .eq('client_id', client.client_id)
        setAdsAccounts(prev => {
          const next = { ...prev }
          delete next[client.client_id]
          return next
        })
      }
    } else {
      const existing = adsAccounts[client.client_id]
      if (existing) {
        await supabase
          .from('client_google_ads_account')
          .update({ customer_id: cleaned, client_name: client.client_name })
          .eq('client_id', client.client_id)
      } else {
        await supabase
          .from('client_google_ads_account')
          .insert({
            client_id: client.client_id,
            client_name: client.client_name,
            customer_id: cleaned,
            login_customer_id: null,
            is_active: true,
          })
      }
      setAdsAccounts(prev => ({
        ...prev,
        [client.client_id]: { customer_id: cleaned, is_active: true },
      }))
    }

    setEditingAds(null)
    setEditValue('')
    setSavingAds(null)
  }

  function formatCustomerId(id) {
    if (!id) return ''
    const d = id.replace(/[^0-9]/g, '')
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
    return d
  }

  async function toggleStatus(client) {
    const newStatus = client.status === 'Active' ? 'Past' : 'Active'
    setUpdating(client.client_id)

    const { error } = await supabase
      .from('client')
      .update({ status: newStatus })
      .eq('client_id', client.client_id)

    if (error) {
      console.error('Error updating status:', error)
    } else {
      setClients(prev =>
        prev.map(c =>
          c.client_id === client.client_id ? { ...c, status: newStatus } : c
        )
      )
      // Update drawer if open for this client
      if (drawerClient?.client_id === client.client_id) {
        setDrawerClient(prev => ({ ...prev, status: newStatus }))
        setDrawerForm(prev => ({ ...prev, status: newStatus }))
      }
    }
    setUpdating(null)
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('asc') }
  }
  const arrow = col => sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ↓'

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function fmtDateInput(d) {
    if (!d) return ''
    return new Date(d).toISOString().split('T')[0]
  }

  // Drawer functions
  function openDrawer(client) {
    setDrawerClient(client)
    setDrawerForm({
      client_name: client.client_name || '',
      industry: client.industry || '',
      city: client.city || '',
      state: client.state || '',
      created_at: fmtDateInput(client.created_at),
      status: client.status || 'Active',
    })
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setDrawerClient(null)
  }

  async function saveDrawer() {
    if (!drawerClient) return
    setDrawerSaving(true)

    const updates = {
      client_name: drawerForm.client_name,
      industry: drawerForm.industry || null,
      city: drawerForm.city || null,
      state: drawerForm.state || null,
      status: drawerForm.status,
    }
    if (drawerForm.created_at) {
      updates.created_at = new Date(drawerForm.created_at).toISOString()
    }

    const { error } = await supabase
      .from('client')
      .update(updates)
      .eq('client_id', drawerClient.client_id)

    if (error) {
      console.error('Error saving client:', error)
    } else {
      setClients(prev =>
        prev.map(c =>
          c.client_id === drawerClient.client_id
            ? { ...c, ...updates }
            : c
        )
      )
      closeDrawer()
    }
    setDrawerSaving(false)
  }

  const filtered = clients.filter(c => {
    const matchesFilter = filter === 'All' || c.status === filter
    const matchesSearch =
      c.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.industry?.toLowerCase().includes(search.toLowerCase()) ||
      c.city?.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  }).sort((a, b) => {
    let va, vb
    switch (sortCol) {
      case 'created_at':
        va = new Date(a.created_at || 0); vb = new Date(b.created_at || 0)
        return sortDir === 'desc' ? vb - va : va - vb
      case 'client_name':
        va = (a.client_name || '').toLowerCase(); vb = (b.client_name || '').toLowerCase()
        break
      case 'industry':
        va = (a.industry || '').toLowerCase(); vb = (b.industry || '').toLowerCase()
        break
      case 'location':
        va = `${a.city || ''} ${a.state || ''}`.toLowerCase(); vb = `${b.city || ''} ${b.state || ''}`.toLowerCase()
        break
      case 'status':
        va = (a.status || '').toLowerCase(); vb = (b.status || '').toLowerCase()
        break
      default:
        return 0
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'desc' ? -cmp : cmp
  })

  const activeCount = clients.filter(c => c.status === 'Active').length
  const pastCount = clients.filter(c => c.status === 'Past').length

  return (
    <div className="p-8">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">All Clients</h1>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Manage and toggle client status.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Total Clients</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{clients.length}</p>
        </div>
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Active</p>
          <p className="text-3xl font-bold text-[#34CC93]">{activeCount}</p>
        </div>
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Past</p>
          <p className="text-3xl font-bold text-gray-400 dark:text-gray-500">{pastCount}</p>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-2">
          {['All', 'Active', 'Past'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by name, industry, city..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden">
        {loading ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm p-8">Loading clients...</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
                {[
                  { key: 'created_at', label: 'Date' },
                  { key: 'client_name', label: 'Client' },
                  { key: 'industry', label: 'Industry' },
                  { key: 'location', label: 'Location' },
                ].map(col => (
                  <th
                    key={col.key}
                    className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3 cursor-pointer select-none hover:text-gray-300 transition"
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}{arrow(col.key)}
                  </th>
                ))}
                <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Google Ads ID</th>
                <th
                  className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3 cursor-pointer select-none hover:text-gray-300 transition"
                  onClick={() => toggleSort('status')}
                >
                  Status{arrow('status')}
                </th>
                <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client, i) => (
                <tr
                  key={client.client_id}
                  onClick={() => openDrawer(client)}
                  className={`border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition cursor-pointer ${
                    i === filtered.length - 1 ? 'border-0' : ''
                  } ${drawerClient?.client_id === client.client_id ? 'bg-blue-50/50 dark:bg-blue-500/[0.04]' : ''}`}
                >
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(client.created_at)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center text-base flex-shrink-0">
                        {industryEmoji[client.industry] || '📊'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{client.client_name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{client.client_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{client.industry}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {client.city && client.state ? `${client.city}, ${client.state}` : '—'}
                  </td>
                  <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                    {editingAds === client.client_id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="text"
                          placeholder="e.g. 123-456-7890"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveAdsAccount(client)
                            if (e.key === 'Escape') setEditingAds(null)
                          }}
                          className="w-32 text-xs font-mono border border-blue-400 dark:border-blue-500 rounded px-2 py-1 bg-white dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => saveAdsAccount(client)}
                          disabled={savingAds === client.client_id}
                          className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline disabled:opacity-50"
                        >
                          {savingAds === client.client_id ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingAds(null)}
                          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditAds(client.client_id)}
                        className="group flex items-center gap-1.5"
                      >
                        {adsAccounts[client.client_id]?.customer_id ? (
                          <>
                            <span className="text-xs font-mono text-gray-600 dark:text-gray-300">
                              {formatCustomerId(adsAccounts[client.client_id].customer_id)}
                            </span>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Linked" />
                            <svg className="w-3 h-3 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-600 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition">
                            + Link Account
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      client.status === 'Active'
                        ? 'text-[#34CC93] bg-[#34CC93]/10'
                        : 'text-gray-400 bg-gray-100 dark:bg-white/5'
                    }`}>
                      ● {client.status}
                    </span>
                  </td>
                  <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => toggleStatus(client)}
                      disabled={updating === client.client_id}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition disabled:opacity-40 ${
                        client.status === 'Active'
                          ? 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-500/30'
                          : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-[#34CC93]/10 hover:text-green-600 dark:hover:text-[#34CC93] hover:border-green-200 dark:hover:border-[#34CC93]/30'
                      }`}
                    >
                      {updating === client.client_id
                        ? 'Saving...'
                        : client.status === 'Active'
                        ? 'Set to Past'
                        : 'Set to Active'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                    No clients found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={closeDrawer}
        />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 right-0 bottom-0 w-[480px] bg-white dark:bg-[#111528] border-l border-gray-200 dark:border-white/10 z-50 flex flex-col shadow-2xl transition-transform duration-300 ${
        drawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {drawerClient && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center text-xl">
                  {industryEmoji[drawerForm.industry] || '📊'}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{drawerForm.client_name || 'Client'}</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{drawerClient.client_id} · Created {fmtDate(drawerClient.created_at)}</p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

              {/* Client Details */}
              <div>
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100 dark:border-white/5">Client Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Client Name</label>
                    <input
                      type="text"
                      value={drawerForm.client_name}
                      onChange={e => setDrawerForm(f => ({ ...f, client_name: e.target.value }))}
                      className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Industry</label>
                    <select
                      value={drawerForm.industry}
                      onChange={e => setDrawerForm(f => ({ ...f, industry: e.target.value }))}
                      className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white outline-none focus:border-blue-500"
                    >
                      <option value="">Select...</option>
                      {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">City</label>
                      <input
                        type="text"
                        value={drawerForm.city}
                        onChange={e => setDrawerForm(f => ({ ...f, city: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">State</label>
                      <input
                        type="text"
                        value={drawerForm.state}
                        onChange={e => setDrawerForm(f => ({ ...f, state: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Start Date</label>
                      <input
                        type="date"
                        value={drawerForm.created_at}
                        onChange={e => setDrawerForm(f => ({ ...f, created_at: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Client ID</label>
                      <div className="px-3 py-2.5 text-sm bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-lg text-gray-400 dark:text-gray-500 font-mono">
                        {drawerClient.client_id}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100 dark:border-white/5">Status</h3>
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 rounded-xl">
                  <div className={`w-2.5 h-2.5 rounded-full ${drawerForm.status === 'Active' ? 'bg-[#34CC93]' : 'bg-gray-400'}`} />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1">{drawerForm.status}</span>
                  <button
                    onClick={() => {
                      const newStatus = drawerForm.status === 'Active' ? 'Past' : 'Active'
                      setDrawerForm(f => ({ ...f, status: newStatus }))
                    }}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                      drawerForm.status === 'Active'
                        ? 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-500/30 hover:text-red-500'
                        : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-[#34CC93]/30 hover:text-[#34CC93]'
                    }`}
                  >
                    {drawerForm.status === 'Active' ? 'Set to Past' : 'Set to Active'}
                  </button>
                </div>
              </div>

              {/* Google Ads */}
              <div>
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100 dark:border-white/5">Google Ads</h3>
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 rounded-xl">
                  {adsAccounts[drawerClient.client_id]?.customer_id ? (
                    <>
                      <div className="flex-1">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold">Customer ID</p>
                        <p className="text-sm font-semibold font-mono text-gray-900 dark:text-white">{formatCustomerId(adsAccounts[drawerClient.client_id].customer_id)}</p>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <button
                        onClick={() => { closeDrawer(); startEditAds(drawerClient.client_id) }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-blue-500 hover:border-blue-300 transition"
                      >
                        Edit
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-semibold">Customer ID</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">No account linked</p>
                      </div>
                      <button
                        onClick={() => { closeDrawer(); startEditAds(drawerClient.client_id) }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-blue-500 hover:border-blue-300 transition"
                      >
                        + Link
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Quick Links */}
              <div>
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100 dark:border-white/5">Quick Links</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: '📊', label: 'Dashboard', path: 'dashboard' },
                    { icon: '👤', label: 'Contacts', path: 'contacts' },
                    { icon: '▶️', label: 'Ads', path: 'paid-ads' },
                    { icon: '🔄', label: 'Funnels', path: 'funnels' },
                    { icon: '🎬', label: 'Videos', path: 'videos' },
                    { icon: '💳', label: 'Billing', path: 'billing' },
                  ].map(link => (
                    <button
                      key={link.path}
                      onClick={() => router.push(`/control/${drawerClient.client_id}/${link.path}`)}
                      className="flex items-center gap-2 px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 rounded-xl hover:border-blue-300 dark:hover:border-blue-500/30 hover:text-blue-500 dark:hover:text-blue-400 transition"
                    >
                      <span className="text-base">{link.icon}</span> {link.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 flex gap-3">
              <button
                onClick={closeDrawer}
                className="px-5 py-2.5 text-sm font-semibold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10 rounded-lg hover:text-gray-700 dark:hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={saveDrawer}
                disabled={drawerSaving}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
              >
                {drawerSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>

    </div>
  )
}
