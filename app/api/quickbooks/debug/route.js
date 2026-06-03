import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tail(s, n = 4) { return s ? '…' + String(s).slice(-n) : null }

// Temporary diagnostic: reports saved QB token rows + freshness. No secrets.
export async function GET() {
  const out = {
    nowUtc: new Date().toISOString(),
    env: { qbRealmIdTail: tail(process.env.QB_REALM_ID) },
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
    if (error) { out.tokens.error = error.message }
    else {
      out.tokens.count = data.length
      out.tokens.rows = data.map(r => ({
        realmIdTail: tail(r.realm_id),
        matchesEnvRealm: process.env.QB_REALM_ID ? r.realm_id === process.env.QB_REALM_ID : null,
        accessExpiresAt: r.access_token_expires_at,
        accessExpired: new Date(r.access_token_expires_at).getTime() < Date.now(),
        updatedAt: r.updated_at,
      }))
    }
  } catch (e) { out.tokens.error = e.message }
  return NextResponse.json(out)
}
