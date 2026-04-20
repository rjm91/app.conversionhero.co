'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

const BILLING_TYPES = [
  { value: 'retainer', label: 'Monthly Retainer', description: 'Flat monthly fee only' },
  { value: 'retainer_plus_percent', label: 'Retainer + % of Ad Spend', description: 'Flat fee plus a percentage of ad spend' },
  { value: 'percent_only', label: '% of Ad Spend Only', description: 'Percentage of ad spend, no flat fee' },
]

function fmt(n) {
  if (!n) return '$0'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function BillingPage() {
  const { clientId } = useParams()
  const [billing, setBilling] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [role, setRole] = useState(null)

  // Form state
  const [billingType, setBillingType] = useState('retainer')
  const [retainerAmount, setRetainerAmount] = useState('')
  const [adSpendPercent, setAdSpendPercent] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => setRole(d.role || null))
  }, [])

  useEffect(() => {
    async function fetchData() {
      // Fetch billing config
      const { data: billingData } = await supabase
        .from('client_billing')
        .select('*')
        .eq('client_id', clientId)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()

      if (billingData) {
        setBilling(billingData)
        setBillingType(billingData.billing_type || 'retainer')
        setRetainerAmount(billingData.retainer_amount || '')
        setAdSpendPercent(billingData.ad_spend_percent || '')
        setEffectiveDate(billingData.effective_date || '')
        setNotes(billingData.notes || '')
      }

      // Fetch payment history for this client
      const { data: paymentData } = await supabase
        .from('client_payments')
        .select('*')
        .eq('client_id', clientId)
        .order('date_created', { ascending: false })

      if (paymentData) setPayments(paymentData)
      setLoading(false)
    }
    fetchData()
  }, [clientId])

  async function handleSave() {
    setSaving(true)
    const retainerVal = ['retainer', 'retainer_plus_percent'].includes(billingType) ? parseFloat(retainerAmount) || null : null
    const payload = {
      client_id: clientId,
      billing_type: billingType,
      retainer_amount: retainerVal,
      ad_spend_percent: ['retainer_plus_percent', 'percent_only'].includes(billingType) ? parseFloat(adSpendPercent) || null : null,
      monthly_budget: retainerVal || 0,
      effective_date: effectiveDate || null,
      notes: notes || null,
    }

    let result
    if (billing?.id) {
      result = await supabase.from('client_billing').update(payload).eq('id', billing.id).select().single()
    } else {
      result = await supabase.from('client_billing').insert(payload).select().single()
    }

    setSaving(false)
    if (result.error) {
      console.error('Billing save failed:', result.error)
      alert(`Save failed: ${result.error.message}`)
      return
    }
    if (result.data) setBilling(result.data)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Calculate MRR estimate
  function getMRRLabel() {
    if (billingType === 'retainer') return retainerAmount ? fmt(retainerAmount) + '/mo' : '—'
    if (billingType === 'percent_only') return adSpendPercent ? `${adSpendPercent}% of ad spend` : '—'
    if (billingType === 'retainer_plus_percent') {
      const parts = []
      if (retainerAmount) parts.push(fmt(retainerAmount))
      if (adSpendPercent) parts.push(`${adSpendPercent}% ad spend`)
      return parts.length ? parts.join(' + ') + '/mo' : '—'
    }
    return '—'
  }

  const totalCollected = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const isAgency = role === 'agency_admin' || role === 'agency_standard'
  const lastPayment = payments[0]

  // Client-view: estimate next payment date as 1 month after most recent payment
  function getNextPaymentDate() {
    if (!lastPayment?.date_created) return null
    const d = new Date(lastPayment.date_created)
    d.setMonth(d.getMonth() + 1)
    return d
  }
  const nextPaymentDate = getNextPaymentDate()

  function getPlanLabel() {
    if (billingType === 'retainer') return retainerAmount ? `${fmt(retainerAmount)}/mo` : '—'
    if (billingType === 'percent_only') return adSpendPercent ? `${adSpendPercent}% of ad spend` : '—'
    if (billingType === 'retainer_plus_percent') {
      const parts = []
      if (retainerAmount) parts.push(`${fmt(retainerAmount)}/mo`)
      if (adSpendPercent) parts.push(`${adSpendPercent}% ad spend`)
      return parts.length ? parts.join(' + ') : '—'
    }
    return '—'
  }

  function getPlanTypeLabel() {
    return BILLING_TYPES.find(t => t.value === billingType)?.label || 'Monthly Retainer'
  }

  return (
    <div className="p-8 max-w-4xl">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing</h1>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
          {isAgency
            ? "Configure this client's pricing model and view payment history."
            : 'View your plan, upcoming payment, and invoice history.'}
        </p>
      </div>

      {/* Summary cards */}
      {isAgency ? (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Total Collected</p>
            <p className="text-2xl font-bold text-[#22cbe3]">{fmt(totalCollected)}</p>
          </div>
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Invoices</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{payments.length}</p>
          </div>
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Current MRR</p>
            <p className="text-2xl font-bold text-[#34CC93]">{getMRRLabel()}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Current Plan</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{getPlanLabel()}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{getPlanTypeLabel()}</p>
          </div>
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Next Payment</p>
            <p className="text-2xl font-bold text-[#22cbe3]">
              {nextPaymentDate ? nextPaymentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {lastPayment ? `Est. ${fmt(lastPayment.amount)}` : 'No scheduled payment'}
            </p>
          </div>
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-5">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Payment Method</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {lastPayment?.merchant === 'STRIPE' ? 'Card' : lastPayment?.merchant === 'QBO' ? 'ACH / Check' : '—'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              via {lastPayment?.merchant === 'QBO' ? 'QuickBooks' : lastPayment?.merchant === 'STRIPE' ? 'Stripe' : lastPayment?.merchant || '—'}
            </p>
          </div>
        </div>
      )}

      {/* Pricing Model — agency only */}
      {isAgency && (
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Pricing Model</h2>

        {/* Billing type selector */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {BILLING_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => setBillingType(type.value)}
              className={`p-4 rounded-xl border text-left transition-all ${
                billingType === type.value
                  ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-500/10'
                  : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
              }`}
            >
              <p className={`text-sm font-semibold mb-1 ${billingType === type.value ? 'text-blue-500' : 'text-gray-900 dark:text-white'}`}>
                {type.label}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{type.description}</p>
            </button>
          ))}
        </div>

        {/* Inputs based on type */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {['retainer', 'retainer_plus_percent'].includes(billingType) && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Monthly Retainer ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={retainerAmount}
                  onChange={e => setRetainerAmount(e.target.value)}
                  placeholder="2500"
                  className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
          {['retainer_plus_percent', 'percent_only'].includes(billingType) && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Ad Spend Percentage (%)</label>
              <div className="relative">
                <input
                  type="number"
                  value={adSpendPercent}
                  onChange={e => setAdSpendPercent(e.target.value)}
                  placeholder="20"
                  className="w-full pl-4 pr-8 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Effective Date</label>
            <input
              type="date"
              value={effectiveDate}
              onChange={e => setEffectiveDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Any additional billing notes..."
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Billing Config'}
        </button>
      </div>
      )}

      {/* Payment History */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Payment History</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{payments.length} invoices across all payment processors</p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 p-6">Loading...</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 p-6">No payment history found for this client.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
                  <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Description</th>
                  <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Source</th>
                  <th className="text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Amount</th>
                  <th className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-6 py-3">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={p.id} className={`border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition ${i === payments.length - 1 ? 'border-0' : ''}`}>
                    <td className="px-6 py-3.5 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {p.date_created ? new Date(p.date_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-900 dark:text-white max-w-xs truncate">{p.description || '—'}</td>
                    <td className="px-6 py-3.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.merchant === 'STRIPE' ? 'text-purple-500 bg-purple-500/10' :
                        p.merchant === 'QBO' ? 'text-blue-500 bg-blue-500/10' :
                        'text-orange-500 bg-orange-500/10'
                      }`}>
                        {p.merchant === 'QBO' ? 'QuickBooks' : p.merchant === 'WAVE' ? 'Wave' : p.merchant || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm font-semibold text-gray-900 dark:text-white text-right whitespace-nowrap">
                      {fmt(p.amount)}
                    </td>
                    <td className="px-6 py-3.5 text-sm">
                      {p.invoice_link && p.invoice_link !== 'None' ? (
                        <a href={p.invoice_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 text-xs">
                          View →
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
