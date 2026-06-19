'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase-browser'

// Account tabs every client user can see (no agency gating).
const ACCOUNT_TABS = [
  { key: 'company',     label: 'Company' },
  { key: 'automations', label: 'Automations' },
]
// Agency tabs — only restrictable here once the agency has shipped them.
const AGENCY_TABS = [
  { key: 'paid-ads',     label: 'Ads' },
  { key: 'funnels',      label: 'Funnels' },
  { key: 'videos',       label: 'Videos' },
  { key: 'contacts',     label: 'Leads', ecomLabel: 'Customers / Orders' },
  { key: 'calendar',     label: 'Calendar' },
  { key: 'legal',        label: 'Legal' },
  { key: 'manufacturing', label: 'Manufacturing', ecomOnly: true },
]

export default function StandardTabAccess({ clientId }) {
  const supabase = createClient()
  const [allowed, setAllowed] = useState(false) // agency_admin or client_admin of this client
  const [ready, setReady] = useState(false)
  const [isEcom, setIsEcom] = useState(false)
  const [tabAccess, setTabAccess] = useState({})
  const [hidden, setHidden] = useState({})       // standard_hidden_tabs
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const role = user?.user_metadata?.role
      if (role !== 'agency_admin' && role !== 'client_admin') { setReady(true); return }
      setAllowed(true)
      const { data } = await supabase.from('client').select('standard_hidden_tabs, tab_access, is_ecom').eq('client_id', clientId).single()
      setHidden(data?.standard_hidden_tabs || {})
      setTabAccess(data?.tab_access || {})
      setIsEcom(!!data?.is_ecom)
      setReady(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function toggle(key, nextOn) {
    setSaving(key)
    const prev = hidden
    setHidden(h => ({ ...h, [key]: !nextOn })) // optimistic (hidden = !accessible)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/standard-tab-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ clientId, key, hidden: !nextOn }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
    } catch (e) {
      setHidden(prev)
      console.error('[StandardTabAccess]', e)
    } finally {
      setSaving(null)
    }
  }

  if (!ready || !allowed) return null

  const tabs = [
    ...ACCOUNT_TABS,
    ...AGENCY_TABS.filter(t => tabAccess?.[t.key] === true && (!t.ecomOnly || isEcom)),
  ]

  return (
    <div className="mb-6 bg-white dark:bg-[#171B33] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 flex items-center gap-2">
        <span className="inline-grid place-items-center w-6 h-6 rounded-md bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.4-1.8M9 20H4v-2a3 3 0 015.4-1.8M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </span>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Standard team access</h2>
          <p className="text-xs text-gray-400">Control which tabs your <b>Standard</b> team members can see. Admins always see everything.</p>
        </div>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-100 dark:bg-blue-500/15 dark:text-blue-400 px-2 py-0.5 rounded">Admins only</span>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-white/5">
        {tabs.map(t => {
          const on = hidden[t.key] !== true // accessible to standard users
          const label = (isEcom && t.ecomLabel) ? t.ecomLabel : t.label
          return (
            <div key={t.key} className="flex items-center gap-4 px-6 py-3">
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                <span className={`ml-2 text-[11px] font-semibold ${on ? 'text-emerald-500' : 'text-gray-400'}`}>{on ? 'Standard can access' : 'Hidden from Standard'}</span>
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
