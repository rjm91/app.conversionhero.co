'use client'

import { useParams, usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../lib/supabase-browser'
import ThemeToggle from '../../../components/ThemeToggle'

const navItems = (clientId) => [
  {
    label: 'Company',
    href: `/control/${clientId}/company`,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    label: 'Dashboard',
    href: `/control/${clientId}/dashboard`,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    label: 'Contacts',
    href: `/control/${clientId}/contacts`,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: 'YouTube Ads',
    href: `/control/${clientId}/youtube-ads`,
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1C4.5 20.5 12 20.5 12 20.5s7.5 0 9.4-.6a3 3 0 002.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.75 15.5v-7l6.5 3.5-6.5 3.5z" />
      </svg>
    ),
  },
  {
    label: 'Scripts',
    href: `/control/${clientId}/scripts`,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
]

function UserMenu() {
  const router = useRouter()
  const { clientId } = useParams()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setUser({ name: profile?.full_name || user.email, email: user.email, role: profile?.role })
    })
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return null

  const nameParts = (user.name || user.email || '').trim().split(' ').filter(Boolean)
  const initials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : (nameParts[0]?.[0] || '?').toUpperCase()

  return (
    <div className="relative" ref={ref}>
      {/* Avatar button only — no text */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 dark:hover:ring-offset-[#0f1117] transition"
      >
        <span className="text-white text-xs font-bold">{initials}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#1a1f35] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">

          {/* User info */}
          <div className="px-4 py-3.5 border-b border-gray-100 dark:border-white/10">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user.name || user.email}</p>
            {user.name && <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>}
          </div>

          {/* Nav items */}
          <div className="py-1.5">
            <Link
              href={`/control/${clientId}/profile`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </Link>
            {user?.role !== 'client_standard' && (
              <Link
                href={`/control/${clientId}/billing`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Billing
              </Link>
            )}
            <Link
              href={`/control/${clientId}/settings`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>
          </div>

          <div className="border-t border-gray-100 dark:border-white/10 py-1.5">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-red-600 dark:hover:text-red-400 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientLayout({ children }) {
  const { clientId } = useParams()
  const pathname = usePathname()
  const [clientName, setClientName] = useState('')
  const items = navItems(clientId)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('client')
      .select('client_name')
      .eq('client_id', clientId)
      .single()
      .then(({ data }) => { if (data) setClientName(data.client_name) })
  }, [clientId])

  return (
    <div className="flex min-h-screen">

      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 dark:bg-[#0f1117] flex flex-col fixed top-0 left-0 bottom-0 z-20 border-r border-gray-800 dark:border-white/5">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">CA</span>
            </div>
            <span className="text-white font-bold text-sm tracking-tight">ConversionAgent</span>
          </div>
        </div>

        {/* Client Badge */}
        {clientName && (
          <div className="px-4 py-4 border-b border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2.5">Client</p>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">
                  {clientName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{clientName}</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-gray-800 space-y-2">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-gray-500">Dark mode</span>
            <ThemeToggle />
          </div>
          <Link
            href="/control"
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-400 hover:text-white transition-all rounded-lg hover:bg-gray-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            All Clients
          </Link>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 ml-60 flex flex-col min-h-screen">

        {/* Top header */}
        <header className="sticky top-0 z-10 h-14 bg-white dark:bg-[#0f1117] border-b border-gray-100 dark:border-white/5 flex items-center justify-end px-6">
          <UserMenu />
        </header>

        {/* Page content */}
        <main className="flex-1 bg-gray-50 dark:bg-[#0f1117]">
          {children}
        </main>
      </div>
    </div>
  )
}
