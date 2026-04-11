'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
  const [user, setUser] = useState(null)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) { router.push('/login'); return }
    setUser(JSON.parse(stored))
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

  function handleLogout() {
    localStorage.removeItem('ca_user')
    router.push('/login')
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
    <div className="min-h-screen bg-gray-50">

      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/control" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">CA</span>
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">ConversionAgent</span>
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-500">All Clients</span>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-700 font-semibold text-xs">
                  {user.name?.split(' ').map(w => w[0]).join('')}
                </span>
              </div>
              <span className="text-sm text-gray-600 font-medium">{user.name}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-gray-700 transition px-3 py-1.5 rounded-lg hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">All Clients</h1>
            <p className="text-gray-400 text-sm mt-1">Manage and toggle client status.</p>
          </div>
          <Link
            href="/control"
            className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
          >
            ← Back to Control Center
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Total Clients</p>
            <p className="text-3xl font-bold text-gray-900">{clients.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Active</p>
            <p className="text-3xl font-bold text-green-600">{activeCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Past</p>
            <p className="text-3xl font-bold text-gray-400">{pastCount}</p>
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
                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
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
            className="text-sm border border-gray-200 rounded-lg px-4 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <p className="text-gray-400 text-sm p-8">Loading clients...</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Client</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Industry</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Location</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client, i) => (
                  <tr
                    key={client.client_id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition ${
                      i === filtered.length - 1 ? 'border-0' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center text-base flex-shrink-0">
                          {industryEmoji[client.industry] || '📊'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{client.client_name}</p>
                          <p className="text-xs text-gray-400">{client.client_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{client.industry}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {client.city && client.state ? `${client.city}, ${client.state}` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        client.status === 'Active'
                          ? 'text-green-600 bg-green-50'
                          : 'text-gray-400 bg-gray-100'
                      }`}>
                        ● {client.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleStatus(client)}
                        disabled={updating === client.client_id}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                          client.status === 'Active'
                            ? 'border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                            : 'border-gray-200 text-gray-500 hover:bg-green-50 hover:text-green-600 hover:border-green-200'
                        } disabled:opacity-40`}
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
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                      No clients found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
