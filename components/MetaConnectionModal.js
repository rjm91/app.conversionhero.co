'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

async function authedFetch(url, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` } })
}

export default function MetaConnectionModal({ clientId, clientName, start, end, onClose, onSaved }) {
  const [current, setCurrent] = useState(null)
  const [adAccountId, setAdAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [showToken, setShowToken] = useState(false)

  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [test, setTest] = useState(null)      // { ok, name, account_status_label, active, error }
  const [error, setError] = useState('')
  const [savedOk, setSavedOk] = useState(false)

  useEffect(() => {
    authedFetch(`/api/meta-connection?client_id=${clientId}`)
      .then(r => r.json()).then(d => { setCurrent(d); if (d.ad_account_id) setAdAccountId(d.ad_account_id) })
      .catch(() => {})
  }, [clientId])

  // Editing any field invalidates a prior test result.
  const onEdit = (setter) => (v) => { setter(v); setTest(null); setSavedOk(false); setError('') }

  async function runTest() {
    setTesting(true); setError(''); setTest(null)
    try {
      const res = await authedFetch('/api/meta-connection', { method: 'POST', body: JSON.stringify({ client_id: clientId, ad_account_id: adAccountId, access_token: accessToken, app_secret: appSecret || null, action: 'test' }) })
      const d = await res.json()
      setTest(d)
      if (!d.ok) setError(d.error || 'Test failed.')
    } catch (e) { setError('Test request failed.') }
    setTesting(false)
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await authedFetch('/api/meta-connection', { method: 'POST', body: JSON.stringify({ client_id: clientId, ad_account_id: adAccountId, access_token: accessToken, app_secret: appSecret || null, action: 'save' }) })
      const d = await res.json()
      if (!res.ok || d.error) { setError(d.error || 'Save failed.'); setSaving(false); return }
      setSavedOk(true)
      onSaved && onSaved()
    } catch (e) { setError('Save request failed.') }
    setSaving(false)
  }

  async function syncNow() {
    setSyncing(true)
    try {
      await fetch(`/api/sync-meta-ads?client_id=${clientId}&start=${start}&end=${end}`, { cache: 'no-store' })
      onSaved && onSaved()
    } catch {}
    setSyncing(false)
    onClose()
  }

  const canTest = adAccountId.trim() && accessToken.trim() && !testing
  const canSave = test?.ok && !saving

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-[#161a2e] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Meta Ads connection</h3>
            <p className="text-xs text-gray-400 mt-0.5">{clientName || clientId} · swap the ad account &amp; token without touching the database</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Current */}
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
            {current
              ? <>Currently: ad account <b className="text-gray-700 dark:text-gray-200">{current.ad_account_id || '—'}</b> · token {current.has_token ? 'set' : 'missing'}</>
              : 'Loading current connection…'}
          </div>

          {/* New ad account ID */}
          <label className="block">
            <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300">New Ad Account ID</span>
            <input value={adAccountId} onChange={e => onEdit(setAdAccountId)(e.target.value)} placeholder="e.g. 1234567890"
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2340] px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-[11px] text-gray-400">Just the digits — from Business Settings → Accounts → Ad Accounts.</span>
          </label>

          {/* Access token */}
          <label className="block">
            <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300">New Access Token</span>
            <div className="mt-1 relative">
              <input value={accessToken} onChange={e => onEdit(setAccessToken)(e.target.value)} type={showToken ? 'text' : 'password'} placeholder="System User token (ads_read)"
                className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2340] px-3 py-2 pr-14 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowToken(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 hover:text-gray-600">{showToken ? 'hide' : 'show'}</button>
            </div>
            <span className="text-[11px] text-gray-400">Use a long-lived System User token so it won&apos;t expire.</span>
          </label>

          {/* App secret (optional) */}
          <label className="block">
            <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300">App Secret <span className="text-gray-400 font-normal">(optional)</span></span>
            <input value={appSecret} onChange={e => onEdit(setAppSecret)(e.target.value)} type="password" placeholder="Only if your app enforces appsecret_proof"
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2340] px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>

          {/* Test result */}
          {test?.ok && (
            <div className="rounded-lg px-3 py-2 text-sm bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              ✓ Connected to <b>{test.name}</b> — account status: <b>{test.account_status_label}</b>{!test.active && ' (heads up: not active)'}
            </div>
          )}
          {error && <div className="rounded-lg px-3 py-2 text-sm bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300">{error}</div>}
          {savedOk && <div className="rounded-lg px-3 py-2 text-sm bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300">Saved. Run a sync to pull data for this account.</div>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-white/10 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
          {!savedOk ? (
            <>
              <button onClick={runTest} disabled={!canTest} className="px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-white/15 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-40">
                {testing ? 'Testing…' : 'Test'}
              </button>
              <button onClick={save} disabled={!canSave} title={!test?.ok ? 'Run a successful Test first' : ''} className="px-3.5 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button onClick={syncNow} disabled={syncing} className="px-3.5 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
