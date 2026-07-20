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

// ONE editable template, many renderers. The digest body is a text template
// with {{token}} placeholders (per-client override in settings.digest_template,
// falling back to the default below). digestModel() computes the token values;
// renderDigest() fills the template and renders BOTH the Slack Block Kit
// payload and the plain-text twin (the daily SMS via Chorus) — first line
// becomes the Slack header, blank-line paragraphs become sections, *bold*
// survives in Slack and is stripped for SMS. Buttons + footer are appended
// automatically per channel and are not part of the editable body.
export const DEFAULT_DIGEST_TEMPLATE = `📊 {{client}} — Daily P&L · {{date}}

{{lede}}

*REVENUE*
Gross Revenue — {{gross}}
Discounts — {{discounts}}
Refunds — {{refunds}}
Net Revenue — *{{net}}*

*ORDERS*
Orders — {{orders}}
New orders (order rate) — {{new_orders}} ({{new_order_rate}})
AOV — {{aov}}

*PAID ADS REVENUE*

BLENDED ADS
Spend — {{bl_spend}}
Attributed orders — {{bl_orders}}
CAC — {{bl_cac}}
AOV — {{bl_aov}}
ROAS — {{blended_roas}}
COGS (BOM) — {{bl_cogs}}
Net — *{{bl_net}}*
True ROAS — {{bl_troas}}

META ADS
Spend — {{meta_spend}}
Attributed orders — {{meta_orders}}
CAC — {{meta_cac}}
AOV — {{meta_aov}}
% of Paid Ad Rev — {{meta_pct}}
ROAS — {{meta_roas}}
COGS (BOM) — {{meta_cogs}}
Net — *{{meta_net}}*
True ROAS — {{meta_troas}}

GOOGLE ADS
Spend — {{google_spend}}
Attributed orders — {{google_orders}}
CAC — {{google_cac}}
AOV — {{google_aov}}
% of Paid Ad Rev — {{google_pct}}
ROAS — {{google_roas}}
COGS (BOM) — {{google_cogs}}
Net — *{{google_net}}*
True ROAS — {{google_troas}}

*ORGANIC REVENUE*
{{organic_lines}}

*MARGIN*
COGS (BOM) — {{cogs}}
Net — *{{net_margin}}*`

export function digestModel(clientName, clientId, date, m = {}, tz = DEFAULT_TZ, extras = {}) {
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

  // Per-channel day rows (client_channel_daily_pnl) — organic split + gross.
  const rows = extras.channelRows || []
  const organic = rows
    .filter(r => r.channel !== 'Meta' && r.channel !== 'Google' && Number(r.net_revenue) > 0)
    .sort((a, b) => Number(b.net_revenue) - Number(a.net_revenue))
  const organicLines = organic.length
    ? organic.map(r => `${r.channel} net revenue — ${$(r.net_revenue)}`).join('\n')
    : 'no organic revenue this day'

  // One paid block's tokens (Blended = Meta + Google summed).
  const troasOf = (c) => c && c.spend > 0 ? xR((c.net - c.cogs) / c.spend) : '—'
  const block = (prefix, c) => ({
    [`${prefix}_spend`]: c ? $(c.spend) : '—',
    [`${prefix}_orders`]: c ? String(c.orders ?? '—') : '—',
    [`${prefix}_cac`]: c ? $(div(c.spend, c.orders)) : '—',
    [`${prefix}_aov`]: c ? $(div(c.net, c.orders)) : '—',
    [`${prefix}_roas`]: c ? xR(div(c.net, c.spend)) : '—',
    [`${prefix}_cogs`]: c ? $(c.cogs) : '—',
    [`${prefix}_net`]: c && chCM(c) != null ? $(chCM(c)) : '—',
    [`${prefix}_troas`]: troasOf(c),
  })
  const blended = ch ? { net: meta.net + goog.net, cogs: meta.cogs + goog.cogs, orders: meta.orders + goog.orders, spend: meta.spend + goog.spend } : null

  const tokens = {
    client: clientName,
    date: prettyDate(date),
    lede,
    gross: $(m.grossSales), discounts: $(m.discounts), refunds: $(m.refunds),
    net: $(extras.netSales ?? m.netSales),
    orders: String(m.totalOrders ?? '—'),
    new_orders: m.nOrders != null ? String(m.nOrders) : '—',
    new_order_rate: m.nOrders != null ? pct1(m.nOrderPct) : '—',
    aov: $(m.trueAov), cpa: $(m.blendedCpa), blended_roas: xR(m.blendedRoas),
    ...block('bl', blended),
    ...block('meta', meta),
    ...block('google', goog),
    meta_pct: meta ? pct1(div(meta.net, paidNet)) : '—',
    google_pct: goog ? pct1(div(goog.net, paidNet)) : '—',
    // legacy token names kept so saved custom templates keep rendering
    meta_cm: meta && chCM(meta) != null ? $(chCM(meta)) : '—',
    google_cm: goog && chCM(goog) != null ? $(chCM(goog)) : '—',
    organic_lines: organicLines,
    cogs: $(m.cogs), cm: $(cm),
    net_margin: $(m.grossProfit ?? cm),
    url: `https://app.conversionhero.co/control/${clientId}/mission`,
  }

  // Fallbacks when the snapshot predates per-channel splits.
  if (!meta && m.metaSpend != null) tokens.meta_spend = $(m.metaSpend)
  if (!goog && m.googleSpend != null) tokens.google_spend = $(m.googleSpend)
  if (!blended && m.totalSpend != null) tokens.bl_spend = $(m.totalSpend)

  return {
    clientName, clientId, date, tz, tokens,
    summary: `${clientName} — Daily P&L · ${prettyDate(date)} · CM ${$(cm)} on ${$(m.grossSales)} gross`,
    url: tokens.url,
    footer: `ConversionHero mission agent · day = ${tz} · same math as the Overview table · Website (GA4) joins when connected`,
  }
}

