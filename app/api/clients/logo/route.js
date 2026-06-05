import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'funnel-assets'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Upload a client's brand logo to the public funnel-assets bucket and return its URL.
export async function POST(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const form = await request.formData()
  const file = form.get('file')
  const clientId = form.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const isAgency = profile?.role === 'agency_admin' || profile?.role === 'agency_standard'
  const isClientAdmin = profile?.role === 'client_admin' && profile?.client_id === clientId
  if (!isAgency && !isClientAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Logo must be under 5 MB' }, { status: 400 })
  const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Use a PNG, JPG, SVG, or WebP image' }, { status: 400 })
  }

  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' }[file.type]
  const path = `clients/${clientId}/brand/logo-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  return NextResponse.json({ ok: true, url })
}
