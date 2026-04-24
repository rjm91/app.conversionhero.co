import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { qbQuery, isQBConnected } from '../../../../lib/quickbooks'

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

export async function GET() {
  try {
    const connected = await isQBConnected()
    if (!connected) return NextResponse.json({ skipped: 'QB not connected' })

    const supabase = db()

    const [{ data: existing }, { data: billing }, { data: allClients }] = await Promise.all([
      supabase.from('client_payments').select('invoice_id, client_id').eq('merchant', 'QBO').not('invoice_id', 'is', null),
      supabase.from('client_billing').select('client_id, qb_customer_id').not('qb_customer_id', 'is', null),
      supabase.from('client').select('client_id, client_name'),
    ])

    const invoiceToClient = {}
    for (const row of (existing || [])) invoiceToClient[row.invoice_id] = row.client_id

    const qbCustomerToClient = {}
    for (const row of (billing || [])) {
      if (row.qb_customer_id) qbCustomerToClient[row.qb_customer_id] = row.client_id
    }

    const normalize = s => s?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
    const clientNameMap = {}
    for (const c of (allClients || [])) {
      const key = normalize(c.client_name)
      if (key) clientNameMap[key] = c.client_id
    }

    const invoices = await fetchAllQBInvoices()
    const rows = []

    for (const inv of invoices) {
      const qbName = normalize(inv.CustomerRef?.name)
      const clientFromName = qbName
        ? Object.entries(clientNameMap).find(([key]) => qbName.includes(key) || key.includes(qbName))?.[1]
        : undefined
      const clientId = invoiceToClient[inv.Id] || qbCustomerToClient[inv.CustomerRef?.value] || clientFromName
      if (!clientId) continue
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

    await supabase.from('client_payments').delete().eq('merchant', 'QBO')
    if (rows.length) await supabase.from('client_payments').insert(rows)

    return NextResponse.json({ synced: rows.length, total: invoices.length })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