// Fill a template and render both channels from the SAME filled body.
export function renderDigest(template, mod) {
  const filled = template.replace(/\{\{(\w+)\}\}/g, (_, k) => mod.tokens[k] != null ? String(mod.tokens[k]) : `{{${k}}}`)
  const paras = filled.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
  const firstLines = (paras[0] || '').split('\n')
  const header = (firstLines[0] || `${mod.clientName} — Daily P&L`).replace(/\*/g, '')
  const afterHeader = firstLines.slice(1).join('\n').trim()
  const sections = [...(afterHeader ? [afterHeader] : []), ...paras.slice(1)]
  const payload = {
    text: mod.summary, // notification fallback
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: header, emoji: true } },
      ...sections.map(p => ({ type: 'section', text: { type: 'mrkdwn', text: p } })),
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Open Overview' }, style: 'primary', url: mod.url },
        { type: 'button', text: { type: 'plain_text', text: 'Daily P&L History' }, url: mod.url },
      ] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: mod.footer }] },
    ],
  }
  const text = filled.replace(/\*/g, '') + `\n\nFull view: ${mod.url}`
  return { payload, text }
}

// Ensure the day's snapshot exists, then build every rendering (no posting).
// Shared by the Slack sender, the Settings preview, and the Chorus MCP tool.
export async function buildDigestForDay(db, client, opts = {}) {
  const settings = client.settings || {}
  const tz = settings.timezone || DEFAULT_TZ
  const date = opts.date || dayInTz(tz, -1)
  let { data: row } = await db.from('client_daily_pnl')
    .select('metrics, net_sales').eq('client_id', client.client_id).eq('date', date).maybeSingle()
  if (!row) {
    try { await snapshotDailyPnl(db, client.client_id, date, date) } catch { /* best-effort */ }
    ;({ data: row } = await db.from('client_daily_pnl')
      .select('metrics, net_sales').eq('client_id', client.client_id).eq('date', date).maybeSingle())
  }
  if (!row) return { date, error: 'no data' }
  // Per-channel rows for the organic split (Direct, Klaviyo, Shop, …).
  const { data: channelRows } = await db.from('client_channel_daily_pnl')
    .select('channel, net_revenue, gross_revenue, orders, cogs, spend')
    .eq('client_id', client.client_id).eq('day', date)
  const name = client.client_name || client.client_id
  const mod = digestModel(name, client.client_id, date, row.metrics || {}, tz, { netSales: row.net_sales, channelRows: channelRows || [] })
  const template = (settings.digest_template || '').trim() || DEFAULT_DIGEST_TEMPLATE
  const { payload, text } = renderDigest(template, mod)
  return {
    date, payload, text,
    template, defaultTemplate: DEFAULT_DIGEST_TEMPLATE, custom: template !== DEFAULT_DIGEST_TEMPLATE,
    tokens: mod.tokens, footer: mod.footer, url: mod.url,
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
  // format 'text' posts the plain-text (SMS) rendering instead of the blocks —
  // used by the Settings test button to proof the daily text in Slack.
  const body = opts.format === 'text' ? { text: built.text } : built.payload
  try {
    const res = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { client_id: client.client_id, date: built.date, posted: res.ok, status: res.status }
  } catch (e) {
    return { client_id: client.client_id, date: built.date, error: String(e?.message || e) }
  }
}
