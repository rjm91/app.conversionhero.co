'use client'

import { useParams, usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '../../../lib/supabase-browser'
import ThemeSelector from '../../../components/ThemeSelector'
import AgentPanel from '../../../components/AgentPanel'

/* ─── Nav structure ─── */
const NAV_GROUPS = {
  marketing: {
    label: 'Marketing',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    items: [
      { key: 'paid-ads', label: 'Ads', icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1C4.5 20.5 12 20.5 12 20.5s7.5 0 9.4-.6a3 3 0 002.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.75 15.5v-7l6.5 3.5-6.5 3.5z" /></svg> },
      { key: 'funnels', label: 'Funnels', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M9 12h6M11 16h2" /></svg> },
      { key: 'videos', label: 'Videos', matchPrefix: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> },
    ],
  },
  contacts: {
    label: 'Contacts',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    items: [
      { key: 'contacts', label: 'Leads', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
      { key: 'calendar', label: 'Calendar', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    ],
  },
  account: {
    label: 'Account',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    items: [
      { key: 'company', label: 'Company', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
      { key: 'automations', label: 'Automations', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
      { key: 'billing', label: 'Billing', agencyOnly: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
    ],
  },
}

/* Pin SVG icon reused in multiple places */
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
function getActiveKey(pathname, clientId) {
  const prefix = `/control/${clientId}/`
  if (!pathname.startsWith(prefix)) return 'dashboard'
  const segment = pathname.slice(prefix.length).split('/')[0]
  if (!segment || segment === 'dashboard') return 'dashboard'
  return segment
}

/* ─── User Menu (preserved from original) ─── */
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
      setUser({ name: profile?.full_name || user.email, email: user.email, role: profile?.role, avatar: profile?.avatar_url || null })
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
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 dark:hover:ring-offset-[#0c0e18] transition"
      >
        <span className="text-white text-xs font-bold">{initials}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#1a1f35] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100 dark:border-white/10 flex items-center gap-3">
            <div className="flex-shrink-0">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="text-white text-base font-bold">{initials}</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user.name || user.email}</p>
              {user.role && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {user.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
              )}
              {user.name && <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{user.email}</p>}
            </div>
          </div>
          <div className="py-1.5">
            <Link href={`/control/${clientId}/profile`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Profile
            </Link>
            <Link href={`/control/${clientId}/settings`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>
          </div>
          <ThemeSelector />
          <div className="border-t border-gray-100 dark:border-white/10 py-1.5">
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-red-600 dark:hover:text-red-400 transition">
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
export default function ClientLayout({ children }) {
  const { clientId } = useParams()
  const pathname = usePathname()
  const [clientName, setClientName] = useState('')
  const [clients, setClients] = useState([])
  const [isAgencyAdmin, setIsAgencyAdmin] = useState(false)
  const [pinnedGroups, setPinnedGroups] = useState(new Set())
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null) // groupId or 'brand'
  const [toast, setToast] = useState('')
  const dropdownRefs = useRef({})

  const activeKey = getActiveKey(pathname, clientId)
  const activeGroup = getGroupForKey(activeKey)
  const hasPins = pinnedGroups.size > 0

  // Load pinned state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`ch-pinned-${clientId}`)
      if (saved) setPinnedGroups(new Set(JSON.parse(saved)))
      const collapsed = localStorage.getItem(`ch-collapsed-${clientId}`)
      if (collapsed === 'true') setIsCollapsed(true)
    } catch {}
  }, [clientId])

  // Persist pinned state
  useEffect(() => {
    try {
      localStorage.setItem(`ch-pinned-${clientId}`, JSON.stringify([...pinnedGroups]))
      localStorage.setItem(`ch-collapsed-${clientId}`, String(isCollapsed))
    } catch {}
  }, [pinnedGroups, isCollapsed, clientId])

  // Fetch client name and role
  useEffect(() => {
    const supabase = createClient()
    supabase.from('client').select('client_name').eq('client_id', clientId).single()
      .then(({ data }) => { if (data) setClientName(data.client_name) })
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.role === 'agency_admin') setIsAgencyAdmin(true)
    })
  }, [clientId])

  // Load active clients for the account switcher
  useEffect(() => {
    const supabase = createClient()
    supabase.from('client').select('client_id, client_name').eq('status', 'Active').order('client_name')
      .then(({ data }) => { if (data) setClients(data) })
  }, [])

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
    const href = `/control/${clientId}/${item.key}`
    if (item.matchPrefix) return pathname.startsWith(href)
    return pathname === href
  }

  const clientInitials = clientName
    ? clientName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'CA'

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
            {clientInitials}
          </button>

          {/* Name + chevron — collapses away. Whole row is the dropdown toggle. */}
          <button
            onClick={() => setOpenDropdown(o => o === 'brand' ? null : 'brand')}
            className="flex items-center gap-1.5 overflow-hidden transition-all duration-300 rounded hover:bg-white/[0.08] px-1.5 -mx-1.5 py-1 group"
            style={{ width: isCollapsed ? 0 : 168, opacity: isCollapsed ? 0 : 1 }}
          >
            <span className="text-white font-semibold text-[13px] truncate min-w-0">
              {clientName || 'Client'}
            </span>
            <svg className="w-3 h-3 text-gray-500 group-hover:text-gray-300 transition flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>

          {/* Account switcher dropdown */}
          {openDropdown === 'brand' && isAgencyAdmin && (
            <div className="absolute top-full left-3 mt-1 bg-[#1a1f36] border border-white/10 rounded-xl p-1.5 min-w-[230px] max-h-[70vh] overflow-y-auto z-[100] shadow-xl">
              <Link
                href="/control"
                className="flex items-center gap-2.5 px-3 py-2.5 text-gray-400 text-[13px] font-medium rounded-lg hover:text-white hover:bg-white/5 transition"
                onClick={() => setOpenDropdown(null)}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Agency
              </Link>
              {clients.length > 0 && <div className="my-1 border-t border-white/[0.06]" />}
              {clients.map(c => {
                const isCurrent = c.client_id === clientId
                const initials = (c.client_name || 'CA').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <Link
                    key={c.client_id}
                    href={`/control/${c.client_id}/dashboard`}
                    onClick={() => setOpenDropdown(null)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium rounded-lg transition ${
                      isCurrent ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${isCurrent ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-300'}`}>{initials}</span>
                    {c.client_name}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Dashboard — standalone, always in topnav */}
        <Link
          href={`/control/${clientId}/dashboard`}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition ${
            activeKey === 'dashboard'
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
          // Filter items by role
          const visibleItems = group.items.filter(i => !i.agencyOnly || isAgencyAdmin)
          if (visibleItems.length === 0) return null

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
                  {visibleItems.map(item => (
                    <Link
                      key={item.key}
                      href={`/control/${clientId}/${item.key}`}
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
          <UserMenu />
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
              const visibleItems = group.items.filter(i => !i.agencyOnly || isAgencyAdmin)
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
                  {visibleItems.map(item => (
                    <Link
                      key={item.key}
                      href={`/control/${clientId}/${item.key}`}
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
      <AgentPanel />

      {/* Fade-in animation for toast */}
      <style jsx global>{`
        @keyframes fade-in { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
      `}</style>
    </div>
  )
}
