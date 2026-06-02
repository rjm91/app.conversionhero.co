'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

/* ─── Package data (from pricing page) ─── */
const PACKAGES = [
  { id: 'pilot',   name: 'Pilot',        icon: '🌱', price: 1000, videos: 8,  cadence: '2 per week',   filming: 'Done-With-You', blurb: 'Test the waters' },
  { id: 'starter', name: 'Starter',      icon: '🚀', price: 1550, videos: 13, cadence: '3–4 per week', filming: 'Done-With-You', blurb: 'Build momentum' },
  { id: 'growth',  name: 'Growth',       icon: '⚡', price: 2450, videos: 21, cadence: '4–6 per week', filming: 'Done-With-You', blurb: 'Most Popular', popular: true },
  { id: 'pro',     name: 'Pro',          icon: '💎', price: 3750, videos: 34, cadence: '7–9 per week', filming: 'Done-For-You',  blurb: 'Full automation' },
  { id: 'hero',    name: 'Synergy Hero', icon: '👑', price: null, videos: 55, cadence: '2 per day',    filming: 'Done-For-You',  blurb: 'The best of the best', custom: true },
]

function money(n) { return '$' + Math.round(n || 0).toLocaleString() }

const emptyForm = {
  company: '', contact: '', email: '', phone: '',
  packageId: 'growth', billing: 'monthly', customPrice: '',
  setupFee: '', adOn: false, adPct: '', notes: '',
}

