'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const chorusDataGroups = [
  {
    title: 'Customer & order data',
    detail: 'Orders, order items, leads, and payments — including contact details, addresses, order status, notes, invoice links, and UTM attribution.',
  },
  {
    title: 'Financial & P&L data',
    detail: 'Daily P&L, channel P&L, revenue, COGS, ad spend, discounts, refunds, margins, and attribution.',
  },
  {
    title: 'Marketing performance',
    detail: 'Google Ads campaigns, ad groups, and ads; Meta campaigns; Klaviyo campaigns; and funnel performance.',
  },
  {
    title: 'Operations & Mission Control',
    detail: 'Materials, SKUs, BOMs, calendar events, assets, video scripts, and Mission Control findings, decisions, and policies.',
  },
]

const chorusTools = [
  ['get_daily_pnl', 'One locked business-day P&L with blended and per-channel totals.'],
  ['get_pnl_range', 'Daily P&L trends for a selected date range.'],
  ['list_tables', 'The 22 ShieldTech tables available to the agent.'],
  ['query_table', 'A filtered, read-only query over the approved ShieldTech tables.'],
]

export default function SettingsPage() {
  const { clientId } = useParams()
  const [email,     setEmail]    = useState('')
  const [password,  setPassword] = useState('')
  const [confirm,   setConfirm]  = useState('')
  const [pwSaved,   setPwSaved]  = useState(false)
  const [pwError,   setPwError]  = useState('')

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('ca_user') || '{}')
      setEmail(stored.email || '')
    } catch {}
  }, [])

  function handlePasswordSave(e) {
    e.preventDefault()
    setPwError('')
    if (!password) return
    if (password !== confirm) { setPwError('Passwords do not match.'); return }
    if (password.length < 8)  { setPwError('Password must be at least 8 characters.'); return }
    // Placeholder — wire to Supabase auth when real auth is implemented
    setPwSaved(true)
    setPassword('')
    setConfirm('')
    setTimeout(() => setPwSaved(false), 2000)
  }

  return (
    <div className="p-8 max-w-2xl">

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Manage your account preferences</p>
      </div>

      {/* Account */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Account</h2>
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5">
          <div className="flex items-center px-6 py-4 border-b border-gray-100 dark:border-white/5">
            <div className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Email</div>
            <p className="text-sm text-gray-900 dark:text-white">{email || '—'}</p>
          </div>
          <div className="flex items-center px-6 py-4">
            <div className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Role</div>
            <span className="text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full">Admin</span>
          </div>
        </div>
      </section>

      {/* Password */}
      <section className={clientId === 'ch069' ? 'mb-8' : ''}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Password</h2>
        <form onSubmit={handlePasswordSave} className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">

          <div className="flex items-center px-6 py-4 gap-6">
            <label className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">New password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 outline-none border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center px-6 py-4 gap-6">
            <label className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Confirm</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 outline-none border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {pwError && (
            <div className="px-6 py-3 text-sm text-red-500">{pwError}</div>
          )}

          <div className="px-6 py-4 flex justify-end">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition"
            >
              {pwSaved ? '✓ Updated' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

      {clientId === 'ch069' && (
        <section aria-labelledby="chorus-access-heading">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 id="chorus-access-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-widest">ShieldTech MCP access</h2>
              <p className="text-sm text-gray-400 mt-1">Data exposed by ShieldTech&apos;s MCP server to the connected Chorus agent</p>
            </div>
            <span className="flex-shrink-0 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full">Read-only · ShieldTech scoped</span>
          </div>

          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-6">
                ShieldTech&apos;s MCP server gives Chorus read-only access to the approved reporting surface for questions and the daily P&amp;L digest. It cannot make changes to ShieldTech data, access another client, or retrieve connection credentials.
              </p>
            </div>

            <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Available tools</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {chorusTools.map(([name, detail]) => (
                  <div key={name} className="rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 px-3.5 py-3">
                    <code className="text-xs font-semibold text-blue-700 dark:text-blue-300">{name}</code>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-5 mt-1">{detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Data the agent may read</h3>
              <div className="space-y-3">
                {chorusDataGroups.map(group => (
                  <div key={group.title}>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{group.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-5 mt-0.5">{group.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Limits &amp; safeguards</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-5 mt-1">Queries are automatically scoped to ShieldTech, read-only, and limited to 200 rows per standard request. The agent cannot access tokens, API keys, user profiles, agency data, or data belonging to other clients.</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                <span className="font-semibold">Group-message note:</span> the connection is scoped to the agent, not to an individual text recipient. Only add people to an agent group chat if they are authorized to receive and request ShieldTech customer and business data.
              </div>
            </div>
          </div>
        </section>
      )}

    </div>
  )
}
