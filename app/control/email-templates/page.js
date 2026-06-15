'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'

// {{variable}} substitution — mirrors lib/email-templates render()
function render(str, vars = {}) {
  return String(str || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [selectedKey, setSelectedKey] = useState(null)
  const [form, setForm] = useState({ subject: '', html: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(null)   // { type: 'ok'|'err', msg }
  const [error, setError] = useState(null)

  const authedFetch = useCallback(async (url, opts = {}) => {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' },
    })
  }, [])

  useEffect(() => {
    (async () => {
      const res = await authedFetch('/api/email-templates')
      if (!res.ok) { setError(res.status === 403 ? 'Agency admins only.' : 'Failed to load templates.'); setLoading(false); return }
      const json = await res.json()
      setTemplates(json.templates || [])
      if (json.templates?.length) {
        setSelectedKey(json.templates[0].key)
        setForm({ subject: json.templates[0].subject, html: json.templates[0].html })
      }
      setLoading(false)
    })()
  }, [authedFetch])

  const selected = templates.find(t => t.key === selectedKey)

  function selectTemplate(t) {
    setSelectedKey(t.key)
    setForm({ subject: t.subject, html: t.html })
    setStatus(null)
  }

  async function handleSave() {
    setSaving(true); setStatus(null)
    const res = await authedFetch('/api/email-templates', { method: 'PUT', body: JSON.stringify({ key: selectedKey, subject: form.subject, html: form.html }) })
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      setTemplates(ts => ts.map(t => t.key === selectedKey ? { ...t, subject: form.subject, html: form.html, customized: true } : t))
      setStatus({ type: 'ok', msg: 'Saved.' })
    } else {
      setStatus({ type: 'err', msg: json.error || 'Save failed.' })
    }
    setSaving(false)
  }

  async function handleSendTest() {
    setSending(true); setStatus(null)
    const res = await authedFetch('/api/email-templates', { method: 'POST', body: JSON.stringify({ key: selectedKey }) })
    const json = await res.json().catch(() => ({}))
    setStatus(res.ok ? { type: 'ok', msg: `Test sent to ${json.sentTo}.` } : { type: 'err', msg: json.error || 'Send failed.' })
    setSending(false)
  }

  const previewHtml = selected ? render(form.html, selected.sample) : ''
  const previewSubject = selected ? render(form.subject, selected.sample) : ''

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Templates</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Preview and edit the system emails your app sends. Changes apply to live sends immediately.</p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : (
        <div className="flex gap-5 items-start">
          {/* Template list */}
          <div className="w-60 flex-shrink-0 space-y-1.5">
            {templates.map(t => (
              <button key={t.key} onClick={() => selectTemplate(t)}
                className={`w-full text-left px-3.5 py-3 rounded-xl border transition ${selectedKey === t.key ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-gray-100 dark:border-white/[0.06] bg-white dark:bg-[#111528] hover:bg-gray-50 dark:hover:bg-[#161b30]'}`}>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{t.description}</div>
                {t.customized && <span className="inline-block mt-1.5 text-[9px] font-bold uppercase tracking-wide text-[#34CC93] bg-[#34CC93]/10 rounded px-1.5 py-0.5">Customized</span>}
              </button>
            ))}
          </div>

          {/* Editor + preview */}
          {selected && (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5 min-w-0">
              {/* Editor */}
              <div className="bg-white dark:bg-[#111528] border border-gray-100 dark:border-white/[0.06] rounded-xl p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Variables</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.variables.map(v => (
                      <code key={v} className="text-[11px] bg-gray-100 dark:bg-[#161b30] text-gray-600 dark:text-gray-300 rounded px-2 py-1">{`{{${v}}}`}</code>
                    ))}
                  </div>
                </div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  className="w-full mb-4 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-100 bg-white dark:bg-[#161b30] outline-none focus:ring-2 focus:ring-blue-500" />
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">HTML</label>
                <textarea value={form.html} onChange={e => setForm(f => ({ ...f, html: e.target.value }))} rows={18}
                  className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 dark:text-gray-100 bg-white dark:bg-[#161b30] outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                <div className="flex items-center gap-3 mt-4">
                  <button onClick={handleSave} disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                  <button onClick={handleSendTest} disabled={sending}
                    className="border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">{sending ? 'Sending…' : 'Send test to me'}</button>
                  {status && <span className={`text-sm ${status.type === 'ok' ? 'text-[#34CC93]' : 'text-red-500'}`}>{status.msg}</span>}
                </div>
              </div>

              {/* Live preview */}
              <div className="bg-white dark:bg-[#111528] border border-gray-100 dark:border-white/[0.06] rounded-xl p-5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Preview</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3"><span className="font-semibold">Subject:</span> {previewSubject}</div>
                <div className="rounded-lg overflow-hidden border border-gray-100 dark:border-white/[0.06] bg-white">
                  <iframe title="preview" srcDoc={previewHtml} className="w-full" style={{ height: 460, border: 'none' }} />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">Rendered with sample data ({Object.entries(selected.sample).map(([k, v]) => `${k}=${v}`).join(', ')}).</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
