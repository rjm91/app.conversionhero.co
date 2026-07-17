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
const pct1 = (n) => n == null ? '—' : (Number(n) * 100).toFixed(1) + '%'
const xR = (n) => n == null ? '—' : Number(n).toFixed(2) + 'x'
const div = (a, b) => (Number(b) > 0 ? Number(a) / Number(b) : null)
const prettyDate = (d) => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) } catch { return d } }

// Build the Slack Block Kit payload for one day's P&L (m = the stored metrics).
// Layout mirrors the approved mock: stacked label — value lines grouped under
// REVENUE & ORDERS / META / GOOGLE / BLENDED / MARGIN. Slack can't color text,
// so the mock's green highlights (% of paid + contribution margin) are bold.
export function formatDigest(clientName, clientId, date, m = {}, tz = DEFAULT_TZ) {
  const ch = m.channels || null
  const meta = ch?.meta, goog = ch?.google
  const paidNet = ch ? (meta.net + goog.net) : null
  const cm = m.contributionMargin
  const chCM = (c) => c && (c.net || c.spend) ? c.net - c.cogs - c.spend : null

  // One-line read: margin + which platform carried the day.
  let lede = `Contribution margin ${$(cm)} on ${$(m.grossSales)} gross.`
  if (ch && meta.spend > 0 && goog.spend > 0) {
    const mR = div(meta.net, meta.spend), gR = div(goog.net, goog.spend)
    if (mR != null && gR != null) {
      const [lead, lag] = gR >= mR ? [['Google', gR], ['Meta', mR]] : [['Meta', mR], ['Google', gR]]
      lede += ` ${lead[0]} led (${xR(lead[1])}); ${lag[0]} ${lag[1] < 1 ? 'ran below breakeven' : 'trailed'} (${xR(lag[1])}).`
    }
  }

  const kv = (label, value, strong) => `${label} — ${strong ? `*${value}*` : value}`
  const group = (title, lines) => ({ type: 'section', text: { type: 'mrkdwn', text: `*${title}*\n${lines.join('\n')}` } })
  const platform = (title, c) => group(title, c ? [
    kv('Spend', $(c.spend)),
    kv('ROAS', xR(div(c.net, c.spend))),
    ...(title === 'META' ? [kv('AOV', $(div(c.net, c.orders)))] : []),
    kv('% of Paid Ad Rev', pct1(div(c.net, paidNet)), true),
    kv('Contribution Margin', chCM(c) == null ? '—' : $(chCM(c)), true),
  ] : [kv('Spend', $(title === 'META' ? m.metaSpend : m.googleSpend)), 'splits arrive with the next snapshot'])

  const summary = `${clientName} — Daily P&L · ${prettyDate(date)} · CM ${$(cm)} on ${$(m.grossSales)} gross`
  return {
    text: summary, // notification fallback
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `📊 ${clientName} — Daily P&L · ${prettyDate(date)}`, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: lede } },
      group('REVENUE & ORDERS', [
        kv('Gross Revenue', $(m.grossSales)),
        kv('Orders > $0', m.totalOrders ?? '—'),
        kv('New Orders', m.nOrders != null ? `${m.nOrders} (${pct1(m.nOrderPct)})` : '—'),
      ]),
      platform('META', meta),
      platform('GOOGLE', goog),
      group('BLENDED', [
        kv('ROAS', xR(m.blendedRoas)),
        kv('AOV', $(m.trueAov)),
        kv('CPA', $(m.blendedCpa)),
      ]),
      group('MARGIN', [
        kv('COGS (BOM)', $(m.cogs)),
        kv('Contribution Margin', $(cm), true),
      ]),
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Open Overview' }, style: 'primary', url: `https://app.conversionhero.co/control/${clientId}/mission` },
        { type: 'button', text: { type: 'plain_text', text: 'Daily P&L History' }, url: `https://app.conversionhero.co/control/${clientId}/mission` },
      ] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `ConversionHero mission agent · day = ${tz} · same math as the Overview table · Website (GA4) joins when connected` }] },
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

  const payload = formatDigest(client.client_name || client.client_id, client.client_id, date, row.metrics || {}, tz)
  try {
    const res = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    return { client_id: client.client_id, date, posted: res.ok, status: res.status }
  } catch (e) {
    return { client_id: client.client_id, date, error: String(e?.message || e) }
  }
}
