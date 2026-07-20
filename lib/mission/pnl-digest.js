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

// ONE digest template, many renderers. digestModel() computes the groups and
// lines once; formatDigest() renders Slack Block Kit, formatDigestText()
// renders the SAME content as plain text (the daily SMS via Chorus). Lines are
// [label, value, strong] tuples; a line with an empty label is a bare note.
export function digestModel(clientName, clientId, date, m = {}, tz = DEFAULT_TZ) {
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

  const platform = (title, c) => c ? [
    ['Spend', $(c.spend)],
    ['ROAS', xR(div(c.net, c.spend))],
    ...(title === 'META' ? [['AOV', $(div(c.net, c.orders))]] : []),
    ['% of Paid Ad Rev', pct1(div(c.net, paidNet)), true],
    ['Contribution Margin', chCM(c) == null ? '—' : $(chCM(c)), true],
  ] : [['Spend', $(title === 'META' ? m.metaSpend : m.googleSpend)], ['', 'splits arrive with the next snapshot']]

  return {
    clientName, clientId, date, tz,
    pretty: prettyDate(date),
    title: `📊 ${clientName} — Daily P&L · ${prettyDate(date)}`,
    lede,
    groups: [
      { title: 'REVENUE & ORDERS', lines: [
        ['Gross Revenue', $(m.grossSales)],
        ['Orders > $0', String(m.totalOrders ?? '—')],
        ['New Orders', m.nOrders != null ? `${m.nOrders} (${pct1(m.nOrderPct)})` : '—'],
      ] },
      { title: 'META', lines: platform('META', meta) },
      { title: 'GOOGLE', lines: platform('GOOGLE', goog) },
      { title: 'BLENDED', lines: [
        ['ROAS', xR(m.blendedRoas)],
        ['AOV', $(m.trueAov)],
        ['CPA', $(m.blendedCpa)],
      ] },
      { title: 'MARGIN', lines: [
        ['COGS (BOM)', $(m.cogs)],
        ['Contribution Margin', $(cm), true],
      ] },
    ],
    summary: `${clientName} — Daily P&L · ${prettyDate(date)} · CM ${$(cm)} on ${$(m.grossSales)} gross`,
    url: `https://app.conversionhero.co/control/${clientId}/mission`,
    footer: `ConversionHero mission agent · day = ${tz} · same math as the Overview table · Website (GA4) joins when connected`,
  }
}

// Slack Block Kit rendering. Slack can't color text, so the green highlights
// (% of paid + contribution margin) are bold instead.
export function formatDigest(clientName, clientId, date, m = {}, tz = DEFAULT_TZ) {
  const mod = digestModel(clientName, clientId, date, m, tz)
  const kv = ([label, value, strong]) => label ? `${label} — ${strong ? `*${value}*` : value}` : value
  return {
    text: mod.summary, // notification fallback
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: mod.title, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: mod.lede } },
      ...mod.groups.map(g => ({ type: 'section', text: { type: 'mrkdwn', text: `*${g.title}*\n${g.lines.map(kv).join('\n')}` } })),
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Open Overview' }, style: 'primary', url: mod.url },
        { type: 'button', text: { type: 'plain_text', text: 'Daily P&L History' }, url: mod.url },
      ] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: mod.footer }] },
    ],
  }
}

// Plain-text rendering of the SAME model — daily text notifications (Chorus
// pulls this via the get_daily_digest MCP tool and sends it as SMS).
export function formatDigestText(clientName, clientId, date, m = {}, tz = DEFAULT_TZ) {
  const mod = digestModel(clientName, clientId, date, m, tz)
  const kv = ([label, value]) => label ? `${label}: ${value}` : value
  return [
    mod.title,
    mod.lede,
    '',
    ...mod.groups.flatMap(g => [g.title, ...g.lines.map(kv), '']),
    `Full view: ${mod.url}`,
  ].join('\n')
}

// Ensure the day's snapshot exists, then build every rendering (no posting).
// Shared by the Slack sender, the Settings preview, and the Chorus MCP tool.
export async function buildDigestForDay(db, client, opts = {}) {
  const settings = client.settings || {}
  const tz = settings.timezone || DEFAULT_TZ
  const date = opts.date || dayInTz(tz, -1)
  let { data: row } = await db.from('client_daily_pnl')
    .select('metrics').eq('client_id', client.client_id).eq('date', date).maybeSingle()
  if (!row) {
    try { await snapshotDailyPnl(db, client.client_id, date, date) } catch { /* best-effort */ }
    ;({ data: row } = await db.from('client_daily_pnl')
      .select('metrics').eq('client_id', client.client_id).eq('date', date).maybeSingle())
  }
  if (!row) return { date, error: 'no data' }
  const name = client.client_name || client.client_id
  return {
    date,
    payload: formatDigest(name, client.client_id, date, row.metrics || {}, tz),
    text: formatDigestText(name, client.client_id, date, row.metrics || {}, tz),
  }
}

// Send one client's digest for a day (default: yesterday in their timezone).
// Ensures the snapshot row exists (locks it on the fly if the nightly watcher
// hasn't yet). Returns a small result object; never throws to the caller.
export async function sendDailyPnlDigest(db, client, opts = {}) {
  const webhook = (client.settings || {}).slack_pnl_webhook
  if (!webhook) return { client_id: client.client_id, skipped: 'no webhook' }
  const built = await buildDigestForDay(db, client, opts)
  if (built.error) return { client_id: client.client_id, date: built.date, skipped: built.error }
  try {
    const res = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(built.payload) })
    return { client_id: client.client_id, date: built.date, posted: res.ok, status: res.status }
  } catch (e) {
    return { client_id: client.client_id, date: built.date, error: String(e?.message || e) }
  }
}
