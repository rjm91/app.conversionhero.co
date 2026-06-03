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

function buildEmailHtml({ message, link, lines, total }) {
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
    <div style="text-align:center;margin:24px 0;">${button}</div>
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

    // 4. Email the client via Resend
    await sendEmail({
      to: customer.email,
      subject: subject || 'Your Conversion Hero agreement & invoice',
      html: buildEmailHtml({ message, link, lines, total }),
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
