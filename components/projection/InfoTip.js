'use client'

import { useState } from 'react'

// Small ⓘ icon revealing an explanation on hover/focus (same as the dashboard).
// Fixed positioning so the tooltip escapes overflow-hidden section clipping.
export default function InfoTip({ text }) {
  const [pos, setPos] = useState(null)
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(r.left + r.width / 2, 120), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 120)
    setPos({ x, y: r.bottom + 6 })
  }
  const hide = () => setPos(null)
  return (
    <span
      tabIndex={0}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex align-middle ml-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 cursor-help outline-none"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
      </svg>
      {pos && (
        <span
          style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateX(-50%)', zIndex: 60 }}
          className="pointer-events-none w-56 rounded-lg bg-gray-900 dark:bg-black/95 text-white text-[11px] font-normal normal-case tracking-normal leading-snug px-3 py-2 shadow-xl ring-1 ring-white/10"
        >
          {text}
        </span>
      )}
    </span>
  )
}
