'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const PRIORITY_META = {
  critical: { label: 'Critical', cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  high:     { label: 'High',     cls: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' },
  medium:   { label: 'Medium',   cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' },
  low:      { label: 'Low',      cls: 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400' },
}

const STATUS_META = {
  active:    { label: 'Active',     cls: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  on_hold:   { label: 'On Hold',    cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' },
  completed: { label: 'Completed',  cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  archived:  { label: 'Archived',   cls: 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400' },
}

const TYPE_LABELS = { client: 'Client', dev: 'Dev', internal: 'Internal', marketing: 'Marketing' }

const emptyForm = { name: '', description: '', type: 'internal', priority: 'medium', owner: '', created_by: '', due_date: '' }

export default function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('active')

  useEffect(() => { load() }, [])

  async function load() {
    const res = await fetch('/api/projects')
    const json = await res.json()
    setProjects(json.projects || [])
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setProjects(prev => [{ ...json.project, project_tasks: [] }, ...prev])
      setCreating(false)
      setForm(emptyForm)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filtered = projects.filter(p => filter === 'all' ? true : p.status === filter)

  const taskCounts = (p) => {
    const tasks = p.project_tasks || []
    const done = tasks.filter(t => t.status === 'done').length
    return { total: tasks.length, done }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track dev, client, and internal projects.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-white/10 mb-6">
        {[['active','Active'],['on_hold','On Hold'],['completed','Completed'],['all','All']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
              filter === val ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >{label}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-12 text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No projects yet</p>
          <p className="text-xs text-gray-400">Click "New Project" to create one.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(p => {
            const { total, done } = taskCounts(p)
            const pct = total ? Math.round((done / total) * 100) : 0
            const pm = PRIORITY_META[p.priority] || PRIORITY_META.medium
            const sm = STATUS_META[p.status] || STATUS_META.active
            return (
              <Link key={p.id} href={`/control/projects/${p.id}`}
                className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-sm transition block"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{p.name}</h2>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${pm.cls}`}>{pm.label}</span>
                </div>
                {p.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{p.description}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${sm.cls}`}>{sm.label}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400">
                    {TYPE_LABELS[p.type] || p.type}
                  </span>
                  {p.due_date && (
                    <span className="text-[10px] text-gray-400">Due {new Date(p.due_date).toLocaleDateString()}</span>
                  )}
                </div>
                {total > 0 && (
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>{done}/{total} tasks</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
                {p.owner && (
                  <p className="text-[10px] text-gray-400 mt-3">Owner: {p.owner}</p>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {/* New Project drawer */}
      {creating && (
        <>
          <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-30" onClick={() => setCreating(false)} />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-transparent dark:border-white/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">New Project</h2>
                <p className="text-xs text-gray-400">Fill in the details below</p>
              </div>
              <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-sm">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Project Name *</label>
                <input autoFocus className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white resize-none"
                  value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Type</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                    value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="internal">Internal</option>
                    <option value="client">Client</option>
                    <option value="dev">Dev</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Priority</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                    value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Owner</label>
                  <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                    placeholder="e.g. Ryan" value={form.owner} onChange={e => setForm(p => ({ ...p, owner: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Created By</label>
                  <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                    placeholder="e.g. Ryan" value={form.created_by} onChange={e => setForm(p => ({ ...p, created_by: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Due Date</label>
                  <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                    value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
