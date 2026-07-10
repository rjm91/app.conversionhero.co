// Daily P&L Slack digest — SERVER ONLY.
// Posts a locked daily P&L snapshot to a client's C-level Slack channel via an
// Incoming Webhook (client.settings.slack_pnl_webhook). Reads the same
// client_daily_pnl row the app shows, so the digest and the IDE never disagree.
import { snapshotDailyPnl } from './pnl-snapshot'

const DEFAULT_TZ = 'America/Phoenix'

// Calendar day (YYYY-MM-DD) in a timezone, N days offset from today.
function dayInTz(tz, offset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const base = new Date(parts + 'T12:00:00Z')
  base.setUTCDate(base.getUTCDate() + offset)
  return base.toISOString().slice(0, 10)
}

const $ = (n) => n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString()
const pct = (n) => n == null ? '' : (Number(n) * 100).toFixed(0) + '%'
const xR = (n) => n == null ? '—' : Number(n).toFixed(2) + 'x'
const prettyDate = (d) => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) } catch { return d } }

// Build the Slack Block Kit payload for one day's P&L (m = the stored metrics).
export function formatDigest(clientName, clientId, date, m = {}) {
  const cac = m.nCpa != null ? m.nCpa : m.blendedCpa
  const summary = `${clientName} — Daily P&L · ${prettyDate(date)} · Net ${$(m.netSales)} · GP ${$(m.grossProfit)} (${pct(m.profitMargin)})`
  return {
    text: summary, // notification fallback
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `📊 ${clientName} — Daily P&L`, emoji: true } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `*${prettyDate(date)}*  ·  locked snapshot` }] },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Net Sales*\n${$(m.netSales)}` },
        { type: 'mrkdwn', text: `*Gross Profit*\n${$(m.grossProfit)}  (${pct(m.profitMargin)})` },
        { type: 'mrkdwn', text: `*Orders*\n${m.totalOrders ?? '—'}${m.nOrders != null ? `  (${m.nOrders} new)` : ''}` },
        { type: 'mrkdwn', text: `*True AOV*\n${$(m.trueAov)}` },
        { type: 'mrkdwn', text: `*Ad Spend*\n${$(m.totalSpend)}` },
        { type: 'mrkdwn', text: `*Blended ROAS*\n${xR(m.blendedRoas)}` },
      ] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Meta ${$(m.metaSpend)}  ·  Google ${$(m.googleSpend)}  ·  COGS ${$(m.cogs)}  ·  CAC ${$(cac)}  ·  Gross ${$(m.grossSales)} / Disc ${$(m.discounts)}` }] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `<https://app.conversionhero.co/control/${clientId}/mission|Open the full P&L → trace every number to source>` }] },
    ],
  }
}

// Send one client's digest for a day (default: yesterday in their timezone).
// Ensures the snapshot row exists (locks it on the fly if the nightly watcher
// hasn't yet). Returns a small result object; never throws to the caller.
export async function sendDailyPnlDigest(db, client, opts = {}) {
  const settings = client.settings || {}
  const webhook = settings.slack_pnl_webhook
  if (!webhook) return { client_id: client.client_id, skipped: 'no webhook' }
  const tz = settings.timezone || DEFAULT_TZ
  const date = opts.date || dayInTz(tz, -1)

  let { data: row } = await db.from('client_daily_pnl')
    .select('metrics').eq('client_id', client.client_id).eq('date', date).maybeSingle()
  if (!row) {
    try { await snapshotDailyPnl(db, client.client_id, date, date) } catch { /* best-effort */ }
    ;({ data: row } = await db.from('client_daily_pnl')
      .select('metrics').eq('client_id', client.client_id).eq('date', date).maybeSingle())
  }
  if (!row) return { client_id: client.client_id, date, skipped: 'no data' }

  const payload = formatDigest(client.client_name || client.client_id, client.client_id, date, row.metrics || {})
  try {
    const res = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    return { client_id: client.client_id, date, posted: res.ok, status: res.status }
  } catch (e) {
    return { client_id: client.client_id, date, error: String(e?.message || e) }
  }
}
