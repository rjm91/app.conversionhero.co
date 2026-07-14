'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
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
  company: '', legalName: '', address: '', contact: '', email: '', phone: '',
  packageId: 'growth', billing: 'monthly', customPrice: '',
  customName: '', customScope: '',
  term: '4 months', termCustom: '',
  setupFee: '', adOn: false, adPct: '', notes: '',
  revOn: false, revPct: '', revStart: '',
  paymentOptions: [],
}

// Parse a commitment term string into a number of months (default 3).
function termToMonths(term) {
  const t = String(term || '').toLowerCase()
  if (/month\s*-?\s*to\s*-?\s*month/.test(t)) return 1
  const m = t.match(/(\d+)\s*month/); if (m) return Number(m[1])
  const d = t.match(/(\d+)\s*day/); if (d) return Math.max(1, Math.round(Number(d[1]) / 30))
  return 3
}
function slug() { return 'opt_' + Math.random().toString(36).slice(2, 8) }

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

  const [open, setOpen] = useState({ client: true, package: true, fees: true, special: false, payment: false, email: true })
  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }))
  const [revStartManual, setRevStartManual] = useState(false)

  // Autosave: dirty edits persist automatically ~2.5s after you stop typing.
  const [autosave, setAutosave] = useState(true)
  const [lastSaved, setLastSaved] = useState(null) // ISO string of last successful save
  const [dirty, setDirty] = useState(false)
  const baselineRef = useRef(null) // JSON snapshot of the last-saved state
  const saveRef = useRef(null)     // latest saveDraft (avoids stale-closure in the timer)

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
        const loadedForm = {
          company: l.company || '',
          legalName: ag.legalName ?? '',
          address: ag.address ?? '',
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
          paymentOptions: Array.isArray(ag.paymentOptions) ? ag.paymentOptions : [],
        }
        setForm(loadedForm)
        if (ag.revStart) setRevStartManual(true)
        setEmailSubject(ag.emailSubject ?? null)
        setEmailMessage(ag.emailMessage ?? null)
        setEmailTerms(ag.emailTerms ?? null)
        setEmailCc(ag.emailCc ?? null)
        if (ag.updated_at) setLastSaved(ag.updated_at)
        // Snapshot the loaded state so autosave only fires on real edits.
        baselineRef.current = JSON.stringify({ form: loadedForm, emailSubject: ag.emailSubject ?? null, emailMessage: ag.emailMessage ?? null, emailTerms: ag.emailTerms ?? null, emailCc: ag.emailCc ?? null })
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
    legalName: form.legalName, address: form.address,
    custom: !!pkg?.custom,
    scope: form.customScope,
    videos: pkg?.custom ? null : pkg?.videos,
    monthly: Math.round(monthly),
    setupFee: setup,
    adOn: form.adOn, adPct: form.adPct,
    revOn: form.revOn, revPct: form.revPct, revStart: form.revStart,
    term: termVal,
  }

  // ── Payment options (choice of how to pay) ──
  const paymentOptions = form.paymentOptions || []
  const termMonths = termToMonths(termVal)
  function setOptions(next) { setForm(f => ({ ...f, paymentOptions: typeof next === 'function' ? next(f.paymentOptions || []) : next })) }
  function updateOption(id, patch) { setOptions(opts => opts.map(o => (o.id === id ? { ...o, ...patch } : o))) }
  function removeOption(id) { setOptions(opts => opts.filter(o => o.id !== id)) }
  function addFreeformOption() { setOptions(opts => [...opts, { id: slug(), label: '', amount: 0, note: '' }]) }
  function seedUpfrontDiscount() {
    if (paymentOptions.length > 0) return
    const first = Math.round(setup + monthly)
    const full = Math.round(monthly * termMonths)
    setOptions([
      { id: 'monthly', label: 'Pay monthly', amount: first, note: `${money(monthly)}/mo, billed monthly (${termVal})${setup ? ` — first payment includes ${money(setup)} setup` : ''}` },
      { id: 'upfront', label: 'Pay upfront', amount: full, note: `One-time payment for the full term (${termVal})` },
    ])
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

  // Fill the builder from an accepted agent proposal (dispatched by AgentPanel).
  useEffect(() => {
    function onApply(e) {
      const f = e.detail || {}
      const keys = ['legalName', 'address', 'packageId', 'customName', 'customScope', 'customPrice', 'billing', 'setupFee', 'adOn', 'adPct', 'revOn', 'revPct', 'term', 'termCustom', 'notes']
      setForm(prev => {
        const next = { ...prev }
        for (const k of keys) if (f[k] !== undefined && f[k] !== null) next[k] = f[k]
        if (f.revStart) next.revStart = f.revStart
        else if (typeof f.revStartDays === 'number') {
          const d = new Date(); d.setDate(d.getDate() + f.revStartDays)
          next.revStart = d.toISOString().split('T')[0]
        }
        return next
      })
      if (f.revStart || typeof f.revStartDays === 'number') setRevStartManual(true)
      setOpen(o => ({ ...o, package: true, fees: true }))
      setToast('Agreement filled from chat — review & send')
      setTimeout(() => setToast(null), 3000)
    }
    window.addEventListener('agreement:apply', onApply)
    return () => window.removeEventListener('agreement:apply', onApply)
  }, [])

  function defaultMessageText() {
    return `Hi ${(form.contact || '').split(' ')[0] || 'there'},\n\nThanks for the time today. Here's the agreement we put together — ${pkg?.name || 'your package'} at ${money(monthly)}/mo${setup ? ` plus a one-time ${money(setup)} setup fee` : ''}. Click below to review and get started.\n\n— ConversionHero`
  }

  const subjectVal = emailSubject !== null ? emailSubject : 'Your ConversionHero agreement & invoice'
  const messageVal = emailMessage !== null ? emailMessage : defaultMessageText()
  const termsVal   = emailTerms   !== null ? emailTerms   : defaultTermsText({ customer, agreement: agreementData })
  const ccVal      = emailCc      !== null ? emailCc      : senderEmail
  const ccList     = ccVal.split(',').map(s => s.trim()).filter(Boolean)

  // ── Terms editor: doc-like formatting on the plain-text terms box ──
  // Bullets / indent / headings are plain-text markers (email-safe): "- " is a
  // bullet, leading spaces indent, "# " is a heading. The toolbar just inserts
  // those markers on the selected line(s); the renderer turns them into layout.
  const termsRef = useRef(null)
  // Apply a per-line transform to the currently-selected line(s), then restore
  // the selection so you can click a button repeatedly.
  const applyToLines = (fn) => {
    const ta = termsRef.current
    if (!ta) return
    const val = ta.value
    const s = ta.selectionStart, e = ta.selectionEnd
    const lineStart = val.lastIndexOf('\n', s - 1) + 1
    let lineEnd = val.indexOf('\n', e); if (lineEnd === -1) lineEnd = val.length
    const block = val.slice(lineStart, lineEnd).split('\n').map(fn).join('\n')
    const next = val.slice(0, lineStart) + block + val.slice(lineEnd)
    setEmailTerms(next)
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = lineStart; ta.selectionEnd = lineStart + block.length })
  }
  const splitWs = (l) => { const m = l.match(/^(\s*)([\s\S]*)$/); return [m[1] || '', m[2] || ''] }
  const fmtIndent = (l) => '  ' + l
  const fmtOutdent = (l) => l.replace(/^(\t| {1,2})/, '')
  const fmtBullet = (l) => { const [ws, r] = splitWs(l); return ws + (r.startsWith('- ') ? r.slice(2) : '- ' + r) }
  const fmtHeading = (l) => { const [ws, r] = splitWs(l); return ws + (r.startsWith('# ') ? r.slice(2) : '# ' + r.replace(/^-\s+/, '')) }
  const onTermsKeyDown = (ev) => {
    if (ev.key === 'Tab') { ev.preventDefault(); applyToLines(ev.shiftKey ? fmtOutdent : fmtIndent) }
  }

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
      legalName: form.legalName, address: form.address,
      billing: form.billing, customPrice: form.customPrice,
      customName: form.customName, customScope: form.customScope,
      term: form.term, termCustom: form.termCustom,
      revOn: form.revOn, revPct: form.revPct, revStart: form.revStart,
      setupFee: form.setupFee, adOn: form.adOn, adPct: form.adPct, notes: form.notes,
      paymentOptions: form.paymentOptions ?? [],
      monthly: Math.round(monthly),
      emailSubject, emailMessage, emailTerms, emailCc,
      status, updated_at: new Date().toISOString(),
    }
  }

  async function saveDraft(opts = {}) {
    if (!lead) return
    setSaving(true)
    try {
      const [first_name, ...rest] = (form.contact || '').trim().split(/\s+/)
      const meta = agreementMeta('Agreement Drafted')
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
          meta: { ...(lead.meta || {}), agreement: meta },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setLead(json.lead)
      setStatusLabel('Agreement Drafted')
      // Mark clean at exactly what we saved, and stamp the time.
      baselineRef.current = JSON.stringify({ form, emailSubject, emailMessage, emailTerms, emailCc })
      setLastSaved(meta.updated_at); setDirty(false)
      if (!opts.auto) flash('Draft saved')
    } catch (err) {
      if (!opts.auto) flash(err.message, 3500)
    } finally {
      setSaving(false)
    }
  }
  saveRef.current = saveDraft

  // Autosave: when the draft differs from the last-saved snapshot, persist it
  // ~2.5s after the last edit. Skips until the initial load has set a baseline.
  useEffect(() => {
    if (!lead || baselineRef.current == null) return
    const snap = JSON.stringify({ form, emailSubject, emailMessage, emailTerms, emailCc })
    if (snap === baselineRef.current) { setDirty(false); return }
    setDirty(true)
    if (!autosave) return
    const t = setTimeout(() => { saveRef.current?.({ auto: true }) }, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, emailSubject, emailMessage, emailTerms, emailCc, lead, autosave])

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
    options: paymentOptions.length > 0
      ? paymentOptions.map(o => ({ label: o.label, amount: Number(o.amount), note: o.note, payUrl: '#preview' }))
      : undefined,
  })

  return (
    <div className="min-h-screen text-gray-200" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #0f1117 50%, #0a0e1a 100%)' }}>
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-24">
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
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">Legal company name <span className="text-gray-600">(for the contract — defaults to Company)</span></label>
                  <input value={form.legalName} onChange={e => set('legalName', e.target.value)} placeholder={form.company || 'e.g. Sun Health RX, LLC'} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">Business address</label>
                  <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, City, ST 00000" className={inputCls} />
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
                    <label className="text-xs text-gray-500 block mb-1">Scope / what&apos;s included</label>
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

            {/* Payment options (optional) */}
            <Section title="Payment Options" open={open.payment} onToggle={() => toggle('payment')}>
              {paymentOptions.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Optional. Offer the client a <span className="text-white font-medium">choice of how to pay</span> — the email shows one Pay button per option, and only the option they click ever becomes a QuickBooks invoice. Leave this empty to send a single invoice exactly as usual.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={seedUpfrontDiscount} className="px-3 py-2 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-xs font-semibold text-white transition">
                      + Add upfront-discount option
                    </button>
                    <button type="button" onClick={addFreeformOption} className="px-3 py-2 rounded-lg border border-white/15 text-xs font-semibold text-gray-300 hover:bg-white/5 transition">
                      + Add option
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">Upfront-discount seeds two options from this deal: pay monthly ({money(setup + monthly)} now) vs. pay upfront for the full {termMonths}-month term ({money(monthly * termMonths)}) — both editable.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentOptions.map((o) => {
                    const full = Math.round(monthly * termMonths)
                    const savings = o.id === 'upfront' && Number(o.amount) > 0 && Number(o.amount) < full ? full - Number(o.amount) : 0
                    return (
                      <div key={o.id} className="p-3 rounded-lg bg-gray-900/40 border border-white/10 space-y-2">
                        <div className="flex items-center gap-2">
                          <input value={o.label} onChange={e => updateOption(o.id, { label: e.target.value })} placeholder="Label (e.g. Pay upfront)" className="flex-1 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                          <button type="button" onClick={() => removeOption(o.id)} title="Remove option" className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-400/40 transition">✕</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">$</span>
                          <input type="number" value={o.amount} onChange={e => updateOption(o.id, { amount: Number(e.target.value) || 0 })} className="w-36 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white text-right focus:outline-none focus:border-blue-500" />
                          <span className="text-[11px] text-gray-500">charged now if the client picks this</span>
                        </div>
                        {savings > 0 && <p className="text-[11px] text-green-400">Saves {money(savings)} vs paying monthly for the full term ({money(full)}).</p>}
                        <input value={o.note || ''} onChange={e => updateOption(o.id, { note: e.target.value })} placeholder="Optional one-line note under the label" className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-xs text-white focus:outline-none focus:border-blue-500" />
                      </div>
                    )
                  })}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={addFreeformOption} className="px-3 py-2 rounded-lg border border-white/15 text-xs font-semibold text-gray-300 hover:bg-white/5 transition">+ Add option</button>
                    <button type="button" onClick={() => setOptions([])} className="px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-gray-500 hover:text-gray-300 hover:bg-white/5 transition">Clear all (send single invoice)</button>
                  </div>
                  <p className="text-[11px] text-gray-500">No invoice is created until the client clicks a Pay button — then only that option is invoiced.</p>
                </div>
              )}
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
                  <p className="text-[11px] text-gray-500 mt-1">You&apos;re CC&apos;d by default. Separate multiple emails with commas (e.g. the client&apos;s partner or finance person).</p>
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
                  <div className="flex items-center gap-1 mb-1">
                    {[
                      { label: 'H', title: 'Heading', fn: fmtHeading },
                      { label: '• List', title: 'Bullet', fn: fmtBullet },
                      { label: '←', title: 'Outdent (Shift+Tab)', fn: fmtOutdent },
                      { label: '→', title: 'Indent (Tab)', fn: fmtIndent },
                    ].map(b => (
                      <button key={b.title} type="button" title={b.title} onMouseDown={e => e.preventDefault()} onClick={() => applyToLines(b.fn)}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold text-gray-300 bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:text-white transition">{b.label}</button>
                    ))}
                  </div>
                  <textarea ref={termsRef} rows={16} value={termsVal} onChange={e => setEmailTerms(e.target.value)} onKeyDown={onTermsKeyDown} className={`${inputCls} leading-relaxed font-mono text-[12px]`} />
                  <p className="text-[11px] text-gray-500 mt-1">Doc-style formatting: select a line and click a button, or type the markers directly — “# Heading” or “3. Fees” = section heading, “- ” = bullet, Tab / Shift+Tab = indent / outdent. Invoice amounts &amp; the Pay button are filled automatically.</p>
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

              {paymentOptions.length > 0 ? (
                <div className="mt-5 p-3 rounded-xl bg-blue-950/30 border border-blue-500/15">
                  <span className="text-xs text-blue-300 uppercase tracking-wide font-semibold">Payment options</span>
                  <div className="mt-2 space-y-1.5">
                    {paymentOptions.map(o => (
                      <div key={o.id} className="flex justify-between items-baseline gap-3">
                        <span className="text-gray-300 text-sm">{o.label || 'Untitled option'}</span>
                        <span className="text-white font-bold">{money(o.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Client picks one — only that option is invoiced.</p>
                </div>
              ) : (
                <div className="mt-5 p-3 rounded-xl bg-blue-950/30 border border-blue-500/15">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-blue-300 uppercase tracking-wide font-semibold">First payment due</span>
                    <span className="text-xl font-extrabold text-white">{basePrice ? money(setup + monthly) : '—'}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Setup fee + first month</p>
                </div>
              )}

              <div className="mt-5 space-y-2">
                <button onClick={doSend} disabled={saving || sending} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white transition disabled:opacity-50">
                  {sending ? 'Sending…' : 'Send Invoice →'}
                </button>
                <button onClick={() => saveDraft()} disabled={saving || sending} className="w-full py-2.5 rounded-xl border border-white/15 text-sm font-semibold text-gray-300 hover:bg-white/5 transition disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky save bar — always in view. Shows autosave state + last-saved time. */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0b0e14]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-2.5 flex items-center gap-3">
          <span className={`text-xs font-medium ${saving ? 'text-blue-300' : dirty ? 'text-amber-400' : lastSaved ? 'text-emerald-400' : 'text-gray-500'}`}>
            {saving ? 'Saving…'
              : dirty ? (autosave ? 'Unsaved changes · autosaving…' : 'Unsaved changes')
              : lastSaved ? `Saved ${new Date(lastSaved).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
              : 'Not saved yet'}
          </span>
          <label className="ml-1 flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
            <input type="checkbox" checked={autosave} onChange={e => setAutosave(e.target.checked)} className="accent-blue-500" />
            Auto-save
          </label>
          <div className="flex-1" />
          <button onClick={() => saveDraft()} disabled={saving || sending} className="px-4 py-1.5 rounded-lg border border-white/15 text-xs font-semibold text-gray-200 hover:bg-white/5 transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={doSend} disabled={saving || sending} className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition disabled:opacity-50">
            {sending ? 'Sending…' : 'Send Invoice →'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg bg-[#171B33] border border-white/10 text-sm text-white shadow-2xl z-50">
          {toast}
        </div>
      )}

      <AgentPanel mode="agency" />
    </div>
  )
}
