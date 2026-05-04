'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-browser'

export default function FunnelsPage() {
  const { clientId } = useParams()
  const [funnels, setFunnels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('client_funnels')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      setFunnels(data || [])
      setLoading(false)
    }
    if (clientId) load()
  }, [clientId])

  const fmtPct = n => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
  const fmtNum = n => (n == null ? '—' : n.toLocaleString())

  const [resetting, setResetting] = useState(null)
  const [confirmFunnel, setConfirmFunnel] = useState(null)

  async function doReset(funnel) {
    setResetting(funnel.id)
    setConfirmFunnel(null)
    const res = await fetch(`/api/funnels/${funnel.id}/reset`, { method: 'POST' })
    if (res.ok) {
      setFunnels(prev => prev.map(p => p.id === funnel.id ? { ...p, visitors: 0, leads: 0 } : p))
    }
    setResetting(null)
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Funnels</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Landing pages and lead funnels built for this client.
          </p>
        </div>
        <button
          disabled
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg opacity-50 cursor-not-allowed"
          title="Funnel builder coming soon"
        >
          + New Funnel
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : funnels.length === 0 ? (
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-12 text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No funnels yet</p>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Funnels you build for this client will appear here with live conversion stats.
            The in-app funnel builder is coming soon — for now, add funnels manually to the
            <code className="mx-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 font-mono text-[11px]">client_funnels</code>
            table in Supabase.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.02] text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-5 py-3 font-medium">URL</th>
                <th className="text-right px-5 py-3 font-medium">Visitors</th>
                <th className="text-right px-5 py-3 font-medium">Leads</th>
                <th className="text-right px-5 py-3 font-medium">Conv. Rate</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {funnels.map(f => {
                const convRate = f.visitors ? f.leads / f.visitors : null
                const liveUrl = f.custom_domain && f.slug
                  ? `https://${f.custom_domain}/f/${f.slug}`
                  : f.slug ? `/f/${f.slug}` : null
                const displayUrl = liveUrl?.startsWith('http') ? liveUrl.replace(/^https?:\/\//, '') : liveUrl
                return (
                  <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-medium">
                      <a
                        href={`/control/${clientId}/funnels/${f.id}`}
                        className="group inline-flex items-center gap-1.5 text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition"
                      >
                        <span>{f.name}</span>
                        <span className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition">›</span>
                      </a>
                    </td>
                    <td className="px-5 py-3">
                      {liveUrl ? (
                        <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs truncate">
                          {displayUrl}
                        </a>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">{fmtNum(f.visitors)}</td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">{fmtNum(f.leads)}</td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">{fmtPct(convRate)}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        f.status === 'live' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        f.status === 'draft' ? 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {f.status || 'draft'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setConfirmFunnel(f)}
                        disabled={resetting === f.id}
                        className="text-xs text-gray-400 hover:text-red-500 transition disabled:opacity-50"
                        title="Reset visitor + lead counts (does not delete actual leads)"
                      >
                        {resetting === f.id ? 'Resetting…' : 'Reset stats'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmFunnel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setConfirmFunnel(null)}
        >
          <div
            className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-200 dark:border-white/10 shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Reset funnel stats?</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                This clears tracking data and counters for
                <span className="font-semibold text-gray-900 dark:text-white"> "{confirmFunnel.name}"</span>.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 leading-relaxed">
                Actual leads in the Contacts tab are <span className="font-semibold">not</span> deleted.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-white/[0.02] flex justify-end gap-2">
              <button
                onClick={() => setConfirmFunnel(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => doReset(confirmFunnel)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                Reset stats
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
