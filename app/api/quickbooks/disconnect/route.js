import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request) {
  const realmId = process.env.QB_REALM_ID
  if (realmId) {
    await db().from('qb_tokens').delete().eq('realm_id', realmId)
  }
  return NextResponse.redirect(new URL('/control/payments?qb=disconnected', request.url))
}
