import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tail(s, n = 4) {
  if (!s) return null
  return '…' + String(s).slice(-n)
}

// Temporary diagnostic: reports whether QB token rows exist and env presence.
// Add ?test=write to run a write-read-delete round-trip on a sentinel row,
// proving whether the service-role key can actually persist a token.
// No secrets returned — only booleans, counts, and last-4 tails.
export async function GET(request) {
  const doWrite = new URL(request.url).searchParams.get('test') === 'write'
  const out = {
    env: {
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceKeyTail: tail(process.env.SUPABASE_SERVICE_ROLE_KEY, 6),
      qbRealmIdSet: !!process.env.QB_REALM_ID,
      qbRealmIdTail: tail(process.env.QB_REALM_ID),
      qbClientId: !!process.env.QB_CLIENT_ID,
      qbClientSecret: !!process.env.QB_CLIENT_SECRET,
      qbRedirectUri: process.env.QB_REDIRECT_URI || null,
    },
    tokens: { count: 0, rows: [], error: null },
    writeTest: doWrite ? {} : 'skipped (add ?test=write)',
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

    if (doWrite) {
      const sentinel = '__debug_test__'
      const up = await supabase.from('qb_tokens').upsert({
        realm_id: sentinel,
        access_token: 'test',
        refresh_token: 'test',
        access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'realm_id' })
      out.writeTest.writeError = up.error?.message || null

      const back = await supabase.from('qb_tokens').select('realm_id').eq('realm_id', sentinel)
      out.writeTest.readBackCount = back.data?.length ?? 0
      out.writeTest.readBackError = back.error?.message || null

      const del = await supabase.from('qb_tokens').delete().eq('realm_id', sentinel)
      out.writeTest.deleteError = del.error?.message || null
    }
  } catch (e) {
    out.tokens.error = e.message
  }
  return NextResponse.json(out)
}
