'use client'

import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { clients } from '../../lib/mockData'
import ThemeToggle from '../../../components/ThemeToggle'

const navItems = (clientId) => [
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
]

export default function ClientLayout({ children }) {
  const { clientId } = useParams()
  const pathname = usePathname()
  const client = clients.find(c => c.id === clientId)
  const items = navItems(clientId)

  return (
    <div className="flex min-h-screen">

      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 dark:bg-[#161b27] flex flex-col fixed top-0 left-0 bottom-0 z-20 border-r border-gray-800 dark:border-gray-700/50">

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
        {client && (
          <div className="px-4 py-4 border-b border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2.5">Client</p>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">
                  {client.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{client.name}</p>
                <p className="text-gray-500 text-xs">{client.industry}</p>
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
          {/* Dark mode toggle */}
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

      {/* Main Content */}
      <main className="flex-1 ml-60 bg-gray-50 dark:bg-[#0f1117] min-h-screen">
        {children}
      </main>
    </div>
  )
}
