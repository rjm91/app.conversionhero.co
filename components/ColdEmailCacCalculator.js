'use client'

import { useState } from 'react'

// Cold-email cost-of-acquisition model. Inputs drive a funnel back-calculation
// of the max you can spend at each step, plus ROI. (Corrected from the original
// spreadsheet, whose formula references were all off by one row.)
const DEFAULTS = {
  targetCac:        1000,  // max cost per customer ($)
  closeRate:        25,    // appt → sale (%)
  replyToApptRate:  40,    // positive reply → appt (%)
  positiveReplyRate: 2,    // positive reply per email sent (%)
  costPerEmail:     0.10,  // tooling/data/infra ($)
  avgDealSize:      3000,  // ($)
}

const fmt$ = (n) =>
  !isFinite(n) ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n) =>
  !isFinite(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function ColdEmailCacCalculator({ onClose }) {
  const [v, setV] = useState(DEFAULTS)
  const set = (k) => (e) => {
    const n = parseFloat(e.target.value)
    setV((prev) => ({ ...prev, [k]: isNaN(n) ? '' : n }))
  }

  // decimals
  const close   = (Number(v.closeRate) || 0) / 100
  const r2a     = (Number(v.replyToApptRate) || 0) / 100
  const prr     = (Number(v.positiveReplyRate) || 0) / 100
  const cac     = Number(v.targetCac) || 0
  const cpe     = Number(v.costPerEmail) || 0
  const deal    = Number(v.avgDealSize) || 0

  // funnel (per sale)
  const apptsPerSale   = close ? 1 / close : Infinity
  const repliesPerSale = r2a ? apptsPerSale / r2a : Infinity
  const emailsPerSale  = prr ? repliesPerSale / prr : Infinity

  // max spend at each step
  const maxCostPerAppt  = cac / apptsPerSale
  const maxCostPerReply = cac / repliesPerSale
  const maxCostPerEmail = cac / emailsPerSale

  // economics
  const hardCostPerSale = emailsPerSale * cpe
  const budgetRemaining = cac - hardCostPerSale
  const profitPerCust   = deal - cac
  const roi             = cac ? deal / cac : Infinity
  const sendUnderBudget = isFinite(maxCostPerEmail) && cpe <= maxCostPerEmail

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#171B33] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-white/10">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/10 sticky top-0 bg-white dark:bg-[#171B33]">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Cold Email CAC Calculator</h2>
            <p className="text-xs text-gray-400 mt-0.5">Back-calculate the max you can spend at each step of the funnel.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* inputs */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Inputs — adjust these</div>
            <div className="space-y-3">
              <Field label="Target CAC (max cost per customer)" prefix="$"><Num value={v.targetCac} onChange={set('targetCac')} /></Field>
              <Field label="Close rate (appt → sale)" suffix="%"><Num value={v.closeRate} onChange={set('closeRate')} /></Field>
              <Field label="Reply → appt rate" suffix="%"><Num value={v.replyToApptRate} onChange={set('replyToApptRate')} /></Field>
              <Field label="Positive reply rate (of emails sent)" suffix="%"><Num value={v.positiveReplyRate} onChange={set('positiveReplyRate')} step="0.1" /></Field>
              <Field label="Cost per email sent (tooling/data)" prefix="$"><Num value={v.costPerEmail} onChange={set('costPerEmail')} step="0.01" /></Field>
              <Field label="Average deal size" prefix="$"><Num value={v.avgDealSize} onChange={set('avgDealSize')} /></Field>
            </div>
          </div>

          {/* results */}
          <div className="space-y-5">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Funnel — needed per sale</div>
              <Row label="Appointments" value={fmtNum(apptsPerSale)} />
              <Row label="Positive replies" value={fmtNum(repliesPerSale)} />
              <Row label="Emails sent" value={fmtNum(emailsPerSale)} />
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Max you can spend</div>
              <Row label="Per appointment" value={fmt$(maxCostPerAppt)} />
              <Row label="Per lead (positive reply)" value={fmt$(maxCostPerReply)} />
              <Row label="Per email sent" value={fmt$(maxCostPerEmail)} highlight />
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Economics</div>
              <Row label="Hard send cost / sale" value={fmt$(hardCostPerSale)} />
              <Row label="Budget left for labor/overhead" value={fmt$(budgetRemaining)} />
              <Row label="Profit / customer (after CAC)" value={fmt$(profitPerCust)} />
              <Row label="ROI" value={isFinite(roi) ? `${fmtNum(roi)}×` : '—'} highlight />
            </div>

            <div className={`text-xs rounded-lg px-3 py-2 ${sendUnderBudget ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
              {sendUnderBudget
                ? `Send cost ($${cpe.toFixed(2)}/email) is within budget (max $${isFinite(maxCostPerEmail) ? maxCostPerEmail.toFixed(2) : '—'}/email). Headroom for labor & overhead.`
                : `Send cost ($${cpe.toFixed(2)}/email) exceeds the max ($${isFinite(maxCostPerEmail) ? maxCostPerEmail.toFixed(2) : '—'}/email) — you'd lose money at these rates.`}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, prefix, suffix, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <div className="flex items-center border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 focus-within:ring-2 focus-within:ring-blue-500">
        {prefix && <span className="pl-3 text-sm text-gray-400">{prefix}</span>}
        {children}
        {suffix && <span className="pr-3 text-sm text-gray-400">{suffix}</span>}
      </div>
    </div>
  )
}

function Num({ value, onChange, step = '1' }) {
  return (
    <input type="number" value={value} onChange={onChange} step={step}
      className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none" />
  )
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-white/5 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-mono tabular-nums ${highlight ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>{value}</span>
    </div>
  )
}
