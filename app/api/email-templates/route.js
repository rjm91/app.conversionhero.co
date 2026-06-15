export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listTemplates, saveTemplate, sendTemplateEmail, EMAIL_TEMPLATES, LOGIN_URL } from '../../../lib/email-templates'

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Verify the caller is an agency admin (via their session bearer token).
async function requireAgencyAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role, email').eq('id', user.id).single()
  if (profile?.role !== 'agency_admin') return { error: 'Forbidden', status: 403 }
  return { user, email: profile.email || user.email }
}

export async function GET(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json({ templates: await listTemplates() })
}

export async function PUT(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { key, subject, html } = await request.json()
  if (!key || !EMAIL_TEMPLATES[key]) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  try {
    await saveTemplate(key, { subject, html })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Send a test of the template to the logged-in admin's own inbox.
export async function POST(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { key } = await request.json()
  const def = EMAIL_TEMPLATES[key]
  if (!def) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  try {
    await sendTemplateEmail({ key, to: auth.email, vars: { ...def.sample, login_url: LOGIN_URL } })
    return NextResponse.json({ ok: true, sentTo: auth.email })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
