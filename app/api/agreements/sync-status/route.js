import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncAgreementPaidStatuses } from '../../../../lib/agreements.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  try {
    const result = await syncAgreementPaidStatuses(db())
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
