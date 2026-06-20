'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../../lib/supabase-browser'
import { isAgencyAdmin } from '../../../lib/roles'

const COLUMNS = [
  { key: 'now',   label: 'Now',   hint: 'this week · keep to ~3', dot: 'bg-rose-500' },
  { key: 'next',  label: 'Next',  hint: 'up soon',                dot: 'bg-amber-500' },
  { key: 'later', label: 'Later', hint: 'someday / maybe',        dot: 'bg-sky-500' },
  { key: 'done',  label: 'Done',  hint: 'shipped',                dot: 'bg-emerald-500' },
]
const PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const PRI_STYLE = {
  P0: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  P1: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  P2: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  P3: 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
}

async function authedFetch(url, opts = {}) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` } })
}

export default function RoadmapPage() {
  const [state, setState] = useState('loading') // loading | ok | forbidden | error
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)   // id being edited
  const [adds, setAdds] = useState({})           // per-column quick-add text

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      // role gate
      const prof = await fetch('/api/profile').then(r => r.json()).catch(() => null)
      if (!isAgencyAdmin(prof?.role)) { setState('forbidden'); return }
      const res = await authedFetch('/api/roadmap')
      if (res.status === 401 || res.status === 403) { setState('forbidden'); return }
      if (!res.ok) { setState('error'); return }
      const d = await res.json()
      setItems(d.items || [])
      setState('ok')
    } catch { setState('error') }
  }, [])

  useEffect(() => { load() }, [load])

  async function save(patch) {
    const res = await authedFetch('/api/roadmap', { method: 'POST', body: JSON.stringify(patch) })
    const d = await res.json()
    if (d.item) setItems(prev => {
      const exists = prev.some(i => i.id === d.item.id)
      return exists ? prev.map(i => i.id === d.item.id ? d.item : i) : [...prev, d.item]
    })
    return d.item
  }
  async function remove(id) {
    await authedFetch(`/api/roadmap?id=${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }
  async function quickAdd(status) {
    const title = (adds[status] || '').trim()
    if (!title) return
    setAdds(a => ({ ...a, [status]: '' }))
    await save({ title, status, priority: status === 'done' ? null : 'P2' })
  }

  if (state === 'loading') return <div className="p-8 text-sm text-gray-400">Loading roadmap…</div>
  if (state === 'forbidden') return (
    <div className="p-8 max-w-md"><h1 className="text-lg font-semibold text-gray-900 dark:text-white">Restricted</h1><p className="mt-2 text-sm text-gray-500">The Dev Board is for agency admins.</p></div>
  )
  if (state === 'error') return <div className="p-8 text-sm text-red-500">Couldn’t load the roadmap.</div>

  const byCol = (k) => items.filter(i => i.status === k).sort((a, b) => (a.sort_order - b.sort_order) || a.created_at.localeCompare(b.created_at))

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Dev Board</h1>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Internal</span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Park ideas here instead of jumping tabs mid-task. Keep <b>Now</b> to ~3.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {COLUMNS.map(col => {
          const list = byCol(col.key)
          return (
            <section key={col.key} className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{col.label}</h2>
                  <span className="text-xs text-gray-400">{list.length}</span>
                </div>
                <span className="text-[11px] text-gray-400">{col.hint}</span>
              </div>

              <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                {list.map(it => (
                  <li key={it.id} className="px-4 py-2.5">
                    {editing === it.id ? (
                      <EditRow item={it} onSave={async (p) => { await save({ id: it.id, ...p }); setEditing(null) }} onCancel={() => setEditing(null)} onDelete={() => remove(it.id)} />
                    ) : (
                      <div className="flex items-start gap-2 group">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {it.priority && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRI_STYLE[it.priority] || ''}`}>{it.priority}</span>}
                            <span className={`text-[13px] ${it.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>{it.title}</span>
                            {it.blocked && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">🚧 blocked</span>}
                          </div>
                          {it.notes && <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{it.notes}</p>}
                          {it.blocked && it.blocked_on && <p className="text-[11px] text-rose-500 mt-0.5">waiting on: {it.blocked_on}</p>}
                        </div>
                        {/* quick move + edit */}
                        <select value={it.status} onChange={e => save({ id: it.id, status: e.target.value })}
                          className="text-[11px] border border-gray-200 dark:border-white/10 rounded-md px-1.5 py-1 bg-white dark:bg-[#1e2340] text-gray-600 dark:text-gray-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition">
                          {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                        <button onClick={() => setEditing(it.id)} className="text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition px-1">edit</button>
                      </div>
                    )}
                  </li>
                ))}
                {list.length === 0 && <li className="px-4 py-3 text-xs text-gray-400">Nothing here.</li>}
              </ul>

              {/* quick add */}
              <div className="px-3 py-2.5 border-t border-gray-100 dark:border-white/[0.06]">
                <input
                  value={adds[col.key] || ''}
                  onChange={e => setAdds(a => ({ ...a, [col.key]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') quickAdd(col.key) }}
                  placeholder={`+ Add to ${col.label}…`}
                  className="w-full text-[13px] bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                />
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function EditRow({ item, onSave, onCancel, onDelete }) {
  const [f, setF] = useState({ title: item.title, notes: item.notes || '', priority: item.priority || '', blocked: item.blocked, blocked_on: item.blocked_on || '' })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  return (
    <div className="space-y-2 py-1">
      <input value={f.title} onChange={e => set('title', e.target.value)} className="w-full text-[13px] rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2340] px-2 py-1.5 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Notes (optional)" className="w-full text-[12px] rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2340] px-2 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <div className="flex items-center gap-2 flex-wrap">
        <select value={f.priority} onChange={e => set('priority', e.target.value)} className="text-[12px] border border-gray-200 dark:border-white/10 rounded-md px-1.5 py-1 bg-white dark:bg-[#1e2340] text-gray-700 dark:text-gray-200">
          <option value="">No priority</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300"><input type="checkbox" checked={f.blocked} onChange={e => set('blocked', e.target.checked)} /> Blocked</label>
        {f.blocked && <input value={f.blocked_on} onChange={e => set('blocked_on', e.target.value)} placeholder="waiting on…" className="flex-1 min-w-[120px] text-[12px] rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2340] px-2 py-1 text-gray-700 dark:text-gray-200 focus:outline-none" />}
      </div>
      <div className="flex items-center justify-between pt-0.5">
        <button onClick={onDelete} className="text-[11px] text-rose-500 hover:text-rose-600">Delete</button>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="text-[12px] text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={() => onSave(f)} className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
        </div>
      </div>
    </div>
  )
}
