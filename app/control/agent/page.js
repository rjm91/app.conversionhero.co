'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../../lib/supabase-browser'

function AccessBadge({ access }) {
  const write = access === 'write'
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
      write
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    }`}>
      {write ? 'Write' : 'Read'}
    </span>
  )
}

function StatusDot({ status }) {
  const live = status === 'live'
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
      <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      <span className={live ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}>{live ? 'Live' : 'Disabled'}</span>
    </span>
  )
}

export default function AgentAccessPage() {
  const [state, setState] = useState('loading') // loading | ok | forbidden | error
  const [data, setData] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/agent/capabilities', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        if (res.status === 403 || res.status === 401) { setState('forbidden'); return }
        if (!res.ok) { setState('error'); return }
        setData(await res.json())
        setState('ok')
      } catch { setState('error') }
    })()
  }, [])

  if (state === 'loading') {
    return <div className="p-8 text-sm text-gray-400">Loading agent registry…</div>
  }
  if (state === 'forbidden') {
    return (
      <div className="p-8 max-w-md">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Restricted</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Agent Access is limited to the security account.</p>
      </div>
    )
  }
  if (state === 'error') {
    return <div className="p-8 text-sm text-red-500">Couldn’t load the registry. Try again.</div>
  }

  const { groups, totals } = data

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Agent Access</h1>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Security</span>
          </div>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
            Everything the AI agent can do, derived live from its tool registry. This is the canonical list — if a capability isn’t here, the agent can’t do it.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <div className="text-center"><div className="text-lg font-semibold text-gray-900 dark:text-white">{totals.tools}</div>tools</div>
          <div className="text-center"><div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{totals.read}</div>read</div>
          <div className="text-center"><div className="text-lg font-semibold text-amber-600 dark:text-amber-400">{totals.write}</div>write</div>
        </div>
      </div>

      {/* Capability groups (nested list) */}
      <div className="mt-6 space-y-4">
        {groups.map(g => (
          <section key={g.group} className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{g.group}</h2>
                <span className="text-xs text-gray-400">{g.tools.length} {g.tools.length === 1 ? 'tool' : 'tools'}</span>
              </div>
              <AccessBadge access={g.access} />
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {g.tools.map(t => (
                <li key={t.name} className="px-4 py-3 flex items-start gap-3">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-white/20 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-[13px] font-medium text-gray-900 dark:text-white">{t.name}</code>
                      <AccessBadge access={t.access} />
                      <StatusDot status={t.status} />
                    </div>
                    <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-300 leading-snug">{t.what}</p>
                    <div className="mt-1.5 flex items-center gap-4 flex-wrap text-[11px] text-gray-400">
                      <span><span className="font-medium text-gray-500 dark:text-gray-400">Touches:</span> {t.touches}</span>
                      {t.surface && <span><span className="font-medium text-gray-500 dark:text-gray-400">Fills:</span> {t.surface}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-6 text-[11px] text-gray-400">
        Read-only view (v1). Per-capability kill switches are planned next.
      </p>
    </div>
  )
}
