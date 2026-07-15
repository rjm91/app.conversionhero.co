// Shared builder for the agreement email so the in-app preview is a true
// mirror of what the client receives. Pure string-building, no server deps.

export function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString() }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtDateLong(d) {
  if (!d) return ''
  const [y, m, day] = String(d).split('-').map(Number)
  if (!y) return String(d)
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// The default, editable terms text (plain text with the deal's values filled
// in). The closer can edit this freely; it renders via renderTermsText below.
export function defaultTermsText({ customer = {}, agreement = {} }) {
  const company = customer.company || customer.contact || 'Client'
  const clientName = agreement.legalName || company
  const clientAddr = agreement.address ? `, with principal place of business at ${agreement.address}` : ''
  const pkg = agreement.packageName || 'selected'
  const monthly = money(agreement.monthly)
  const setup = money(Number(agreement.setupFee) || 0)
  const adPct = Number(agreement.adPct) || 15
  const revPct = Number(agreement.revPct) || 0
  const term = (agreement.term || '4 months').trim()
  const isMonthToMonth = /month\s*-?\s*to\s*-?\s*month/i.test(term)

  // Section 2 — Services / Deliverable
  const services = agreement.custom
    ? `Provider will deliver the following for Client: ${agreement.scope || 'the services described in this agreement'}. Weekly check-in calls (up to 1 hour) and advertising consulting are available on an as-needed basis. Provider does not guarantee any specific number of leads, sales, or revenue.`
    : `Provider will produce ${agreement.videos != null ? agreement.videos : 'the contracted number of'} short-form videos per month under the ${pkg} package and manage Client's YouTube advertising using those videos as ad creative. Weekly check-in calls (up to 1 hour) and advertising consulting are available on an as-needed basis. The deliverable is the production of the videos and management of advertising; Provider does not guarantee any specific number of leads, sales, or revenue.`

  // Section 3 — Fees
  const feeLines = [`- Setup fee: ${setup}, one-time, due on the first invoice.`]
  if (Number(agreement.monthly) > 0) feeLines.push(`- Monthly fee: ${monthly}/month for the ${pkg} package, billed monthly.`)
  if (agreement.adOn) feeLines.push(`- Ad-spend commission: in any month where managed ad spend exceeds $10,000, a ${adPct}% commission applies to the full ad spend for that month, billed monthly. Months at or under $10,000 incur no commission.`)
  if (agreement.revOn) {
    const start = agreement.revStart ? fmtDateLong(agreement.revStart) : 'a date to be agreed'
    feeLines.push(`- Revenue share: beginning ${start}, Client pays ${revPct}% of collected revenue, billed monthly. No revenue share applies before that date.`)
  }

  // Section 4 — Term
  const termText = isMonthToMonth
    ? `This is a month-to-month engagement with no minimum commitment; either party may cancel with reasonable notice.`
    : `${term} minimum commitment, beginning on the date of first payment. After the initial term it continues month-to-month until either party cancels.`

  return `1. Parties
This agreement is between ConversionHero, LLC ("Provider," 3300 N Scottsdale Rd, Scottsdale, AZ 85251) and ${clientName} ("Client")${clientAddr}.

2. Services / Deliverable
${services}

3. Fees
${feeLines.join('\n')}

4. Term
${termText}

5. Refunds
All fees are non-refundable once paid, including if Client cancels mid-month. Client remains responsible for any outstanding ad-account, commission, and revenue-share balances.

6. Exclusivity
Leads and campaign assets generated through Provider's marketing efforts are exclusive to Client.

7. Payment Authorization & Acceptance
By paying the invoice associated with this agreement, Client (a) authorizes ConversionHero, LLC to charge the payment method on file for the setup fee, recurring monthly fee, and any applicable ad-spend commission or revenue share, and (b) confirms Client has read, understood, and agrees to all terms herein.`
}

// Render editable terms text to HTML: "N. Title" lines become bold headings,
// "- " lines become bullets, everything else a paragraph.
function renderTermsText(text) {
  const lines = String(text || '').split('\n')
  let body = ''
  for (const raw of lines) {
    // Leading whitespace (tabs or spaces) sets the indent level: one level per
    // tab or two spaces. Bullets nest; paragraphs indent.
    const m = raw.match(/^([ \t]*)(.*)$/)
    const ws = (m && m[1]) || ''
    const line = ((m && m[2]) || '').trim()
    if (!line) { body += '<div style="height:8px"></div>'; continue }
    const level = Math.min(6, ws.replace(/\t/g, '  ').length >> 1)
    const pad = level * 20
    if (/^#{1,3}\s/.test(line)) {
      // Markdown-style heading (# Title). Fewer #, larger.
      const hashes = (line.match(/^#+/) || [''])[0].length
      const t = line.replace(/^#{1,3}\s+/, '')
      const size = hashes === 1 ? 14 : 13
      body += `<p style="margin:12px 0 2px ${pad}px;font-size:${size}px;font-weight:700;color:#111827;">${esc(t)}</p>`
    } else if (/^\d+\.\s/.test(line) && level === 0) {
      // Numbered section heading (1. Parties) — the legal convention.
      body += `<p style="margin:12px 0 2px;font-size:13px;font-weight:700;color:#111827;">${esc(line)}</p>`
    } else if (line.startsWith('- ')) {
      body += `<p style="margin:2px 0 2px ${14 + pad}px;font-size:13px;color:#4b5563;line-height:1.6;">&bull; ${esc(line.slice(2))}</p>`
    } else {
      body += `<p style="margin:0 0 4px ${pad}px;font-size:13px;color:#4b5563;line-height:1.6;">${esc(line)}</p>`
    }
  }
  return `<div style="margin:22px 0;padding:18px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;"><p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#111827;">Service Agreement &amp; Terms</p>${body}</div>`
}

// Render the multi-option "Choose how to pay" block: one card per payment
// option (label, note, big amount, its own Pay button). Only the button the
// client clicks ever becomes an invoice.
function renderOptionsBlock(options) {
  const cards = (options || []).map(o => {
    const button = o.payUrl
      ? `<a href="${o.payUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">Pay ${money(o.amount)} →</a>`
      : `<span style="color:#b91c1c;font-size:13px;">Payment link unavailable — please contact us.</span>`
    return `
    <table style="width:100%;border-collapse:separate;margin:0 0 14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
      <tr><td style="padding:18px 20px;text-align:center;">
        <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#111827;">${esc(o.label || 'Payment option')}</p>
        ${o.note ? `<p style="margin:0 0 10px;font-size:13px;color:#6b7280;line-height:1.5;">${esc(o.note)}</p>` : ''}
        <p style="margin:0 0 14px;font-size:28px;font-weight:800;color:#111827;">${money(o.amount)}</p>
        <div>${button}</div>
      </td></tr>
    </table>`
  }).join('')
  return `
    <p style="margin:20px 0 12px;font-size:15px;font-weight:700;color:#111827;text-align:center;">Choose how to pay</p>
    ${cards}`
}

export function buildAgreementEmailHtml({ message, link, lines, total, termsText, options }) {
  const hasOptions = Array.isArray(options) && options.length > 0
  const rows = (lines || []).map(l => `
    <tr>
      <td style="padding:8px 0;color:#374151;font-size:14px;">${esc(l.description || l.name)}</td>
      <td style="padding:8px 0;color:#111827;font-size:14px;text-align:right;font-weight:600;">${money(l.amount)}</td>
    </tr>`).join('')
  const body = String(message || '').split('\n').map(p => `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">${esc(p) || '&nbsp;'}</p>`).join('')
  const button = link
    ? `<a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">Review &amp; Pay →</a>`
    : `<p style="color:#b91c1c;font-size:13px;">Payment link unavailable — please contact us.</p>`

  // Multi-option flow: show a Pay button per option instead of the single
  // line-items table + single Pay button.
  const chargeBlock = hasOptions
    ? renderOptionsBlock(options)
    : `
    <table style="width:100%;border-collapse:collapse;margin:20px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
      ${rows}
      <tr>
        <td style="padding:12px 0;color:#111827;font-size:15px;font-weight:700;">Total due</td>
        <td style="padding:12px 0;color:#111827;font-size:15px;font-weight:700;text-align:right;">${money(total)}</td>
      </tr>
    </table>`

  const authLine = hasOptions
    ? `<p style="font-size:12px;color:#6b7280;text-align:center;margin:0 0 14px;line-height:1.5;">Choosing an option and paying its invoice authorizes the charge for that option and confirms your agreement to the Service Agreement &amp; Terms.</p>`
    : `<p style="font-size:12px;color:#6b7280;text-align:center;margin:0 0 14px;line-height:1.5;">By clicking <strong>Review &amp; Pay</strong> and paying this invoice, you authorize the charges above and agree to the Service Agreement &amp; Terms.</p>`

  // Payment (the option cards or the single Pay button) always sits BELOW the
  // agreement terms — read first, pay at the bottom. The single-invoice flow
  // still shows its line-items/total table up top for a quick summary.
  return `
  <div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,sans-serif;padding:24px;background:#ffffff;">
    ${body}
    ${hasOptions ? '' : chargeBlock}
    ${termsText ? renderTermsText(termsText) : ''}
    ${hasOptions ? chargeBlock : ''}
    ${authLine}
    ${hasOptions ? '' : `<div style="text-align:center;margin:8px 0 24px;">${button}</div>`}
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;text-align:center;">ConversionHero · Powered by QuickBooks secure payments</p>
  </div>`
}
