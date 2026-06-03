import { qbQuery } from './quickbooks.js'

// For deals with a sent/viewed agreement invoice, check QuickBooks for payment
// (Balance === 0) and advance their sale_status to "Invoice Paid". Never
// downgrades deals already past this stage (only touches Sent/Viewed).
export async function syncAgreementPaidStatuses(supabase) {
  const { data: leads } = await supabase
    .from('agency_leads')
    .select('id, sale_status, meta')
    .in('sale_status', ['Agreement Sent', 'Agreement Viewed'])

  const pending = (leads || []).filter(l => l?.meta?.agreement?.invoice?.id)
  if (!pending.length) return { checked: 0, paid: 0 }

  const ids = [...new Set(pending.map(l => String(l.meta.agreement.invoice.id).replace(/'/g, '')))]
  const idList = ids.map(i => `'${i}'`).join(',')
  const res = await qbQuery(`SELECT Id, Balance, TotalAmt FROM Invoice WHERE Id IN (${idList})`)
  const invoices = res.QueryResponse?.Invoice || []
  const paidIds = new Set(
    invoices.filter(i => Number(i.Balance) === 0 && Number(i.TotalAmt) > 0).map(i => String(i.Id))
  )

  let paid = 0
  for (const l of pending) {
    if (paidIds.has(String(l.meta.agreement.invoice.id))) {
      const meta = {
        ...l.meta,
        agreement: {
          ...l.meta.agreement,
          invoice: { ...l.meta.agreement.invoice, paid_at: new Date().toISOString() },
        },
      }
      await supabase.from('agency_leads').update({ sale_status: 'Invoice Paid', meta }).eq('id', l.id)
      paid++
    }
  }
  return { checked: pending.length, paid }
}
