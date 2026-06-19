'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase-browser'

// Tabs that are agency-only by default and can be "shipped" to a client's users.
// `key` must match the nav item key in the client layout.
const SHIPPABLE_TABS = [
  { key: 'paid-ads',     label: 'Ads',            ecomLabel: 'Ads' },
  { key: 'funnels',      label: 'Funnels' },
  { key: 'videos',       label: 'Videos' },
  { key: 'contacts',     label: 'Leads',          ecomLabel: 'Customers / Orders' },
  { key: 'calendar',     label: 'Calendar' },
  { key: 'legal',        label: 'Legal' },
  { key: 'manufacturing', label: 'Manufacturing', ecomOnly: true },
]

export default function ClientTabAccess({ clientId }) {
  const supabase = createClient()
  const [isAdmin, setIsAdmin] = useState(false)
  const [ready, setReady] = useState(false)
  const [isEcom, setIsEcom] = useState(false)
  const [access, setAccess] = useState({})
  const [saving, setSaving] = useState(null) // key currently saving
  const [viewAs, setViewAs] = useState(false) // respect the "View as client" preview

  useEffect(() => {
    const read = () => { try { setViewAs(localStorage.getItem('ca_view_as_client') === '1') } catch {} }
    read()
    window.addEventListener('ca:viewas', read)
    window.addEventListener('storage', read)
    return () => { window.removeEventListener('ca:viewas', read); window.removeEventListener('storage', read) }
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const role = user?.user_metadata?.role
      if (role !== 'agency_admin') { setReady(true); return }
      setIsAdmin(true)
      const { data } = await supabase.from('client').select('tab_access, is_ecom').eq('client_id', clientId).single()
      setAccess(data?.tab_access || {})
      setIsEcom(!!data?.is_ecom)
      setReady(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function toggle(key, next) {
    setSaving(key)
    const prev = access
    setAccess(a => ({ ...a, [key]: next })) // optimistic
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/client-tab-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ clientId, key, visible: next }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
    } catch (e) {
      setAccess(prev) // revert on failure
      console.error('[ClientTabAccess]', e)
    } finally {
      setSaving(null)
    }
  }

  if (!ready || !isAdmin || viewAs) return null
  const tabs = SHIPPABLE_TABS.filter(t => !t.ecomOnly || isEcom)

  return (
    <div className="mb-6 bg-white dark:bg-[#171B33] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 flex items-center gap-2">
        <span className="inline-grid place-items-center w-6 h-6 rounded-md bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S5.5 5.5 12 5.5 21.5 12 21.5 12 18.5 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
        </span>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Client-visible tabs</h2>
          <p className="text-xs text-gray-400">Agency-only. Toggle a tab on to ship it to this client's users; off to pull it back.</p>
        </div>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-purple-600 bg-purple-100 dark:bg-purple-500/15 dark:text-purple-400 px-2 py-0.5 rounded">Agency only</span>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-white/5">
        {tabs.map(t => {
          const on = access[t.key] === true
          const label = (isEcom && t.ecomLabel) ? t.ecomLabel : t.label
          return (
            <div key={t.key} className="flex items-center gap-4 px-6 py-3">
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                <span className={`ml-2 text-[11px] font-semibold ${on ? 'text-emerald-500' : 'text-gray-400'}`}>{on ? 'Visible to client' : 'Hidden (agency only)'}</span>
              </div>
              <button
                role="switch" aria-checked={on} disabled={saving === t.key}
                onClick={() => toggle(t.key, !on)}
                className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/15'} ${saving === t.key ? 'opacity-50' : ''}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
