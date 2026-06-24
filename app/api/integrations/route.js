import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isAgencyAdmin } from '../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'funnel-assets'
const admin = () => createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function requireAgencyAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const db = admin()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyAdmin(profile?.role)) return { error: 'Forbidden', status: 403 }
  return { db, user }
}

// List apps — never include the raw api_key.
export async function GET() {
  const a = await requireAgencyAdmin()
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })
  const { data, error } = await a.db.from('integrations')
    .select('id, name, kind, logo_url, status, created_at, api_key')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const apps = (data || []).map(({ api_key, ...rest }) => ({ ...rest, has_key: !!api_key }))
  return NextResponse.json({ apps })
}

// Create an app — multipart form: name, kind, api_key, optional logo file.
export async function POST(request) {
  const a = await requireAgencyAdmin()
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })

  const form = await request.formData()
  const name = (form.get('name') || '').toString().trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  const kind = (form.get('kind') || 'other').toString()
  const apiKey = (form.get('api_key') || '').toString().trim() || null
  const file = form.get('file')

  let logo_url = null
  if (file && typeof file !== 'string') {
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Logo must be under 5 MB' }, { status: 400 })
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' }[file.type]
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, SVG, or WebP image' }, { status: 400 })
    const path = `integrations/logo-${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await a.db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: true })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    logo_url = a.db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }

  const row = { name, kind, logo_url, api_key: apiKey, status: apiKey ? 'connected' : 'draft', owner_id: a.user.id }
  const { data, error } = await a.db.from('integrations').insert(row)
    .select('id, name, kind, logo_url, status, created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, app: data })
}

export async function DELETE(request) {
  const a = await requireAgencyAdmin()
  if (a.error) return NextResponse.json({ error: a.error }, { status: a.status })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await a.db.from('integrations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
