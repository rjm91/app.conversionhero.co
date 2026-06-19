'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../../../lib/useAuth'
import CampaignBuilder from '../../../components/CampaignBuilder'
import { isAgencyUser } from '../../../lib/roles'

const LS_KEY = 'campaignBuilderClient'

export default function AgencyCampaignBuilderPage() {
  const { role, loading: authLoading } = useAuth()
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [loading, setLoading] = useState(true)

  const isAgency = isAgencyUser(role)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/clients')
        const data = await res.json()
        if (!alive) return
        const list = data.clients || []
        setClients(list)
        const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
        const initial = (saved && list.some(c => c.client_id === saved)) ? saved : (list[0]?.client_id || '')
        setClientId(initial)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  function pickClient(id) {
    setClientId(id)
    if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, id)
  }

  const selectedClient = clients.find(c => c.client_id === clientId)

  if (!authLoading && !isAgency) {
    return <div className="p-8 text-sm text-gray-400">This page is available to agency users only.</div>
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Google Ads Campaign Builder</h1>
          <p className="text-sm text-gray-400 mt-0.5">Build Search campaigns and export them for Google Ads Editor. Pick the client you're building for.</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Building for</label>
          <select value={clientId} onChange={e => pickClient(e.target.value)} disabled={loading || clients.length === 0}
            className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 bg-white dark:bg-[#161b30] outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]">
            {clients.length === 0 && <option value="">No clients</option>}
            {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.client_name} ({c.client_id})</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading clients…</div>
      ) : !clientId ? (
        <div className="py-12 text-center text-sm text-gray-400">No clients available to build for.</div>
      ) : (
        <div className="bg-white dark:bg-[#171B33] border border-gray-100 dark:border-white/5 rounded-2xl p-5">
          <div className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-3 py-1.5 rounded-lg">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Saving to {selectedClient?.client_name || clientId}'s campaign draft
          </div>
          {/* key forces a fresh builder when the client changes */}
          <CampaignBuilder key={clientId} clientId={clientId} clientName={selectedClient?.client_name} />
        </div>
      )}
    </div>
  )
}
