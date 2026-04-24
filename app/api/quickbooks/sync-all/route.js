import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { qbQuery } from '../../../../lib/quickbooks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function fetchAllQBInvoices() {
  const pageSize = 1000
  let start = 1
  let all = []
  while (true) {
    const data = await qbQuery(
      `SELECT * FROM Invoice ORDERBY TxnDate DESC MAXRESULTS ${pageSize} STARTPOSITION ${start}`
    )
    const batch = data.QueryResponse?.Invoice || []
    all = all.concat(batch)
    if (batch.length < pageSize) break
    start += pageSize
  }
  return all
}

export async function POST() {
  const supabase = db()

  // 1. Build invoice_id → client_id map from existing data
  const { data: existing } = await supabase
    .from('client_payments')
    .select('invoice_id, client_id')
    .eq('merchant', 'QBO')
    .not('invoice_id', 'is', null)

  const invoiceToClient = {}
  for (const row of (existing || [])) {
    invoiceToClient[row.invoice_id] = row.client_id
  }

  // 2. Build qb_customer_id → client_id map from billing config
  const { data: billing } = await supabase
    .from('client_billing')
    .select('client_id, qb_customer_id')
    .not('qb_customer_id', 'is', null)

  const qbCustomerToClient = {}
  for (const row of (billing || [])) {
    if (row.qb_customer_id) qbCustomerToClient[row.qb_customer_id] = row.client_id
  }

  // 3. Fetch all QB invoices
  const invoices = await fetchAllQBInvoices()

  // 4. Map each invoice to a client_id
  const rows = []
  let skipped = 0

  for (const inv of invoices) {
    const clientId = invoiceToClient[inv.Id] || qbCustomerToClient[inv.CustomerRef?.value]
    if (!clientId) { skipped++; continue }

    const desc = inv.Line?.find(l => l.Description && l.DetailType !== 'SubTotalLineDetail')?.Description || null

    rows.push({
      client_id:     clientId,
      merchant:      'QBO',
      date_created:  inv.TxnDate,
      invoice_id:    inv.Id,
      doc_id:        inv.DocNumber || null,
      customer_name: inv.CustomerRef?.name || null,
      description:   desc,
      amount:        inv.TotalAmt,
      invoice_link:  `https://app.qbo.intuit.com/app/invoice?txnId=${inv.Id}`,
    })
  }

  // 5. Replace all QBO rows
  await supabase.from('client_payments').delete().eq('merchant', 'QBO')

  if (rows.length) {
    const { error } = await supabase.from('client_payments').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    total:   invoices.length,
    synced:  rows.length,
    skipped,
  })
}
