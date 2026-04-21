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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {funnels.map(f => {
                const convRate = f.visitors ? f.leads / f.visitors : null
                const liveUrl = f.custom_domain
                  ? `https://${f.custom_domain}/${f.slug}`
                  : f.slug ? `/f/${f.slug}` : f.url
                const displayUrl = liveUrl?.startsWith('http') ? liveUrl.replace(/^https?:\/\//, '') : liveUrl
                return (
                  <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{f.name}</td>
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
