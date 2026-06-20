export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { isAgencyAdmin } from '../../../lib/roles'

const META_API_VERSION = 'v21.0'

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAgencyAdmin(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyAdmin(profile?.role)) return { error: 'Forbidden', status: 403 }
  return { db }
}

const digits = (id) => String(id || '').replace(/\D/g, '')

// Validate an ad-account + token pair against Meta before we ever save it.
async function testMeta({ adAccountId, accessToken, appSecret }) {
  const id = digits(adAccountId)
  if (!id) return { ok: false, error: 'Ad account ID is required.' }
  if (!accessToken) return { ok: false, error: 'Access token is required.' }
  const params = new URLSearchParams({ fields: 'name,account_status,disable_reason', access_token: accessToken })
  if (appSecret) params.set('appsecret_proof', crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex'))
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/act_${id}?${params}`, { cache: 'no-store' })
  const j = await res.json()
  if (j.error) {
    const c = j.error.code
    const hint = c === 190 ? 'Token is invalid or expired — generate a fresh one.'
      : c === 100 ? 'Ad account ID not found, or this token has no access to it.'
      : 'Meta rejected the request.'
    return { ok: false, error: `${hint} (${j.error.message})` }
  }
  const STATUS = { 1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending risk review', 8: 'Pending settlement', 9: 'In grace period', 100: 'Pending closure', 101: 'Closed' }
  return { ok: true, name: j.name, account_status: j.account_status, account_status_label: STATUS[j.account_status] || `status ${j.account_status}`, active: j.account_status === 1 }
}

// GET ?client_id= → current connection (never returns the token itself)
export async function GET(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const clientId = new URL(request.url).searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
  const { data } = await auth.db.from('meta_connections').select('ad_account_id, access_token, app_secret').eq('client_id', clientId).maybeSingle()
  return NextResponse.json({
    connected: !!data,
    ad_account_id: data?.ad_account_id || null,
    has_token: !!data?.access_token,
    app_secret_set: !!data?.app_secret,
  })
}

// POST { client_id, ad_account_id, access_token, app_secret?, action: 'test'|'save' }
export async function POST(request) {
  const auth = await requireAgencyAdmin(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const b = await request.json()
  const clientId = b.client_id
  const adAccountId = b.ad_account_id
  const accessToken = b.access_token
  const appSecret = b.app_secret || null
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  // Always test the pair first.
  const test = await testMeta({ adAccountId, accessToken, appSecret })
  if (b.action === 'test') return NextResponse.json(test)
  if (!test.ok) return NextResponse.json(test, { status: 422 })

  // Save — store the normalized act_<digits> id so the sync builds correct URLs.
  const { error } = await auth.db.from('meta_connections').upsert({
    client_id: clientId,
    ad_account_id: digits(adAccountId),
    access_token: accessToken,
    app_secret: appSecret,
  }, { onConflict: 'client_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...test })
}
