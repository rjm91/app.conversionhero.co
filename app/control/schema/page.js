'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../../../lib/supabase-browser'

/* ── group standalone (un-FK'd) tables by domain so they're readable ── */
function domainOf(name) {
  if (/^client_(yt|google_ads)/.test(name) || name === 'google_ads_tokens') return 'Google Ads'
  if (/meta/.test(name)) return 'Meta Ads'
  if (/shopify/.test(name)) return 'Shopify'
  if (/(payment|qb_)/.test(name)) return 'Payments / QuickBooks'
  if (/^agency_/.test(name)) return 'Agency tools'
  if (/(avatar|video|transcription|calendar)/.test(name)) return 'Content'
  if (/(role_change|user_activity|tokens)/.test(name)) return 'System / auth'
  if (/^client_/.test(name)) return 'Client (misc)'
  return 'Other'
}

function colCount(t) { return t.columns.length }
function clientIdCol(t) { return t.columns.find(c => c.name === 'client_id') }
// A table is an "orphan" if it has a client_id that doesn't point to client.
// Exclude the client table itself (its client_id is its own primary key/root).
function isOrphanClient(t) { const c = clientIdCol(t); return c && !c.fk && !c.pk }

/* ── one table card (expandable to show columns) ── */
function TableCard({ table, expanded, onToggle, childCount }) {
  const orphan = isOrphanClient(table)
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#141a2c] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03] transition">
        <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''} text-gray-400`}>▸</span>
        <span className="font-mono text-[13px] font-semibold text-gray-900 dark:text-white">{table.name}</span>
        <span className="text-[10px] text-gray-400">{colCount(table)} cols</span>
        {childCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 dark:text-blue-300 font-bold">{childCount} ↳</span>}
        {orphan && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 font-bold" title="Has a client_id column but no foreign key to client">client_id · no FK</span>}
      </button>
      {expanded && (
        <div className="border-t border-gray-100 dark:border-white/[0.06] px-3.5 py-2 text-[12px] font-mono">
          {table.columns.map(c => (
            <div key={c.name} className="flex items-center gap-2 py-0.5">
              <span className={`${c.pk ? 'text-amber-500 font-bold' : c.fk ? 'text-blue-500 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>{c.name}</span>
              <span className="text-gray-400 text-[11px]">{c.type}</span>
              {c.pk && <span className="text-[9px] text-amber-500 font-bold">PK</span>}
              {c.fk && <span className="text-[9px] text-blue-400">→ {c.fk}</span>}
              {!c.nullable && !c.pk && <span className="text-[9px] text-gray-400">not null</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── recursive FK tree node ── */
function TreeNode({ name, childrenMap, byName, expanded, toggle, depth = 0 }) {
  const kids = childrenMap[name] || []
  const table = byName[name]
  if (!table) return null
  return (
    <div className={depth > 0 ? 'ml-5 pl-4 border-l border-dashed border-gray-300 dark:border-white/15' : ''}>
      <div className="mb-2">
        <TableCard table={table} expanded={expanded.has(name)} onToggle={() => toggle(name)} childCount={kids.length} />
      </div>
      {kids.map(k => (
        <TreeNode key={k} name={k} childrenMap={childrenMap} byName={byName} expanded={expanded} toggle={toggle} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function SchemaMapPage() {
  const [state, setState] = useState('loading') // loading | ok | forbidden | error
  const [data, setData] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/admin/schema', { headers: { Authorization: `Bearer ${session?.access_token}` } })
        if (res.status === 401 || res.status === 403) { setState('forbidden'); return }
        if (!res.ok) { setState('error'); return }
        setData(await res.json())
        setState('ok')
      } catch { setState('error') }
    })()
  }, [])

  const model = useMemo(() => {
    if (!data?.tables) return null
    const byName = Object.fromEntries(data.tables.map(t => [t.name, t]))
    // FK edges → reverse adjacency (target → [children])
    const childrenMap = {}
    const hasOutgoing = new Set()
    const isTarget = new Set()
    for (const t of data.tables) {
      for (const c of t.columns) {
        if (!c.fk) continue
        const target = c.fk.split('.')[0]
        if (target === t.name) continue // self-ref
        ;(childrenMap[target] ||= []).push(t.name)
        hasOutgoing.add(t.name)
        isTarget.add(target)
      }
    }
    // de-dupe children
    for (const k of Object.keys(childrenMap)) childrenMap[k] = [...new Set(childrenMap[k])]
    // roots = FK targets that are not themselves children (top of a tree)
    const roots = [...isTarget].filter(t => !hasOutgoing.has(t)).sort()
    // standalone = no FK in or out
    const connected = new Set([...hasOutgoing, ...isTarget])
    const standalone = data.tables.map(t => t.name).filter(n => !connected.has(n)).sort()
    // group standalone by domain
    const groups = {}
    for (const n of standalone) (groups[domainOf(n)] ||= []).push(n)
    // insight: tables with a client_id column but no FK to client
    const orphanClient = data.tables.filter(isOrphanClient).map(t => t.name)
    const fkCount = data.tables.reduce((s, t) => s + t.columns.filter(c => c.fk).length, 0)
    return { byName, childrenMap, roots, standalone, groups, orphanClient, fkCount }
  }, [data])

  const toggle = (n) => setExpanded(s => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x })

  if (state === 'loading') return <div className="p-8 text-sm text-gray-400">Loading schema map…</div>
  if (state === 'forbidden') return (
    <div className="p-8 max-w-md">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Restricted</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">The Schema Map is available to the security admin account only.</p>
    </div>
  )
  if (state === 'error' || !model) return (
    <div className="p-8 max-w-md">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">No snapshot</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Run <code className="font-mono">npm run db:schema</code> to generate <code className="font-mono">db/schema.json</code>, then redeploy.</p>
    </div>
  )

  const { byName, childrenMap, roots, groups, orphanClient, fkCount } = model

  return (
    <div className="p-8">
      <div className="flex items-baseline gap-3 mb-1">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Schema Map</h1>
        <span className="text-xs text-gray-400">snapshot {data.generatedAt} · via {data.method}</span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">A top-down view of your real database — foreign-key hierarchy on the left, un-linked tables grouped on the right. Click any table to see its columns.</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { v: data.tables.length, l: 'Tables' },
          { v: fkCount, l: 'Foreign keys' },
          { v: model.standalone.length, l: 'Un-linked tables' },
          { v: orphanClient.length, l: 'client_id w/ no FK', accent: 'amber' },
        ].map((k, i) => (
          <div key={i} className={`rounded-xl border p-4 ${k.accent === 'amber' ? 'border-amber-400/40 bg-amber-500/[0.06]' : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#141a2c]'}`}>
            <div className={`text-2xl font-extrabold ${k.accent === 'amber' ? 'text-amber-500' : 'text-gray-900 dark:text-white'}`}>{k.v}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{k.l}</div>
          </div>
        ))}
      </div>

      {/* Insight banner */}
      {orphanClient.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.08] px-4 py-3">
          <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">{orphanClient.length} tables have a <span className="font-mono">client_id</span> but no foreign key to <span className="font-mono">client</span></p>
          <p className="text-[12px] text-amber-700 dark:text-amber-300/90 mt-1 font-mono">{orphanClient.join(' · ')}</p>
          <p className="text-[12px] text-amber-700/80 dark:text-amber-300/70 mt-1.5">These are the &quot;loose&quot; tables — logically client-owned but not declared as relationships. Wiring FKs here is what would un-tangle the map.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* LEFT — FK hierarchy */}
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Foreign-key hierarchy</h2>
          {roots.map(r => (
            <div key={r} className="mb-6">
              <TreeNode name={r} childrenMap={childrenMap} byName={byName} expanded={expanded} toggle={toggle} />
            </div>
          ))}
        </div>

        {/* RIGHT — standalone groups */}
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Un-linked tables (no FK in or out)</h2>
          <div className="space-y-5">
            {Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([domain, names]) => (
              <div key={domain}>
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">{domain} <span className="text-gray-400">· {names.length}</span></div>
                <div className="space-y-2">
                  {names.map(n => (
                    <TableCard key={n} table={byName[n]} expanded={expanded.has(n)} onToggle={() => toggle(n)} childCount={0} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
