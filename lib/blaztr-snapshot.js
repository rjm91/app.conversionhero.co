// Blaztr has no time-series endpoint — its `summary` returns current totals
// only. So we snapshot the summary into blaztr_daily once per day (idempotent
// on `day`) and build the trend chart from accumulated snapshots.

const SUMMARY_URL = 'https://www.blaztr.app/api/blaztrApi?action=summary'

export async function fetchBlaztrSummary() {
  if (!process.env.BLAZTR_API_KEY) return null
  try {
    const r = await fetch(SUMMARY_URL, { headers: { 'x-api-key': process.env.BLAZTR_API_KEY }, cache: 'no-store' })
    const j = await r.json()
    return j?.success && j.data ? j.data : null
  } catch {
    return null
  }
}

// Fetch the current summary and upsert today's row. `db` = a Supabase
// service-role client. Returns the summary (or null). Never throws.
export async function snapshotBlaztrDaily(db) {
  const s = await fetchBlaztrSummary()
  if (!s) return null
  const day = new Date().toISOString().slice(0, 10)
  try {
    await db.from('blaztr_daily').upsert({
      day,
      total_campaigns: s.total_campaigns || 0,
      total_leads: s.total_leads || 0,
      total_sent: s.total_sent || 0,
      total_replies: s.total_replies || 0,
      total_bounced: s.total_bounced || 0,
      reply_rate: s.reply_rate || 0,
      active_senders: s.active_senders || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'day' })
  } catch {
    // table may not exist yet — chart just stays empty until it does
  }
  return s
}
