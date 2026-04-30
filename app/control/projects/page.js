'use client'

import { useEffect, useState } from 'react'

const PRIORITY_META = {
  critical: { label: 'Critical', cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  high:     { label: 'High',     cls: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' },
  medium:   { label: 'Medium',   cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' },
  low:      { label: 'Low',      cls: 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400' },
}
const STATUS_META = {
  active:    { label: 'Active',    cls: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  on_hold:   { label: 'On Hold',   cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' },
  completed: { label: 'Completed', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  archived:  { label: 'Archived',  cls: 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400' },
}
const TYPE_LABELS = { client: 'Client', dev: 'Dev', internal: 'Internal', marketing: 'Marketing' }
const TASK_STATUS = ['todo', 'in_progress', 'done']
const TASK_STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
const TASK_STATUS_CLS = {
  todo:        'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  done:        'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
}
const emptyNewProject = { name: '', description: '', type: 'internal', priority: 'medium', owner: '', created_by: '', due_date: '' }
const emptyTask = { title: '', priority: 'medium', assignee: '', due_date: '' }

export default function ProjectsPage() {
  // List state
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('active')
  const [creating, setCreating]   = useState(false)
  const [newForm, setNewForm]     = useState(emptyNewProject)
  const [newSaving, setNewSaving] = useState(false)
  const [newError, setNewError]   = useState(null)

  // Detail drawer state
  const [project, setProject]         = useState(null)   // selected project (with tasks)
  const [tasks, setTasks]             = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [addingTask, setAddingTask]   = useState(false)
  const [taskForm, setTaskForm]       = useState(emptyTask)
  const [taskSaving, setTaskSaving]   = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [taskSaveMsg, setTaskSaveMsg] = useState(null)

  useEffect(() => { loadList() }, [])

  async function loadList() {
    const res = await fetch('/api/projects')
    const json = await res.json()
    setProjects(json.projects || [])
    setLoading(false)
  }

  async function openProject(p) {
    setProject(p)
    setTasks([])
    setDetailLoading(true)
    const res = await fetch(`/api/projects/${p.id}`)
    const json = await res.json()
    setProject(json.project)
    setTasks((json.project?.project_tasks || []).sort((a, b) => a.sort_order - b.sort_order))
    setDetailLoading(false)
  }

  function closeProject() {
    setProject(null)
    setTasks([])
    setAddingTask(false)
    setEditingTask(null)
    setTaskForm(emptyTask)
  }

  // ── New project ──────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!newForm.name.trim()) return
    setNewSaving(true); setNewError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setProjects(prev => [{ ...json.project, project_tasks: [] }, ...prev])
      setCreating(false); setNewForm(emptyNewProject)
    } catch (e) { setNewError(e.message) }
    finally { setNewSaving(false) }
  }

  // ── Project field patch ──────────────────────────────────────────────────
  async function patchProject(updates) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const json = await res.json()
    if (res.ok) {
      setProject(json.project)
      setProjects(prev => prev.map(p => p.id === json.project.id ? { ...p, ...json.project } : p))
    }
  }

  // ── Tasks ────────────────────────────────────────────────────────────────
  async function addTask() {
    if (!taskForm.title.trim()) return
    setTaskSaving(true)
    const res = await fetch('/api/project-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...taskForm, project_id: project.id, sort_order: tasks.length }),
    })
    const json = await res.json()
    if (res.ok) { setTasks(prev => [...prev, json.task]); setTaskForm(emptyTask); setAddingTask(false) }
    setTaskSaving(false)
  }

  async function patchTask(taskId, updates) {
    const res = await fetch(`/api/project-tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const json = await res.json()
    if (res.ok) {
      setTasks(prev => prev.map(t => t.id === taskId ? json.task : t))
      if (editingTask?.id === taskId) setEditingTask(json.task)
      setTaskSaveMsg('Saved ✓'); setTimeout(() => setTaskSaveMsg(null), 1800)
    }
  }

  async function deleteTask(taskId) {
    await fetch(`/api/project-tasks/${taskId}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== taskId))
    if (editingTask?.id === taskId) setEditingTask(null)
  }

  async function cycleTaskStatus(task) {
    const next = TASK_STATUS[(TASK_STATUS.indexOf(task.status) + 1) % TASK_STATUS.length]
    await patchTask(task.id, { status: next })
  }

  const filtered = projects.filter(p => filter === 'all' ? true : p.status === filter)
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const pct = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track dev, client, and internal projects.</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Project
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-white/10 mb-6">
        {[['active','Active'],['on_hold','On Hold'],['completed','Completed'],['all','All']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${filter === val ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Project cards */}
      {loading ? <p className="text-sm text-gray-400">Loading…</p> : filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-12 text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No projects yet</p>
          <p className="text-xs text-gray-400">Click "New Project" to create one.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(p => {
            const tasks_ = p.project_tasks || []
            const done_ = tasks_.filter(t => t.status === 'done').length
            const pct_ = tasks_.length ? Math.round((done_ / tasks_.length) * 100) : 0
            const pm = PRIORITY_META[p.priority] || PRIORITY_META.medium
            const sm = STATUS_META[p.status] || STATUS_META.active
            return (
              <button key={p.id} onClick={() => openProject(p)} className="text-left bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-sm transition w-full">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{p.name}</h2>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${pm.cls}`}>{pm.label}</span>
                </div>
                {p.description && <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{p.description}</p>}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${sm.cls}`}>{sm.label}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400">{TYPE_LABELS[p.type] || p.type}</span>
                  {p.due_date && <span className="text-[10px] text-gray-400">Due {new Date(p.due_date).toLocaleDateString()}</span>}
                </div>
                {tasks_.length > 0 && (
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1"><span>{done_}/{tasks_.length} tasks</span><span>{pct_}%</span></div>
                    <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct_}%` }} />
                    </div>
                  </div>
                )}
                {p.owner && <p className="text-[10px] text-gray-400 mt-3">Owner: {p.owner}</p>}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Project detail drawer ─────────────────────────────────────────── */}
      {project && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={closeProject} />
          <div className="fixed top-0 right-0 h-full w-[560px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-transparent dark:border-white/5 overflow-hidden">

            {/* Drawer header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className="font-semibold text-gray-900 dark:text-white text-base leading-snug">{project.name}</h2>
                {project.description && <p className="text-xs text-gray-400 mt-1">{project.description}</p>}
              </div>
              <button onClick={closeProject} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <p className="p-6 text-sm text-gray-400">Loading…</p>
              ) : (
                <>
                  {/* Quick settings */}
                  <div className="grid grid-cols-2 gap-3 px-6 py-4 border-b border-gray-100 dark:border-white/5">
                    {[
                      { label: 'Status',   field: 'status',   type: 'select', options: ['active','on_hold','completed','archived'] },
                      { label: 'Priority', field: 'priority', type: 'select', options: ['critical','high','medium','low'] },
                      { label: 'Owner',    field: 'owner',    type: 'text' },
                      { label: 'Due Date', field: 'due_date', type: 'date' },
                    ].map(({ label, field, type, options }) => (
                      <div key={field} className="bg-gray-50 dark:bg-white/5 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                        {type === 'select' ? (
                          <select className="w-full text-xs bg-transparent text-gray-900 dark:text-white focus:outline-none"
                            value={project[field] || ''}
                            onChange={e => patchProject({ [field]: e.target.value })}>
                            {options.map(o => <option key={o} value={o}>{o.replace('_',' ').replace(/^\w/,c=>c.toUpperCase())}</option>)}
                          </select>
                        ) : (
                          <input type={type} className="w-full text-xs bg-transparent text-gray-900 dark:text-white focus:outline-none"
                            value={project[field] || ''}
                            onChange={e => setProject(p => ({ ...p, [field]: e.target.value }))}
                            onBlur={e => patchProject({ [field]: e.target.value })} />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Tasks */}
                  <div>
                    <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-white/5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">Tasks</span>
                        {tasks.length > 0 && <span className="text-xs text-gray-400">{doneTasks}/{tasks.length} done</span>}
                      </div>
                      <button onClick={() => setAddingTask(true)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Add Task
                      </button>
                    </div>

                    {tasks.length > 0 && (
                      <div className="h-1 bg-gray-100 dark:bg-white/5">
                        <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}

                    {/* Inline add task */}
                    {addingTask && (
                      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 bg-blue-50/50 dark:bg-blue-500/5">
                        <input autoFocus placeholder="Task title"
                          className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                          value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTask(false) }} />
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                            value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))}>
                            <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                          </select>
                          <input placeholder="Assignee" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                            value={taskForm.assignee} onChange={e => setTaskForm(p => ({ ...p, assignee: e.target.value }))} />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setAddingTask(false); setTaskForm(emptyTask) }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition">Cancel</button>
                          <button onClick={addTask} disabled={taskSaving || !taskForm.title.trim()} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-60">
                            {taskSaving ? 'Saving…' : 'Add Task'}
                          </button>
                        </div>
                      </div>
                    )}

                    {tasks.length === 0 && !addingTask ? (
                      <p className="px-6 py-8 text-xs text-center text-gray-400">No tasks yet — click "Add Task" to get started.</p>
                    ) : (
                      <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                        {tasks.map(task => {
                          const tpm = PRIORITY_META[task.priority] || PRIORITY_META.medium
                          return (
                            <div key={task.id}
                              className={`flex items-center gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.02] cursor-pointer transition ${task.status === 'done' ? 'opacity-60' : ''}`}
                              onClick={() => setEditingTask(task)}>
                              <button onClick={e => { e.stopPropagation(); cycleTaskStatus(task) }}
                                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${task.status === 'done' ? 'bg-green-500 border-green-500' : task.status === 'in_progress' ? 'border-blue-500' : 'border-gray-300 dark:border-white/20'}`}
                                title="Click to cycle status">
                                {task.status === 'done' && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                {task.status === 'in_progress' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <span className={`text-sm text-gray-900 dark:text-white ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</span>
                                {task.assignee && <span className="ml-2 text-xs text-gray-400">{task.assignee}</span>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {task.due_date && <span className="text-[10px] text-gray-400">{new Date(task.due_date).toLocaleDateString()}</span>}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${tpm.cls}`}>{tpm.label}</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${TASK_STATUS_CLS[task.status]}`}>{TASK_STATUS_LABEL[task.status]}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Task edit panel (nested inside drawer) ───────────────────────── */}
      {editingTask && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEditingTask(null)} />
          <div className="fixed top-0 right-[560px] h-full w-[380px] bg-white dark:bg-[#1a1f3a] shadow-2xl z-50 flex flex-col border-l border-gray-100 dark:border-white/5">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Edit Task</h3>
              <button onClick={() => setEditingTask(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Title</label>
                <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                  value={editingTask.title} onChange={e => setEditingTask(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white resize-none"
                  value={editingTask.description || ''} onChange={e => setEditingTask(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Status</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                    value={editingTask.status} onChange={e => setEditingTask(p => ({ ...p, status: e.target.value }))}>
                    <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Priority</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                    value={editingTask.priority} onChange={e => setEditingTask(p => ({ ...p, priority: e.target.value }))}>
                    <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Assignee</label>
                  <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                    value={editingTask.assignee || ''} onChange={e => setEditingTask(p => ({ ...p, assignee: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Due Date</label>
                  <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                    value={editingTask.due_date || ''} onChange={e => setEditingTask(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
              <button onClick={() => deleteTask(editingTask.id)} className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition">Delete</button>
              <div className="flex items-center gap-2">
                {taskSaveMsg && <span className="text-xs text-green-600 dark:text-green-400">{taskSaveMsg}</span>}
                <button onClick={() => setEditingTask(null)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition">Cancel</button>
                <button onClick={() => patchTask(editingTask.id, { title: editingTask.title, description: editingTask.description, status: editingTask.status, priority: editingTask.priority, assignee: editingTask.assignee, due_date: editingTask.due_date })}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">Save</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── New project drawer ───────────────────────────────────────────── */}
      {creating && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={() => setCreating(false)} />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-transparent dark:border-white/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div><h2 className="font-semibold text-gray-900 dark:text-white">New Project</h2><p className="text-xs text-gray-400">Fill in the details below</p></div>
              <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-sm">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Project Name *</label>
                <input autoFocus className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                  value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') handleCreate() }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white resize-none"
                  value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Type</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                    value={newForm.type} onChange={e => setNewForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="internal">Internal</option><option value="client">Client</option><option value="dev">Dev</option><option value="marketing">Marketing</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Priority</label>
                  <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                    value={newForm.priority} onChange={e => setNewForm(p => ({ ...p, priority: e.target.value }))}>
                    <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Owner</label>
                  <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                    placeholder="e.g. Ryan" value={newForm.owner} onChange={e => setNewForm(p => ({ ...p, owner: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Created By</label>
                  <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                    placeholder="e.g. Ryan" value={newForm.created_by} onChange={e => setNewForm(p => ({ ...p, created_by: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Due Date</label>
                  <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                    value={newForm.due_date} onChange={e => setNewForm(p => ({ ...p, due_date: e.target.value }))} />
                </div>
              </div>
              {newError && <p className="text-xs text-red-500">{newError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition">Cancel</button>
              <button onClick={handleCreate} disabled={newSaving || !newForm.name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
                {newSaving ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
