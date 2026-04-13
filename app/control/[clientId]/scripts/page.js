'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

const STATUS_COLORS = {
  draft:     'bg-[#FFD024]/10 text-[#b89600] dark:text-[#FFD024]',
  in_review: 'bg-[#5b97e6]/10 text-[#3a72c4] dark:text-[#5b97e6]',
  approved:  'bg-[#34CC93]/10 text-[#1a9e6e] dark:text-[#34CC93]',
  completed: 'bg-[#22cbe3]/10 text-[#0f9aad] dark:text-[#22cbe3]',
  archived:  'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
}

const APPROVAL_COLORS = {
  pending:  'bg-[#FFD024]/10 text-[#b89600] dark:text-[#FFD024]',
  approved: 'bg-[#34CC93]/10 text-[#1a9e6e] dark:text-[#34CC93]',
  rejected: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

const EMPTY = {
  client_id:              '',
  vscript_title:          '',
  vscript_status:         'draft',
  vscript_approval_status:'pending',
  vscript_type:           '',
  vscript_category:       '',
  vscript_writer:         '',
  vscript_state:          '',
  vscript_city:           '',
  script_body:            '',
  vscript_launch_date:    '',
  vscript_end_date:       '',
}

export default function ScriptsPage() {
  const { clientId } = useParams()
  const [scripts,  setScripts]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(null)  // null = closed, {} = new, row = edit
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [isNew,    setIsNew]    = useState(false)

  useEffect(() => { fetchScripts() }, [clientId])

  async function fetchScripts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('client_video_scripts')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    else setScripts(data || [])
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      client_id:               clientId,
      vscript_title:           selected.vscript_title,
      vscript_status:          selected.vscript_status,
      vscript_approval_status: selected.vscript_approval_status,
      vscript_type:            selected.vscript_type,
      vscript_category:        selected.vscript_category,
      vscript_writer:          selected.vscript_writer,
      vscript_state:           selected.vscript_state,
      vscript_city:            selected.vscript_city,
      script_body:             selected.script_body,
      vscript_launch_date:     selected.vscript_launch_date || null,
      vscript_end_date:        selected.vscript_end_date    || null,
      updated_at:              new Date().toISOString(),
    }

    if (isNew) {
      const { data, error } = await supabase.from('client_video_scripts').insert([payload]).select().single()
      if (!error) {
        setScripts(prev => [data, ...prev])
        setSelected(data)
        setIsNew(false)
      }
    } else {
      const { error } = await supabase
        .from('client_video_scripts')
        .update(payload)
        .eq('id', selected.id)
      if (!error) setScripts(prev => prev.map(s => s.id === selected.id ? { ...s, ...payload } : s))
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this script permanently?')) return
    await supabase.from('client_video_scripts').delete().eq('id', selected.id)
    setScripts(prev => prev.filter(s => s.id !== selected.id))
    setSelected(null)
  }

  function openNew() {
    setIsNew(true)
    setSelected({ ...EMPTY, client_id: clientId })
  }

  const filtered = scripts.filter(s => {
    const q = search.toLowerCase()
    return (
      s.vscript_title?.toLowerCase().includes(q) ||
      s.vscript_writer?.toLowerCase().includes(q) ||
      s.vscript_city?.toLowerCase().includes(q) ||
      s.vscript_state?.toLowerCase().includes(q) ||
      s.vscript_type?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-8 relative">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scripts</h1>
          <p className="text-gray-400 text-sm mt-0.5">{scripts.length} total scripts</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search scripts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500"
          />
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Script
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-gray-400 text-sm p-8">Loading scripts…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium">No scripts yet</p>
            <p className="text-xs mt-1">Click <strong>New Script</strong> to add one</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Title</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Approval</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Location</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Writer</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Launch Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr
                  key={s.id}
                  onClick={() => { setSelected({ ...s }); setIsNew(false) }}
                  className={`border-b border-gray-50 dark:border-white/5 hover:bg-blue-50 dark:hover:bg-white/5 cursor-pointer transition ${
                    selected?.id === s.id ? 'bg-blue-50 dark:bg-white/5' : ''
                  } ${i === filtered.length - 1 ? 'border-0' : ''}`}
                >
                  <td className="px-6 py-3.5 font-medium text-gray-900 dark:text-white max-w-xs truncate">{s.vscript_title || '—'}</td>
                  <td className="px-4 py-3.5">
                    {s.vscript_status ? (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[s.vscript_status] || 'bg-gray-100 text-gray-500'}`}>
                        {s.vscript_status.replace('_', ' ')}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    {s.vscript_approval_status ? (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${APPROVAL_COLORS[s.vscript_approval_status] || 'bg-gray-100 text-gray-500'}`}>
                        {s.vscript_approval_status}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400">{s.vscript_type || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400">
                    {s.vscript_city && s.vscript_state ? `${s.vscript_city}, ${s.vscript_state}` : s.vscript_state || s.vscript_city || '—'}
                  </td>
                  <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400">{s.vscript_writer || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-400 dark:text-gray-500">
                    {s.vscript_launch_date ? new Date(s.vscript_launch_date).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-out Panel */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-30 animate-[fadeIn_0.2s_ease]" onClick={() => setSelected(null)} />
          <div className="fixed top-0 right-0 h-full w-[600px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col border-l border-transparent dark:border-white/5 animate-[slideIn_0.25s_ease]">

            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5 flex-shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  {isNew ? 'New Script' : (selected.vscript_title || 'Edit Script')}
                </h2>
                {!isNew && <p className="text-xs text-gray-400 mt-0.5">{selected.id}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Title */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">Title</label>
                <input
                  className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                  placeholder="Script title..."
                  value={selected.vscript_title || ''}
                  onChange={e => setSelected(p => ({ ...p, vscript_title: e.target.value }))}
                />
              </div>

              {/* Status row */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">Status</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Script Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                      value={selected.vscript_status || ''} onChange={e => setSelected(p => ({ ...p, vscript_status: e.target.value }))}>
                      <option value="">—</option>
                      <option value="draft">Draft</option>
                      <option value="in_review">In Review</option>
                      <option value="approved">Approved</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Approval</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                      value={selected.vscript_approval_status || ''} onChange={e => setSelected(p => ({ ...p, vscript_approval_status: e.target.value }))}>
                      <option value="">—</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Writer</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      placeholder="Writer name"
                      value={selected.vscript_writer || ''}
                      onChange={e => setSelected(p => ({ ...p, vscript_writer: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Type / Category */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">Classification</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Type</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                      value={selected.vscript_type || ''} onChange={e => setSelected(p => ({ ...p, vscript_type: e.target.value }))}>
                      <option value="">—</option>
                      <option>In-Stream</option>
                      <option>In-Feed</option>
                      <option>Bumper</option>
                      <option>Shorts</option>
                      <option>Performance Max</option>
                      <option>Demand Gen</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Category</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      placeholder="e.g. HVAC, Roofing..."
                      value={selected.vscript_category || ''}
                      onChange={e => setSelected(p => ({ ...p, vscript_category: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">Location</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">State</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      placeholder="e.g. Kentucky"
                      value={selected.vscript_state || ''}
                      onChange={e => setSelected(p => ({ ...p, vscript_state: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">City</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      placeholder="e.g. Louisville"
                      value={selected.vscript_city || ''}
                      onChange={e => setSelected(p => ({ ...p, vscript_city: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">Dates</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Launch Date</label>
                    <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.vscript_launch_date || ''}
                      onChange={e => setSelected(p => ({ ...p, vscript_launch_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">End Date</label>
                    <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.vscript_end_date || ''}
                      onChange={e => setSelected(p => ({ ...p, vscript_end_date: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Script Body */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">Script Body</label>
                <textarea
                  rows={14}
                  className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500 font-mono leading-relaxed"
                  placeholder="Paste or write the full script here..."
                  value={selected.script_body || ''}
                  onChange={e => setSelected(p => ({ ...p, script_body: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">{(selected.script_body || '').length} characters</p>
              </div>

              {/* Danger zone — only on existing scripts */}
              {!isNew && (
                <div className="border border-red-100 dark:border-red-500/20 rounded-xl p-4">
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-2">Danger Zone</p>
                  <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400 transition font-medium">
                    Delete this script…
                  </button>
                </div>
              )}

            </div>

            {/* Panel Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-between flex-shrink-0">
              <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50"
              >
                {saving ? 'Saving…' : saved ? '✓ Saved!' : isNew ? 'Create Script' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
