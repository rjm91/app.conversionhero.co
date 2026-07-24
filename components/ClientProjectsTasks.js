'use client'

// Projects & Tasks for a single client, modeled on the agency Projects page
// (app/control/projects/page.js). Scoped to one client_id and designed to sit
// inside a dashboard Section. New projects are auto-tagged to this client, so
// they also show up in the agency-wide Projects view and vice-versa.

import { useEffect, useState, useMemo } from 'react'

const PRIORITY_META = {
  critical: { label: 'Critical', cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  high:     { label: 'High',     cls: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' },
  medium:   { label: 'Medium',   cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' },
  low:      { label: 'Low',      cls: 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400' },
}
const STATUS_META = {
  active:    { label: 'Active',    dot: 'bg-green-500' },
  on_hold:   { label: 'On Hold',   dot: 'bg-yellow-400' },
  completed: { label: 'Completed', dot: 'bg-indigo-400' },
  archived:  { label: 'Archived',  dot: 'bg-gray-400' },
}
const STATUS_ORDER = ['active', 'on_hold', 'completed', 'archived']
const TYPE_LABELS = { client: 'Client', dev: 'Dev', internal: 'Internal', marketing: 'Marketing' }
const TASK_STATUS = ['todo', 'in_progress', 'done']
const TASK_STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
const TASK_STATUS_CLS = {
  todo:        'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  done:        'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
}

export default function ClientProjectsTasks({ clientId }) {
  const emptyNewProject = { name: '', description: '', type: 'client', priority: 'medium', owner: '', created_by: '', due_date: '' }
  const emptyTask = { title: '', priority: 'medium', assignee: '', due_date: '' }

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  const [openGroups, setOpenGroups] = useState(new Set(['active']))
  const [expandedProjectId, setExpandedProjectId] = useState(null)
  const [expandedTasks, setExpandedTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)

  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState(emptyNewProject)
  const [newSaving, setNewSaving] = useState(false)
  const [newError, setNewError] = useState(null)

  const [editProject, setEditProject] = useState(null)

  const [addingTaskFor, setAddingTaskFor] = useState(null)
  const [taskForm, setTaskForm] = useState(emptyTask)
  const [taskSaving, setTaskSaving] = useState(false)

  const [editingTask, setEditingTask] = useState(null)
  const [taskSaveMsg, setTaskSaveMsg] = useState(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadList() }, [clientId])

  async function loadList() {
    setLoading(true)
    const res = await fetch(`/api/projects?client_id=${encodeURIComponent(clientId)}`)
    const json = await res.json()
    setProjects(json.projects || [])
    setLoading(false)
  }

  const grouped = useMemo(() => {
    const g = {}
    STATUS_ORDER.forEach(s => { g[s] = [] })
    projects.forEach(p => { const s = g[p.status] ? p.status : 'active'; g[s].push(p) })
    return g
  }, [projects])

  const stats = useMemo(() => ({
    total: projects.length,
    active: (grouped.active || []).length,
    on_hold: (grouped.on_hold || []).length,
    completed: (grouped.completed || []).length,
  }), [projects, grouped])

  function toggleGroup(status) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
      return next
    })
  }

  async function toggleProject(p) {
    if (expandedProjectId === p.id) {
      setExpandedProjectId(null); setExpandedTasks([]); setAddingTaskFor(null); return
    }
    setExpandedProjectId(p.id); setExpandedTasks([]); setTasksLoading(true); setAddingTaskFor(null)
    const res = await fetch(`/api/projects/${p.id}`)
    const json = await res.json()
    const proj = json.project
    if (proj) {
      setExpandedTasks((proj.project_tasks || []).sort((a, b) => a.sort_order - b.sort_order))
      setProjects(prev => prev.map(x => x.id === proj.id ? { ...x, ...proj } : x))
    }
    setTasksLoading(false)
  }

  async function handleCreate() {
    if (!newForm.name.trim()) return
    setNewSaving(true); setNewError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newForm, client_id: clientId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setProjects(prev => [{ ...json.project, project_tasks: [] }, ...prev])
      setCreating(false); setNewForm(emptyNewProject)
    } catch (e) { setNewError(e.message) }
    finally { setNewSaving(false) }
  }

  async function patchProject(id, updates) {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const json = await res.json()
    if (res.ok) {
      setEditProject(json.project)
      setProjects(prev => prev.map(p => p.id === json.project.id ? { ...p, ...json.project } : p))
    }
  }

  async function addTask(projectId) {
    if (!taskForm.title.trim()) return
    setTaskSaving(true)
    const res = await fetch('/api/project-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...taskForm, project_id: projectId, sort_order: expandedTasks.length }),
    })
    const json = await res.json()
    if (res.ok) {
      setExpandedTasks(prev => [...prev, json.task])
      setProjects(prev => prev.map(p => p.id === projectId
        ? { ...p, project_tasks: [...(p.project_tasks || []), json.task] } : p))
      setTaskForm(emptyTask); setAddingTaskFor(null)
    }
    setTaskSaving(false)
  }

  async function patchTask(taskId, updates) {
    const res = await fetch(`/api/project-tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const json = await res.json()
    if (res.ok) {
      setExpandedTasks(prev => prev.map(t => t.id === taskId ? json.task : t))
      if (editingTask?.id === taskId) setEditingTask(json.task)
      setTaskSaveMsg('Saved'); setTimeout(() => setTaskSaveMsg(null), 1800)
      setProjects(prev => prev.map(p => p.id === expandedProjectId
        ? { ...p, project_tasks: (p.project_tasks || []).map(t => t.id === taskId ? json.task : t) } : p))
    }
  }

  async function deleteTask(taskId) {
    await fetch(`/api/project-tasks/${taskId}`, { method: 'DELETE' })
    setExpandedTasks(prev => prev.filter(t => t.id !== taskId))
    if (editingTask?.id === taskId) setEditingTask(null)
    setProjects(prev => prev.map(p => p.id === expandedProjectId
      ? { ...p, project_tasks: (p.project_tasks || []).filter(t => t.id !== taskId) } : p))
  }

  async function cycleTaskStatus(task) {
    const next = TASK_STATUS[(TASK_STATUS.indexOf(task.status) + 1) % TASK_STATUS.length]
    await patchTask(task.id, { status: next })
  }

  return (
    <div>
      {/* Toolbar: stat chips + New Project */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-white/[0.06] flex-wrap">
        <div className="flex items-center gap-4 text-sm flex-1 flex-wrap">
          <span className="text-gray-500 dark:text-gray-400"><span className="font-bold text-gray-900 dark:text-white">{stats.total}</span> total</span>
          <span className="text-gray-500 dark:text-gray-400"><span className="font-bold text-green-500">{stats.active}</span> active</span>
          <span className="text-gray-500 dark:text-gray-400"><span className="font-bold text-yellow-500">{stats.on_hold}</span> on hold</span>
          <span className="text-gray-500 dark:text-gray-400"><span className="font-bold text-indigo-400">{stats.completed}</span> completed</span>
        </div>
        <button onClick={() => { setNewForm(emptyNewProject); setCreating(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Project
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 p-6">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-400">No projects yet for this client.</p>
          <button onClick={() => { setNewForm(emptyNewProject); setCreating(true) }}
            className="mt-3 text-xs text-gray-400 border border-dashed border-gray-300 dark:border-white/10 px-3 py-1.5 rounded hover:text-blue-500 hover:border-blue-500 transition">
            + Create the first project
          </button>
        </div>
      ) : (
        <div>
          {STATUS_ORDER.map(status => {
            const group = grouped[status] || []
            if (group.length === 0) return null
            const sm = STATUS_META[status]
            const isOpen = openGroups.has(status)
            return (
              <div key={status} className="border-b border-gray-100 dark:border-white/[0.04] last:border-b-0">
                <button onClick={() => toggleGroup(status)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition">
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <div className={`w-2.5 h-2.5 rounded-full ${sm.dot}`} />
                  <span className="text-sm font-bold text-gray-900 dark:text-white flex-1 text-left">{sm.label}</span>
                  <span className="text-xs text-gray-400 font-semibold bg-gray-100 dark:bg-white/5 px-2.5 py-0.5 rounded-full">{group.length} project{group.length !== 1 ? 's' : ''}</span>
                </button>

                {isOpen && group.map(p => {
                  const tasks_ = p.project_tasks || []
                  const done_ = tasks_.filter(t => t.status === 'done').length
                  const pct_ = tasks_.length ? Math.round((done_ / tasks_.length) * 100) : 0
                  const pm = PRIORITY_META[p.priority] || PRIORITY_META.medium
                  const isExpanded = expandedProjectId === p.id
                  return (
                    <div key={p.id}>
                      <div className={`flex items-center gap-3 px-5 py-3 pl-14 cursor-pointer transition border-t border-gray-50 dark:border-white/[0.03] hover:bg-gray-50 dark:hover:bg-white/[0.02] ${isExpanded ? 'bg-blue-50/50 dark:bg-blue-500/[0.04]' : ''}`}
                        onClick={() => toggleProject(p)}>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1 min-w-0 truncate">{p.name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pm.cls}`}>{pm.label}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400">{TYPE_LABELS[p.type] || p.type}</span>
                          {p.owner && <span className="text-[11px] text-gray-400 hidden sm:inline">{p.owner}</span>}
                          {p.due_date && <span className="text-[11px] text-gray-400 hidden sm:inline">Due {new Date(p.due_date).toLocaleDateString()}</span>}
                          {tasks_.length > 0 && (
                            <>
                              <div className="w-14 h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct_}%` }} /></div>
                              <span className="text-[10px] text-gray-400 font-semibold w-8 text-right">{done_}/{tasks_.length}</span>
                            </>
                          )}
                          <button onClick={e => { e.stopPropagation(); setEditProject(p) }}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Edit project">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="bg-black/5 dark:bg-black/15">
                          {tasksLoading ? (
                            <p className="px-14 py-4 text-xs text-gray-400">Loading tasks…</p>
                          ) : expandedTasks.length === 0 && addingTaskFor !== p.id ? (
                            <div className="px-14 py-4 flex items-center gap-3">
                              <span className="text-xs text-gray-400">No tasks yet</span>
                              <button onClick={() => { setAddingTaskFor(p.id); setTaskForm(emptyTask) }}
                                className="text-xs text-gray-400 border border-dashed border-gray-300 dark:border-white/10 px-3 py-1 rounded hover:text-blue-500 hover:border-blue-500 transition">+ Add task</button>
                            </div>
                          ) : (
                            <>
                              {expandedTasks.map(task => (
                                <div key={task.id}
                                  className={`flex items-center gap-3 px-5 py-2.5 pl-20 border-b border-gray-100/50 dark:border-white/[0.03] hover:bg-white/5 transition cursor-pointer ${task.status === 'done' ? 'opacity-60' : ''}`}
                                  onClick={() => setEditingTask(task)}>
                                  <button onClick={e => { e.stopPropagation(); cycleTaskStatus(task) }}
                                    className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${task.status === 'done' ? 'bg-green-500 border-green-500' : task.status === 'in_progress' ? 'border-blue-500' : 'border-gray-300 dark:border-white/20'}`}>
                                    {task.status === 'done' && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    {task.status === 'in_progress' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                  </button>
                                  <span className={`text-sm flex-1 text-gray-700 dark:text-gray-300 ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</span>
                                  {task.assignee && <span className="text-[11px] text-gray-400">{task.assignee}</span>}
                                  {task.due_date && <span className="text-[11px] text-gray-400">{new Date(task.due_date).toLocaleDateString()}</span>}
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${TASK_STATUS_CLS[task.status]}`}>{TASK_STATUS_LABEL[task.status]}</span>
                                </div>
                              ))}
                              {addingTaskFor === p.id ? (
                                <div className="px-20 py-3">
                                  <input autoFocus placeholder="Task title"
                                    className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                                    value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') addTask(p.id); if (e.key === 'Escape') setAddingTaskFor(null) }} />
                                  <div className="flex gap-2 justify-end">
                                    <button onClick={() => { setAddingTaskFor(null); setTaskForm(emptyTask) }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition">Cancel</button>
                                    <button onClick={() => addTask(p.id)} disabled={taskSaving || !taskForm.title.trim()} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-60">{taskSaving ? 'Saving…' : 'Add Task'}</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="px-20 py-2">
                                  <button onClick={() => { setAddingTaskFor(p.id); setTaskForm(emptyTask) }}
                                    className="text-[11px] text-gray-400 border border-dashed border-gray-300 dark:border-white/10 px-3 py-1 rounded hover:text-blue-500 hover:border-blue-500 transition">+ Add task</button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* Edit project drawer */}
      {editProject && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={() => setEditProject(null)} />
          <div className="fixed top-0 right-0 h-full w-[480px] max-w-full bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-transparent dark:border-white/5">
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className="font-semibold text-gray-900 dark:text-white text-base">{editProject.name}</h2>
                {editProject.description && <p className="text-xs text-gray-400 mt-1">{editProject.description}</p>}
              </div>
              <button onClick={() => setEditProject(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Status', field: 'status', type: 'select', options: ['active', 'on_hold', 'completed', 'archived'] },
                  { label: 'Priority', field: 'priority', type: 'select', options: ['critical', 'high', 'medium', 'low'] },
                  { label: 'Owner', field: 'owner', type: 'text' },
                  { label: 'Due Date', field: 'due_date', type: 'date' },
                ].map(({ label, field, type, options }) => (
                  <div key={field} className="bg-gray-50 dark:bg-white/5 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                    {type === 'select' ? (
                      <select className="w-full text-xs bg-transparent text-gray-900 dark:text-white focus:outline-none"
                        value={editProject[field] || ''} onChange={e => patchProject(editProject.id, { [field]: e.target.value })}>
                        {options.map(o => <option key={o} value={o}>{o.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</option>)}
                      </select>
                    ) : (
                      <input type={type} className="w-full text-xs bg-transparent text-gray-900 dark:text-white focus:outline-none"
                        value={editProject[field] || ''} onChange={e => setEditProject(p => ({ ...p, [field]: e.target.value }))}
                        onBlur={e => patchProject(editProject.id, { [field]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Description</label>
                <textarea rows={3} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white resize-none"
                  value={editProject.description || ''} onChange={e => setEditProject(p => ({ ...p, description: e.target.value }))}
                  onBlur={e => patchProject(editProject.id, { description: e.target.value })} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Task edit panel */}
      {editingTask && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={() => setEditingTask(null)} />
          <div className="fixed top-0 right-0 h-full w-[380px] max-w-full bg-white dark:bg-[#1a1f3a] shadow-2xl z-40 flex flex-col border-l border-gray-100 dark:border-white/5">
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

      {/* New project drawer */}
      {creating && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={() => setCreating(false)} />
          <div className="fixed top-0 right-0 h-full w-[480px] max-w-full bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-transparent dark:border-white/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div><h2 className="font-semibold text-gray-900 dark:text-white">New Project</h2><p className="text-xs text-gray-400">For this client</p></div>
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
                    <option value="client">Client</option><option value="marketing">Marketing</option><option value="dev">Dev</option><option value="internal">Internal</option>
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
              <button onClick={handleCreate} disabled={newSaving || !newForm.name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60">{newSaving ? 'Creating…' : 'Create Project'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
