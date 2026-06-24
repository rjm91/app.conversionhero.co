'use client'

import { useEffect, useRef, useState } from 'react'

const KINDS = [
  { value: 'cold_email', label: 'Cold Email' },
  { value: 'ads', label: 'Ads' },
  { value: 'crm', label: 'CRM' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'other', label: 'Other' },
]
const kindLabel = (k) => (KINDS.find((x) => x.value === k) || { label: 'Other' }).label

export default function IntegrationsPage() {
  const [apps, setApps] = useState(null)
  const [err, setErr] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', kind: 'cold_email', api_key: '' })
  const [logoPreview, setLogoPreview] = useState(null)
  const fileRef = useRef(null)

  const load = async () => {
    try {
      const res = await fetch('/api/integrations', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'Failed to load'); return }
      setErr(null); setApps(j.apps || [])
    } catch (e) { setErr(String(e?.message || e)) }
  }
  useEffect(() => { load() }, [])

  const onFile = (e) => {
    const f = e.target.files?.[0]
    setLogoPreview(f ? URL.createObjectURL(f) : null)
  }
  const reset = () => { setForm({ name: '', kind: 'cold_email', api_key: '' }); setLogoPreview(null); if (fileRef.current) fileRef.current.value = ''; setShowForm(false) }

  const create = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name.trim())
      fd.append('kind', form.kind)
      fd.append('api_key', form.api_key.trim())
      const f = fileRef.current?.files?.[0]
      if (f) fd.append('file', f)
      const res = await fetch('/api/integrations', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'Create failed'); setSaving(false); return }
      reset(); await load()
    } catch (e2) { setErr(String(e2?.message || e2)) }
    setSaving(false)
  }

  const remove = async (id, name) => {
    if (!window.confirm(`Remove "${name}"? This deletes the app and its stored key.`)) return
    await fetch(`/api/integrations?id=${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Apps &amp; Integrations</h1>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Connect or Create App
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Register an app (name, logo, API key) so it shows up as a channel. The key is stored securely server-side. Data wiring is added per app.</p>

      {err && <div className="mb-4 text-sm text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{err.includes('Forbidden') ? 'Agency admins only.' : err}</div>}

      {showForm && (
        <form onSubmit={create} className="mb-6 border border-gray-200 dark:border-white/[0.06] rounded-xl bg-white dark:bg-[#111528] p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">App name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Blaztr" required
                className="w-full bg-gray-50 dark:bg-[#0d1020] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Type</label>
              <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                className="w-full bg-gray-50 dark:bg-[#0d1020] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200">
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">API key <span className="font-normal text-gray-400">(optional — stored server-side, never shown again)</span></label>
            <input value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))} type="password" placeholder="paste API key"
              className="w-full bg-gray-50 dark:bg-[#0d1020] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200" />
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0d1020] grid place-items-center overflow-hidden flex-shrink-0">
              {logoPreview ? <img src={logoPreview} alt="" className="w-full h-full object-contain" /> : <span className="text-gray-300 dark:text-gray-600 text-lg">▦</span>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Logo <span className="font-normal text-gray-400">(PNG / JPG / SVG / WebP, ≤5 MB)</span></label>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onFile} className="text-xs text-gray-500 dark:text-gray-400" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save app'}</button>
            <button type="button" onClick={reset} className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancel</button>
          </div>
        </form>
      )}

      {apps === null ? (
        <div className="text-sm text-gray-400 dark:text-gray-500">Loading…</div>
      ) : apps.length === 0 ? (
        <div className="border border-dashed border-gray-200 dark:border-white/10 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No apps yet. Click <b>Connect or Create App</b> to add your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {apps.map((app) => (
            <div key={app.id} className="border border-gray-100 dark:border-white/[0.06] rounded-xl bg-white dark:bg-[#111528] p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-[#0d1020] grid place-items-center overflow-hidden flex-shrink-0">
                {app.logo_url ? <img src={app.logo_url} alt="" className="w-full h-full object-contain" /> : <span className="text-gray-300 dark:text-gray-600">▦</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-gray-900 dark:text-white truncate">{app.name}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500">{kindLabel(app.kind)}</div>
                <span className={`inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${app.has_key ? 'bg-[#34CC93]/10 text-[#1a9e6e] dark:text-[#34CC93]' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>{app.has_key ? 'Connected' : 'No key'}</span>
              </div>
              <button onClick={() => remove(app.id, app.name)} title="Remove" className="text-gray-300 hover:text-rose-500 dark:text-gray-600 dark:hover:text-rose-400 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
