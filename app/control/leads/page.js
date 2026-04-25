'use client'

import { useEffect, useState } from 'react'

export default function AgencyLeadsPage() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/agency-leads')
      const json = await res.json()
      setLeads(json.leads || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      l.first_name?.toLowerCase().includes(q) ||
      l.last_name?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.company?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-8 relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leads</h1>
          <p className="text-gray-400 text-sm mt-0.5">{leads.length} total leads from agency funnels</p>
        </div>
        <input
          type="text"
          placeholder="Search by name, email, phone, company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2 w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500"
        />
      </div>

      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="text-gray-400 text-sm p-8">Loading leads…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-sm p-8">No leads yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Phone</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Company</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Funnel</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Booking</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap">
              {filtered.map((l, i) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className={`border-b border-gray-50 dark:border-white/5 hover:bg-blue-50 dark:hover:bg-white/5 cursor-pointer transition ${
                    selected?.id === l.id ? 'bg-blue-50 dark:bg-white/5' : ''
                  } ${i === filtered.length - 1 ? 'border-0' : ''}`}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 dark:text-blue-400 text-xs font-semibold">
                          {(l.first_name?.[0] || '') + (l.last_name?.[0] || '')}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {l.first_name} {l.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{l.email || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{l.phone || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{l.company || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{l.agency_funnels?.name || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                    {[l.selected_date, l.selected_time].filter(Boolean).join(' • ') || '—'}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-400 dark:text-gray-500">
                    {l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <>
          <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-30" onClick={() => setSelected(null)} />
          <div className="fixed top-0 right-0 h-full w-[440px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col overflow-hidden border-l border-transparent dark:border-white/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{selected.first_name} {selected.last_name}</h2>
                <p className="text-xs text-gray-400">{selected.id}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Contact</p>
                <div className="space-y-1.5">
                  <Row label="Email" value={selected.email} />
                  <Row label="Phone" value={selected.phone} />
                  <Row label="Company" value={selected.company} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Booking</p>
                <div className="space-y-1.5">
                  <Row label="Date" value={selected.selected_date} />
                  <Row label="Time" value={selected.selected_time} />
                  <Row label="Funnel" value={selected.agency_funnels?.name} />
                </div>
              </div>
              {selected.meta && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Source</p>
                  <pre className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 text-[11px] text-gray-600 dark:text-gray-300 overflow-x-auto">
{JSON.stringify(selected.meta, null, 2)}
                  </pre>
                </div>
              )}
              <Row label="Submitted" value={selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 dark:text-gray-200 truncate max-w-[260px] text-right">{value || '—'}</span>
    </div>
  )
}
