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

function fmt(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function ControlPage() {
  const router = useRouter()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [cashCollected, setCashCollected] = useState(null)
  const [mrr, setMrr] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) router.push('/login')
  }, [router])

  useEffect(() => {
    async function fetchAll() {
      // Active clients
      const { data: clientData } = await supabase
        .from('client')
        .select('*')
        .eq('status', 'Active')
        .order('client_name', { ascending: true })
      if (clientData) setClients(clientData)

      // Cash collected — sum all client_payments
      const { data: payments } = await supabase
        .from('client_payments')
        .select('amount')
      if (payments) {
        const total = payments.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
        setCashCollected(total)
      } else {
        setCashCollected(0)
      }

      // MRR — sum monthly_budget from active client_billing records
      const { data: billing } = await supabase
        .from('client_billing')
        .select('monthly_budget, client_id')
      if (billing && clientData) {
        const activeIds = new Set(clientData.map(c => c.client_id))
        const total = billing
          .filter(b => activeIds.has(b.client_id))
          .reduce((sum, b) => sum + (parseFloat(b.monthly_budget) || 0), 0)
        setMrr(total)
      } else {
        setMrr(0)
      }

      setLoading(false)
    }
    fetchAll()
  }, [])

  const arr = mrr ? mrr * 12 : 0

  const statCards = [
    {
      label: 'Active Clients',
      value: loading ? '—' : clients.length,
      color: 'text-white',
      prefix: false,
    },
    {
      label: 'Cash Collected',
      value: cashCollected === null ? '—' : fmt(cashCollected),
      color: 'text-[#22cbe3]',
      prefix: false,
    },
    {
      label: 'MRR',
      value: mrr === null ? '—' : fmt(mrr),
      color: 'text-[#34CC93]',
      prefix: false,
    },
    {
      label: 'ARR',
      value: arr === 0 ? '$0' : fmt(arr),
      color: arr === 0 ? 'text-gray-500' : 'text-[#846CC5]',
      prefix: false,
    },
  ]

  return (
    <div className="p-8">

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agency Control Center</h1>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Select a client to view their performance dashboard.</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        {statCards.map(card => (
          <div key={card.label} className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none p-5">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
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
