'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '../../../../lib/supabase-browser'

// Command Hub — the client's business at the core, with three sectors branching
// off. Each sector bubble links to the dashboard. Laid out on a fixed
// coordinate canvas (720×600): SVG connectors behind, circular nodes on top.
// Geometry keeps a clear gap so sector bubbles never overlap the core/ring.

const CORE = { cx: 360, cy: 320, r: 84 }
const RING_OFFSET = 18

const SECTORS = [
  {
    key: 'marketing',
    title: 'Marketing',
    subtitle: 'Campaigns · leads',
    cx: 360, cy: 120, r: 72,
    gradient: 'radial-gradient(circle at 35% 30%, #6d5de8, #4a3bbd)',
    line: '#5b4bd6',
  },
  {
    key: 'sales',
    title: 'Sales',
    subtitle: 'Deals · revenue',
    cx: 210, cy: 450, r: 72,
    gradient: 'radial-gradient(circle at 35% 30%, #1f8a6e, #145a48)',
    line: '#1f8a6e',
  },
  {
    key: 'manufacturing',
    title: 'Manufacturing',
    subtitle: 'Cost of goods',
    cx: 510, cy: 450, r: 72,
    gradient: 'radial-gradient(circle at 35% 30%, #b15a2e, #7e3b1c)',
    line: '#b15a2e',
  },
]

export default function CommandHubPage() {
  const { clientId } = useParams()
  const dashHref = `/control/${clientId}/dashboard`
  const [clientName, setClientName] = useState('')
  const [primary, setPrimary] = useState(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('client').select('client_name, branding').eq('client_id', clientId).single()
      .then(({ data }) => {
        if (!data) return
        if (data.client_name) setClientName(data.client_name)
        const colors = Array.isArray(data.branding?.colors) ? data.branding.colors : []
        const hex = colors.find(c => (c?.role || '').toLowerCase() === 'primary')?.hex || colors[0]?.hex || null
        setPrimary(hex)
      })
  }, [clientId])

  // Core bubble uses the client's primary brand color (lighter top-left →
  // darker bottom-right for depth); falls back to neutral gray if none set.
  const coreBg = primary
    ? `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${primary} 86%, #fff), color-mix(in srgb, ${primary} 82%, #000))`
    : 'radial-gradient(circle at 35% 30%, #6b7280, #404652)'

  return (
    <div className="min-h-full w-full flex flex-col items-center px-6 py-10"
         style={{ background: 'radial-gradient(120% 90% at 50% 0%, #161922 0%, #0d0f16 60%, #0a0b11 100%)' }}>
      <div className="text-center mb-2">
        <h1 className="text-2xl font-bold text-white">Command Hub</h1>
        <p className="text-sm text-gray-400 mt-1">Your business at the core. Click a sector to open its dashboard.</p>
      </div>

      <div className="relative" style={{ width: 720, height: 600, maxWidth: '100%' }}>
        {/* Connector lines */}
        <svg viewBox="0 0 720 600" className="absolute inset-0 w-full h-full" aria-hidden="true">
          {SECTORS.map(s => (
            <line key={s.key} x1={CORE.cx} y1={CORE.cy} x2={s.cx} y2={s.cy}
                  stroke={s.line} strokeWidth="2.5" strokeOpacity="0.85" />
          ))}
        </svg>

        {/* Dashed ring around the core */}
        <div className="absolute rounded-full"
             style={{
               left: CORE.cx - (CORE.r + RING_OFFSET), top: CORE.cy - (CORE.r + RING_OFFSET),
               width: (CORE.r + RING_OFFSET) * 2, height: (CORE.r + RING_OFFSET) * 2,
               border: '1.5px dashed rgba(255,255,255,0.18)',
             }} />

        {/* Core node — the client's business */}
        <div className="absolute rounded-full flex flex-col items-center justify-center text-center select-none px-4"
             style={{
               left: CORE.cx - CORE.r, top: CORE.cy - CORE.r,
               width: CORE.r * 2, height: CORE.r * 2,
               background: coreBg,
               boxShadow: '0 12px 40px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)',
             }}>
          <div className="text-white font-bold text-lg leading-tight">{clientName || 'Your business'}</div>
          <div className="text-gray-300 text-sm mt-0.5">Command hub</div>
        </div>

        {/* Sector nodes (clickable → dashboard) */}
        {SECTORS.map(s => (
          <Link key={s.key} href={dashHref}
                className="absolute rounded-full flex flex-col items-center justify-center text-center select-none transition-transform duration-200 hover:scale-105 focus:scale-105 focus:outline-none"
                style={{
                  left: s.cx - s.r, top: s.cy - s.r,
                  width: s.r * 2, height: s.r * 2,
                  background: s.gradient,
                  boxShadow: '0 14px 40px -14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.18)',
                }}>
            <div className="text-white font-bold text-lg leading-tight px-3">{s.title}</div>
            <div className="text-white/80 text-sm mt-1">{s.subtitle}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
