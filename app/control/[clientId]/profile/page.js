'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../lib/supabase-browser'

export default function ProfilePage() {
  const [email,     setEmail]     = useState('')
  const [firstName, setFirst]     = useState('')
  const [lastName,  setLast]      = useState('')
  const [saved,     setSaved]     = useState(false)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setEmail(user.email)
      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).single()
      const parts = (profile?.full_name || '').split(' ')
      setFirst(parts[0] || '')
      setLast(parts.slice(1).join(' ') || '')
      setLoading(false)
    })
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const nameParts = ([firstName, lastName].filter(Boolean).join(' ') || email || '').trim().split(' ').filter(Boolean)
  const initials  = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : (nameParts[0]?.[0] || '?').toUpperCase()

  return (
    <div className="p-8 max-w-2xl">

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>
        <p className="text-sm text-gray-400 mt-1">Manage your personal information</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-5 mb-8 pb-8 border-b border-gray-100 dark:border-white/5">
        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xl font-bold">{initials}</span>
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900 dark:text-white">
            {[firstName, lastName].filter(Boolean).join(' ') || '—'}
          </p>
          <p className="text-sm text-gray-400">{email}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">

          <div className="flex items-center px-6 py-4 gap-6">
            <label className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">First name</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirst(e.target.value)}
              placeholder="First name"
              disabled={loading}
              className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 outline-none border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div className="flex items-center px-6 py-4 gap-6">
            <label className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Last name</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLast(e.target.value)}
              placeholder="Last name"
              disabled={loading}
              className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 outline-none border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div className="flex items-center px-6 py-4 gap-6">
            <label className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Email</label>
            <p className="flex-1 text-sm text-gray-400 dark:text-gray-500">{email || '—'}</p>
          </div>

        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition"
          >
            {saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
