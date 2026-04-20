'use client'

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'

export default function VideosLayout({ children }) {
  const pathname = usePathname()
  const { clientId } = useParams()

  const subNav = [
    { label: 'Videos',  href: `/control/${clientId}/videos` },
    { label: 'Scripts', href: `/control/${clientId}/videos/scripts` },
    { label: 'Avatar',  href: `/control/${clientId}/videos/avatar` },
    { label: 'Media',   href: `/control/${clientId}/videos/media` },
  ]

  return (
    <div>
      <div className="border-b border-gray-100 dark:border-white/5 bg-white dark:bg-[#0f1117] px-8 pt-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Videos</h1>
        <nav className="flex gap-6">
          {subNav.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      {children}
    </div>
  )
}
