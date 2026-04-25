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

async function fetchAllInvoices() {
  const pageSize = 1000
  let start = 1
  const all = []
  while (true) {
    const data = await qbQuery(
      `SELECT * FROM Invoice ORDERBY TxnDate DESC MAXRESULTS ${pageSize} STARTPOSITION ${start}`
    )
    const batch = data.QueryResponse?.Invoice || []
    all.push(...batch)
    if (batch.length < pageSize) break
    start += pageSize
  }
  return all
}

export async function GET() {
  try {
    const connected = await isQBConnected()
    if (!connected) return NextResponse.json({ error: 'QB not connected' }, { status: 400 })

    const realmId = process.env.QB_REALM_ID
    const invoices = await fetchAllInvoices()

    const supabase = db()
    await supabase.from('client_qb_payments').delete().eq('realm_id', realmId)

    const rows = invoices.map(inv => ({
      realm_id:      realmId,
      invoice_id:    inv.Id,
      doc_number:    inv.DocNumber || null,
      txn_date:      inv.TxnDate || null,
      customer_id:   inv.CustomerRef?.value || null,
      customer_name: inv.CustomerRef?.name || null,
      total_amt:     inv.TotalAmt ?? null,
      balance:       inv.Balance ?? null,
      description:   inv.Line?.find(l => l.Description && l.DetailType !== 'SubTotalLineDetail')?.Description || null,
      raw:           inv,
    }))

    if (rows.length) {
      const chunkSize = 500
      for (let i = 0; i < rows.length; i += chunkSize) {
        const { error } = await supabase.from('client_qb_payments').insert(rows.slice(i, i + chunkSize))
        if (error) return NextResponse.json({ error: error.message, inserted: i }, { status: 500 })
      }
    }

    const dates = rows.map(r => r.txn_date).filter(Boolean).sort()
    return NextResponse.json({
      total: invoices.length,
      inserted: rows.length,
      earliest_txn_date: dates[0] || null,
      latest_txn_date: dates[dates.length - 1] || null,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
