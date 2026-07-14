// Durable per-user terminal chat history — GET loads, POST appends one turn.
//
// Auth via the user's SSR session (same pattern as /api/mission/ask). Queries
// run with the SERVICE-ROLE client but ALWAYS filter by user_id = user.id
// ourselves (defense in depth on top of RLS). FAIL-SAFE: if the terminal_chat
// table doesn't exist yet (migration runs after deploy) we swallow the PG error
// and return empty on GET / { ok:false } on POST so the terminal degrades to
// its in-memory behavior instead of throwing.

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const admin = () => createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const titleOf = (s) => {
  const t = (s || '').trim().replace(/\s+/g, ' ')
  if (!t) return 'New conversation'
  return t.length > 60 ? t.slice(0, 60) + '…' : t
}

// Build the sessions list (most-recent first) from all of the user's rows on
// this surface. title = first user message of the session.
function summarize(rows) {
  const bySession = new Map()
  for (const r of rows) {
    let s = bySession.get(r.session_id)
    if (!s) { s = { id: r.session_id, title: null, updated_at: r.created_at, count: 0, firstUserAt: null }; bySession.set(r.session_id, s) }
    s.count++
    if (r.created_at > s.updated_at) s.updated_at = r.created_at
    if (r.role === 'user' && (s.firstUserAt === null || r.created_at < s.firstUserAt)) {
      s.firstUserAt = r.created_at
      s.title = titleOf(r.content)
    }
  }
  const sessions = [...bySession.values()].map(s => ({
    id: s.id, title: s.title || 'New conversation', updated_at: s.updated_at, count: s.count,
  }))
  sessions.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
  return sessions
}

export async function GET(request) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const surface = searchParams.get('surface')
    const sessionParam = searchParams.get('session')
    if (!surface) return NextResponse.json({ error: 'surface required' }, { status: 400 })

    const db = admin()
    // All of the user's rows on this surface — cheap (per-user, per-surface) and
    // lets us build the sessions list + pick the active session in one pass.
    const { data, error } = await db
      .from('terminal_chat')
      .select('id, session_id, role, content, actions, created_at')
      .eq('user_id', user.id)
      .eq('surface', surface)
      .order('created_at', { ascending: true })
      .limit(2000)
    if (error) throw error

    const rows = data || []
    const sessions = summarize(rows)
    const activeSessionId = sessionParam || sessions[0]?.id || null
    const messages = activeSessionId
      ? rows.filter(r => r.session_id === activeSessionId)
          .map(r => ({ role: r.role, content: r.content, actions: r.actions, created_at: r.created_at }))
      : []
    return NextResponse.json({ sessions, activeSessionId, messages })
  } catch {
    // Missing table / any failure → degrade gracefully.
    return NextResponse.json({ sessions: [], activeSessionId: null, messages: [] })
  }
}

export async function POST(request) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { surface, session_id, role, content, actions } = body || {}
    if (!surface || !session_id || !['user', 'agent', 'system'].includes(role)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    // Nothing worth storing (empty content and no actions) → no-op success.
    if (!content && !(actions && Object.keys(actions).length)) {
      return NextResponse.json({ ok: true })
    }

    const db = admin()
    const { error } = await db.from('terminal_chat').insert({
      user_id: user.id,
      surface,
      session_id,
      role,
      content: content ?? null,
      actions: actions ?? null,
    })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch {
    // Missing table / any failure → swallow so the UI never breaks.
    return NextResponse.json({ ok: false })
  }
}
