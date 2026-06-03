import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findOrCreateCustomer, findOrCreateItem, createInvoice, getInvoiceLink } from '../../../../lib/quickbooks.js'
import { buildAgreementEmailHtml, defaultTermsText } from '../../../../lib/agreement-email.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function sendEmail({ to, cc, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not set')
  const payload = {
    from: 'ConversionHero <notifications@send.conversionhero.co>',
    to,
    subject,
    html,
  }
  const ccList = (Array.isArray(cc) ? cc : [])
    .map(e => String(e).trim())
    .filter(e => e && e.toLowerCase() !== String(to).toLowerCase())
  if (ccList.length) payload.cc = ccList
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || `Email failed (${res.status})`)
  return json
}


export async function POST(request) {
  try {
    const { leadId, subject, message, terms, cc, customer, lines, agreement } = await request.json()
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
    const termsText = terms || defaultTermsText({ customer, agreement })
    await sendEmail({
      to: customer.email,
      cc,
      subject: subject || 'Your ConversionHero agreement & invoice',
      html: buildAgreementEmailHtml({ message, link: buttonLink, lines, total, termsText }),
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
