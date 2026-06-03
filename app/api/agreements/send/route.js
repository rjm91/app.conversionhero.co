import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findOrCreateCustomer, findOrCreateItem, createInvoice, getInvoiceLink } from '../../../../lib/quickbooks.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString() }

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not set')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Conversion Hero <notifications@send.conversionhero.co>',
      to,
      subject,
      html,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || `Email failed (${res.status})`)
  return json
}

function buildTermsHtml({ customer, agreement }) {
  const company = customer.company || customer.contact || 'Client'
  const pkg = agreement.packageName || 'selected'
  const videos = agreement.videos != null ? agreement.videos : 'the contracted number of'
  const monthly = agreement.monthly
  const setup = Number(agreement.setupFee) || 0
  const adPct = Number(agreement.adPct) || 15
  const sec = (n, title, inner) => `
    <p style="margin:14px 0 3px;font-size:13px;font-weight:700;color:#111827;">${n}. ${title}</p>
    <div style="font-size:13px;color:#4b5563;line-height:1.6;">${inner}</div>`
  const adClause = agreement.adOn
    ? `<li>Ad-spend commission: in any month where managed ad spend exceeds $10,000, a ${adPct}% commission applies to the full ad spend for that month, billed monthly. Months at or under $10,000 incur no commission.</li>`
    : ''
  return `
  <div style="margin:22px 0;padding:18px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">
    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#111827;">Service Agreement &amp; Terms</p>
    ${sec(1, 'Parties', `This agreement is between ConversionHero, LLC (&ldquo;Provider,&rdquo; 3300 N Scottsdale Rd, Scottsdale, AZ 85251) and <strong>${company}</strong> (&ldquo;Client&rdquo;).`)}
    ${sec(2, 'Services / Deliverable', `Provider will produce <strong>${videos} short-form videos per month</strong> under the <strong>${pkg}</strong> package and manage Client&rsquo;s YouTube advertising using those videos as ad creative. Weekly check-in calls (up to 1 hour) and advertising consulting are available on an as-needed basis. The deliverable is the production of the videos and management of advertising; Provider does not guarantee any specific number of leads, sales, or revenue.`)}
    ${sec(3, 'Fees', `<ul style="margin:4px 0;padding-left:18px;"><li>Setup fee: ${money(setup)}, one-time, due on the first invoice.</li><li>Monthly fee: ${money(monthly)}/month for the ${pkg} package, billed monthly.</li>${adClause}</ul>`)}
    ${sec(4, 'Term', `Four (4) month minimum commitment beginning on the date of first payment. After the initial term it continues month-to-month until either party cancels.`)}
    ${sec(5, 'Refunds', `All fees are non-refundable once paid, including if Client cancels mid-month. Client remains responsible for any outstanding ad-account and commission balances.`)}
    ${sec(6, 'Exclusivity', `Leads and campaign assets generated through Provider&rsquo;s marketing efforts are exclusive to Client.`)}
    ${sec(7, 'Payment Authorization &amp; Acceptance', `By paying the invoice associated with this agreement, Client (a) authorizes ConversionHero, LLC to charge the payment method on file for the setup fee, recurring monthly fee, and any applicable ad-spend commission, and (b) confirms Client has read, understood, and agrees to all terms herein.`)}
  </div>`
}

function buildEmailHtml({ message, link, lines, total, customer, agreement }) {
  const rows = lines.map(l => `
    <tr>
      <td style="padding:8px 0;color:#374151;font-size:14px;">${l.description || l.name}</td>
      <td style="padding:8px 0;color:#111827;font-size:14px;text-align:right;font-weight:600;">${money(l.amount)}</td>
    </tr>`).join('')
  const body = (message || '').split('\n').map(p => `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">${p || '&nbsp;'}</p>`).join('')
  const button = link
    ? `<a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">Review &amp; Pay →</a>`
    : `<p style="color:#b91c1c;font-size:13px;">Payment link unavailable — please contact us.</p>`
  return `
  <div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,sans-serif;padding:24px;">
    ${body}
    <table style="width:100%;border-collapse:collapse;margin:20px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
      ${rows}
      <tr>
        <td style="padding:12px 0;color:#111827;font-size:15px;font-weight:700;">Total due</td>
        <td style="padding:12px 0;color:#111827;font-size:15px;font-weight:700;text-align:right;">${money(total)}</td>
      </tr>
    </table>
    ${customer && agreement ? buildTermsHtml({ customer, agreement }) : ''}
    <p style="font-size:12px;color:#6b7280;text-align:center;margin:0 0 14px;line-height:1.5;">By clicking <strong>Review &amp; Pay</strong> and paying this invoice, you authorize the charges above and agree to the Service Agreement &amp; Terms.</p>
    <div style="text-align:center;margin:8px 0 24px;">${button}</div>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Conversion Hero · Powered by QuickBooks secure payments</p>
  </div>`
}

export async function POST(request) {
  try {
    const { leadId, subject, message, customer, lines, agreement } = await request.json()
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 })
    if (!customer?.email) return NextResponse.json({ error: 'Customer email is required to send.' }, { status: 400 })
    if (!Array.isArray(lines) || lines.length === 0) return NextResponse.json({ error: 'No line items to invoice.' }, { status: 400 })

    // 1. Find or create the QuickBooks customer
    const qbCustomer = await findOrCreateCustomer(customer)

    // 2. Find or create an item for each line, build invoice lines
    const invoiceLines = []
    for (const l of lines) {
      const item = await findOrCreateItem(l.name, l.amount)
      invoiceLines.push({ itemId: item.Id, amount: l.amount, description: l.description || l.name })
    }

    // 3. Create the invoice and grab its payment link
    const invoice = await createInvoice({ customerId: qbCustomer.Id, email: customer.email, lines: invoiceLines })
    const link = await getInvoiceLink(invoice.Id)
    const total = invoice.TotalAmt

    // 4. Email the client via Resend. The Pay button routes through our
    // tracking endpoint (records the view) before redirecting to QuickBooks.
    const origin = new URL(request.url).origin
    const buttonLink = link ? `${origin}/api/agreements/track/${leadId}` : null
    await sendEmail({
      to: customer.email,
      subject: subject || 'Your Conversion Hero agreement & invoice',
      html: buildEmailHtml({ message, link: buttonLink, lines, total, customer, agreement }),
    })

    // 5. Update the deal: status + invoice details on meta
    const supabase = db()
    const { data: lead } = await supabase.from('agency_leads').select('meta').eq('id', leadId).single()
    const meta = {
      ...(lead?.meta || {}),
      agreement: {
        ...(agreement || {}),
        invoice: { id: invoice.Id, link, total, sent_at: new Date().toISOString() },
      },
    }
    await supabase.from('agency_leads').update({ sale_status: 'Agreement Sent', meta }).eq('id', leadId)

    return NextResponse.json({ ok: true, link, invoiceId: invoice.Id, total })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
