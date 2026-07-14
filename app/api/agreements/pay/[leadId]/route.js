import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findOrCreateCustomer, findOrCreateItem, createInvoice, getInvoiceLink } from '../../../../../lib/quickbooks.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Click-time pay router. The email's per-option Pay buttons point here with
// ?opt=<optionId>. The QuickBooks invoice is created ONLY for the option the
// client actually clicks — and only once (first click wins). Every path
// redirects the client somewhere useful; we never 500 the client.
export async function GET(request, { params }) {
  const { leadId } = await params
  const optId = new URL(request.url).searchParams.get('opt')
  const home = new URL('/control', request.url)
  const supabase = db()

  try {
    const { data: lead } = await supabase
      .from('agency_leads')
      .select('first_name, last_name, email, phone, company, sale_status, meta')
      .eq('id', leadId)
      .single()

    const ag = lead?.meta?.agreement
    if (!lead || !ag) return NextResponse.redirect(home)

    const options = Array.isArray(ag.paymentOptions) ? ag.paymentOptions : []
    const option = options.find(o => String(o.id) === String(optId))
    if (!option) return NextResponse.redirect(home)

    // 2. First-click-wins guard: if an invoice already exists for this
    // agreement, redirect to it — never create a second one, even if the
    // client clicks twice or later picks the other option.
    if (ag.payment?.invoiceLink) {
      return NextResponse.redirect(ag.payment.invoiceLink)
    }

    // 3. Create the invoice for this option now.
    const customer = {
      company: ag.company || lead.company || '',
      contact: ag.contact || [lead.first_name, lead.last_name].filter(Boolean).join(' '),
      email: ag.email || lead.email || '',
      phone: ag.phone || lead.phone || '',
    }
    const qbCustomer = await findOrCreateCustomer(customer)
    const item = await findOrCreateItem(option.label, option.amount)
    const invoice = await createInvoice({
      customerId: qbCustomer.Id,
      email: customer.email,
      lines: [{ itemId: item.Id, amount: Number(option.amount), description: option.note || option.label }],
    })
    const invoiceLink = await getInvoiceLink(invoice.Id)

    // 4. Persist the chosen option + invoice on the lead. Re-read meta first so
    // we don't clobber a concurrent write; if a payment landed in the meantime,
    // honor that one (first-click-wins) rather than overwriting it.
    const { data: fresh } = await supabase
      .from('agency_leads')
      .select('sale_status, meta')
      .eq('id', leadId)
      .single()
    const freshAg = fresh?.meta?.agreement || {}
    if (freshAg.payment?.invoiceLink) {
      return NextResponse.redirect(freshAg.payment.invoiceLink)
    }
    const meta = {
      ...(fresh?.meta || {}),
      agreement: {
        ...freshAg,
        viewed_at: freshAg.viewed_at || new Date().toISOString(),
        payment: {
          chosenOptionId: option.id,
          chosenLabel: option.label,
          amount: Number(option.amount),
          invoiceId: invoice.Id,
          invoiceLink,
          chosen_at: new Date().toISOString(),
        },
      },
    }
    const update = { meta }
    // Advance Agreement Sent -> Agreement Viewed; never regress a later stage.
    if (fresh?.sale_status === 'Agreement Sent') update.sale_status = 'Agreement Viewed'
    await supabase.from('agency_leads').update(update).eq('id', leadId)

    if (invoiceLink) return NextResponse.redirect(invoiceLink)
    return NextResponse.redirect(home)
  } catch {
    return NextResponse.redirect(home)
  }
}
