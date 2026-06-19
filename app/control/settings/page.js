'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase-browser'

const ROLE_LABELS = {
  agency_admin:          'Agency Admin',
  agency_admin_security: 'Agency Admin (Security)',
  agency_standard:       'Agency Standard',
  client_admin:          'Admin',
  client_standard:       'Standard',
}
const ROLE_BADGE = {
  agency_admin:          'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
  agency_admin_security: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  agency_standard:       'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  client_admin:          'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  client_standard:       'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400',
}

export default function AgencySettingsPage() {
  const [email, setEmail]     = useState('')
  const [role, setRole]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [pwSaved, setPwSaved]   = useState(false)
  const [pwError, setPwError]   = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setEmail(user.email || '')
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole(profile?.role || user.user_metadata?.role || '')
    })
  }, [])

  async function handlePasswordSave(e) {
    e.preventDefault()
    setPwError('')
    if (!password) return
    if (password !== confirm) { setPwError('Passwords do not match.'); return }
    if (password.length < 8)  { setPwError('Password must be at least 8 characters.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) { setPwError(error.message); return }
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
            <div className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Access level</div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_BADGE[role] || ROLE_BADGE.client_standard}`}>
              {ROLE_LABELS[role] || role || '—'}
            </span>
          </div>
        </div>
      </section>

      {/* Password */}
      <section>
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
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : pwSaved ? '✓ Updated' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

    </div>
  )
}
