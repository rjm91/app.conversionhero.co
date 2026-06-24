import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAgencyUser } from '../../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (u, o = {}) => fetch(u, { ...o, cache: 'no-store' }) },
    }
  )
}

// Any agency user may see the agency-level revenue channels.
async function requireAgency(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorized', status: 401 }
  const db = adminDb()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyUser(profile?.role)) return { error: 'Forbidden', status: 403 }
  return { db }
}

// Pipeline-stage rules mirror app/control/page.js buildPipelines().
const isAppt = (l) => (l.appt_status && l.appt_status !== 'NA') || l.lead_status === 'Appt Set'
const isSold = (l) => l.sale_status === 'Sold'

export async function GET(request) {
  const auth = await requireAgency(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { db } = auth

  const { data: leads, error } = await db
    .from('agency_leads')
    .select('id, lead_status, appt_status, sale_status, sale_amount, created_at, meta')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate the real pipeline by acquisition source (meta.source → 'blaztr', …).
  const sources = {}
  for (const l of leads || []) {
    const src = (l.meta && l.meta.source) || 'direct'
    const a = sources[src] || (sources[src] = { leads: 0, appts: 0, clients: 0, mrr: 0 })
    a.leads++
    if (isAppt(l)) a.appts++
    if (isSold(l)) { a.clients++; a.mrr += Number(l.sale_amount) || 0 }
  }
  const zero = { leads: 0, appts: 0, clients: 0, mrr: 0 }
  const total = Object.values(sources).reduce(
    (t, a) => ({ leads: t.leads + a.leads, appts: t.appts + a.appts, clients: t.clients + a.clients, mrr: t.mrr + a.mrr }),
    { ...zero }
  )
  const blaztr = sources.blaztr || { ...zero }

  // Blaztr email funnel + per-campaign breakdown (best-effort; the pipeline
  // numbers still render if Blaztr is unavailable). www host = skip the 307.
  let blaztrFunnel = null
  let blaztrCampaigns = []
  try {
    if (process.env.BLAZTR_API_KEY) {
      const hdr = { headers: { 'x-api-key': process.env.BLAZTR_API_KEY }, cache: 'no-store' }
      const [sumR, campR] = await Promise.all([
        fetch('https://www.blaztr.app/api/blaztrApi?action=summary', hdr),
        fetch('https://www.blaztr.app/api/blaztrApi?action=campaigns', hdr),
      ])
      const sum = await sumR.json().catch(() => null)
      const camp = await campR.json().catch(() => null)
      if (sum?.success && sum.data) {
        const s = sum.data
        blaztrFunnel = {
          campaigns: s.total_campaigns || 0, leads: s.total_leads || 0, sent: s.total_sent || 0,
          replied: s.total_replies || 0, bounced: s.total_bounced || 0, replyRate: s.reply_rate || 0,
        }
      }
      if (camp?.success && Array.isArray(camp.data)) {
        blaztrCampaigns = camp.data
          .map((c) => ({ name: c.name, status: c.status, sent: c.total_sent || 0, replies: c.total_replies || 0, bounced: c.total_bounced || 0, queued: c.queued || 0 }))
          .sort((a, b) => b.sent - a.sent)
      }
    }
  } catch { /* Blaztr API optional */ }

  return NextResponse.json({ total, blaztr, blaztrFunnel, blaztrCampaigns, sources })
}
