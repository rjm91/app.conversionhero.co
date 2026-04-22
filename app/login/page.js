'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase-browser'

// ── Password Reset Form ──────────────────────────────────────────────────────
function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword]   = useState('')
  const [confirm,  setConfirm]    = useState('')
  const [error,    setError]      = useState('')
  const [loading,  setLoading]    = useState(false)
  const [done,     setDone]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6)        { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm)        { setError('Passwords do not match.'); return }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/login'), 2000)
  }

  if (done) {
    return (
      <div className="bg-green-50 text-green-700 text-sm rounded-lg px-4 py-3 text-center">
        Password updated! Redirecting to login…
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder-gray-300 [color-scheme:light]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="••••••••"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder-gray-300 [color-scheme:light]"
        />
      </div>
      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition text-sm"
      >
        {loading ? 'Saving…' : 'Set New Password'}
      </button>
    </form>
  )
}

// ── Main Login Page ──────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter()
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [isRecovery, setIsRecovery] = useState(false)

  // Detect password-recovery flow from the URL hash
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash   = window.location.hash
    const params = new URLSearchParams(hash.replace('#', ''))
    if (params.get('type') === 'recovery') {
      setIsRecovery(true)
      // Let Supabase exchange the token from the hash
      const supabase = createClient()
      supabase.auth.getSession()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Please enter your email and password.'); return }

    setLoading(true)
    const supabase = createClient()

    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    const user     = signInData.user
    const meta     = user.user_metadata || {}
    const role     = meta.role
    const clientId = meta.client_id

    localStorage.setItem('ca_user', JSON.stringify({ id: user.id, email: user.email, role, clientId }))

    if (role === 'agency_admin') {
      router.push('/control')
    } else if (clientId) {
      router.push(`/control/${clientId}/dashboard`)
    } else {
      setError('Your account is not linked to a client. Contact your administrator.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">CA</span>
            </div>
            <span className="text-white text-2xl font-bold tracking-tight">ConversionAgent</span>
          </div>
          <p className="text-gray-500 text-sm mt-1">Agency Performance Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {isRecovery ? (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-1">Set a new password</h1>
              <p className="text-gray-400 text-sm mb-7">Choose a new password for your account</p>
              <ResetPasswordForm />
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-1">Sign in to your account</h1>
              <p className="text-gray-400 text-sm mb-7">Enter your credentials to continue</p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@agency.com"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder-gray-300 [color-scheme:light]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder-gray-300 [color-scheme:light]"
                  />
                </div>
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2.5">{error}</div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition text-sm mt-1"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">© 2026 ConversionAgent. All rights reserved.</p>
      </div>
    </div>
  )
}
