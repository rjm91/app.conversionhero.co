'use client'

import { useEffect, useState } from 'react'

const statusColors = {
  // Lead Status
  'New / Not Yet Contacted': 'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  'Contacted / Working':     'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  'Appt Set':                'bg-[#846CC5]/10 text-[#6b52b0] dark:bg-[#846CC5]/10 dark:text-[#846CC5]',
  'Lost':                    'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  'Disqualified':            'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  'Out of Area':             'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  // Appt Status
  'NA':                      'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  'Appt Confirmed':          'bg-[#846CC5]/10 text-[#6b52b0] dark:bg-[#846CC5]/10 dark:text-[#846CC5]',
  'Appt Complete':           'bg-[#22cbe3]/10 text-[#0f9aad] dark:bg-[#22cbe3]/10 dark:text-[#22cbe3]',
  'Appt Lost':               'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  'Appt Disqualified':       'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  // Sale Status
  'Proposal Sent':           'bg-[#5b97e6]/10 text-[#3a72c4] dark:bg-[#5b97e6]/10 dark:text-[#5b97e6]',
  'Sold':                    'bg-[#34CC93]/10 text-[#1a9e6e] dark:bg-[#34CC93]/10 dark:text-[#34CC93]',
  'Sale Lost':               'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
}

function StatusBadge({ value }) {
  if (!value) return <span className="text-gray-400 text-xs">—</span>
  const cls = statusColors[value] || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>{value}</span>
  )
}

