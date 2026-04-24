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

export async function POST(request) {
  const { clientId, qbCustomerId } = await request.json()
  if (!clientId || !qbCustomerId) {
    return NextResponse.json({ error: 'clientId and qbCustomerId required' }, { status: 400 })
  }

  // Fetch all invoices for this QB customer (paid = Balance 0, unpaid included for completeness)
  const sql = `SELECT * FROM Invoice WHERE CustomerRef = '${qbCustomerId}' ORDERBY TxnDate DESC MAXRESULTS 200`
  const data = await qbQuery(sql)
  const invoices = data.QueryResponse?.Invoice || []

  if (!invoices.length) {
    return NextResponse.json({ synced: 0 })
  }

  // Map QB invoices → client_payments rows
  const rows = invoices.map(inv => {
    const desc = inv.Line?.find(l => l.Description && l.DetailType !== 'SubTotalLineDetail')?.Description || null
    return {
      client_id:    clientId,
      merchant:     'QBO',
      date_created: inv.TxnDate,
      invoice_id:   inv.Id,
      doc_id:       inv.DocNumber || null,
      customer_name: inv.CustomerRef?.name || null,
      description:  desc,
      amount:       inv.TotalAmt,
      invoice_link: `https://app.qbo.intuit.com/app/invoice?txnId=${inv.Id}`,
    }
  })

  const supabase = db()

  // Delete old QBO rows for this client then re-insert (avoids constraint issues)
  await supabase.from('client_payments').delete()
    .eq('client_id', clientId).eq('merchant', 'QBO')

  const { error } = await supabase.from('client_payments').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update last synced timestamp on billing config
  await supabase.from('client_billing')
    .update({ qb_last_synced_at: new Date().toISOString() })
    .eq('client_id', clientId)

  return NextResponse.json({ synced: rows.length })
}
