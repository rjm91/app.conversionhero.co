'use client'

// Durable per-user terminal chat history — a self-contained hook both the
// agency terminal (surface='agency') and the per-client terminal (surface=
// clientId) import. Persists conversation turns to the terminal_chat table via
// /api/terminal-chat and reloads them on mount, plus a browsable session list.
//
// FAIL-SAFE by design: every network call is try/caught and saves are
// fire-and-forget. If the table/endpoint isn't there yet, load returns empty
// and the terminal silently keeps its in-memory behavior.

import { useCallback, useEffect, useRef, useState } from 'react'

const uuid = () => {
  try { return crypto.randomUUID() } catch { /* very old browser */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function useTerminalHistory(surface) {
  const [ready, setReady] = useState(false)
  const [sessions, setSessions] = useState([])
  const [messages, setMessages] = useState([])   // hydrated turns for the active session
  const [sessionId, setSessionId] = useState(null)
  const sessionRef = useRef(null)
  useEffect(() => { sessionRef.current = sessionId }, [sessionId])

  // On mount / surface change: load the most-recent session + sessions list.
  useEffect(() => {
    let alive = true
    setReady(false); setSessions([]); setMessages([]); setSessionId(null)
    if (!surface) return
    ;(async () => {
      try {
        const res = await fetch(`/api/terminal-chat?surface=${encodeURIComponent(surface)}`, { cache: 'no-store' })
        const j = await res.json()
        if (!alive) return
        setSessions(j.sessions || [])
        if (j.activeSessionId) {
          setSessionId(j.activeSessionId)
          setMessages(j.messages || [])
        } else {
          setSessionId(uuid())   // fresh, empty conversation
          setMessages([])
        }
      } catch {
        if (alive) { setSessionId(uuid()); setMessages([]) }
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => { alive = false }
  }, [surface])

  // Persist one turn — fire-and-forget, never blocks typing, swallows errors.
  const saveTurn = useCallback(({ role, content, actions } = {}) => {
    const sid = sessionRef.current
    if (!surface || !sid || !role) return
    if (!content && !(actions && Object.keys(actions).length)) return
    try {
      fetch('/api/terminal-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ surface, session_id: sid, role, content, actions }),
      }).then(() => {
        // Optimistically keep the session in the list (title from first user msg).
        setSessions(prev => {
          const now = new Date().toISOString()
          const found = prev.find(s => s.id === sid)
          if (found) return prev.map(s => s.id === sid ? { ...s, updated_at: now, count: s.count + 1 } : s)
          const title = role === 'user' && content
            ? (content.trim().length > 60 ? content.trim().slice(0, 60) + '…' : content.trim())
            : 'New conversation'
          return [{ id: sid, title, updated_at: now, count: 1 }, ...prev]
        })
      }).catch(() => {})
    } catch { /* invisible */ }
  }, [surface])

  // Start a fresh conversation — mint a new session id, clear the transcript.
  const newSession = useCallback(() => {
    const sid = uuid()
    setSessionId(sid)
    setMessages([])
    return sid
  }, [])

  // Load a past session's transcript and make it active.
  const loadSession = useCallback(async (id) => {
    if (!surface || !id) return []
    try {
      const res = await fetch(`/api/terminal-chat?surface=${encodeURIComponent(surface)}&session=${id}`, { cache: 'no-store' })
      const j = await res.json()
      setSessionId(id)
      setMessages(j.messages || [])
      if (j.sessions) setSessions(j.sessions)
      return j.messages || []
    } catch {
      setSessionId(id); setMessages([])
      return []
    }
  }, [surface])

  return { ready, sessions, sessionId, messages, saveTurn, newSession, loadSession }
}

// Relative "3d ago"-style stamp for the session dropdown.
export function relTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60; if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60; if (h < 24) return `${Math.floor(h)}h ago`
  const d = h / 24; if (d < 7) return `${Math.floor(d)}d ago`
  const w = d / 7; if (w < 5) return `${Math.floor(w)}w ago`
  return new Date(iso).toLocaleDateString()
}
