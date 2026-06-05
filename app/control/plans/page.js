'use client'

import { useEffect, useState, useMemo } from 'react'
import PlanGantt, { nights, catTotal, money } from '../../../components/PlanGantt'

const COLORS = ['#7c5cff', '#2dd4bf', '#fb923c', '#818cf8', '#38bdf8', '#f472b6', '#34d399', '#f5c542']
const CATS = [
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'food', label: 'Food' },
  { key: 'personal', label: 'Personal' },
  { key: 'fun', label: 'Fun' },
]
const emptyForm = { id: null, name: '', city: '', url: '', color: COLORS[0], start_date: '', end_date: '', airbnb: '', food: '', personal: '', fun: '', flight_route: '', flight_date: '', notes: '' }

function formFromPlan(p) {
  const c = p.categories || {}
  return {
    id: p.id, name: p.name || '', city: p.city || '', url: p.url || '', color: p.color || COLORS[0],
    start_date: p.start_date || '', end_date: p.end_date || '',
    airbnb: c.airbnb ?? '', food: c.food ?? '', personal: c.personal ?? '', fun: c.fun ?? '',
    flight_route: p.flight_route || '', flight_date: p.flight_date || '', notes: p.notes || '',
  }
}

export default function PlansPage() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const res = await fetch('/api/plans')
      const json = await res.json()
      setPlans(json.plans || [])
    } catch (e) { /* table may not exist yet */ }
    setLoading(false)
  }

  function openNew() { setForm(emptyForm); setError(null); setDrawer(true) }
  function openEdit(plan) { setForm(formFromPlan(plan)); setError(null); setDrawer(true) }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.start_date || !form.end_date) { setError('Check-in and check-out dates are required'); return }
    if (form.end_date <= form.start_date) { setError('Check-out must be after check-in'); return }
    setSaving(true); setError(null)
    const payload = {
      name: form.name, city: form.city, url: form.url, color: form.color,
      start_date: form.start_date, end_date: form.end_date,
      categories: {
        airbnb: Number(form.airbnb) || 0, food: Number(form.food) || 0,
        personal: Number(form.personal) || 0, fun: Number(form.fun) || 0,
      },
      flight_route: form.flight_route || null,
      flight_date: form.flight_date || null,
      notes: form.notes || null,
    }
    try {
      const url = form.id ? `/api/plans/${form.id}` : '/api/plans'
      const method = form.id ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setPlans(prev => form.id ? prev.map(p => p.id === json.plan.id ? json.plan : p) : [...prev, json.plan])
      setDrawer(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!form.id) return
    if (!confirm('Delete this stay?')) return
    setSaving(true)
    try {
      await fetch(`/api/plans/${form.id}`, { method: 'DELETE' })
      setPlans(prev => prev.filter(p => p.id !== form.id))
      setDrawer(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const stats = useMemo(() => {
    const budget = plans.reduce((a, s) => a + catTotal(s), 0)
    const nts = plans.reduce((a, s) => a + nights(s), 0)
    return { budget, nts, stays: plans.length, perDay: nts ? budget / nts : 0 }
  }, [plans])

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Plans</h1>
          <p className="text-sm text-gray-400 mt-0.5">Your forward plan — where you'll be and what it costs, day by day.</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Stay
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Planned Budget', val: money(stats.budget), color: 'text-green-500' },
          { label: 'Nights', val: stats.nts, color: 'text-gray-900 dark:text-white' },
          { label: 'Stays', val: stats.stays, color: 'text-gray-900 dark:text-white' },
          { label: 'Avg / Day', val: money(stats.perDay), color: 'text-indigo-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 px-5 py-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-2xl font-extrabold ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <PlanGantt stays={plans} today={new Date()} onSelect={openEdit} />
      )}

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="relative w-full max-w-md h-full bg-white dark:bg-[#111528] border-l border-gray-100 dark:border-white/10 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{form.id ? 'Edit Stay' : 'New Stay'}</h2>
              <button onClick={() => setDrawer(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4">
              <Field label="Lodging name">
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Old Town Loft" className={inputCls} />
              </Field>
              <Field label="City">
                <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Scottsdale, AZ" className={inputCls} />
              </Field>
              <Field label="Airbnb / listing link">
                <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://airbnb.com/rooms/…" className={inputCls} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Check-in"><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inputCls} /></Field>
                <Field label="Check-out"><input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={inputCls} /></Field>
              </div>

              <Field label="Color">
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => set('color', c)}
                      className={`w-7 h-7 rounded-lg ${form.color === c ? 'ring-2 ring-offset-2 ring-offset-[#111528] ring-white' : ''}`} style={{ background: c }} />
                  ))}
                </div>
              </Field>

              <Field label="Budget">
                <div className="grid grid-cols-2 gap-3">
                  {CATS.map(c => (
                    <div key={c.key}>
                      <label className="text-[11px] text-gray-400">{c.label}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input type="number" min="0" value={form[c.key]} onChange={e => set(c.key, e.target.value)} placeholder="0" className={inputCls + ' pl-7'} />
                      </div>
                    </div>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Flight in (route)"><input value={form.flight_route} onChange={e => set('flight_route', e.target.value)} placeholder="SAN → PHX" className={inputCls} /></Field>
                <Field label="Flight date"><input type="date" value={form.flight_date} onChange={e => set('flight_date', e.target.value)} className={inputCls} /></Field>
              </div>

              <Field label="Notes">
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={inputCls} />
              </Field>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex items-center gap-2 pt-2">
                <button onClick={save} disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition">
                  {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add stay'}
                </button>
                {form.id && (
                  <button onClick={remove} disabled={saving}
                    className="px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 rounded-lg transition">Delete</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#171B33] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}
