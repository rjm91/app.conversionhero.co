'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '../../../lib/supabase-browser'

function Chip({ children, onRemove, color = 'gray' }) {
  const c = color === 'green'
    ? 'bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
    : 'bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 border-transparent'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border ${c}`}>
      {children}
      {onRemove && <button onClick={onRemove} className="ml-0.5 text-gray-400 hover:text-red-500" title="Revoke">×</button>}
    </span>
  )
}

function AgencyNode({ agency, byParent, clientsByAgency, agencyMembers, clientMembers, depth, onInvite, onRevokeAgency, onRevokeClient }) {
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
          <button onClick={() => onInvite(agency)} className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ Invite member</button>
        </div>
        {members.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-1">Members</span>
            {members.map((m, i) => (
              <Chip key={i} onRemove={() => onRevokeAgency(m.profile_id, agency.id)}>{m.email} <span className="text-gray-400">· {m.role.replace('agency_', '')}</span></Chip>
            ))}
          </div>
        )}
        {clients.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-1">Clients</span>
            {clients.map(c => {
              const cm = clientMembers.filter(m => m.client_id === c.client_id)
              return (
                <Chip key={c.client_id} color="green">
                  {c.client_name}
                  {cm.map((m, i) => <span key={i} className="text-emerald-600/70 dark:text-emerald-300/70"> · {m.email.split('@')[0]}<button onClick={() => onRevokeClient(m.profile_id, c.client_id)} className="ml-0.5 hover:text-red-500" title="Revoke">×</button></span>)}
                </Chip>
              )
            })}
          </div>
        )}
      </div>
      {kids.map(k => (
        <AgencyNode key={k.id} agency={k} byParent={byParent} clientsByAgency={clientsByAgency} agencyMembers={agencyMembers} clientMembers={clientMembers} depth={depth + 1} onInvite={onInvite} onRevokeAgency={onRevokeAgency} onRevokeClient={onRevokeClient} />
      ))}
    </div>
  )
}

export default function AgenciesPage() {
  const [state, setState] = useState('loading')
  const [data, setData] = useState(null)
  const [token, setToken] = useState(null)
  const [modal, setModal] = useState(null) // { agency }
  const [form, setForm] = useState({ email: '', fullName: '', level: 'agency', role: 'agency_standard', clientIds: [] })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { tempPassword } | { error }

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    setToken(session?.access_token)
    const res = await fetch('/api/admin/agencies', { headers: { Authorization: `Bearer ${session?.access_token}` } })
    if (res.status === 401 || res.status === 403) { setState('forbidden'); return }
    if (!res.ok) { setState('error'); return }
    setData(await res.json()); setState('ok')
  }, [])
  useEffect(() => { load() }, [load])

  const model = useMemo(() => {
    if (!data?.agencies) return null
    const byParent = {}
    for (const a of data.agencies) (byParent[a.parent_agency_id || 'root'] ||= []).push(a)
    const clientsByAgency = {}
    for (const c of data.clients) (clientsByAgency[c.agency_id] ||= []).push(c)
    // roots = agencies in scope whose parent isn't also in scope
    const ids = new Set(data.agencies.map(a => a.id))
    const roots = data.agencies.filter(a => !a.parent_agency_id || !ids.has(a.parent_agency_id))
    return { byParent, clientsByAgency, roots }
  }, [data])

  async function post(payload) {
    const res = await fetch('/api/admin/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    return res.json()
  }

  function openInvite(agency) {
    setForm({ email: '', fullName: '', level: 'agency', role: 'agency_standard', clientIds: [] })
    setResult(null); setModal({ agency })
  }

  async function submitInvite() {
    setBusy(true); setResult(null)
    const p = { action: 'invite', email: form.email.trim(), fullName: form.fullName.trim(), level: form.level, role: form.role, agencyId: modal.agency.id, clientIds: form.clientIds }
    const r = await post(p)
    setBusy(false)
    if (r.error) setResult({ error: r.error })
    else { setResult({ tempPassword: r.tempPassword }); await load() }
  }

  async function revokeAgency(profileId, agencyId) {
    if (!confirm('Revoke this member from the agency?')) return
    await post({ action: 'revokeAgency', profileId, agencyId }); load()
  }
  async function revokeClient(profileId, clientId) {
    if (!confirm('Revoke this member from the client?')) return
    await post({ action: 'revokeClient', profileId, clientId }); load()
  }

  if (state === 'loading') return <div className="p-8 text-sm text-gray-400">Loading agencies…</div>
  if (state === 'forbidden') return <div className="p-8 max-w-md"><h1 className="text-lg font-semibold text-gray-900 dark:text-white">Restricted</h1><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Agency admins only.</p></div>
  if (state === 'error' || !model) return <div className="p-8 text-sm text-gray-400">Couldn’t load agencies.</div>

  const modalClients = modal ? (model.clientsByAgency[modal.agency.id] || []) : []

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">Agencies</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Your white-label hierarchy. Invite members agency-wide or scoped to specific clients — you can only assign within agencies/clients you control.</p>

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
        <AgencyNode key={r.id} agency={r} byParent={model.byParent} clientsByAgency={model.clientsByAgency} agencyMembers={data.agencyMembers} clientMembers={data.clientMembers} depth={0} onInvite={openInvite} onRevokeAgency={revokeAgency} onRevokeClient={revokeClient} />
      ))}

      {/* Invite modal */}
      {modal && (
        <div className="fixed inset-0 z-[200] bg-black/50 grid place-items-center p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md bg-white dark:bg-[#141a2c] rounded-2xl border border-gray-200 dark:border-white/10 p-5" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-gray-900 dark:text-white">Invite member to {modal.agency.name}</h2>
            {result?.tempPassword ? (
              <div className="mt-4 text-sm">
                <p className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Member invited.</p>
                <p className="mt-2 text-gray-600 dark:text-gray-300">Temp password (share once, they reset on first login):</p>
                <code className="mt-1 block bg-gray-100 dark:bg-[#0d1020] rounded-lg px-3 py-2 font-mono text-gray-900 dark:text-white">{result.tempPassword}</code>
                <button onClick={() => setModal(null)} className="mt-4 w-full py-2 rounded-lg bg-blue-600 text-white font-semibold">Done</button>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@company.com" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-[#0d1020] text-gray-900 dark:text-white" />
                <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Full name" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-[#0d1020] text-gray-900 dark:text-white" />
                <div className="flex gap-2">
                  {[['agency', 'Agency-wide'], ['client', 'Specific clients']].map(([v, l]) => (
                    <button key={v} onClick={() => setForm(f => ({ ...f, level: v, role: v === 'agency' ? 'agency_standard' : 'client_standard' }))} className={`flex-1 py-2 rounded-lg border text-[13px] font-medium ${form.level === v ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-300' : 'border-gray-300 dark:border-white/15 text-gray-500'}`}>{l}</button>
                  ))}
                </div>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-[#0d1020] text-gray-900 dark:text-white">
                  {(form.level === 'agency' ? ['agency_admin', 'agency_standard'] : ['client_admin', 'client_standard']).map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
                {form.level === 'client' && (
                  <div className="max-h-40 overflow-auto rounded-lg border border-gray-200 dark:border-white/10 p-2 space-y-1">
                    {modalClients.length === 0 && <p className="text-gray-400 text-xs px-1">No clients in this agency yet.</p>}
                    {modalClients.map(c => (
                      <label key={c.client_id} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer">
                        <input type="checkbox" checked={form.clientIds.includes(c.client_id)} onChange={e => setForm(f => ({ ...f, clientIds: e.target.checked ? [...f.clientIds, c.client_id] : f.clientIds.filter(x => x !== c.client_id) }))} />
                        <span className="text-gray-700 dark:text-gray-200">{c.client_name}</span>
                      </label>
                    ))}
                  </div>
                )}
                {result?.error && <p className="text-red-500 text-xs">{result.error}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-white/15 text-gray-600 dark:text-gray-300">Cancel</button>
                  <button onClick={submitInvite} disabled={busy || !form.email} className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? 'Inviting…' : 'Invite'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
