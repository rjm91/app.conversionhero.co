'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '../../lib/supabase-browser'
import ThemeSelector from '../../components/ThemeSelector'
import AgentPanel from '../../components/AgentPanel'
import { isSecurityAdmin } from '../../lib/roles'

/* ─── Nav structure ─── */
const NAV_GROUPS = {
  sales: {
    label: 'Sales',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    items: [
      { key: 'prospecting', label: 'Prospecting', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
      { key: 'leads', label: 'Leads', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
      { key: 'sales', label: 'Sales', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
      { key: 'funnels', label: 'Funnels', matchPrefix: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M9 12h6M11 16h2" /></svg> },
    ],
  },
  management: {
    label: 'Management',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    items: [
      { key: 'clients', label: 'Clients', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
      { key: 'projects', label: 'Projects', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
      { key: 'plans', label: 'Plans', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
      { key: 'calendar', label: 'Calendar', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    ],
  },
  tools: {
    label: 'Tools',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
    items: [
      { key: 'transcriptions', label: 'Transcriber', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg> },
      { key: 'campaign-builder', label: 'Campaign Builder', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v18H3V3zm0 6h18M3 15h18M9 3v18" /></svg> },
    ],
  },
  admin: {
    label: 'Admin',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    items: [
      { key: 'team', label: 'Team & Roles', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c1.657 0 3-1.567 3-3.5S13.657 4 12 4 9 5.567 9 7.5 10.343 11 12 11zm0 2c-3.314 0-6 1.79-6 4v1h12v-1c0-2.21-2.686-4-6-4zm7-2l1.5 1.5L23 9.5" /></svg> },
      { key: 'payments', label: 'Payments', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
      { key: 'automations', label: 'Automations', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
      { key: 'email-templates', label: 'Email Templates', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
      { key: 'agent', label: 'Agent Access', securityOnly: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 7h10v10H7V7zm3 3h4v4h-4v-4z" /></svg> },
    ],
  },
}

/* Pin SVG icon */
const PinIcon = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>
)

/* ─── Determine which group a route key belongs to ─── */
function getGroupForKey(key) {
  for (const [groupId, group] of Object.entries(NAV_GROUPS)) {
    if (group.items.some(i => i.key === key)) return groupId
  }
  return null
}

/* ─── Get active route key from pathname ─── */
function getActiveKey(pathname) {
  if (pathname === '/control' || pathname === '/control/') return 'overview'
  const segment = pathname.replace('/control/', '').split('/')[0]
  return segment || 'overview'
}

function getInitials(name, email) {
  const parts = (name || email || '').trim().split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.[0] || '?').toUpperCase()
}

/* ─── User Menu ─── */
function AdminUserMenu({ profile }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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

  const initials = getInitials(profile.name, profile.email)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 dark:hover:ring-offset-[#0c0e18] transition"
      >
        <span className="text-white text-xs font-bold">{initials}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#1a1f35] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100 dark:border-white/10">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{profile.name || profile.email}</p>
            {profile.name && <p className="text-xs text-gray-400 truncate mt-0.5">{profile.email}</p>}
          </div>
          <div className="py-1.5">
            <Link href="/control/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Profile
            </Link>
            <Link href="/control/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>
          </div>
          <ThemeSelector />
          <div className="border-t border-gray-100 dark:border-white/10 py-1.5">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-red-600 dark:hover:text-red-400 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Toast notification ─── */
function Toast({ message }) {
  if (!message) return null
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-5 py-2 rounded-full shadow-lg z-[100] animate-fade-in">
      {message}
    </div>
  )
}

/* ─── Main Layout ─── */
export default function AdminLayout({ children }) {
  const pathname = usePathname()
  const [profile, setProfile] = useState({ name: '', email: '', role: null })
  const [clients, setClients] = useState([])
  const [pinnedGroups, setPinnedGroups] = useState(new Set())
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null)
  const [toast, setToast] = useState('')
  const dropdownRefs = useRef({})

  // All hooks must be before any conditional return
  // Load profile
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setProfile({ name: data.full_name || '', email: data.email || '', role: data.role || null })
      })
  }, [])

  // Load active clients for the account switcher
  useEffect(() => {
    const supabase = createClient()
    supabase.from('client').select('client_id, client_name').eq('status', 'Active').order('client_name')
      .then(({ data }) => { if (data) setClients(data) })
  }, [])

  // Load pinned state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ch-pinned-agency')
      if (saved) setPinnedGroups(new Set(JSON.parse(saved)))
      const collapsed = localStorage.getItem('ch-collapsed-agency')
      if (collapsed === 'true') setIsCollapsed(true)
    } catch {}
  }, [])

  // Persist pinned state
  useEffect(() => {
    try {
      localStorage.setItem('ch-pinned-agency', JSON.stringify([...pinnedGroups]))
      localStorage.setItem('ch-collapsed-agency', String(isCollapsed))
    } catch {}
  }, [pinnedGroups, isCollapsed])

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClick(e) {
      if (openDropdown) {
        const ref = dropdownRefs.current[openDropdown]
        if (ref && !ref.contains(e.target)) setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openDropdown])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 1500)
  }, [])

  const activeKey = getActiveKey(pathname)
  const activeGroup = getGroupForKey(activeKey)
  const hasPins = pinnedGroups.size > 0

  // Pass through to client-level layout (but not agency funnel editor)
  if (pathname.match(/^\/control\/[^/]+\//) && !pathname.startsWith('/control/funnels/')) {
    return <>{children}</>
  }

  function pinGroup(groupId) {
    setPinnedGroups(prev => new Set([...prev, groupId]))
    setOpenDropdown(null)
    showToast(`Pinned ${NAV_GROUPS[groupId].label}`)
  }

  function unpinGroup(groupId) {
    setPinnedGroups(prev => { const s = new Set(prev); s.delete(groupId); return s })
    showToast(`Unpinned ${NAV_GROUPS[groupId].label}`)
  }

  function toggleCollapse() {
    setIsCollapsed(c => !c)
  }

  function isItemActive(item) {
    const href = `/control/${item.key}`
    if (item.matchPrefix) return pathname.startsWith(href)
    return pathname === href
  }

  // Hide security-only items (e.g. Agent Access) from everyone but the security account.
  function canSeeItem(item) {
    if (item.securityOnly) return isSecurityAdmin(profile.role)
    return true
  }

  const sidebarW = !hasPins ? '0px' : isCollapsed ? '54px' : '240px'

  return (
    <div className="flex flex-col min-h-screen">

      {/* ===== TOP NAV BAR ===== */}
      <header className="h-12 bg-[#0c0e18] border-b border-white/[0.06] flex items-center pr-3 gap-1 flex-shrink-0 relative z-50">

        {/* Brand area */}
        <div
          ref={el => dropdownRefs.current['brand'] = el}
          className="flex items-center gap-2 px-3 border-r border-white/10 h-full flex-shrink-0 relative"
        >
          {/* Icon — toggles collapse */}
          <button
            onClick={toggleCollapse}
            className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 hover:brightness-110 transition text-white text-[10px] font-bold"
            title="Toggle sidebar"
          >
            CA
          </button>

          {/* Name + chevron — collapses away. Whole row is the dropdown toggle. */}
          <button
            onClick={() => setOpenDropdown(o => o === 'brand' ? null : 'brand')}
            title="Switch account"
            className="flex items-center gap-1.5 overflow-hidden transition-all duration-300 rounded hover:bg-white/[0.08] px-1.5 -mx-1.5 py-1 group"
            style={{ width: isCollapsed ? 0 : 172, opacity: isCollapsed ? 0 : 1 }}
          >
            <span className="text-white font-semibold text-[13px] truncate min-w-0">
              ConversionAgent
            </span>
            <svg className="w-3 h-3 text-gray-500 group-hover:text-gray-300 transition flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>

          {/* Account switcher dropdown */}
          {openDropdown === 'brand' && (
            <div className="absolute top-full left-3 mt-1 bg-[#1a1f36] border border-white/10 rounded-xl p-1.5 min-w-[230px] max-h-[70vh] overflow-y-auto z-[100] shadow-xl">
              <Link
                href="/control"
                onClick={() => setOpenDropdown(null)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium rounded-lg transition bg-blue-600 text-white"
              >
                <span className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[9px] font-bold flex-shrink-0">CA</span>
                Agency
              </Link>
              {clients.length > 0 && <div className="my-1 border-t border-white/[0.06]" />}
              {clients.map(c => (
                <Link
                  key={c.client_id}
                  href={`/control/${c.client_id}/dashboard`}
                  onClick={() => setOpenDropdown(null)}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium rounded-lg transition text-gray-400 hover:text-white hover:bg-white/5"
                >
                  <span className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[9px] font-bold flex-shrink-0 text-gray-300">{getInitials(c.client_name, '')}</span>
                  {c.client_name}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Dashboard — standalone, always in topnav */}
        <Link
          href="/control"
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition ${
            activeKey === 'overview'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Dashboard
        </Link>

        {/* Group buttons — hidden when pinned */}
        {Object.entries(NAV_GROUPS).map(([groupId, group]) => {
          if (pinnedGroups.has(groupId)) return null

          return (
            <div
              key={groupId}
              ref={el => dropdownRefs.current[groupId] = el}
              className="relative flex items-center"
            >
              <button
                onClick={() => setOpenDropdown(o => o === groupId ? null : groupId)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition border-none bg-transparent cursor-pointer ${
                  activeGroup === groupId
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {group.icon}
                {group.label}
                <span className="text-[8px] opacity-50 ml-0.5">&#9662;</span>
              </button>

              {/* Dropdown */}
              {openDropdown === groupId && (
                <div className="absolute top-full left-0 mt-1.5 bg-[#1a1f36] border border-white/10 rounded-xl p-1.5 min-w-[220px] z-[100] shadow-xl">
                  <div className="flex items-center justify-between px-3 pb-2 mb-1 border-b border-white/[0.06]">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{group.label}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); pinGroup(groupId) }}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:bg-white/[0.08] hover:text-blue-400 transition relative group/pin"
                      title="Pin to sidebar"
                    >
                      <PinIcon />
                      <span className="hidden group-hover/pin:block absolute top-full right-0 mt-1 bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap">Pin to sidebar</span>
                    </button>
                  </div>
                  {group.items.filter(canSeeItem).map(item => (
                    <Link
                      key={item.key}
                      href={`/control/${item.key}`}
                      onClick={() => setOpenDropdown(null)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium rounded-lg transition ${
                        isItemActive(item)
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="w-[18px] flex justify-center flex-shrink-0">{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2.5">
          <AdminUserMenu profile={profile} />
        </div>
      </header>

      {/* ===== CONTENT ROW (sidebar + main) ===== */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar — only visible when pins exist */}
        <aside
          className="bg-[#0f1117] flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300"
          style={{
            width: sidebarW,
            borderRight: hasPins ? '1px solid rgba(255,255,255,0.06)' : 'none',
          }}
        >
          <nav className="flex-1 px-1.5 py-1.5 overflow-y-auto">
            {Object.entries(NAV_GROUPS).map(([groupId, group]) => {
              if (!pinnedGroups.has(groupId)) return null
              return (
                <div key={groupId} className="mb-1.5">
                  {/* Group header — hidden when collapsed */}
                  {!isCollapsed && (
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{group.label}</span>
                      <button
                        onClick={() => unpinGroup(groupId)}
                        className="w-5 h-5 rounded flex items-center justify-center text-blue-400 hover:bg-white/[0.06] hover:text-gray-400 transition"
                        title="Unpin"
                      >
                        <PinIcon className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {/* Nav items */}
                  {group.items.filter(canSeeItem).map(item => (
                    <Link
                      key={item.key}
                      href={`/control/${item.key}`}
                      className={`group/nav relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium mb-px whitespace-nowrap overflow-hidden transition ${
                        isCollapsed ? 'justify-center py-2.5 px-0' : 'px-3 py-2'
                      } ${
                        isItemActive(item)
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className={`flex justify-center flex-shrink-0 ${isCollapsed ? 'text-base' : 'w-[18px]'}`}>{item.icon}</span>
                      {!isCollapsed && <span>{item.label}</span>}
                      {/* Tooltip when collapsed */}
                      {isCollapsed && (
                        <span className="hidden group-hover/nav:block absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-[11px] px-2.5 py-1 rounded-md whitespace-nowrap z-[100]">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 bg-gray-50 dark:bg-[#0f1117]">
          {children}
        </main>
      </div>

      <Toast message={toast} />
      <AgentPanel mode="agency" />

      <style jsx global>{`
        @keyframes fade-in { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
      `}</style>
    </div>
  )
}
