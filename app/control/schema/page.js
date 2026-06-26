'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../../../lib/supabase-browser'

/* ── helpers ── */
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
const colCount = t => t.columns.length
const clientIdCol = t => t.columns.find(c => c.name === 'client_id')
// orphan = has a client_id that doesn't point to client (exclude client's own PK)
function isOrphanClient(t) { const c = clientIdCol(t); return c && !c.fk && !c.pk }

/* ── shared: column detail rows ── */
function ColumnList({ table }) {
  return (
    <div className="px-3 py-2 text-[11.5px] font-mono text-left">
      {table.columns.map(c => (
        <div key={c.name} className="flex items-center gap-2 py-0.5">
          <span className={c.pk ? 'text-amber-500 font-bold' : c.fk ? 'text-blue-500 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}>{c.name}</span>
          <span className="text-gray-400 text-[10px]">{c.type}</span>
          {c.pk && <span className="text-[9px] text-amber-500 font-bold">PK</span>}
          {c.fk && <span className="text-[9px] text-blue-400">→ {c.fk}</span>}
        </div>
      ))}
    </div>
  )
}

/* ── LIST view: indented tree + standalone groups ── */
function TableCard({ table, expanded, onToggle, childCount }) {
  const orphan = isOrphanClient(table)
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#141a2c] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03] transition">
        <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''} text-gray-400`}>▸</span>
        <span className="font-mono text-[13px] font-semibold text-gray-900 dark:text-white">{table.name}</span>
        <span className="text-[10px] text-gray-400">{colCount(table)} cols</span>
        {childCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 dark:text-blue-300 font-bold">{childCount} ↳</span>}
        {orphan && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 font-bold">client_id · no FK</span>}
      </button>
      {expanded && <div className="border-t border-gray-100 dark:border-white/[0.06]"><ColumnList table={table} /></div>}
    </div>
  )
}

function TreeNode({ name, childrenMap, byName, expanded, toggle, depth = 0 }) {
  const kids = childrenMap[name] || []
  const table = byName[name]
  if (!table) return null
  return (
    <div className={depth > 0 ? 'ml-5 pl-4 border-l border-dashed border-gray-300 dark:border-white/15' : ''}>
      <div className="mb-2"><TableCard table={table} expanded={expanded.has(name)} onToggle={() => toggle(name)} childCount={kids.length} /></div>
      {kids.map(k => <TreeNode key={k} name={k} childrenMap={childrenMap} byName={byName} expanded={expanded} toggle={toggle} depth={depth + 1} />)}
    </div>
  )
}

/* ── DIAGRAM view: top-down org chart (pyramid + legs) ── */
function OrgNode({ name, childrenMap, byName, expanded, toggle }) {
  const kids = childrenMap[name] || []
  const table = byName[name]
  if (!table) return null
  const open = expanded.has(name)
  return (
    <li>
      <div className="orgnode" onClick={() => toggle(name)} role="button">
        <div className="orgnode-head">
          <span className="orgnode-name">{table.name}</span>
          <span className="orgnode-meta">{colCount(table)} cols{kids.length ? ` · ${kids.length} ↳` : ''}</span>
        </div>
        {open && <div className="orgnode-cols"><ColumnList table={table} /></div>}
      </div>
      {kids.length > 0 && (
        <ul>{kids.map(k => <OrgNode key={k} name={k} childrenMap={childrenMap} byName={byName} expanded={expanded} toggle={toggle} />)}</ul>
      )}
    </li>
  )
}

function OrgChart({ root, childrenMap, byName, expanded, toggle }) {
  return (
    <ul className="orgtree">
      <OrgNode name={root} childrenMap={childrenMap} byName={byName} expanded={expanded} toggle={toggle} />
    </ul>
  )
}

export default function SchemaMapPage() {
  const [state, setState] = useState('loading')
  const [data, setData] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [view, setView] = useState('diagram') // diagram | list

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/admin/schema', { headers: { Authorization: `Bearer ${session?.access_token}` } })
        if (res.status === 401 || res.status === 403) { setState('forbidden'); return }
        if (!res.ok) { setState('error'); return }
        setData(await res.json()); setState('ok')
      } catch { setState('error') }
    })()
  }, [])

  const model = useMemo(() => {
    if (!data?.tables) return null
    const byName = Object.fromEntries(data.tables.map(t => [t.name, t]))
    const childrenMap = {}, hasOutgoing = new Set(), isTarget = new Set()
    for (const t of data.tables) for (const c of t.columns) {
      if (!c.fk) continue
      const target = c.fk.split('.')[0]
      if (target === t.name) continue
      ;(childrenMap[target] ||= []).push(t.name)
      hasOutgoing.add(t.name); isTarget.add(target)
    }
    for (const k of Object.keys(childrenMap)) childrenMap[k] = [...new Set(childrenMap[k])].sort()
    const roots = [...isTarget].filter(t => !hasOutgoing.has(t)).sort()
    const connected = new Set([...hasOutgoing, ...isTarget])
    const standalone = data.tables.map(t => t.name).filter(n => !connected.has(n)).sort()
    const groups = {}
    for (const n of standalone) (groups[domainOf(n)] ||= []).push(n)
    const orphanClient = data.tables.filter(isOrphanClient).map(t => t.name)
    const fkCount = data.tables.reduce((s, t) => s + t.columns.filter(c => c.fk).length, 0)
    return { byName, childrenMap, roots, standalone, groups, orphanClient, fkCount }
  }, [data])

  const toggle = (n) => setExpanded(s => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x })

  if (state === 'loading') return <div className="p-8 text-sm text-gray-400">Loading schema map…</div>
  if (state === 'forbidden') return (
    <div className="p-8 max-w-md"><h1 className="text-lg font-semibold text-gray-900 dark:text-white">Restricted</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">The Schema Map is available to the security admin account only.</p></div>
  )
  if (state === 'error' || !model) return (
    <div className="p-8 max-w-md"><h1 className="text-lg font-semibold text-gray-900 dark:text-white">No snapshot</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Run <code className="font-mono">npm run db:schema</code> to generate <code className="font-mono">db/schema.json</code>.</p></div>
  )

  const { byName, childrenMap, roots, groups, orphanClient, fkCount } = model

  return (
    <div className="p-8">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Schema Map</h1>
          <span className="text-xs text-gray-400">snapshot {data.generatedAt}</span>
        </div>
        {/* view toggle */}
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#141a2c] p-0.5 text-[13px] font-semibold">
          {['diagram', 'list'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3.5 py-1.5 rounded-md capitalize transition ${view === v ? 'bg-white dark:bg-blue-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Your real database. {view === 'diagram' ? 'Top-down tree — the root client table at the top, related tables branching below. Click any table to see its columns.' : 'Foreign-key hierarchy on the left, un-linked tables grouped on the right. Click any table to see its columns.'}</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { v: data.tables.length, l: 'Tables' },
          { v: fkCount, l: 'Foreign keys' },
          { v: model.standalone.length, l: 'Un-linked tables' },
          { v: orphanClient.length, l: 'client_id w/ no FK', accent: orphanClient.length ? 'amber' : null },
        ].map((k, i) => (
          <div key={i} className={`rounded-xl border p-4 ${k.accent === 'amber' ? 'border-amber-400/40 bg-amber-500/[0.06]' : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#141a2c]'}`}>
            <div className={`text-2xl font-extrabold ${k.accent === 'amber' ? 'text-amber-500' : 'text-gray-900 dark:text-white'}`}>{k.v}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{k.l}</div>
          </div>
        ))}
      </div>

      {orphanClient.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.08] px-4 py-3">
          <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">{orphanClient.length} tables have a <span className="font-mono">client_id</span> but no foreign key to <span className="font-mono">client</span></p>
          <p className="text-[12px] text-amber-700 dark:text-amber-300/90 mt-1 font-mono">{orphanClient.join(' · ')}</p>
        </div>
      )}

      {/* ── DIAGRAM ── */}
      {view === 'diagram' && (
        <div>
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-16 min-w-min items-start">
              {roots.map(r => (
                <div key={r} className="inline-block">
                  <OrgChart root={r} childrenMap={childrenMap} byName={byName} expanded={expanded} toggle={toggle} />
                </div>
              ))}
            </div>
          </div>
          {/* standalone, as a flat shelf below */}
          <div className="mt-8">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Un-linked tables (no relationships)</h2>
            <div className="flex flex-wrap gap-2">
              {model.standalone.map(n => (
                <button key={n} onClick={() => toggle(n)} className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#11182a] px-3 py-2 text-left hover:border-blue-400 transition">
                  <div className="font-mono text-[12px] text-gray-700 dark:text-gray-200">{n}</div>
                  <div className="text-[10px] text-gray-400">{byName[n].columns.length} cols · {domainOf(n)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LIST ── */}
      {view === 'list' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Foreign-key hierarchy</h2>
            {roots.map(r => <div key={r} className="mb-6"><TreeNode name={r} childrenMap={childrenMap} byName={byName} expanded={expanded} toggle={toggle} /></div>)}
          </div>
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Un-linked tables (no FK in or out)</h2>
            <div className="space-y-5">
              {Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([domain, names]) => (
                <div key={domain}>
                  <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">{domain} <span className="text-gray-400">· {names.length}</span></div>
                  <div className="space-y-2">{names.map(n => <TableCard key={n} table={byName[n]} expanded={expanded.has(n)} onToggle={() => toggle(n)} childCount={0} />)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* org-chart CSS (pure-CSS connector "legs") */}
      <style jsx global>{`
        .orgtree, .orgtree ul, .orgtree li { list-style: none; margin: 0; padding: 0; }
        .orgtree { display: inline-block; text-align: center; }
        .orgtree ul { display: flex; justify-content: center; position: relative; padding-top: 22px; }
        .orgtree li { display: flex; flex-direction: column; align-items: center; position: relative; padding: 22px 10px 0; }
        /* the two halves of the horizontal connector above each child */
        .orgtree li::before, .orgtree li::after {
          content: ''; position: absolute; top: 0; right: 50%;
          border-top: 1.5px solid rgba(127,140,160,0.45); width: 50%; height: 22px;
        }
        .orgtree li::after { right: auto; left: 50%; border-left: 1.5px solid rgba(127,140,160,0.45); }
        .orgtree li:only-child::before, .orgtree li:only-child::after { display: none; }
        .orgtree li:only-child { padding-top: 22px; }
        .orgtree li:first-child::before, .orgtree li:last-child::after { border: 0 none; }
        .orgtree li:last-child::before { border-right: 1.5px solid rgba(127,140,160,0.45); border-radius: 0 6px 0 0; }
        .orgtree li:first-child::after { border-radius: 6px 0 0 0; }
        /* vertical "leg" dropping from a parent into its children row */
        .orgtree ul ul::before {
          content: ''; position: absolute; top: 0; left: 50%;
          border-left: 1.5px solid rgba(127,140,160,0.45); width: 0; height: 22px;
        }
        .orgnode {
          display: inline-block; cursor: pointer; min-width: 150px;
          border: 1px solid rgba(127,140,160,0.25); border-radius: 10px;
          background: #ffffff; transition: border-color .15s, box-shadow .15s;
        }
        :global(.dark) .orgnode { background: #141a2c; border-color: rgba(255,255,255,0.1); }
        .orgnode:hover { border-color: #3b82f6; box-shadow: 0 2px 10px rgba(59,130,246,0.15); }
        .orgnode-head { padding: 9px 12px; }
        .orgnode-name { display: block; font-family: ui-monospace, monospace; font-size: 12.5px; font-weight: 700; color: #111827; }
        :global(.dark) .orgnode-name { color: #fff; }
        .orgnode-meta { display: block; font-size: 10px; color: #9aa3b2; margin-top: 1px; }
        .orgnode-cols { border-top: 1px solid rgba(127,140,160,0.18); max-height: 220px; overflow: auto; }
      `}</style>
    </div>
  )
}
