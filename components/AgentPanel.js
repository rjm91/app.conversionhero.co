'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, usePathname } from 'next/navigation'

const SUGGESTIONS = [
  'Summarize this client',
  'How many leads do we have?',
  'What scripts are approved?',
  'How many assets are uploaded?',
]

const MIN_W = 320
const MIN_H = 400
const STORAGE_KEY = 'agentPanelRect'

function defaultRect() {
  if (typeof window === 'undefined') return { x: 100, y: 100, w: 420, h: 640 }
  const w = 420
  const h = Math.min(720, window.innerHeight - 80)
  return { x: window.innerWidth - w - 24, y: 40, w, h }
}

function clampRect(r) {
  if (typeof window === 'undefined') return r
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.max(MIN_W, Math.min(r.w, vw))
  const h = Math.max(MIN_H, Math.min(r.h, vh))
  const x = Math.max(0, Math.min(r.x, vw - w))
  const y = Math.max(0, Math.min(r.y, vh - h))
  return { x, y, w, h }
}

export default function AgentPanel() {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(defaultRect)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'agent', text: "Hey — ask me anything about this client. I can pull live data from leads, scripts, and assets." },
  ])
  const [sending, setSending] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const { clientId } = useParams()
  const pathname = usePathname()
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const dragRef = useRef(null) // { mode, startX, startY, startRect }

  // Load persisted rect
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (saved && typeof saved.x === 'number') setRect(clampRect(saved))
    } catch {}
    if (localStorage.getItem('agentPanelHideSuggestions') === '1') setShowSuggestions(false)
  }, [])

  function dismissSuggestions() {
    setShowSuggestions(false)
    try { localStorage.setItem('agentPanelHideSuggestions', '1') } catch {}
  }

  // Re-clamp on viewport resize
  useEffect(() => {
    function onResize() { setRect(r => clampRect(r)) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ⌘K / Ctrl+K to toggle
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open])

  // Drag / resize pointer handling
  useEffect(() => {
    function onMove(e) {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      const r = { ...d.startRect }
      const m = d.mode
      if (m === 'move') {
        r.x += dx; r.y += dy
      } else {
        if (m.includes('e')) r.w = d.startRect.w + dx
        if (m.includes('s')) r.h = d.startRect.h + dy
        if (m.includes('w')) { r.w = d.startRect.w - dx; r.x = d.startRect.x + dx }
        if (m.includes('n')) { r.h = d.startRect.h - dy; r.y = d.startRect.y + dy }
      }
      // enforce min sizes by adjusting x/y if dragging from w/n edges
      if (m.includes('w') && r.w < MIN_W) { r.x -= (MIN_W - r.w); r.w = MIN_W }
      if (m.includes('n') && r.h < MIN_H) { r.y -= (MIN_H - r.h); r.h = MIN_H }
      setRect(clampRect(r))
    }
    function onUp() {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rect)) } catch {}
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [rect])

  const startDrag = useCallback((mode, cursor) => (e) => {
    e.preventDefault()
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startRect: rect }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = cursor
  }, [rect])

  async function applyProposal(messageIndex, proposalIndex, proposal) {
    setMessages(m => m.map((msg, i) => i === messageIndex
      ? { ...msg, proposals: msg.proposals.map((p, j) => j === proposalIndex ? { ...p, _status: 'applying' } : p) }
      : msg))
    try {
      const res = await fetch('/api/agent/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: proposal.action,
          clientId: proposal.clientId,
          scriptId: proposal.scriptId,
          fields: proposal.fields,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMessages(m => m.map((msg, i) => i === messageIndex
        ? { ...msg, proposals: msg.proposals.map((p, j) => j === proposalIndex ? { ...p, _status: 'applied' } : p) }
        : msg))
    } catch (e) {
      setMessages(m => m.map((msg, i) => i === messageIndex
        ? { ...msg, proposals: msg.proposals.map((p, j) => j === proposalIndex ? { ...p, _status: 'error', _error: e.message } : p) }
        : msg))
    }
  }

  function rejectProposal(messageIndex, proposalIndex) {
    setMessages(m => m.map((msg, i) => i === messageIndex
      ? { ...msg, proposals: msg.proposals.map((p, j) => j === proposalIndex ? { ...p, _status: 'rejected' } : p) }
      : msg))
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function resetPosition() {
    const r = defaultRect()
    setRect(r)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)) } catch {}
  }

  async function send() {
    if (!input.trim() || sending) return
    const text = input.trim()
    const next = [...messages, { role: 'user', text }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const apiMessages = next.map(m => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.text,
      }))
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, clientId, pageContext: pageLabel }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const proposals = data.proposals || []
      const fallback = proposals.length ? 'Drafted a new proposal — review it below.' : '(no response)'
      setMessages(m => [...m, { role: 'agent', text: data.text || fallback, proposals }])
    } catch (e) {
      setMessages(m => [...m, { role: 'agent', text: `Error: ${e.message}`, error: true }])
    } finally {
      setSending(false)
    }
  }

  const lastRejectedProposal = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const ps = messages[i].proposals
      if (!ps?.length) continue
      const last = ps[ps.length - 1]
      if (last._status === 'rejected') {
        return last.fields?.vscript_title || last.currentTitle || 'that script'
      }
      return null
    }
    return null
  })()

  const pageLabel = pathname.includes('/scripts') ? 'Scripts'
    : pathname.includes('/assets') ? 'Assets'
    : pathname.includes('/library') ? 'Library'
    : pathname.includes('/contacts') ? 'Leads'
    : pathname.includes('/youtube-ads') ? 'Ads'
    : pathname.includes('/billing') ? 'Billing'
    : pathname.includes('/company') ? 'Company'
    : pathname.includes('/dashboard') ? 'Dashboard'
    : 'this page'

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition flex items-center justify-center"
          title="Open Agent (⌘K)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </button>
      )}

      {open && (
        <div
          className="fixed z-40 bg-white dark:bg-[#0f1117] border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        >
          {/* Header (drag handle) */}
          <div
            onPointerDown={startDrag('move', 'grabbing')}
            className="h-14 px-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Agent</p>
                <p className="text-[10px] text-gray-400 -mt-0.5">Viewing {pageLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-1" onPointerDown={e => e.stopPropagation()}>
              <button onClick={resetPosition} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded" title="Reset position">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded" title="Minimize">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                </svg>
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded" title="Close">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {[...messages, ...(sending ? [{ role: 'agent', text: '', pending: true }] : [])].map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'flex gap-2.5'}`}>
                  {m.role === 'agent' && (
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  )}
                  <div>
                    <div className={`text-sm rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-gray-100 rounded-bl-md'
                    }`}>
                      {m.text}
                      {m.pending && (
                        <div className="flex gap-1 mt-2">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                    </div>
                    {m.proposals?.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {m.proposals.map((p, j) => (
                          <ProposalCard key={p.proposalId || j} proposal={p} onAccept={() => applyProposal(i, j, p)} onReject={() => rejectProposal(i, j)} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Suggestions */}
          {showSuggestions && (
            <div className="border-t border-gray-100 dark:border-white/10 pt-2 px-4 pb-2 flex-shrink-0 relative">
              <button
                onClick={dismissSuggestions}
                className="absolute top-1.5 right-2 p-0.5 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300 rounded"
                title="Hide suggestions"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="flex flex-wrap gap-1.5 pr-6">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-100 dark:border-white/10 flex-shrink-0">
            <div className="flex items-end gap-2 bg-gray-100 dark:bg-white/5 rounded-2xl px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={lastRejectedProposal ? `What should I change about "${lastRejectedProposal}"?` : `Ask the agent about ${pageLabel.toLowerCase()}…`}
                rows={1}
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none max-h-32"
              />
              <button
                onClick={send}
                disabled={!input.trim()}
                className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-center">⌘K to toggle · drag header to move · drag edges to resize</p>
          </div>

          {/* Resize handles */}
          <div onPointerDown={startDrag('n',  'ns-resize')} className="absolute top-0 left-2 right-2 h-1.5 cursor-ns-resize" />
          <div onPointerDown={startDrag('s',  'ns-resize')} className="absolute bottom-0 left-2 right-2 h-1.5 cursor-ns-resize" />
          <div onPointerDown={startDrag('w',  'ew-resize')} className="absolute left-0 top-2 bottom-2 w-1.5 cursor-ew-resize" />
          <div onPointerDown={startDrag('e',  'ew-resize')} className="absolute right-0 top-2 bottom-2 w-1.5 cursor-ew-resize" />
          <div onPointerDown={startDrag('nw', 'nwse-resize')} className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize" />
          <div onPointerDown={startDrag('ne', 'nesw-resize')} className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize" />
          <div onPointerDown={startDrag('sw', 'nesw-resize')} className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize" />
          <div onPointerDown={startDrag('se', 'nwse-resize')} className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize" />
        </div>
      )}
    </>
  )
}

function ProposalCard({ proposal, onAccept, onReject }) {
  const [expanded, setExpanded] = useState(false)
  const status = proposal._status
  const isUpdate = proposal.action === 'updateScript'
  const fields = proposal.fields || {}
  const diff = proposal.diff || {}

  const statusBadge = status === 'applied' ? { text: 'Applied ✓', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
    : status === 'rejected' ? { text: 'Rejected', cls: 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400' }
    : status === 'applying' ? { text: 'Applying…', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
    : status === 'error' ? { text: 'Error', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
    : null

  return (
    <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-[#161922]">
      <div className="px-3 py-2 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isUpdate ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
            {isUpdate ? 'UPDATE' : 'CREATE'}
          </span>
          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{proposal.summary}</p>
        </div>
        {statusBadge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusBadge.cls}`}>{statusBadge.text}</span>}
      </div>

      <div className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
        {isUpdate ? (
          <div className="space-y-1">
            {Object.keys(diff).length === 0 && <p className="text-gray-400 italic">No changes detected</p>}
            {Object.entries(diff).slice(0, expanded ? undefined : 3).map(([k, v]) => (
              <div key={k} className="text-[11px]">
                <span className="font-mono text-gray-500">{k}</span>:{' '}
                <span className="line-through text-gray-400">{String(v.from ?? '∅').slice(0, 40)}</span>
                {' → '}
                <span className="text-gray-900 dark:text-gray-100">{String(v.to ?? '∅').slice(0, 40)}</span>
              </div>
            ))}
            {Object.keys(diff).length > 3 && !expanded && (
              <button onClick={() => setExpanded(true)} className="text-[11px] text-blue-600 hover:underline">+{Object.keys(diff).length - 3} more</button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(fields).slice(0, expanded ? undefined : 4).map(([k, v]) => {
              const str = String(v ?? '')
              const isLong = str.length > 80
              const isBody = k === 'script_body'
              return (
                <div key={k} className="text-[11px]">
                  <div className="font-mono text-gray-500">{k}:</div>
                  {expanded || !isLong ? (
                    <div className={`text-gray-900 dark:text-gray-100 ${isBody ? 'whitespace-pre-wrap mt-0.5 p-2 bg-gray-50 dark:bg-white/5 rounded max-h-80 overflow-y-auto' : ''}`}>
                      {str}
                    </div>
                  ) : (
                    <div className="text-gray-900 dark:text-gray-100">{str.slice(0, 80)}…</div>
                  )}
                </div>
              )
            })}
            {(Object.keys(fields).length > 4 || Object.values(fields).some(v => String(v ?? '').length > 80)) && (
              <button onClick={() => setExpanded(e => !e)} className="text-[11px] text-blue-600 hover:underline mt-1">
                {expanded ? 'Show less' : 'Show full script'}
              </button>
            )}
          </div>
        )}
        {proposal._error && <p className="mt-1.5 text-[11px] text-red-600">{proposal._error}</p>}
      </div>

      {!status && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-white/10 flex gap-2">
          <button onClick={onAccept} className="flex-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">
            Accept
          </button>
          <button onClick={onReject} className="flex-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition">
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
