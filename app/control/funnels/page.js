'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function AgencyFunnelsPage() {
  const [funnels, setFunnels] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(null)
  const [confirmFunnel, setConfirmFunnel] = useState(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/agency-funnels')
      const json = await res.json()
      setFunnels(json.funnels || [])
      setLoading(false)
    }
    load()
  }, [])

  const fmtPct = n => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
  const fmtNum = n => (n == null ? '—' : n.toLocaleString())

  async function doReset(funnel) {
    setResetting(funnel.id)
    setConfirmFunnel(null)
    const res = await fetch(`/api/agency-funnels/${funnel.id}/reset`, { method: 'POST' })
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
            Agency landing pages used to send prospects to your offer.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : funnels.length === 0 ? (
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-12 text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No funnels yet</p>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Drop a static HTML file at
            <code className="mx-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 font-mono text-[11px]">public/p/&lt;slug&gt;/index.html</code>
            and add a row to
            <code className="mx-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 font-mono text-[11px]">agency_funnels</code>.
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
                const liveUrl = `/p/${f.slug}`
                return (
                  <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-medium">
                      <Link href={`/control/funnels/${f.id}`} className="text-gray-900 dark:text-white hover:text-blue-500 dark:hover:text-blue-400 transition">
                        {f.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs truncate">
                        {liveUrl}
                      </a>
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
                        title="Reset visitor + lead counts"
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
