'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../../../lib/supabase-browser'

function AgencyNode({ agency, byParent, clientsByAgency, agencyMembers, clientMembers, depth = 0 }) {
  const kids = byParent[agency.id] || []
  const clients = clientsByAgency[agency.id] || []
  const members = agencyMembers.filter(m => m.agency_id === agency.id)
  return (
    <div className={depth > 0 ? 'ml-5 pl-4 border-l border-dashed border-gray-300 dark:border-white/15' : ''}>
      <div className="mb-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#141a2c] p-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-6 h-6 rounded-lg grid place-items-center text-white text-[11px] font-bold" style={{ background: depth === 0 ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'linear-gradient(135deg,#34CC93,#0f9d63)' }}>{(agency.name || '?').slice(0, 2).toUpperCase()}</span>
          <span className="font-bold text-gray-900 dark:text-white">{agency.name}</span>
          {agency.slug && <span className="text-[11px] font-mono text-gray-400">/{agency.slug}</span>}
          {depth === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 dark:text-blue-300 font-bold">ROOT</span>}
          <span className="ml-auto text-[11px] text-gray-400">{clients.length} clients · {members.length} members</span>
        </div>
        {members.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {members.map((m, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300">{m.email} <span className="text-gray-400">· {m.role.replace('agency_', '')}</span></span>
            ))}
          </div>
        )}
        {clients.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {clients.map(c => {
              const cm = clientMembers.filter(m => m.client_id === c.client_id)
              return (
                <span key={c.client_id} className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300 border border-emerald-500/20" title={cm.map(m => `${m.email} (${m.role})`).join(', ')}>
                  {c.client_name}{cm.length ? ` · ${cm.length}👤` : ''}
                </span>
              )
            })}
          </div>
        )}
      </div>
      {kids.map(k => (
        <AgencyNode key={k.id} agency={k} byParent={byParent} clientsByAgency={clientsByAgency} agencyMembers={agencyMembers} clientMembers={clientMembers} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function AgenciesPage() {
  const [state, setState] = useState('loading')
  const [data, setData] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/admin/agencies', { headers: { Authorization: `Bearer ${session?.access_token}` } })
        if (res.status === 401 || res.status === 403) { setState('forbidden'); return }
        if (!res.ok) { setState('error'); return }
        setData(await res.json()); setState('ok')
      } catch { setState('error') }
    })()
  }, [])

  const model = useMemo(() => {
    if (!data?.agencies) return null
    const byParent = {}
    for (const a of data.agencies) (byParent[a.parent_agency_id || 'root'] ||= []).push(a)
    const clientsByAgency = {}
    for (const c of data.clients) (clientsByAgency[c.agency_id] ||= []).push(c)
    const roots = byParent['root'] || []
    return { byParent, clientsByAgency, roots }
  }, [data])

  if (state === 'loading') return <div className="p-8 text-sm text-gray-400">Loading agencies…</div>
  if (state === 'forbidden') return (
    <div className="p-8 max-w-md"><h1 className="text-lg font-semibold text-gray-900 dark:text-white">Restricted</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">The Agencies view is available to the security admin account only.</p></div>
  )
  if (state === 'error' || !model) return <div className="p-8 text-sm text-gray-400">Couldn’t load agencies.</div>

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">Agencies</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">The white-label hierarchy — agencies nest under a parent, with their clients and members. A parent agency sees its descendants’ clients.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { v: data.agencies.length, l: 'Agencies' },
          { v: data.clients.length, l: 'Clients' },
          { v: data.agencyMembers.length, l: 'Agency members' },
          { v: data.clientMembers.length, l: 'Client members' },
        ].map((k, i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#141a2c] p-4">
            <div className="text-2xl font-extrabold text-gray-900 dark:text-white">{k.v}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{k.l}</div>
          </div>
        ))}
      </div>
      {model.roots.map(r => (
        <AgencyNode key={r.id} agency={r} byParent={model.byParent} clientsByAgency={model.clientsByAgency} agencyMembers={data.agencyMembers} clientMembers={data.clientMembers} />
      ))}
    </div>
  )
}
