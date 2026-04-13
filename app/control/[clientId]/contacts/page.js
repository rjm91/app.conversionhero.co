'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

const statusColors = {
  // Lead Status — yellow = leads, purple = appt set
  'New / Not Yet Contacted': 'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  'Contacted / Working':     'bg-[#FFD024]/10 text-[#b89600] dark:bg-[#FFD024]/10 dark:text-[#FFD024]',
  'Appt Set':                'bg-[#846CC5]/10 text-[#6b52b0] dark:bg-[#846CC5]/10 dark:text-[#846CC5]',
  'Lost':                    'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  'Disqualified':            'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  'Out of Area':             'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  // Appt Status — purple = confirmed, teal = complete
  'NA':                      'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
  'Appt Confirmed':          'bg-[#846CC5]/10 text-[#6b52b0] dark:bg-[#846CC5]/10 dark:text-[#846CC5]',
  'Appt Complete':           'bg-[#22cbe3]/10 text-[#0f9aad] dark:bg-[#22cbe3]/10 dark:text-[#22cbe3]',
  'Appt Lost':               'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  'Appt Disqualified':       'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  // Sale Status — green = sold
  'Proposal Sent':           'bg-[#5b97e6]/10 text-[#3a72c4] dark:bg-[#5b97e6]/10 dark:text-[#5b97e6]',
  'Sold':                    'bg-[#34CC93]/10 text-[#1a9e6e] dark:bg-[#34CC93]/10 dark:text-[#34CC93]',
  'Sale Lost':               'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
}

async function deleteLeads(leadIds) {
  // Delete child rows first, then parent
  await supabase.from('client_lead_meta').delete().in('lead_id', leadIds)
  const { error } = await supabase.from('client_lead').delete().in('lead_id', leadIds)
  if (error) throw error
}

export default function ContactsPage() {
  const { clientId } = useParams()
  const [leads,       setLeads]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [checked,     setChecked]     = useState(new Set())   // multi-select
  const [deleting,    setDeleting]    = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)   // confirm in panel

  useEffect(() => { fetchLeads() }, [clientId])

  async function fetchLeads() {
    const { data, error } = await supabase
      .from('client_lead')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) console.error('Error fetching leads:', error)
    else setLeads(data || [])
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('client_lead')
      .update({
        first_name:  selected.first_name,
        last_name:   selected.last_name,
        email:       selected.email,
        phone:       selected.phone,
        address:     selected.address,
        city:        selected.city,
        state:       selected.state,
        zip_code:    selected.zip_code,
        lead_status:  selected.lead_status,
        appt_status:  selected.appt_status,
        sale_status:  selected.sale_status,
        sale_amount:  selected.sale_amount,
        appt_date:    selected.appt_date,
        appt_time:    selected.appt_time,
        ch_notes:     selected.ch_notes,
      })
      .eq('lead_id', selected.lead_id)

    if (!error) {
      setLeads(prev => prev.map(l => l.lead_id === selected.lead_id ? selected : l))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    }
    setSaving(false)
  }

  // Delete single lead from panel
  async function handleDeleteOne() {
    setDeleting(true)
    try {
      await deleteLeads([selected.lead_id])
      setLeads(prev => prev.filter(l => l.lead_id !== selected.lead_id))
      setSelected(null)
      setConfirmDelete(false)
    } catch (e) {
      console.error('Delete failed:', e)
    }
    setDeleting(false)
  }

  // Delete all checked leads
  async function handleDeleteChecked() {
    setDeleting(true)
    const ids = [...checked]
    try {
      await deleteLeads(ids)
      setLeads(prev => prev.filter(l => !ids.includes(l.lead_id)))
      setChecked(new Set())
    } catch (e) {
      console.error('Delete failed:', e)
    }
    setDeleting(false)
  }

  function toggleCheck(leadId, e) {
    e.stopPropagation()
    setChecked(prev => {
      const next = new Set(prev)
      next.has(leadId) ? next.delete(leadId) : next.add(leadId)
      return next
    })
  }

  function toggleAll() {
    if (checked.size === filtered.length) {
      setChecked(new Set())
    } else {
      setChecked(new Set(filtered.map(l => l.lead_id)))
    }
  }

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    return (
      l.first_name?.toLowerCase().includes(q) ||
      l.last_name?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.city?.toLowerCase().includes(q)
    )
  })

  const allChecked = filtered.length > 0 && checked.size === filtered.length
  const someChecked = checked.size > 0

  return (
    <div className="p-8 relative">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contacts</h1>
          <p className="text-gray-400 text-sm mt-0.5">{leads.length} total leads</p>
        </div>
        <div className="flex items-center gap-3">
          {someChecked && (
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
            placeholder="Search by name, email, phone, city..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2 w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-gray-400 text-sm p-8">Loading contacts...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-sm p-8">No contacts found.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Phone</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Location</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Lead Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Appt Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Sale Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, i) => (
                <tr
                  key={lead.lead_id}
                  onClick={() => { setSelected({ ...lead }); setConfirmDelete(false) }}
                  className={`border-b border-gray-50 dark:border-white/5 hover:bg-blue-50 dark:hover:bg-white/5 cursor-pointer transition ${
                    checked.has(lead.lead_id) ? 'bg-red-50/40 dark:bg-red-500/5' :
                    selected?.lead_id === lead.lead_id ? 'bg-blue-50 dark:bg-white/5' : ''
                  } ${i === filtered.length - 1 ? 'border-0' : ''}`}
                >
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked.has(lead.lead_id)}
                      onChange={e => toggleCheck(lead.lead_id, e)}
                      className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 dark:text-blue-400 text-xs font-semibold">
                          {(lead.first_name?.[0] || '') + (lead.last_name?.[0] || '')}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {lead.first_name} {lead.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{lead.email || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">{lead.phone || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                    {lead.city && lead.state ? `${lead.city}, ${lead.state}` : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    {lead.lead_status ? (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[lead.lead_status] || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                        {lead.lead_status}
                      </span>
                    ) : <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {lead.appt_status ? (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[lead.appt_status] || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                        {lead.appt_status}
                      </span>
                    ) : <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {lead.sale_status ? (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[lead.sale_status] || 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                        {lead.sale_status}
                      </span>
                    ) : <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-400 dark:text-gray-500">
                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
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
          <div className="fixed top-0 right-0 h-full w-[480px] bg-white dark:bg-[#171B33] shadow-2xl z-40 flex flex-col overflow-hidden border-l border-transparent dark:border-white/5 animate-[slideIn_0.25s_ease]">

            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 dark:text-blue-400 font-semibold text-sm">
                    {(selected.first_name?.[0] || '') + (selected.last_name?.[0] || '')}
                  </span>
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">{selected.first_name} {selected.last_name}</h2>
                  <p className="text-xs text-gray-400">{selected.lead_id}</p>
                </div>
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

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Contact Info</p>
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
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Phone</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.phone || ''} onChange={e => setSelected(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Address</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.address || ''} onChange={e => setSelected(p => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">City</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.city || ''} onChange={e => setSelected(p => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">State</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.state || ''} onChange={e => setSelected(p => ({ ...p, state: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Zip Code</label>
                    <input className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                      value={selected.zip_code || ''} onChange={e => setSelected(p => ({ ...p, zip_code: e.target.value }))} />
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
                          sale_status:  val,
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
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
                <textarea rows={4} className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500"
                  placeholder="Add notes about this contact..."
                  value={selected.ch_notes || ''} onChange={e => setSelected(p => ({ ...p, ch_notes: e.target.value }))} />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Source</p>
                <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 space-y-2 text-xs text-gray-500">
                  {[
                    ['UTM Source',   selected.utm_source],
                    ['UTM Medium',   selected.utm_medium],
                    ['UTM Campaign', selected.utm_campaign],
                    ['UTM Ad Group', selected.utm_adgroup],
                    ['Device',       selected.device],
                    ['LP URL',       selected.lp_url],
                  ].map(([label, val]) => val ? (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-gray-400">{label}</span>
                      <span className="text-gray-600 dark:text-gray-300 truncate max-w-[260px] text-right">{val}</span>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* Danger zone */}
              <div className="border border-red-100 dark:border-red-500/20 rounded-xl p-4">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-2">Danger Zone</p>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400 transition font-medium"
                  >
                    Delete this lead…
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-red-600 dark:text-red-400">This will permanently delete the lead and all related data. Are you sure?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteOne}
                        disabled={deleting}
                        className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-50"
                      >
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-3 py-1.5 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Panel Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
              <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : saveSuccess ? '✓ Saved!' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
