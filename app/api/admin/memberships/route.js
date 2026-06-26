export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { isAgencyAdmin } from '../../../../lib/roles'
import { getGrantScope } from '../../../../lib/access'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Authenticate the actor and load what they may grant. Any agency admin (you,
// or a sub-agency admin like Keith) may use this — scoped to their own reach.
async function actor(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  const grant = await getGrantScope(user.id)
  if (!isAgencyAdmin(profile?.role) && !grant.canGrant) return { error: 'Forbidden', status: 403 }
  return { db, userId: user.id, grant }
}

const AGENCY_ROLES = new Set(['agency_admin', 'agency_standard'])
const CLIENT_ROLES = new Set(['client_admin', 'client_standard'])

export async function POST(request) {
  const a = await actor(request)
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })
  const { db, userId, grant } = a
  const okAgency = id => grant.all || grant.agencyIds.has(id)
  const okClient = id => grant.all || grant.clientIds.has(id)

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const { action } = body

  try {
    // ── Invite a member (agency-level or scoped to specific clients) ──
    if (action === 'invite') {
      const { email, fullName, level, agencyId, clientIds = [], role } = body
      if (!email || !role) return NextResponse.json({ error: 'email and role required' }, { status: 400 })

      if (level === 'agency') {
        if (!AGENCY_ROLES.has(role)) return NextResponse.json({ error: 'invalid agency role' }, { status: 400 })
        if (!okAgency(agencyId)) return NextResponse.json({ error: 'You can only invite into agencies you control.' }, { status: 403 })
      } else if (level === 'client') {
        if (!CLIENT_ROLES.has(role)) return NextResponse.json({ error: 'invalid client role' }, { status: 400 })
        if (!clientIds.length) return NextResponse.json({ error: 'pick at least one client' }, { status: 400 })
        if (!clientIds.every(okClient)) return NextResponse.json({ error: 'You can only assign clients you control.' }, { status: 403 })
      } else return NextResponse.json({ error: 'level must be agency|client' }, { status: 400 })

      // Create or find the auth user.
      let targetId, tempPassword = null
      const password = 'Tmp' + crypto.randomBytes(6).toString('hex') + '!9'
      const { data: created, error: cErr } = await db.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName || email, role },
      })
      if (cErr) {
        if (/already|registered|exists/i.test(cErr.message)) {
          const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
          targetId = list.users.find(u => u.email === email)?.id
        } else return NextResponse.json({ error: cErr.message }, { status: 500 })
      } else { targetId = created.user.id; tempPassword = password }
      if (!targetId) return NextResponse.json({ error: 'could not resolve user' }, { status: 500 })

      // Profile + memberships.
      if (level === 'agency') {
        await db.from('profiles').upsert({ id: targetId, email, full_name: fullName || email, role, agency_id: agencyId }, { onConflict: 'id' })
        await db.from('agency_membership').upsert({ profile_id: targetId, agency_id: agencyId, role, granted_by: userId }, { onConflict: 'profile_id,agency_id' })
      } else {
        const { data: c } = await db.from('client').select('agency_id').eq('client_id', clientIds[0]).single()
        await db.from('profiles').upsert({ id: targetId, email, full_name: fullName || email, role, agency_id: c?.agency_id, client_id: clientIds[0] }, { onConflict: 'id' })
        await db.from('client_membership').upsert(clientIds.map(cid => ({ profile_id: targetId, client_id: cid, role, granted_by: userId })), { onConflict: 'profile_id,client_id' })
      }
      return NextResponse.json({ ok: true, tempPassword })
    }

    // ── Assign an existing member to a client ──
    if (action === 'assignClient') {
      const { profileId, clientId, role = 'client_standard' } = body
      if (!okClient(clientId)) return NextResponse.json({ error: 'You can only assign clients you control.' }, { status: 403 })
      await db.from('client_membership').upsert({ profile_id: profileId, client_id: clientId, role, granted_by: userId }, { onConflict: 'profile_id,client_id' })
      return NextResponse.json({ ok: true })
    }

    // ── Revoke a membership ──
    if (action === 'revokeClient') {
      const { profileId, clientId } = body
      if (!okClient(clientId)) return NextResponse.json({ error: 'Out of scope.' }, { status: 403 })
      await db.from('client_membership').delete().eq('profile_id', profileId).eq('client_id', clientId)
      return NextResponse.json({ ok: true })
    }
    if (action === 'revokeAgency') {
      const { profileId, agencyId } = body
      if (!okAgency(agencyId)) return NextResponse.json({ error: 'Out of scope.' }, { status: 403 })
      await db.from('agency_membership').delete().eq('profile_id', profileId).eq('agency_id', agencyId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
