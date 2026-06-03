'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { buildAgreementEmailHtml, defaultTermsText } from '../../../../lib/agreement-email.js'
import AgentPanel from '../../../../components/AgentPanel'

/* ─── Package data (from pricing page) ─── */
const PACKAGES = [
  { id: 'pilot',   name: 'Pilot',        icon: '🌱', price: 1000, videos: 8,  cadence: '2 per week',   filming: 'Done-With-You', blurb: 'Test the waters' },
  { id: 'starter', name: 'Starter',      icon: '🚀', price: 1550, videos: 13, cadence: '3–4 per week', filming: 'Done-With-You', blurb: 'Build momentum' },
  { id: 'growth',  name: 'Growth',       icon: '⚡', price: 2450, videos: 21, cadence: '4–6 per week', filming: 'Done-With-You', blurb: 'Most Popular', popular: true },
  { id: 'pro',     name: 'Pro',          icon: '💎', price: 3750, videos: 34, cadence: '7–9 per week', filming: 'Done-For-You',  blurb: 'Full automation' },
  { id: 'custom',  name: 'Custom',       icon: '✨', price: null, videos: null, cadence: '',           filming: 'Done-For-You',  blurb: 'Build your own', custom: true },
]

function money(n) { return '$' + Math.round(n || 0).toLocaleString() }

const emptyForm = {
  company: '', contact: '', email: '', phone: '',
  packageId: 'growth', billing: 'monthly', customPrice: '',
  customName: '', customScope: '',
  term: '4 months', termCustom: '',
  setupFee: '', adOn: false, adPct: '', notes: '',
  revOn: false, revPct: '', revStart: '',
}

