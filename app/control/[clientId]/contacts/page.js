'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

const statusColors = {
  New:         'bg-blue-50 text-blue-600',
  Contacted:   'bg-yellow-50 text-yellow-600',
  Qualified:   'bg-purple-50 text-purple-600',
  Booked:      'bg-indigo-50 text-indigo-600',
  Completed:   'bg-green-50 text-green-600',
  Lost:        'bg-red-50 text-red-600',
}

export default function ContactsPage() {
  const { clientId } = useParams()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    fetchLeads()
  }, [clientId])

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
        first_name:   selected.first_name,
        last_name:    selected.last_name,
        email:        selected.email,
        phone:        selected.phone,
        address:      selected.address,
        city:         selected.city,
        state:        selected.state,
        zip_code:     selected.zip_code,
        lead_status:  selected.lead_status,
        appt_status:  selected.appt_status,
        sale_status:  selected.sale_status,
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

  return (
    <div className="p-8 relative">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-400 text-sm mt-0.5">{leads.length} total leads</p>
        </div>
        <input
          type="text"
          placeholder="Search by name, email, phone, city..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-4 py-2 w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-gray-400 text-sm p-8">Loading contacts...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-sm p-8">No contacts found.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Phone</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Location</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Lead Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Appt Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, i) => (
                <tr
                  key={lead.lead_id}
                  onClick={() => setSelected({ ...lead })}
                  className={`border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition ${
                    selected?.lead_id === lead.lead_id ? 'bg-blue-50' : ''
                  } ${i === filtered.length - 1 ? 'border-0' : ''}`}
                >
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 text-xs font-semibold">
                          {(lead.first_name?.[0] || '') + (lead.last_name?.[0] || '')}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {lead.first_name} {lead.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-gray-500">{lead.email || '—'}</td>
                  <td className="px-6 py-3.5 text-sm text-gray-500">{lead.phone || '—'}</td>
                  <td className="px-6 py-3.5 text-sm text-gray-500">
                    {lead.city && lead.state ? `${lead.city}, ${lead.state}` : '—'}
                  </td>
                  <td className="px-6 py-3.5">
                    {lead.lead_status ? (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[lead.lead_status] || 'bg-gray-100 text-gray-500'}`}>
                        {lead.lead_status}
                      </span>
                    ) : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="px-6 py-3.5">
                    {lead.appt_status ? (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[lead.appt_status] || 'bg-gray-100 text-gray-500'}`}>
                        {lead.appt_status}
                      </span>
                    ) : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="px-6 py-3.5 text-sm text-gray-400">
                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-out Panel Overlay */}
      {selected && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-30"
            onClick={() => setSelected(null)}
          />
          <div className="fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-40 flex flex-col overflow-hidden">

            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 font-semibold text-sm">
                    {(selected.first_name?.[0] || '') + (selected.last_name?.[0] || '')}
                  </span>
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">{selected.first_name} {selected.last_name}</h2>
                  <p className="text-xs text-gray-400">{selected.lead_id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600 transition p-1.5 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Contact Info */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Contact Info</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">First Name</label>
                    <input
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.first_name || ''}
                      onChange={e => setSelected(p => ({ ...p, first_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Last Name</label>
                    <input
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.last_name || ''}
                      onChange={e => setSelected(p => ({ ...p, last_name: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Email</label>
                    <input
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.email || ''}
                      onChange={e => setSelected(p => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Phone</label>
                    <input
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.phone || ''}
                      onChange={e => setSelected(p => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Address</label>
                    <input
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.address || ''}
                      onChange={e => setSelected(p => ({ ...p, address: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">City</label>
                    <input
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.city || ''}
                      onChange={e => setSelected(p => ({ ...p, city: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">State</label>
                    <input
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.state || ''}
                      onChange={e => setSelected(p => ({ ...p, state: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Zip Code</label>
                    <input
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.zip_code || ''}
                      onChange={e => setSelected(p => ({ ...p, zip_code: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Lead Status</label>
                    <select
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.lead_status || ''}
                      onChange={e => setSelected(p => ({ ...p, lead_status: e.target.value }))}
                    >
                      <option value="">—</option>
                      <option>New</option>
                      <option>Contacted</option>
                      <option>Qualified</option>
                      <option>Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Appt Status</label>
                    <select
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.appt_status || ''}
                      onChange={e => setSelected(p => ({ ...p, appt_status: e.target.value }))}
                    >
                      <option value="">—</option>
                      <option>Booked</option>
                      <option>Completed</option>
                      <option>No Show</option>
                      <option>Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Sale Status</label>
                    <select
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.sale_status || ''}
                      onChange={e => setSelected(p => ({ ...p, sale_status: e.target.value }))}
                    >
                      <option value="">—</option>
                      <option>Sold</option>
                      <option>Not Sold</option>
                      <option>Pending</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Appointment */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Appointment</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Appt Date</label>
                    <input
                      type="date"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.appt_date || ''}
                      onChange={e => setSelected(p => ({ ...p, appt_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Appt Time</label>
                    <input
                      type="time"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selected.appt_time || ''}
                      onChange={e => setSelected(p => ({ ...p, appt_time: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
                <textarea
                  rows={4}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Add notes about this contact..."
                  value={selected.ch_notes || ''}
                  onChange={e => setSelected(p => ({ ...p, ch_notes: e.target.value }))}
                />
              </div>

              {/* Source Info (read-only) */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Source</p>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs text-gray-500">
                  {[
                    ['UTM Source', selected.utm_source],
                    ['UTM Medium', selected.utm_medium],
                    ['UTM Campaign', selected.utm_campaign],
                    ['UTM Ad Group', selected.utm_adgroup],
                    ['Device', selected.device],
                    ['LP URL', selected.lp_url],
                  ].map(([label, val]) => val ? (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-gray-400">{label}</span>
                      <span className="text-gray-600 truncate max-w-[260px] text-right">{val}</span>
                    </div>
                  ) : null)}
                </div>
              </div>

            </div>

            {/* Panel Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setSelected(null)}
                className="text-sm text-gray-400 hover:text-gray-600 transition"
              >
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
