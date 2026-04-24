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

// ── Forgot Password Form ─────────────────────────────────────────────────────
function ForgotPasswordForm({ onBack }) {
  const [email,   setEmail]   = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email) { setError('Please enter your email address.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login',
    })
    setLoading(false)
    if (resetError) { setError(resetError.message); return }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">Check your email</p>
          <p className="text-sm text-gray-400 mt-1">We sent a password reset link to <strong>{email}</strong></p>
        </div>
        <button onClick={onBack} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Back to sign in</button>
      </div>
    )
  }

  return (
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
      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition text-sm"
      >
        {loading ? 'Sending…' : 'Send Reset Link'}
      </button>
      <button type="button" onClick={onBack} className="w-full text-sm text-gray-500 hover:text-gray-700 transition">
        Back to sign in
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
  const [isForgot,   setIsForgot]   = useState(false)

  // Detect password-recovery flow (PKCE: ?code= in query; legacy: #type=recovery in hash)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const supabase = createClient()

    // PKCE flow — Supabase sends ?code=... in the query string
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!error) setIsRecovery(true)
      })
      return
    }

    // Legacy implicit flow — #type=recovery in hash
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
    if (hashParams.get('type') === 'recovery') {
      setIsRecovery(true)
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

    const user = signInData.user

    const { data: profile } = await supabase
      .from('profiles').select('role, client_id').eq('id', user.id).single()

    const role     = profile?.role
    const clientId = profile?.client_id

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
          ) : isForgot ? (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-1">Reset your password</h1>
              <p className="text-gray-400 text-sm mb-7">Enter your email and we'll send you a reset link</p>
              <ForgotPasswordForm onBack={() => setIsForgot(false)} />
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <button type="button" onClick={() => setIsForgot(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium transition">
                      Forgot password?
                    </button>
                  </div>
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
