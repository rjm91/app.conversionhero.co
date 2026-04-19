'use client'

import { useState, useEffect } from 'react'

export default function AgencyProfilePage() {
  const [user, setUser]       = useState(null)
  const [firstName, setFirst] = useState('')
  const [lastName,  setLast]  = useState('')
  const [saving,    setSaving] = useState(false)
  const [saved,     setSaved]  = useState(false)
  const [error,     setError]  = useState('')

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        const parts = (data.full_name || '').trim().split(' ')
        setFirst(parts[0] || '')
        setLast(parts.slice(1).join(' ') || '')
        setUser({ email: data.email, name: data.full_name || '' })
      })
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const full_name = [firstName, lastName].filter(Boolean).join(' ')
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { setError(data.error); return }
    setUser(u => ({ ...u, name: full_name }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (error && !user) return <p className="p-8 text-sm text-red-500">{error}</p>
  if (!user) return null

  const nameParts = (user.name || user.email || '').trim().split(' ').filter(Boolean)
  const initials = nameParts.length >= 2
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
          <p className="text-base font-semibold text-gray-900 dark:text-white">{user.name || '—'}</p>
          <p className="text-sm text-gray-400">{user.email}</p>
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
              className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 outline-none border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center px-6 py-4 gap-6">
            <label className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Last name</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLast(e.target.value)}
              placeholder="Last name"
              className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 outline-none border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center px-6 py-4 gap-6">
            <label className="w-36 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Email</label>
            <p className="flex-1 text-sm text-gray-400 dark:text-gray-500">{user.email}</p>
          </div>

        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-lg transition"
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
