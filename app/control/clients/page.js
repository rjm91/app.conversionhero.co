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
  Other: '📊',
}

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) { router.push('/login'); return }
  }, [router])

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    const { data, error } = await supabase
      .from('client')
      .select('*')
      .order('client_name', { ascending: true })

    if (error) console.error('Error fetching clients:', error)
    else setClients(data)
    setLoading(false)
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
    }
    setUpdating(null)
  }

  const filtered = clients.filter(c => {
    const matchesFilter = filter === 'All' || c.status === filter
    const matchesSearch =
      c.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.industry?.toLowerCase().includes(search.toLowerCase()) ||
      c.city?.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
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
                <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Client</th>
                <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Industry</th>
                <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Location</th>
                <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client, i) => (
                <tr
                  key={client.client_id}
                  className={`border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition ${
                    i === filtered.length - 1 ? 'border-0' : ''
                  }`}
                >
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
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      client.status === 'Active'
                        ? 'text-[#34CC93] bg-[#34CC93]/10'
                        : 'text-gray-400 bg-gray-100 dark:bg-white/5'
                    }`}>
                      ● {client.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
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
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                    No clients found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
