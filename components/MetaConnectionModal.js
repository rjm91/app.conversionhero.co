'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

async function authedFetch(url, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
  })
}

const OAUTH_ERRORS = {
  authorization_denied: 'Facebook authorization was cancelled.',
  ads_read_not_granted: 'Ads reporting permission was not granted. Reconnect and allow Meta Ads access.',
  invalid_state: 'This authorization attempt could not be verified. Close it and try again.',
  expired_state: 'This authorization attempt expired. Please try again.',
  authorization_session_mismatch: 'Sign in again before connecting this account.',
  meta_exchange_failed: 'Meta could not complete authorization. Check the app configuration and try again.',
}

export default function MetaConnectionModal({ clientId, clientName, start, end, onClose, onSaved, allowManual = true }) {
  const [status, setStatus] = useState(null)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [oauthSession, setOauthSession] = useState(null)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const [manualOpen, setManualOpen] = useState(false)
  const [adAccountId, setAdAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [test, setTest] = useState(null)
  const [savedOk, setSavedOk] = useState(false)

  const loadStatus = async () => {
    const response = await fetch(`/api/meta/oauth/status?client_id=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.error || 'Could not load the Meta connection.')
    setStatus(json)
    if (json.connection?.ad_account_id) setAdAccountId(json.connection.ad_account_id)
    return json
  }

  useEffect(() => {
    let cancelled = false
    loadStatus().catch(err => {
      if (!cancelled) {
        setStatus({ configured: false, connected: false, can_manual: false })
        setError(err.message)
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    const receive = async (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'conversionhero:meta-oauth') return
      setOauthBusy(false)
      if (!event.data.ok) {
        setError(OAUTH_ERRORS[event.data.error] || 'Meta authorization did not complete.')
        return
      }
      try {
        const response = await fetch(`/api/meta/oauth/session?state=${encodeURIComponent(event.data.state)}`, { cache: 'no-store' })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Could not load authorized accounts.')
        setOauthSession({ ...json, state: event.data.state })
        const active = (json.accounts || []).filter(a => a.account_status === 1)
        if (active.length === 1) setSelectedAccount(active[0].id)
        else if ((json.accounts || []).length === 1) setSelectedAccount(json.accounts[0].id)
        if (!(json.accounts || []).length) {
          setError('Facebook connected, but it did not return any ad accounts. Confirm this person has access to Contour’s ad account, then reconnect.')
        }
      } catch (err) {
        setError(err.message)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  function startOAuth() {
    setError('')
    setSyncMessage('')
    setOauthSession(null)
    setOauthBusy(true)
    const returnTo = `${window.location.pathname}?tab=settings`
    const url = `/api/meta/oauth/start?client_id=${encodeURIComponent(clientId)}&return_to=${encodeURIComponent(returnTo)}`
    const popup = window.open(url, 'conversionhero-meta-oauth', 'popup=yes,width=620,height=760')
    if (!popup) {
      setOauthBusy(false)
      setError('Your browser blocked the Facebook sign-in window. Allow popups for this site and try again.')
      return
    }
    popup.focus()
  }

  async function finishOAuth() {
    if (!oauthSession?.state || !selectedAccount) return
    setOauthBusy(true)
    setError('')
    try {
      const response = await fetch('/api/meta/oauth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: oauthSession.state, client_id: clientId, ad_account_id: selectedAccount }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not save the Meta connection.')
      await loadStatus()
      setOauthSession(null)
      setSelectedAccount('')
      setSyncMessage(`Connected to ${json.account.name}. Pulling the latest campaign data…`)
      onSaved?.()
      await syncNow(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setOauthBusy(false)
    }
  }

  async function syncNow(closeWhenDone = false) {
    setSyncing(true)
    setError('')
    setSyncMessage('Pulling campaign data from Meta…')
    try {
      const params = new URLSearchParams({ client_id: clientId })
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      const response = await fetch(`/api/sync-meta-ads?${params}`, { cache: 'no-store' })
      const json = await response.json()
      const result = json.results?.find(item => item.client_id === clientId)
      if (!response.ok || json.error || result?.error) throw new Error(result?.error || json.error || 'Meta sync failed.')
      setSyncMessage(`Sync complete — ${result?.synced || 0} campaign-day rows updated.`)
      onSaved?.()
      if (closeWhenDone) onClose()
    } catch (err) {
      setError(err.message)
      setSyncMessage('')
    } finally {
      setSyncing(false)
    }
  }

  const onEdit = setter => value => {
    setter(value)
    setTest(null)
    setSavedOk(false)
    setError('')
  }

  async function runManualTest() {
    setTesting(true)
    setError('')
    setTest(null)
    try {
      const response = await authedFetch('/api/meta-connection', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          ad_account_id: adAccountId,
          access_token: accessToken,
          app_secret: appSecret || null,
          action: 'test',
        }),
      })
      const json = await response.json()
      setTest(json)
      if (!json.ok) setError(json.error || 'Test failed.')
    } catch {
      setError('Test request failed.')
    } finally {
      setTesting(false)
    }
  }

  async function saveManual() {
    setSaving(true)
    setError('')
    try {
      const response = await authedFetch('/api/meta-connection', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          ad_account_id: adAccountId,
          access_token: accessToken,
          app_secret: appSecret || null,
          action: 'save',
        }),
      })
      const json = await response.json()
      if (!response.ok || json.error) throw new Error(json.error || 'Save failed.')
      setSavedOk(true)
      await loadStatus()
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const accounts = oauthSession?.accounts || []
  const effectiveManual = allowManual && status?.can_manual
  const connected = status?.connected && status?.connection
  const expiry = useMemo(() => {
    if (!connected?.token_expires_at) return null
    return new Date(connected.token_expires_at).toLocaleDateString()
  }, [connected?.token_expires_at])

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto bg-white dark:bg-[#1d1e22] rounded-xl shadow-2xl border border-gray-200 dark:border-white/10" onClick={event => event.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Connect Meta Ads</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{clientName || clientId} · reporting access only</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {status === null && <div className="text-sm text-gray-500">Checking the current connection…</div>}

          {connected && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Connected
              </div>
              <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                {connected.account_name || `Ad account ${connected.ad_account_id}`}
                <span className="text-gray-400"> · {connected.ad_account_id}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {connected.connection_method === 'facebook_oauth' ? `Authorized by ${connected.meta_user_name || 'Facebook user'}` : 'Agency-managed connection'}
                {expiry ? ` · token expires ${expiry}` : ''}
              </div>
              <button type="button" onClick={() => syncNow(false)} disabled={syncing}
                className="mt-3 rounded-md border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 disabled:opacity-50">
                {syncing ? 'Syncing…' : 'Sync Meta Ads now'}
              </button>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.025] p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1877F2] text-lg font-bold text-white">f</div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {connected ? 'Change the connected ad account' : 'Continue with Facebook'}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Sign in as a person who can access Contour’s ad account. ConversionHero requests read-only <code>ads_read</code> permission, then lets you choose the exact account.
                </p>
              </div>
            </div>

            {!status?.configured ? (
              <div className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {status?.can_manual
                  ? 'Facebook sign-in needs the Meta App ID and App Secret added to this environment first. The agency fallback is available below.'
                  : 'Facebook sign-in is being configured by ConversionHero. Ask your agency admin to finish the Meta app connection.'}
              </div>
            ) : (
              <button type="button" onClick={startOAuth} disabled={oauthBusy}
                style={{ backgroundColor: 'var(--mission-client-accent, #1877F2)' }}
                className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
                {oauthBusy ? 'Waiting for Facebook…' : connected ? 'Reconnect with Facebook' : 'Continue with Facebook'}
              </button>
            )}
          </div>

          {oauthSession && (
            <div className="rounded-lg border border-gray-200 dark:border-white/10 p-4">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">Choose Contour’s ad account</div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Facebook returned {accounts.length} account{accounts.length === 1 ? '' : 's'} for {oauthSession.meta_user_name || 'this login'}.
              </p>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {accounts.map(account => (
                  <label key={account.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${selectedAccount === account.id ? 'border-[var(--mission-client-accent,#1877F2)] bg-white/[0.05]' : 'border-gray-200 dark:border-white/10'}`}>
                    <input type="radio" name="meta-account" value={account.id} checked={selectedAccount === account.id} onChange={() => setSelectedAccount(account.id)} className="mt-1" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{account.name}</span>
                      <span className="block text-xs text-gray-500">{account.id}{account.business?.name ? ` · ${account.business.name}` : ''}{account.currency ? ` · ${account.currency}` : ''}</span>
                    </span>
                    <span className={`ml-auto text-[10px] uppercase ${account.account_status === 1 ? 'text-emerald-400' : 'text-amber-400'}`}>{account.account_status === 1 ? 'active' : `status ${account.account_status}`}</span>
                  </label>
                ))}
              </div>
              {!!accounts.length && (
                <button type="button" onClick={finishOAuth} disabled={!selectedAccount || oauthBusy}
                  style={{ backgroundColor: 'var(--mission-client-accent, #1877F2)' }}
                  className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  Connect selected account
                </button>
              )}
            </div>
          )}

          {effectiveManual && (
            <div className="border-t border-gray-200 dark:border-white/10 pt-3">
              <button type="button" onClick={() => setManualOpen(value => !value)} className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                {manualOpen ? '▾' : '▸'} Agency fallback: connect with a System User token
              </button>
              {manualOpen && (
                <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-white/[0.025]">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Ad Account ID</span>
                    <input value={adAccountId} onChange={event => onEdit(setAdAccountId)(event.target.value)} placeholder="1234567890" inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:bg-[#25262b] dark:text-white" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">System User access token</span>
                    <div className="relative mt-1">
                      <input value={accessToken} onChange={event => onEdit(setAccessToken)(event.target.value)} type={showToken ? 'text' : 'password'} autoComplete="new-password"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-14 text-sm text-gray-900 dark:border-white/10 dark:bg-[#25262b] dark:text-white" />
                      <button type="button" onClick={() => setShowToken(value => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">{showToken ? 'hide' : 'show'}</button>
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">App Secret <span className="font-normal text-gray-400">(only if required)</span></span>
                    <input value={appSecret} onChange={event => onEdit(setAppSecret)(event.target.value)} type="password" autoComplete="new-password"
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:bg-[#25262b] dark:text-white" />
                  </label>
                  <button type="button" onClick={() => setShowGuide(value => !value)} className="text-[11px] text-gray-500">{showGuide ? '▾ Hide setup' : '▸ System User setup steps'}</button>
                  {showGuide && (
                    <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-gray-500">
                      <li>Assign the client ad account to the ConversionHero Business Portfolio.</li>
                      <li>Assign that ad account to the System User with view/manage campaign access.</li>
                      <li>Generate a token for the ConversionHero Meta app with <b>ads_read</b>.</li>
                    </ol>
                  )}
                  {test?.ok && <div className="text-xs text-emerald-500">Connected to {test.name} · {test.account_status_label}</div>}
                  <div className="flex gap-2">
                    <button type="button" onClick={runManualTest} disabled={!adAccountId.trim() || !accessToken.trim() || testing}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs dark:border-white/15 disabled:opacity-40">{testing ? 'Testing…' : 'Test'}</button>
                    <button type="button" onClick={saveManual} disabled={!test?.ok || saving}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
                    {savedOk && <button type="button" onClick={() => syncNow(false)} disabled={syncing} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Sync now</button>}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{error}</div>}
          {syncMessage && <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{syncMessage}</div>}
        </div>

        <div className="flex justify-end border-t border-gray-100 px-5 py-3 dark:border-white/10">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Close</button>
        </div>
      </div>
    </div>
  )
}