export default function AgreementBuilderPage() {
  const { leadId } = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [lead, setLead] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [statusLabel, setStatusLabel] = useState('Draft')
  const [toast, setToast] = useState(null)

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
          packageId: ag.packageId || 'growth',
          billing: ag.billing || 'monthly',
          customPrice: ag.customPrice ?? '',
          setupFee: ag.setupFee ?? '',
          adOn: ag.adOn ?? false,
          adPct: ag.adPct ?? '',
          notes: ag.notes || '',
        })
        if (l.sale_status === 'Agreement Sent') setStatusLabel('Agreement Sent')
        else if (l.sale_status === 'Agreement Drafted' || ag.packageId) setStatusLabel('Agreement Drafted')
      } catch {
        if (active) setNotFound(true)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [leadId])

  const pkg = PACKAGES.find(p => p.id === form.packageId) || null
  const basePrice = pkg?.custom ? Number(form.customPrice || 0) : (pkg?.price || 0)
  const monthly = form.billing === 'annual' ? basePrice * 0.85 : basePrice
  const setup = Number(form.setupFee || 0)
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function persist(saleStatus, label, doneMsg) {
    if (!lead) return
    setSaving(true)
    try {
      const agreement = {
        packageId: form.packageId,
        billing: form.billing,
        customPrice: form.customPrice,
        setupFee: form.setupFee,
        adOn: form.adOn,
        adPct: form.adPct,
        notes: form.notes,
        monthly: Math.round(monthly),
        status: label,
        updated_at: new Date().toISOString(),
      }
      const [first_name, ...rest] = (form.contact || '').trim().split(/\s+/)
      const payload = {
        company: form.company,
        first_name: first_name || null,
        last_name: rest.join(' ') || null,
        email: form.email,
        phone: form.phone,
        sale_status: saleStatus,
        meta: { ...(lead.meta || {}), agreement },
      }
      const res = await fetch(`/api/agency-leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setLead(json.lead)
      setStatusLabel(label)
      setToast(doneMsg)
      setTimeout(() => setToast(null), 2500)
    } catch (err) {
      setToast(err.message)
      setTimeout(() => setToast(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = () => persist('Agreement Drafted', 'Agreement Drafted', 'Draft saved')
  const sendForSig = () => {
    if (!pkg) { setToast('Pick a package first.'); setTimeout(() => setToast(null), 2500); return }
    persist('Agreement Sent', 'Agreement Sent', 'Sent for signature')
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
    : statusLabel === 'Agreement Drafted'
      ? 'bg-amber-500/20 text-amber-300'
      : 'bg-gray-700 text-gray-300'

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
        <p className="text-sm text-gray-500 mb-8">Fill out the deal terms — saves as a draft, then sends for signature.</p>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: FORM */}
          <div className="lg:col-span-3 space-y-6">
            {/* Client & Deal */}
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: '#12161f' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">Client &amp; Deal</h2>
                <span className="text-xs text-gray-500">Date: <span className="text-gray-300 font-medium">{today}</span></span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Company</label>
                  <input value={form.company} onChange={e => set('company', e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Contact name</label>
                  <input value={form.contact} onChange={e => set('contact', e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Email</label>
                  <input value={form.email} onChange={e => set('email', e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Phone</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>

            {/* Package */}
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: '#12161f' }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">Package</h2>
                <div className="inline-flex items-center bg-gray-900/70 rounded-full p-1 text-xs">
                  <button onClick={() => set('billing', 'monthly')} className={`px-3 py-1 rounded-full font-semibold ${form.billing === 'monthly' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Monthly</button>
                  <button onClick={() => set('billing', 'annual')} className={`px-3 py-1 rounded-full font-semibold ${form.billing === 'annual' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Annual <span className="text-green-400">−15%</span></button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-4">YouTube Advertising included in every package.</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PACKAGES.map(p => {
                  const selected = form.packageId === p.id
                  return (
                    <div key={p.id} onClick={() => set('packageId', p.id)}
                      className={`rounded-xl border p-3 relative cursor-pointer transition ${selected ? 'border-blue-500 ring-1 ring-blue-500' : p.custom ? 'border-yellow-500/20 hover:border-white/25' : 'border-white/10 hover:border-white/25'}`}
                      style={{ background: '#0d1119' }}>
                      {p.popular && <span className="absolute -top-2 right-2 text-[9px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">POPULAR</span>}
                      <div className="text-lg mb-1">{p.icon}</div>
                      <p className={`text-sm font-bold ${p.custom ? 'text-yellow-400' : 'text-white'}`}>{p.name}</p>
                      <p className="text-[11px] text-gray-500 mb-2">{p.videos} videos/mo</p>
                      <p className={`text-base font-extrabold ${p.custom ? 'text-yellow-400' : 'text-white'}`}>{p.custom ? "Let's Talk" : money(p.price)}</p>
                    </div>
                  )
                })}
              </div>

              {pkg?.custom && (
                <div className="mt-3 p-3 rounded-lg bg-yellow-900/15 border border-yellow-500/20">
                  <label className="text-xs text-yellow-400 font-semibold">Synergy Hero is custom — enter monthly price</label>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-gray-400">$</span>
                    <input type="number" value={form.customPrice} onChange={e => set('customPrice', e.target.value)} placeholder="0" className="w-32 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
                    <span className="text-gray-500 text-sm">/mo</span>
                  </div>
                </div>
              )}
            </div>

            {/* Fees */}
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: '#12161f' }}>
              <h2 className="text-sm font-bold text-white uppercase tracking-wide mb-4">Fees</h2>
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
                    <span className="text-gray-400 text-sm">% of ad spend</span>
                  </div>
                </div>
              )}
            </div>

            {/* Special terms */}
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: '#12161f' }}>
              <h2 className="text-sm font-bold text-white uppercase tracking-wide mb-3">Special terms <span className="text-gray-600 normal-case font-normal">(optional)</span></h2>
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. 30-day cancellation, performance guarantee…" className="w-full px-3 py-2 rounded-lg bg-gray-900/60 border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          {/* RIGHT: PREVIEW */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-white/10 p-5 sticky top-6" style={{ background: '#0d1119' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">Agreement Preview</h2>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadgeCls}`}>{statusLabel}</span>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Client</span><span className="text-white font-medium text-right">{form.company || form.contact || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="text-gray-300">{today}</span></div>
                <div className="border-t border-white/5" />
                <div className="flex justify-between"><span className="text-gray-500">Package</span><span className="text-white font-medium">{pkg ? pkg.name : '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Videos / month</span><span className="text-gray-300">{pkg ? `${pkg.videos} (${pkg.cadence})` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Filming</span><span className="text-gray-300">{pkg ? pkg.filming : '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">YouTube Ads</span><span className="text-green-400">Included</span></div>
                <div className="border-t border-white/5" />
                <div className="flex justify-between"><span className="text-gray-500">Billing</span><span className="text-gray-300">{form.billing === 'annual' ? 'Annual (15% off)' : 'Monthly'}</span></div>
                <div className="flex justify-between items-baseline"><span className="text-gray-500">Recurring</span><span className="text-white font-bold text-lg">{basePrice ? money(monthly) + '/mo' : '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Setup fee</span><span className="text-gray-300">{setup ? money(setup) : '$0'}</span></div>
                {form.adOn && <div className="flex justify-between"><span className="text-gray-500">Ad commission</span><span className="text-gray-300">{Number(form.adPct || 0)}% of ad spend</span></div>}
              </div>

              <div className="mt-5 p-3 rounded-xl bg-blue-950/30 border border-blue-500/15">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-blue-300 uppercase tracking-wide font-semibold">First payment due</span>
                  <span className="text-xl font-extrabold text-white">{basePrice ? money(setup + monthly) : '—'}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Setup fee + first month</p>
              </div>

              <div className="mt-5 space-y-2">
                <button onClick={sendForSig} disabled={saving} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white transition disabled:opacity-50">
                  {saving ? 'Working…' : 'Send for Signature →'}
                </button>
                <button onClick={saveDraft} disabled={saving} className="w-full py-2.5 rounded-xl border border-white/15 text-sm font-semibold text-gray-300 hover:bg-white/5 transition disabled:opacity-50">
                  Save Draft
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
    </div>
  )
}
