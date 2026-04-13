'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import ThemeToggle from '../../components/ThemeToggle'

const navItems = [
  {
    label: 'Overview',
    href: '/control',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    label: 'Clients',
    href: '/control/clients',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

function AdminUserMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ca_user')
      if (stored) setUser(JSON.parse(stored))
    } catch {}
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSignOut() {
    localStorage.removeItem('ca_user')
    supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return null

  const nameParts = (user.name || user.email || '').trim().split(' ').filter(Boolean)
  const initials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : (nameParts[0]?.[0] || '?').toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 dark:hover:ring-offset-[#0f1117] transition"
      >
        <span className="text-white text-xs font-bold">{initials}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#1a1f35] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100 dark:border-white/10">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user.name || user.email}</p>
            {user.name && <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>}
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

export default function AdminLayout({ children }) {
  const pathname = usePathname()

  // Don't apply sidebar layout to client sub-routes (they have their own layout)
  if (pathname.match(/^\/control\/[^/]+\//)) {
    return <>{children}</>
  }

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

        {/* Admin Badge */}
        <div className="px-4 py-4 border-b border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-2.5">Workspace</p>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">CA</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">Agency Admin</p>
              <p className="text-gray-500 text-xs truncate">Control Center</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
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
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 ml-60 flex flex-col min-h-screen">

        {/* Top header */}
        <header className="sticky top-0 z-10 h-14 bg-white dark:bg-[#0f1117] border-b border-gray-100 dark:border-white/5 flex items-center justify-end px-6">
          <AdminUserMenu />
        </header>

        {/* Page content */}
        <main className="flex-1 bg-gray-50 dark:bg-[#0f1117]">
          {children}
        </main>
      </div>
    </div>
  )
}
