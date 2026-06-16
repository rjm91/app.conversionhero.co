'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

// Command Hub — "your business at the core, with the three sectors branching
// off." Each sector bubble links to the dashboard. Laid out on a fixed
// coordinate canvas (720×600): SVG connectors behind, circular nodes on top.

const SECTORS = [
  {
    key: 'marketing',
    title: 'Marketing',
    subtitle: 'Campaigns · leads',
    // node center (cx, cy) + radius on the 720×600 canvas
    cx: 360, cy: 130, r: 78,
    gradient: 'radial-gradient(circle at 35% 30%, #6d5de8, #4a3bbd)',
    line: '#5b4bd6',
  },
  {
    key: 'sales',
    title: 'Sales',
    subtitle: 'Deals · revenue',
    cx: 220, cy: 430, r: 78,
    gradient: 'radial-gradient(circle at 35% 30%, #1f8a6e, #145a48)',
    line: '#1f8a6e',
  },
  {
    key: 'manufacturing',
    title: 'Manufacturing',
    subtitle: 'Cost of goods',
    cx: 500, cy: 430, r: 78,
    gradient: 'radial-gradient(circle at 35% 30%, #b15a2e, #7e3b1c)',
    line: '#b15a2e',
  },
]

const CORE = { cx: 360, cy: 300, r: 92 }

export default function CommandHubPage() {
  const { clientId } = useParams()
  const dashHref = `/control/${clientId}/dashboard`

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
               left: CORE.cx - (CORE.r + 26), top: CORE.cy - (CORE.r + 26),
               width: (CORE.r + 26) * 2, height: (CORE.r + 26) * 2,
               border: '1.5px dashed rgba(255,255,255,0.18)',
             }} />

        {/* Core node */}
        <div className="absolute rounded-full flex flex-col items-center justify-center text-center select-none"
             style={{
               left: CORE.cx - CORE.r, top: CORE.cy - CORE.r,
               width: CORE.r * 2, height: CORE.r * 2,
               background: 'radial-gradient(circle at 35% 30%, #6b7280, #404652)',
               boxShadow: '0 12px 40px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)',
             }}>
          <div className="text-white font-bold text-lg leading-tight">Your business</div>
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