const TERM_OPTIONS = ['Month-to-month', '30 days', '60 days', '90 days', '4 months', '6 months', '12 months', 'Custom…']
function fmtShortDate(d) {
  if (!d) return '—'
  const [y, m, day] = String(d).split('-').map(Number)
  if (!y) return String(d)
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ─── Collapsible section (accordion) ─── */
function Section({ title, open, onToggle, children }) {
  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: '#12161f' }}>
      <div role="button" onClick={onToggle} className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-white/[0.02] transition">
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <h2 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 260ms cubic-bezier(0.4,0,0.2,1)' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default function AgreementBuilderPage() {
  const { leadId } = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [lead, setLead] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [statusLabel, setStatusLabel] = useState('Draft')
  const [toast, setToast] = useState(null)

  // Email overrides: null = use the live default, otherwise the edited value.
  const [emailSubject, setEmailSubject] = useState(null)
  const [emailMessage, setEmailMessage] = useState(null)
  const [emailTerms, setEmailTerms] = useState(null)
  const [emailCc, setEmailCc] = useState(null)
  const [senderEmail, setSenderEmail] = useState('')

  // The logged-in app user (sender) — CC'd by default.
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('ca_user') || '{}')
      if (u.email) setSenderEmail(u.email)
    } catch {}
  }, [])

  const [open, setOpen] = useState({ client: true, package: true, fees: true, special: false, email: true })
  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }))
  const [revStartManual, setRevStartManual] = useState(false)

  function flash(msg, ms = 2800) { setToast(msg); setTimeout(() => setToast(null), ms) }

  // Load the lead + any existing agreement draft
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/agency-leads', { cache: 'no-store' })
        const json = await res.json()
        const l = (json.leads || []).find(x => x.id === leadId)
        if (!active) return
        if (!l) { setNotFound(true); setLoading(false); return }
        setLead(l)
        const ag = l.meta?.agreement || {}
        setForm({
          company: l.company || '',
          contact: [l.first_name, l.last_name].filter(Boolean).join(' '),
          email: l.email || '',
          phone: l.phone || '',
          packageId: ag.packageId === 'hero' ? 'custom' : (ag.packageId || 'growth'),
          billing: ag.billing || 'monthly',
          customPrice: ag.customPrice ?? '',
          customName: ag.customName ?? '',
          customScope: ag.customScope ?? (ag.customVideos ? `${ag.customVideos} short-form videos per month` : ''),
          term: ag.term ?? '4 months',
          termCustom: ag.termCustom ?? '',
          setupFee: ag.setupFee ?? '',
          adOn: ag.adOn ?? false,
          adPct: ag.adPct ?? '',
          notes: ag.notes || '',
          revOn: ag.revOn ?? false,
          revPct: ag.revPct ?? '',
          revStart: ag.revStart ?? '',
        })
        if (ag.revStart) setRevStartManual(true)
        setEmailSubject(ag.emailSubject ?? null)
        setEmailMessage(ag.emailMessage ?? null)
        setEmailTerms(ag.emailTerms ?? null)
        setEmailCc(ag.emailCc ?? null)
        if (l.sale_status === 'Agreement Sent') setStatusLabel('Agreement Sent')
        else if (l.sale_status === 'Agreement Viewed') setStatusLabel('Agreement Viewed')
        else if (l.sale_status === 'Agreement Drafted' || ag.packageId) setStatusLabel('Agreement Drafted')
      } catch {
        if (active) setNotFound(true)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [leadId])

  const rawPkg = PACKAGES.find(p => p.id === form.packageId) || null
  const pkg = rawPkg && rawPkg.custom
    ? { ...rawPkg, name: form.customName || 'Custom', cadence: '' }
    : rawPkg
  const basePrice = pkg?.custom ? Number(form.customPrice || 0) : (pkg?.price || 0)
  const monthly = form.billing === 'annual' ? basePrice * 0.85 : basePrice
  const setup = Number(form.setupFee || 0)
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const customer = { company: form.company, contact: form.contact, email: form.email, phone: form.phone }
  const termVal = form.term === 'Custom…' ? (form.termCustom || 'a custom term') : form.term
  const agreementData = {
    packageName: pkg?.name,
    custom: !!pkg?.custom,
    scope: form.customScope,
    videos: pkg?.custom ? null : pkg?.videos,
    monthly: Math.round(monthly),
    setupFee: setup,
    adOn: form.adOn, adPct: form.adPct,
    revOn: form.revOn, revPct: form.revPct, revStart: form.revStart,
    term: termVal,
  }

  // Auto-suggest the revenue-share start date from the commitment term
  // (unless the user has set it manually).
  useEffect(() => {
    if (revStartManual) return
    const map = { '30 days': [30, 'd'], '60 days': [60, 'd'], '90 days': [90, 'd'], '4 months': [4, 'm'], '6 months': [6, 'm'], '12 months': [12, 'm'] }
    const e = map[form.term]
    if (!e) return
    const d = new Date()
    if (e[1] === 'd') d.setDate(d.getDate() + e[0]); else d.setMonth(d.getMonth() + e[0])
    const iso = d.toISOString().split('T')[0]
    setForm(f => (f.revStart === iso ? f : { ...f, revStart: iso }))
  }, [form.term, revStartManual])

  function defaultMessageText() {
    return `Hi ${(form.contact || '').split(' ')[0] || 'there'},\n\nThanks for the time today. Here's the agreement we put together — ${pkg?.name || 'your package'} at ${money(monthly)}/mo${setup ? ` plus a one-time ${money(setup)} setup fee` : ''}. Click below to review and get started.\n\n— ConversionHero`
  }

  const subjectVal = emailSubject !== null ? emailSubject : 'Your ConversionHero agreement & invoice'
  const messageVal = emailMessage !== null ? emailMessage : defaultMessageText()
  const termsVal   = emailTerms   !== null ? emailTerms   : defaultTermsText({ customer, agreement: agreementData })
  const ccVal      = emailCc      !== null ? emailCc      : senderEmail
  const ccList     = ccVal.split(',').map(s => s.trim()).filter(Boolean)

  function lineItems() {
    const items = []
    if (setup > 0) items.push({ name: 'Setup Fee', description: 'One-time setup fee', amount: setup })
    if (pkg && basePrice > 0) {
      const desc = pkg.custom ? `${pkg.name} — first month` : `${pkg.name} — first month (${pkg.videos} videos/mo${pkg.cadence ? `, ${pkg.cadence}` : ''})`
      items.push({ name: pkg.name, description: desc, amount: Math.round(monthly) })
    }
    return items
  }

  function agreementMeta(status) {
    return {
      packageId: form.packageId, packageName: pkg?.name, videos: pkg?.videos,
      billing: form.billing, customPrice: form.customPrice,
      customName: form.customName, customScope: form.customScope,
      term: form.term, termCustom: form.termCustom,
      revOn: form.revOn, revPct: form.revPct, revStart: form.revStart,
      setupFee: form.setupFee, adOn: form.adOn, adPct: form.adPct, notes: form.notes,
      monthly: Math.round(monthly),
      emailSubject, emailMessage, emailTerms, emailCc,
      status, updated_at: new Date().toISOString(),
    }
  }

  async function saveDraft() {
    if (!lead) return
    setSaving(true)
    try {
      const [first_name, ...rest] = (form.contact || '').trim().split(/\s+/)
      const res = await fetch(`/api/agency-leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: form.company,
          first_name: first_name || null,
          last_name: rest.join(' ') || null,
          email: form.email,
          phone: form.phone,
          sale_status: 'Agreement Drafted',
          meta: { ...(lead.meta || {}), agreement: agreementMeta('Agreement Drafted') },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setLead(json.lead)
      setStatusLabel('Agreement Drafted')
      flash('Draft saved')
    } catch (err) {
      flash(err.message, 3500)
    } finally {
      setSaving(false)
    }
  }

  async function doSend() {
    if (!lead) return
    if (!pkg) { flash('Pick a package first.'); return }
    if (!form.email) { flash('Add a client email first.'); return }
    if (!window.confirm(`Send this invoice & agreement to ${form.email}?`)) return
    setSending(true)
    try {
      const res = await fetch('/api/agreements/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          subject: subjectVal,
          message: messageVal,
          terms: termsVal,
          cc: ccList,
          customer,
          lines: lineItems(),
          agreement: agreementMeta('Agreement Sent'),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Send failed')
      setStatusLabel('Agreement Sent')
      flash('Invoice sent to ' + form.email, 3500)
    } catch (err) {
      flash(err.message, 5000)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #0f1117 50%, #0a0e1a 100%)' }}>Loading…</div>
  }
  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-400" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #0f1117 50%, #0a0e1a 100%)' }}>
        <p>Deal not found.</p>
        <button onClick={() => router.push('/control')} className="text-blue-400 hover:text-blue-300 text-sm">← Back to Control Center</button>
      </div>
    )
  }

  const statusBadgeCls = statusLabel === 'Agreement Sent'
    ? 'bg-blue-500/20 text-blue-300'
    : statusLabel === 'Agreement Viewed'
      ? 'bg-violet-500/20 text-violet-300'
      : statusLabel === 'Agreement Drafted'
        ? 'bg-amber-500/20 text-amber-300'
        : 'bg-gray-700 text-gray-300'

  const inputCls = 'w-full mt-1 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500'
  const ResetLink = ({ onClick, show }) => show
    ? <button onClick={onClick} className="text-[11px] text-blue-400 hover:text-blue-300">Reset to default</button>
    : null

  const previewHtml = buildAgreementEmailHtml({
    message: messageVal,
    link: '#preview',
    lines: lineItems(),
    total: setup + monthly,
    termsText: termsVal,
  })

  return (
    <div className="min-h-screen text-gray-200" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #0f1117 50%, #0a0e1a 100%)' }}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <button onClick={() => router.push('/control')} className="text-xs text-gray-400 hover:text-blue-400 transition mb-4">← Back to Control Center</button>

        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase mb-1">Agreement Builder</p>
            <h1 className="text-2xl font-bold text-white">New Agreement</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Deal</p>
            <p className="text-sm font-semibold text-white">{form.company || form.contact || '—'}</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-8">Fill out the deal terms — the email preview at the bottom is exactly what your client receives.</p>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: FORM + EMAIL + PREVIEW */}
          <div className="lg:col-span-3 space-y-4">
            {/* Client & Deal */}
            <Section title="Client & Deal" open={open.client} onToggle={() => toggle('client')}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Company</label>
                  <input value={form.company} onChange={e => set('company', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Contact name</label>
                  <input value={form.contact} onChange={e => set('contact', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Email</label>
                  <input value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Phone</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} />
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-3">Date: <span className="text-gray-400">{today}</span></p>
            </Section>

            {/* Package */}
            <Section title="Package" open={open.package} onToggle={() => toggle('package')}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500">YouTube Advertising included in every package.</p>
                <div className="inline-flex items-center bg-gray-900/70 rounded-full p-1 text-xs">
                  <button onClick={() => set('billing', 'monthly')} className={`px-3 py-1 rounded-full font-semibold ${form.billing === 'monthly' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Monthly</button>
                  <button onClick={() => set('billing', 'annual')} className={`px-3 py-1 rounded-full font-semibold ${form.billing === 'annual' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Annual <span className="text-green-400">−15%</span></button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PACKAGES.map(p => {
                  const selected = form.packageId === p.id
                  const dName = p.custom ? (form.customName || 'Custom') : p.name
                  const dSub = p.custom ? (form.customScope || 'Custom scope') : `${p.videos} videos/mo`
                  const dPrice = p.custom ? (form.customPrice ? money(form.customPrice) : 'Custom') : money(p.price)
                  return (
                    <div key={p.id} onClick={() => set('packageId', p.id)}
                      className={`rounded-xl border p-3 relative cursor-pointer transition ${selected ? 'border-blue-500 ring-1 ring-blue-500' : p.custom ? 'border-violet-500/30 hover:border-white/25' : 'border-white/10 hover:border-white/25'}`}
                      style={{ background: '#0d1119' }}>
                      {p.popular && <span className="absolute -top-2 right-2 text-[9px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">POPULAR</span>}
                      {p.custom && <span className="absolute -top-2 right-2 text-[9px] font-bold bg-violet-600 text-white px-2 py-0.5 rounded-full">CUSTOM</span>}
                      <div className="text-lg mb-1">{p.icon}</div>
                      <p className={`text-sm font-bold ${p.custom ? 'text-violet-300' : 'text-white'}`}>{dName}</p>
                      <p className="text-[11px] text-gray-500 mb-2 line-clamp-2">{dSub}</p>
                      <p className={`text-base font-extrabold ${p.custom ? 'text-violet-300' : 'text-white'}`}>{dPrice}</p>
                    </div>
                  )
                })}
              </div>
              {pkg?.custom && (
                <div className="mt-3 p-3 rounded-lg bg-violet-900/10 border border-violet-500/20 space-y-3">
                  <p className="text-xs text-violet-300 font-semibold">Build a custom package</p>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Title</label>
                    <input value={form.customName} onChange={e => set('customName', e.target.value)} placeholder="e.g. Enterprise" className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Scope / what's included</label>
                    <textarea rows={2} value={form.customScope} onChange={e => set('customScope', e.target.value)} placeholder="e.g. 21 short-form videos/mo + ad management — or '90-day brand setup engagement'" className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Monthly price <span className="text-gray-600">(optional — leave 0 for setup-only / rev-share deals)</span></label>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">$</span>
                      <input type="number" value={form.customPrice} onChange={e => set('customPrice', e.target.value)} placeholder="0" className="w-40 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                      <span className="text-gray-500 text-sm">/mo</span>
                    </div>
                  </div>
                </div>
              )}
            </Section>

            {/* Fees */}
            <Section title="Fees" open={open.fees} onToggle={() => toggle('fees')}>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-white font-medium">Setup fee</p>
                  <p className="text-xs text-gray-500">One-time, charged at signing</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400">$</span>
                  <input type="number" value={form.setupFee} onChange={e => set('setupFee', e.target.value)} className="w-28 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white text-right focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="border-t border-white/5 my-2" />
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-white font-medium">Ad-spend commission</p>
                  <p className="text-xs text-gray-500">Optional — % of managed ad spend</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={form.adOn} onChange={e => set('adOn', e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-[22px] bg-gray-700 peer-checked:bg-blue-600 rounded-full transition" />
                  <div className="absolute left-[2px] top-[2px] w-[18px] h-[18px] bg-white rounded-full transition peer-checked:translate-x-[18px]" />
                </label>
              </div>
              {form.adOn && (
                <div className="pl-1 pb-2">
                  <div className="flex items-center gap-1">
                    <input type="number" value={form.adPct} onChange={e => set('adPct', e.target.value)} className="w-20 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white text-right focus:outline-none focus:border-blue-500" />
                    <span className="text-gray-400 text-sm">% of ad spend (kicks in over $10k/mo)</span>
                  </div>
                </div>
              )}

              <div className="border-t border-white/5 my-2" />
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-white font-medium">Revenue share</p>
                  <p className="text-xs text-gray-500">Optional — % of collected revenue, from a start date</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={form.revOn} onChange={e => set('revOn', e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-[22px] bg-gray-700 peer-checked:bg-blue-600 rounded-full transition" />
                  <div className="absolute left-[2px] top-[2px] w-[18px] h-[18px] bg-white rounded-full transition peer-checked:translate-x-[18px]" />
                </label>
              </div>
              {form.revOn && (
                <div className="grid grid-cols-2 gap-3 pb-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">% of collected revenue</label>
                    <input type="number" value={form.revPct} onChange={e => set('revPct', e.target.value)} placeholder="0" className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Starts on</label>
                    <input type="date" value={form.revStart} onChange={e => { setRevStartManual(true); set('revStart', e.target.value) }} className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              )}

              <div className="border-t border-white/5 my-2" />
              <div className="py-2">
                <p className="text-sm text-white font-medium mb-1">Commitment term</p>
                <div className="flex items-center gap-2">
                  <select value={form.term} onChange={e => set('term', e.target.value)} className="px-3 py-2 rounded-lg bg-[#1e2340] border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500">
                    {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {form.term === 'Custom…' && (
                    <input value={form.termCustom} onChange={e => set('termCustom', e.target.value)} placeholder="e.g. 18 months" className="flex-1 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                  )}
                </div>
                {form.revOn && form.term !== 'Custom…' && form.term !== 'Month-to-month' && (
                  <p className="text-[11px] text-gray-500 mt-1">Revenue-share start date auto-set to {fmtShortDate(form.revStart)} from this term — editable above.</p>
                )}
              </div>
            </Section>

            {/* Special terms */}
            <Section title="Special terms (optional)" open={open.special} onToggle={() => toggle('special')}>
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. 30-day cancellation, performance guarantee…" className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
            </Section>

            {/* Email (editable) */}
            <Section title="Email" open={open.email} onToggle={() => toggle('email')}>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">CC</label>
                    <ResetLink show={emailCc !== null} onClick={() => setEmailCc(null)} />
                  </div>
                  <input value={ccVal} onChange={e => setEmailCc(e.target.value)} placeholder="you@conversionhero.co, finance@client.com" className={inputCls} />
                  <p className="text-[11px] text-gray-500 mt-1">You're CC'd by default. Separate multiple emails with commas (e.g. the client's partner or finance person).</p>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">Subject</label>
                    <ResetLink show={emailSubject !== null} onClick={() => setEmailSubject(null)} />
                  </div>
                  <input value={subjectVal} onChange={e => setEmailSubject(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">Message</label>
                    <ResetLink show={emailMessage !== null} onClick={() => setEmailMessage(null)} />
                  </div>
                  <textarea rows={6} value={messageVal} onChange={e => setEmailMessage(e.target.value)} className={`${inputCls} leading-relaxed`} />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">Agreement terms</label>
                    <ResetLink show={emailTerms !== null} onClick={() => setEmailTerms(null)} />
                  </div>
                  <textarea rows={16} value={termsVal} onChange={e => setEmailTerms(e.target.value)} className={`${inputCls} leading-relaxed font-mono text-[12px]`} />
                  <p className="text-[11px] text-gray-500 mt-1">Edit freely. Lines like “3. Fees” become section headings; lines starting with “- ” become bullets. Invoice amounts &amp; the Pay button are filled automatically.</p>
                </div>
              </div>
            </Section>

            {/* Live email preview */}
            <div>
              <p className="text-xs font-bold text-white uppercase tracking-wide mb-2 px-1">Email Preview — exactly what your client receives</p>
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-white">
                <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 text-[12px] text-gray-600 space-y-0.5">
                  <div><span className="text-gray-400">From:</span> ConversionHero &lt;notifications@send.conversionhero.co&gt;</div>
                  <div><span className="text-gray-400">To:</span> {form.email || '—'}</div>
                  {ccList.length > 0 && <div><span className="text-gray-400">Cc:</span> {ccList.join(', ')}</div>}
                  <div><span className="text-gray-400">Subject:</span> <span className="text-gray-800 font-medium">{subjectVal || '—'}</span></div>
                </div>
                <iframe title="Email preview" className="w-full bg-white" style={{ height: 620, border: 'none' }} srcDoc={previewHtml} />
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5 px-1">The “Review &amp; Pay” button links to the live QuickBooks invoice once sent.</p>
            </div>
          </div>

          {/* RIGHT: SUMMARY + ACTIONS */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-white/10 p-5 sticky top-6" style={{ background: '#0d1119' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">Agreement Summary</h2>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadgeCls}`}>{statusLabel}</span>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Client</span><span className="text-white font-medium text-right">{form.company || form.contact || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="text-gray-300">{today}</span></div>
                <div className="border-t border-white/5" />
                <div className="flex justify-between"><span className="text-gray-500">Package</span><span className="text-white font-medium">{pkg ? pkg.name : '—'}</span></div>
                {pkg?.custom ? (
                  form.customScope && <div className="flex justify-between gap-4"><span className="text-gray-500">Scope</span><span className="text-gray-300 text-right">{form.customScope}</span></div>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-gray-500">Videos / month</span><span className="text-gray-300">{pkg && pkg.videos ? `${pkg.videos}${pkg.cadence ? ` (${pkg.cadence})` : ''}` : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Filming</span><span className="text-gray-300">{pkg ? pkg.filming : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">YouTube Ads</span><span className="text-green-400">Included</span></div>
                  </>
                )}
                <div className="border-t border-white/5" />
                {basePrice > 0 && <div className="flex justify-between"><span className="text-gray-500">Billing</span><span className="text-gray-300">{form.billing === 'annual' ? 'Annual (15% off)' : 'Monthly'}</span></div>}
                <div className="flex justify-between items-baseline"><span className="text-gray-500">Recurring</span><span className="text-white font-bold text-lg">{basePrice ? money(monthly) + '/mo' : '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Setup fee</span><span className="text-gray-300">{setup ? money(setup) : '$0'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Term</span><span className="text-gray-300">{termVal}</span></div>
                {form.adOn && <div className="flex justify-between"><span className="text-gray-500">Ad commission</span><span className="text-gray-300">{Number(form.adPct || 0)}% of ad spend</span></div>}
                {form.revOn && <div className="flex justify-between"><span className="text-gray-500">Rev share</span><span className="text-gray-300">{Number(form.revPct || 0)}% from {fmtShortDate(form.revStart)}</span></div>}
              </div>

              <div className="mt-5 p-3 rounded-xl bg-blue-950/30 border border-blue-500/15">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-blue-300 uppercase tracking-wide font-semibold">First payment due</span>
                  <span className="text-xl font-extrabold text-white">{basePrice ? money(setup + monthly) : '—'}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Setup fee + first month</p>
              </div>

              <div className="mt-5 space-y-2">
                <button onClick={doSend} disabled={saving || sending} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white transition disabled:opacity-50">
                  {sending ? 'Sending…' : 'Send Invoice →'}
                </button>
                <button onClick={saveDraft} disabled={saving || sending} className="w-full py-2.5 rounded-xl border border-white/15 text-sm font-semibold text-gray-300 hover:bg-white/5 transition disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg bg-[#171B33] border border-white/10 text-sm text-white shadow-2xl z-50">
          {toast}
        </div>
      )}

      <AgentPanel mode="agency" />
    </div>
  )
}
