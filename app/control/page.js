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
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) router.push('/login')
  }, [router])

  useEffect(() => {
    async function fetchClients() {
      const { data, error } = await supabase
        .from('client')
        .select('*')
        .eq('status', 'Active')
        .order('client_name', { ascending: true })

      if (!error) setClients(data)
      setLoading(false)
    }
    fetchClients()
  }, [])

  const industries = [...new Set(clients.map(c => c.industry))].length

  return (
    <div className="p-8">

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agency Control Center</h1>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Select a client to view their performance dashboard.</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Active Clients</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{clients.length}</p>
        </div>
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Industries</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{industries}</p>
        </div>
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Status</p>
          <p className="text-3xl font-bold text-[#34CC93]">Live</p>
        </div>
      </div>

      {/* Client Grid */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Your Clients</p>
        <Link
          href="/control/clients"
          className="text-xs font-medium text-blue-500 hover:text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/30 hover:bg-blue-500/10 transition"
        >
          Manage All Clients →
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading clients...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {clients.map(client => (
            <Link
              key={client.client_id}
              href={`/control/${client.client_id}/dashboard`}
              className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-6 hover:shadow-md dark:hover:border-white/10 hover:border-blue-200 transition-all group"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="w-11 h-11 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center text-xl">
                  {industryEmoji[client.industry] || '📊'}
                </div>
                <span className="text-xs font-medium text-[#34CC93] bg-[#34CC93]/10 px-2.5 py-1 rounded-full">
                  ● {client.status}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-lg group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                {client.client_name}
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                {client.industry} · {client.city}, {client.state}
              </p>
              <div className="mt-5 pt-4 border-t border-gray-50 dark:border-white/5 flex items-center justify-end">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform inline-block">
                  View Dashboard →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
