import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAgencyAdmin, isAgencyUser } from '../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_ROLES = [
  'agency_admin', 'agency_admin_security', 'agency_standard',
  'client_admin', 'client_standard',
]

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Only agency admins (or the security mirror) may view/manage the team.
async function requireAgencyAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyAdmin(profile?.role)) return { error: 'Forbidden', status: 403 }
  return { db, callerId: user.id, callerEmail: user.email }
}

export async function GET(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { db } = auth

  const [{ data: profiles, error: pErr }, { data: clients }] = await Promise.all([
    db.from('profiles').select('id, email, full_name, role, client_id, created_at'),
    db.from('client').select('client_id, client_name'),
  ])
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  // Last sign-in from auth (best-effort; first page covers the agency's user count).
  let lastSignIn = {}
  try {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    for (const u of list?.users || []) lastSignIn[u.id] = u.last_sign_in_at || null
  } catch {}

  const nameMap = Object.fromEntries((clients || []).map(c => [c.client_id, c.client_name]))
  const users = (profiles || []).map(p => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: p.role,
    client_id: p.client_id,
    client_name: p.client_id ? (nameMap[p.client_id] || p.client_id) : null,
    created_at: p.created_at,
    last_sign_in_at: lastSignIn[p.id] || null,
  })).sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''))

  return NextResponse.json({ users })
}

// PATCH { userId, role } → change a user's role. Agency roles clear client_id;
// client roles keep the user's existing client (assign clients from the
// per-client Company page).
export async function PATCH(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { db, callerId, callerEmail } = auth

  const { userId, role } = await request.json()
  if (!userId || !role) return NextResponse.json({ error: 'userId and role are required' }, { status: 400 })
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 })

  // Safety: you can't strip your own agency-admin access (avoid self-lockout).
  if (userId === callerId && !isAgencyAdmin(role)) {
    return NextResponse.json({ error: "You can't change your own access level here." }, { status: 400 })
  }

  const { data: target } = await db.from('profiles').select('role, client_id, email').eq('id', userId).single()
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const oldRole = target.role

  // Agency roles are not client-scoped; client roles need a client.
  let clientId = target.client_id
  if (isAgencyUser(role)) {
    clientId = null
  } else if (!clientId) {
    return NextResponse.json({ error: 'Assign this user to a client from that client\'s Company page before giving a client role.' }, { status: 400 })
  }

  const { error: pErr } = await db.from('profiles')
    .update({ role, client_id: clientId, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  // Merge into auth user_metadata (don't clobber other keys).
  try {
    const { data: cur } = await db.auth.admin.getUserById(userId)
    const meta = { ...(cur?.user?.user_metadata || {}), role, client_id: clientId }
    await db.auth.admin.updateUserById(userId, { user_metadata: meta })
  } catch (e) {
    return NextResponse.json({ error: `Role saved, but session sync failed: ${e.message}` }, { status: 500 })
  }

  // Audit trail (best-effort — never block or fail the role change on this).
  // Safe to deploy before sql/2026-06-24_role_change_audit.sql is applied: a
  // missing table just no-ops here.
  try {
    await db.from('role_change_audit').insert({
      actor_id: callerId,
      actor_email: callerEmail,
      target_id: userId,
      target_email: target.email,
      old_role: oldRole,
      new_role: role,
    })
  } catch {}

  return NextResponse.json({ ok: true, user: { id: userId, role, client_id: clientId } })
}
