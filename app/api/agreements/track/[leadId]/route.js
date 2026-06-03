import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// The "Review & Pay" link in the agreement email points here. We record the
// view (advance Agreement Sent -> Agreement Viewed, stamp viewed_at) and then
// redirect the client straight to the QuickBooks payment page.
export async function GET(request, { params }) {
  const { leadId } = await params
  const supabase = db()

  const { data: lead } = await supabase
    .from('agency_leads')
    .select('sale_status, meta')
    .eq('id', leadId)
    .single()

  const link = lead?.meta?.agreement?.invoice?.link

  if (lead) {
    const meta = {
      ...(lead.meta || {}),
      agreement: {
        ...(lead.meta?.agreement || {}),
        viewed_at: lead.meta?.agreement?.viewed_at || new Date().toISOString(),
      },
    }
    const update = { meta }
    // Only advance from "Agreement Sent" so we never regress a later stage.
    if (lead.sale_status === 'Agreement Sent') update.sale_status = 'Agreement Viewed'
    await supabase.from('agency_leads').update(update).eq('id', leadId)
  }

  if (link) return NextResponse.redirect(link)
  return NextResponse.redirect(new URL('/control', request.url))
}
