import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tail(s, n = 4) {
  if (!s) return null
  return '…' + String(s).slice(-n)
}

// Temporary diagnostic: reports whether QB token rows exist and env presence.
// No secrets returned — only booleans, counts, and last-4 tails.
export async function GET() {
  const out = {
    env: {
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      qbRealmIdSet: !!process.env.QB_REALM_ID,
      qbRealmIdTail: tail(process.env.QB_REALM_ID),
      qbClientId: !!process.env.QB_CLIENT_ID,
      qbClientSecret: !!process.env.QB_CLIENT_SECRET,
      qbRedirectUri: process.env.QB_REDIRECT_URI || null,
    },
    tokens: { count: 0, rows: [], error: null },
  }
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data, error } = await supabase
      .from('qb_tokens')
      .select('realm_id, access_token_expires_at, updated_at')
    if (error) {
      out.tokens.error = error.message
    } else {
      out.tokens.count = data.length
      out.tokens.rows = data.map(r => ({
        realmIdTail: tail(r.realm_id),
        matchesEnvRealm: process.env.QB_REALM_ID ? r.realm_id === process.env.QB_REALM_ID : null,
        expiresAt: r.access_token_expires_at,
        updatedAt: r.updated_at,
      }))
    }
  } catch (e) {
    out.tokens.error = e.message
  }
  return NextResponse.json(out)
}
