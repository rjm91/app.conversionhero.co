'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../lib/supabase-browser'
import { isAgencyUser } from '../../../lib/roles'

const ROLE_LABELS = {
  agency_admin:          'Agency Admin',
  agency_admin_security: 'Agency Admin (Security)',
  agency_standard:       'Agency Standard',
  client_admin:          'Client Admin',
  client_standard:       'Client Standard',
}
const ROLE_BADGE = {
  agency_admin:          'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
  agency_admin_security: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  agency_standard:       'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
  client_admin:          'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  client_standard:       'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400',
}
// Ordered least access (app-wide) → highest access.
const ROLE_OPTIONS = ['client_standard', 'client_admin', 'agency_standard', 'agency_admin', 'agency_admin_security']

function fmtDate(d) {
  if (!d) return 'Never'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TeamRolesPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [meId, setMeId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [toast, setToast] = useState(null)

  async function token() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setMeId(user?.id || null))
    load()
  }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/agency-users', { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load team')
      setUsers(json.users || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function changeRole(user, role) {
    if (role === user.role) return
    setSavingId(user.id)
    const prev = users
    setUsers(us => us.map(u => u.id === user.id ? { ...u, role, client_id: isAgencyUser(role) ? null : u.client_id, client_name: isAgencyUser(role) ? null : u.client_name } : u))
    try {
      const res = await fetch('/api/agency-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ userId: user.id, role }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Update failed')
      showToast(`${user.full_name || user.email} → ${ROLE_LABELS[role] || role}`)
    } catch (e) {
      setUsers(prev) // revert
      showToast(e.message, true)
    } finally {
      setSavingId(null)
    }
  }

  function showToast(msg, isError) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 2600)
  }

  const agencyTeam = useMemo(() => users.filter(u => isAgencyUser(u.role)), [users])
  const clientUsers = useMemo(() => users.filter(u => !isAgencyUser(u.role)), [users])

  function Row({ u }) {
    const isMe = u.id === meId
    return (
      <tr className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
        <td className="px-4 py-3">
          <div className="font-medium text-gray-900 dark:text-white">{u.full_name || '—'} {isMe && <span className="text-[10px] text-gray-400 font-normal">(you)</span>}</div>
          <div className="text-xs text-gray-400">{u.email}</div>
        </td>
        <td className="px-4 py-3">
          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${ROLE_BADGE[u.role] || ROLE_BADGE.client_standard}`}>{ROLE_LABELS[u.role] || u.role}</span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{u.client_name || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{fmtDate(u.last_sign_in_at)}</td>
        <td className="px-4 py-3 text-right">
          <select
            value={u.role}
            disabled={isMe || savingId === u.id}
            onChange={e => changeRole(u, e.target.value)}
            title={isMe ? "You can't change your own access level here" : 'Change role'}
            className="text-xs border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {savingId === u.id && <span className="ml-2 text-[11px] text-gray-400">saving…</span>}
        </td>
      </tr>
    )
  }

  function Table({ title, rows, subtitle }) {
    return (
      <section className="mb-8">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
          <span className="text-xs text-gray-400">{rows.length}</span>
          {subtitle && <span className="text-xs text-gray-400">· {subtitle}</span>}
        </div>
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">No users.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-white/[0.02] text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Client</th>
                  <th className="text-left px-4 py-3 font-medium">Last sign-in</th>
                  <th className="text-right px-4 py-3 font-medium">Change role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {rows.map(u => <Row key={u.id} u={u} />)}
              </tbody>
            </table>
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team &amp; Roles</h1>
        <p className="text-sm text-gray-400 mt-1">Everyone with access to ConversionHero, their access level, and where they're scoped.</p>
      </div>

      {error && <div className="mb-4 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <Table title="Agency team" subtitle="full access across all clients" rows={agencyTeam} />
          <Table title="Client users" subtitle="scoped to a single client" rows={clientUsers} />
          <p className="text-xs text-gray-400">
            Switching a user to an agency role removes their client scope. To assign a client user to a specific client, use that client's <span className="font-medium">Company</span> page.
          </p>
        </>
      )}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 text-white text-xs font-semibold px-5 py-2 rounded-full shadow-lg z-[100] ${toast.isError ? 'bg-red-600' : 'bg-blue-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
