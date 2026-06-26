export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { getAccessScope } from '../../../../lib/access'

// Returns the set of clients the current user may access:
//   { all: true }                 → reaches every agency; UI shows all (no filter)
//   { all: false, clientIds: [] } → explicit allow-list
// The control center + account switcher call this to scope their client lists.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const scope = await getAccessScope(user.id)
    return NextResponse.json({ all: scope.all, clientIds: scope.clientIds })
  } catch (e) {
    // Fail open to current behavior (caller falls back to showing all) so a
    // resolver hiccup never blanks an agency admin's dashboard.
    return NextResponse.json({ all: true, clientIds: [] })
  }
}
