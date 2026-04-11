'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

const industryEmoji = {
  HVAC: '❄️',
  Roofing: '🏠',
  Solar: '☀️',
  Funeral: '🕊️',
  Restaurant: '🍽️',
  Other: '📊',
}

export default function ControlPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) {
      router.push('/login')
      return
    }
    setUser(JSON.parse(stored))
  }, [router])

  useEffect(() => {
    async function fetchClients() {
      const { data, error } = await supabase
        .from('client')
        .select('*')
        .eq('status', 'Active')
        .order('client_name', { ascending: true })

      if (error) {
        console.error('Error fetching clients:', error)
      } else {
        setClients(data)
      }
      setLoading(false)
    }
    fetchClients()
  }, [])

  function handleLogout() {
    localStorage.removeItem('ca_user')
    router.push('/login')
  }

  const industries = [...new Set(clients.map(c => c.industry))].length

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">CA</span>
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">ConversionAgent</span>
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

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Agency Control Center</h1>
          <p className="text-gray-400 text-sm mt-1">Select a client to view their performance dashboard.</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Active Clients</p>
            <p className="text-3xl font-bold text-gray-900">{clients.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Industries</p>
            <p className="text-3xl font-bold text-gray-900">{industries}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Status</p>
            <p className="text-3xl font-bold text-green-600">Live</p>
          </div>
        </div>

        {/* Client Grid */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Your Clients</p>
          <Link
            href="/control/clients"
            className="text-xs font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition"
          >
            Manage All Clients →
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading clients...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {clients.map(client => (
              <Link
                key={client.client_id}
                href={`/control/${client.client_id}/dashboard`}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 hover:shadow-md hover:border-blue-200 transition-all group"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center text-xl">
                    {industryEmoji[client.industry] || '📊'}
                  </div>
                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                    ● {client.status}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                  {client.client_name}
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {client.industry} · {client.city}, {client.state}
                </p>
                <div className="mt-5 pt-4 border-t border-gray-50 flex items-center justify-end">
                  <span className="text-xs font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform inline-block">
                    View Dashboard →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