export default function AgencyLeadsPage() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [checked, setChecked] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const res = await fetch('/api/agency-leads', { cache: 'no-store' })
    const json = await res.json()
    setLeads(json.leads || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setSaveSuccess(false)
    const payload = {
      first_name: selected.first_name,
      last_name: selected.last_name,
      email: selected.email,
      phone: selected.phone,
      company: selected.company,
      lead_status: selected.lead_status,
      appt_status: selected.appt_status,
      sale_status: selected.sale_status,
      sale_amount: selected.sale_amount,
      appt_date: selected.appt_date,
      appt_time: selected.appt_time,
      ch_notes: selected.ch_notes,
    }
    const res = await fetch(`/api/agency-leads/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const json = await res.json()
      setLeads(prev => prev.map(l => l.id === selected.id ? json.lead : l))
      setSelected(json.lead)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 1800)
    }
    setSaving(false)
  }

  async function deleteIds(ids) {
    await Promise.all(ids.map(id =>
      fetch(`/api/agency-leads/${id}`, { method: 'DELETE' })
    ))
  }

  async function handleDeleteOne() {
    if (!selected) return
    setDeleting(true)
    try {
      await deleteIds([selected.id])
      setLeads(prev => prev.filter(l => l.id !== selected.id))
      setSelected(null)
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeleteChecked() {
    setDeleting(true)
    const ids = [...checked]
    try {
      await deleteIds(ids)
      setLeads(prev => prev.filter(l => !ids.includes(l.id)))
      setChecked(new Set())
    } finally {
      setDeleting(false)
    }
  }

  function toggleCheck(id, e) {
    e.stopPropagation()
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (checked.size === filtered.length) {
      setChecked(new Set())
    } else {
      setChecked(new Set(filtered.map(l => l.id)))
    }
  }

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      l.first_name?.toLowerCase().includes(q) ||
      l.last_name?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.company?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-8 relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leads</h1>
          <p className="text-gray-400 text-sm mt-0.5">{leads.length} total leads from agency funnels</p>
        </div>
        <div className="flex items-center gap-3">
          {checked.size > 0 && (
            <button
              onClick={handleDeleteChecked}
              disabled={deleting}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {deleting ? 'Deleting…' : `Delete ${checked.size} lead${checked.size > 1 ? 's' : ''}`}
            </button>
          )}
          <input
            type="text"
            placeholder="Search by name, email, phone, company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2 w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="text-gray-400 text-sm p-8">Loading leads…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-sm p-8">No leads yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && checked.size === filtered.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Phone</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Company</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Funnel</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Lead Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Appt Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Sale Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap">
              {filtered.map((l, i) => (
                <tr
                  key={l.id}
                  onClick={() => { setSelected(l); setConfirmDelete(false) }}
                  className={`border-b border-gray-50 dark:border-white/5 hover:bg-blue-50 dark:hover:bg-white/5 cursor-pointer transition ${
                    checked.has(l.id) ? 'bg-red-50/40 dark:bg-red-500/5' :
                    selected?.id === l.id ? 'bg-blue-50 dark:bg-white/5' : ''
                  } ${i === filtered.length - 1 ? 'border-0' : ''}`}
                >
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked.has(l.id)}
                      onChange={e => toggleCheck(l.id, e)}
                      className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 dark:text-blue-400 text-xs font-semibold">
                          {(l.first_name?.[0] || '') + (l.last_name?.[0] || '')}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {l.first_name} {l.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{l.email || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{l.phone || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{l.company || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{l.agency_funnels?.name || '—'}</td>
                  <td className="px-4 py-3.5"><StatusBadge value={l.lead_status} /></td>
                  <td className="px-4 py-3.5"><StatusBadge value={l.appt_status} /></td>
                  <td className="px-4 py-3.5"><StatusBadge value={l.sale_status} /></td>
                  <td className="px-4 py-3.5 text-sm text-gray-400 dark:text-gray-500">
                    {l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <>
          <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-30" onClick={() => setSelected(null)} />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col overflow-hidden border-l border-transparent dark:border-white/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{selected.first_name} {selected.last_name}</h2>
                <p className="text-xs text-gray-400">{selected.agency_funnels?.name || 'Agency Lead'}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Contact</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">First Name</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.first_name || ''} onChange={e => setSelected(p => ({ ...p, first_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Last Name</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.last_name || ''} onChange={e => setSelected(p => ({ ...p, last_name: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Email</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.email || ''} onChange={e => setSelected(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Phone</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.phone || ''} onChange={e => setSelected(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Company</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.company || ''} onChange={e => setSelected(p => ({ ...p, company: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Lead Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                      value={selected.lead_status || ''} onChange={e => setSelected(p => ({ ...p, lead_status: e.target.value }))}>
                      <option value="">—</option>
                      <option>New / Not Yet Contacted</option>
                      <option>Contacted / Working</option>
                      <option>Appt Set</option>
                      <option>Lost</option>
                      <option>Disqualified</option>
                      <option>Out of Area</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Appt Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                      value={selected.appt_status || ''} onChange={e => setSelected(p => ({ ...p, appt_status: e.target.value }))}>
                      <option value="">—</option>
                      <option>NA</option>
                      <option>Appt Confirmed</option>
                      <option>Appt Complete</option>
                      <option>Appt Lost</option>
                      <option>Appt Disqualified</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sale Status</label>
                    <select className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e2340] dark:text-white"
                      value={selected.sale_status || ''} onChange={e => {
                        const val = e.target.value
                        setSelected(p => ({
                          ...p,
                          sale_status: val,
                          ...(val === 'Sold' && {
                            lead_status: 'Appt Set',
                            appt_status: 'Appt Complete',
                          }),
                        }))
                      }}>
                      <option value="">—</option>
                      <option>NA</option>
                      <option>Proposal Sent</option>
                      <option>Sold</option>
                      <option>Sale Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sale Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg pl-6 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                        value={selected.sale_amount ?? ''}
                        onChange={e => setSelected(p => ({ ...p, sale_amount: e.target.value === '' ? null : Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Appointment</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Appt Date</label>
                    <input type="date" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.appt_date || ''} onChange={e => setSelected(p => ({ ...p, appt_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Appt Time</label>
                    <input type="time" className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.appt_time || ''} onChange={e => setSelected(p => ({ ...p, appt_time: e.target.value }))} />
                  </div>
                </div>
                {(selected.selected_date || selected.selected_time) && (
                  <p className="text-xs text-gray-400 mt-2">
                    Lead requested: {[selected.selected_date, selected.selected_time].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
                <textarea rows={4} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500"
                  placeholder="Add notes about this lead..."
                  value={selected.ch_notes || ''} onChange={e => setSelected(p => ({ ...p, ch_notes: e.target.value }))} />
              </div>

              {selected.meta && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Source</p>
                  <pre className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 text-[11px] text-gray-600 dark:text-gray-300 overflow-x-auto">
{JSON.stringify(selected.meta, null, 2)}
                  </pre>
                </div>
              )}

              <p className="text-xs text-gray-400">
                Submitted {selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-end gap-2">
              {saveSuccess && (
                <span className="text-xs text-green-600 dark:text-green-400 mr-auto">Saved ✓</span>
              )}
              {confirmDelete ? (
                <>
                  <span className="text-xs text-red-600 dark:text-red-400 mr-auto">Delete this lead?</span>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteOne}
                    disabled={deleting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-60"
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-white/5 border border-red-200 dark:border-red-500/20 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition mr-auto"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
