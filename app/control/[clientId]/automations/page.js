'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const NOTIFICATION_KIND = 'lead.notification.email'

const DEFAULT_SUBJECT = 'New lead: {{first_name}} {{last_name}}'
const DEFAULT_BODY =
  'A new lead just came in:\n\n' +
  'Name: {{first_name}} {{last_name}}\n' +
  'Email: {{email}}\n' +
  'Phone: {{phone}}\n' +
  'City/State: {{city}} {{state}}\n' +
  'Funnel: {{funnel_name}}\n\n' +
  '— Source —\n' +
  'utm_source: {{utm_source}}\n' +
  'utm_medium: {{utm_medium}}\n' +
  'utm_campaign: {{utm_campaign}}\n' +
  'utm_content: {{utm_content}}\n' +
  'utm_adgroup: {{utm_adgroup}}\n' +
  'gclid: {{gclid}}\n' +
  'wbraid: {{wbraid}}\n' +
  'device: {{device}}\n' +
  'lp_url: {{lp_url}}\n'

export default function ClientAutomationsPage() {
  const { clientId } = useParams()
  const [tab, setTab] = useState('notifications')
  const [automations, setAutomations] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [recipientInput, setRecipientInput] = useState('')
  const [testingId, setTestingId] = useState(null)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => { if (clientId) load() }, [clientId])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/client-automations?clientId=${clientId}`, { cache: 'no-store' })
    const json = await res.json()
    setAutomations(json.automations || [])
    setLoading(false)
  }

  const notifications = automations.filter(a => a.kind === NOTIFICATION_KIND)

  async function createNotification() {
    const res = await fetch('/api/client-automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        kind: NOTIFICATION_KIND,
        enabled: true,
        config: {
          recipients: [],
          subject: DEFAULT_SUBJECT,
          body: DEFAULT_BODY,
          from_name: 'ConversionHero',
        },
      }),
    })
    const json = await res.json()
    if (json.ok) {
      setAutomations(prev => [...prev, json.automation])
      setEditing(json.automation)
      setRecipientInput('')
    }
  }

  async function toggleEnabled(rule) {
    const next = !rule.enabled
    setAutomations(prev => prev.map(a => a.id === rule.id ? { ...a, enabled: next } : a))
    await fetch(`/api/client-automations/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
  }

  async function saveEditing() {
    if (!editing) return
    setSaving(true)
    setSaveSuccess(false)

    const recipients = (editing.config?.recipients || []).filter(Boolean)
    const config = {
      ...editing.config,
      recipients,
      subject: editing.config?.subject || DEFAULT_SUBJECT,
      body: editing.config?.body || DEFAULT_BODY,
      from_name: editing.config?.from_name || 'ConversionHero',
    }

    const res = await fetch(`/api/client-automations/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, enabled: editing.enabled }),
    })
    if (res.ok) {
      const json = await res.json()
      setAutomations(prev => prev.map(a => a.id === editing.id ? json.automation : a))
      setEditing(json.automation)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 1800)
    }
    setSaving(false)
  }

  async function deleteEditing() {
    if (!editing) return
    if (!confirm('Delete this notification rule?')) return
    await fetch(`/api/client-automations/${editing.id}`, { method: 'DELETE' })
    setAutomations(prev => prev.filter(a => a.id !== editing.id))
    setEditing(null)
  }

  async function sendTest(rule) {
    setTestingId(rule.id)
    setTestResult(null)
    try {
      const res = await fetch(`/api/client-automations/${rule.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      })
      const json = await res.json()
      setTestResult(res.ok ? { id: rule.id, ok: true } : { id: rule.id, ok: false, error: json.error })
    } finally {
      setTestingId(null)
      setTimeout(() => setTestResult(null), 2500)
    }
  }

  function addRecipient() {
    const email = recipientInput.trim()
    if (!email || !editing) return
    const next = [...(editing.config?.recipients || []), email]
    setEditing({ ...editing, config: { ...editing.config, recipients: next } })
    setRecipientInput('')
  }

  function removeRecipient(idx) {
    const next = (editing.config?.recipients || []).filter((_, i) => i !== idx)
    setEditing({ ...editing, config: { ...editing.config, recipients: next } })
  }

  return (
    <div className="p-8 relative">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Automations</h1>
        <p className="text-gray-400 text-sm mt-0.5">Trigger actions when things happen for this client.</p>
      </div>

      <div className="border-b border-gray-200 dark:border-white/10 mb-6">
        <nav className="flex gap-6">
          <button
            onClick={() => setTab('notifications')}
            className={`pb-3 text-sm font-medium border-b-2 transition ${
              tab === 'notifications'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-white'
            }`}
          >
            Notifications
          </button>
        </nav>
      </div>

      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Email when a new lead comes in for this client.
            </p>
            <button
              onClick={createNotification}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              + New notification
            </button>
          </div>

          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm">
            {loading ? (
              <p className="text-gray-400 text-sm p-8">Loading…</p>
            ) : notifications.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-gray-500 dark:text-gray-400 text-sm">No notification rules yet.</p>
                <p className="text-gray-400 text-xs mt-1">Click "New notification" to create one.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-white/5">
                {notifications.map(rule => {
                  const cfg = rule.config || {}
                  const recipients = cfg.recipients || []
                  return (
                    <li key={rule.id} className="px-5 py-4 flex items-center gap-4">
                      <button
                        onClick={() => toggleEnabled(rule)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition flex-shrink-0 ${
                          rule.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-white/10'
                        }`}
                        title={rule.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          rule.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Email on new lead
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {recipients.length === 0
                            ? <span className="text-orange-500">No recipients — add one to start sending</span>
                            : `To: ${recipients.join(', ')}`}
                        </p>
                      </div>

                      {testResult && testResult.id === rule.id && (
                        <span className={`text-xs ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                          {testResult.ok ? 'Sent' : `Failed: ${testResult.error}`}
                        </span>
                      )}

                      <button
                        onClick={() => sendTest(rule)}
                        disabled={testingId === rule.id || recipients.length === 0}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {testingId === rule.id ? 'Sending…' : 'Test'}
                      </button>

                      <button
                        onClick={() => { setEditing(rule); setRecipientInput('') }}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition"
                      >
                        Edit
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
            <p><span className="font-medium text-gray-500 dark:text-gray-400">Contact:</span> <code>{'{{first_name}}'}</code> <code>{'{{last_name}}'}</code> <code>{'{{email}}'}</code> <code>{'{{phone}}'}</code> <code>{'{{city}}'}</code> <code>{'{{state}}'}</code> <code>{'{{zip_code}}'}</code></p>
            <p><span className="font-medium text-gray-500 dark:text-gray-400">Survey:</span> <code>{'{{reason}}'}</code> <code>{'{{fuel}}'}</code> <code>{'{{size}}'}</code> <code>{'{{intent}}'}</code> <code>{'{{system_type}}'}</code> <code>{'{{system_age}}'}</code></p>
            <p><span className="font-medium text-gray-500 dark:text-gray-400">Funnel:</span> <code>{'{{funnel_name}}'}</code> <code>{'{{lp_url}}'}</code></p>
            <p><span className="font-medium text-gray-500 dark:text-gray-400">Source:</span> <code>{'{{utm_source}}'}</code> <code>{'{{utm_medium}}'}</code> <code>{'{{utm_campaign}}'}</code> <code>{'{{utm_content}}'}</code> <code>{'{{utm_adgroup}}'}</code> <code>{'{{gclid}}'}</code> <code>{'{{wbraid}}'}</code> <code>{'{{device}}'}</code></p>
          </div>
        </div>
      )}

      {editing && (
        <>
          <div className="fixed inset-0 bg-black/30 z-30" onClick={() => setEditing(null)} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-[#0f1117] z-40 shadow-2xl flex flex-col border-l border-gray-200 dark:border-white/10">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Edit notification</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Recipients</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(editing.config?.recipients || []).map((r, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1 rounded-full">
                      {r}
                      <button onClick={() => removeRecipient(i)} className="hover:text-blue-900 dark:hover:text-blue-200">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={recipientInput}
                    onChange={e => setRecipientInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient() } }}
                    placeholder="name@company.com"
                    className="flex-1 text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white dark:placeholder-gray-500"
                  />
                  <button
                    onClick={addRecipient}
                    disabled={!recipientInput.trim()}
                    className="text-sm font-medium px-4 py-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">From name</label>
                <input
                  type="text"
                  value={editing.config?.from_name || ''}
                  onChange={e => setEditing({ ...editing, config: { ...editing.config, from_name: e.target.value } })}
                  className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                />
                <p className="text-[11px] text-gray-400 mt-1">Sent from notifications@send.conversionhero.co</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Subject</label>
                <input
                  type="text"
                  value={editing.config?.subject || ''}
                  onChange={e => setEditing({ ...editing, config: { ...editing.config, subject: e.target.value } })}
                  className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Body</label>
                <textarea
                  rows={10}
                  value={editing.config?.body || ''}
                  onChange={e => setEditing({ ...editing, config: { ...editing.config, body: e.target.value } })}
                  className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-white/5 dark:text-white font-mono"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditing({ ...editing, enabled: !editing.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition flex-shrink-0 ${
                    editing.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-white/10'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    editing.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {editing.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/10 flex items-center justify-between">
              <button
                onClick={deleteEditing}
                className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
              >
                Delete
              </button>
              <div className="flex items-center gap-3">
                {saveSuccess && <span className="text-xs text-green-600">Saved</span>}
                <button
                  onClick={() => setEditing(null)}
                  className="text-sm font-medium px-4 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition"
                >
                  Close
                </button>
                <button
                  onClick={saveEditing}
                  disabled={saving}
                  className="text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
