'use client'

// Heritage Shutters — pre-qualification survey funnel.
// Modeled on the Synergy HVAC funnel (components/funnels/synergy-hvac), reusing
// the shared DESIGN_CSS shell. Placeholder branding/copy for now (no logo asset
// yet) — wordmark falls back to text; swap branding.logoUrl + copy when ready.
// Steps: product interest → homeowner (qualifier) → ZIP (service area) → contact.

import { useState, useEffect, useRef, useMemo } from 'react'
import Script from 'next/script'
import { DESIGN_CSS } from '../synergy-generator/design'

const PRODUCT = [
  { id: 'plantation_shutters', label: 'Plantation Shutters', sub: 'Custom interior shutters' },
  { id: 'blinds',             label: 'Blinds',              sub: 'Wood, faux-wood & mini blinds' },
  { id: 'shades',             label: 'Shades',              sub: 'Roller, roman & cellular shades' },
  { id: 'unsure',             label: 'Not sure yet',        sub: "We'll help you choose" },
]
const HOMEOWNER = [
  { id: 'own',  label: 'Yes, I own my home', sub: 'Ready for a custom install' },
  { id: 'rent', label: 'No, I rent',         sub: "We'll point you in the right direction" },
]

function captureMeta() {
  if (typeof window === 'undefined') return {}
  const p = new URLSearchParams(window.location.search)
  return {
    page: window.location.hostname + window.location.pathname,
    lpurl: p.get('lpurl') || window.location.href,
    utm_source: p.get('utm_source') || '',
    utm_medium: p.get('utm_medium') || '',
    utm_campaign: p.get('utm_campaign') || '',
    utm_content: p.get('utm_content') || '',
    adgroup: p.get('utm_adgroup') || p.get('ad_group_id') || p.get('adgroup') || '',
    gclid: p.get('gclid') || '',
    wbraid: p.get('wbraid') || '',
    device: p.get('device') || (/Mobi|Android/i.test(navigator.userAgent) ? 'm' : 'd'),
    cacheBuster: p.get('cacheBuster') || '',
  }
}

function OptionTile({ option, selected, onClick, index }) {
  return (
    <button type="button" className={`opt-tile ${selected ? 'selected' : ''}`}
            onClick={onClick} style={{ '--i': index }}>
      <div className="opt-radio"><div className="opt-radio-inner" /></div>
      <div>
        <div className="opt-tile-label">{option.label}</div>
        <div className="opt-tile-sub">{option.sub}</div>
      </div>
      <div className="opt-tile-arrow" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
          <path d="M5 3L10 8L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </button>
  )
}

function StepHeader({ eyebrow, title, sub }) {
  return (
    <div className="step-header">
      <div className="step-eyebrow">{eyebrow}</div>
      <h2 className="step-title">{title}</h2>
      {sub && <p className="step-sub">{sub}</p>}
    </div>
  )
}

// Placeholder trust copy — neutral & editable. Replace with Heritage's real
// numbers/claims once confirmed with the owner.
function StatStrip() {
  return (
    <div className="stat-strip">
      <div className="stat">
        <div className="stat-title">Free in-home consultation</div>
        <div className="stat-label">No obligation</div>
      </div>
      <div className="stat-rule" />
      <div className="stat">
        <div className="stat-title">Made-to-measure</div>
        <div className="stat-label">Custom-fit to every window</div>
      </div>
      <div className="stat-rule" />
      <div className="stat">
        <div className="stat-title">Professional installation</div>
        <div className="stat-label">Done right, guaranteed</div>
      </div>
    </div>
  )
}

function ZipStep({ zip, setZip }) {
  function onChange(e) {
    setZip(e.target.value.replace(/\D/g, '').slice(0, 5))
  }
  return (
    <div className="zip-field-wrap">
      <div className={`zip-field ${zip.length === 5 ? 'ok' : ''}`}>
        <input id="zip-input" type="text" inputMode="numeric" placeholder="12345"
               value={zip} onChange={onChange} autoComplete="postal-code" maxLength={5} />
        <div className="zip-status">
          {zip.length === 5
            ? <span className="zip-city">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7.2L6 10L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Got it
              </span>
            : <span className="zip-hint">5-digit US ZIP</span>}
        </div>
      </div>
      <div className="zip-coverage">
        <span className="cov-dot" /> We&apos;ll confirm we service your area
      </div>
    </div>
  )
}

function formatPhone(input) {
  const d = (input || '').replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

function ContactStep({ data, setData }) {
  return (
    <div className="contact-grid">
      <div className="field">
        <label className="field-label" htmlFor="d-name">Full name</label>
        <input id="d-name" type="text" placeholder="Jane Smith" value={data.name}
               onChange={(e) => setData({ ...data, name: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="d-email">Email</label>
        <input id="d-email" type="email" placeholder="jane@email.com" value={data.email}
               onChange={(e) => setData({ ...data, email: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="d-phone">
          Phone <span style={{ fontFamily: 'var(--sans)', fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>For scheduling your free consultation</span>
        </label>
        <input id="d-phone" type="tel" placeholder="555-000-0000" value={data.phone}
               onChange={(e) => setData({ ...data, phone: formatPhone(e.target.value) })} maxLength={12} />
      </div>
      <label className="check-row">
        <input type="checkbox" defaultChecked />
        <span>I&apos;d like a follow-up text from Heritage Shutters (no spam, no robocalls).</span>
      </label>
    </div>
  )
}

function Wordmark({ branding }) {
  if (branding.logoUrl) return <img src={branding.logoUrl} alt="Heritage Shutters" />
  return <span style={{ fontFamily: 'var(--serif, Newsreader, Georgia, serif)', fontSize: 26, fontWeight: 500, color: 'var(--brand-deep)', letterSpacing: '0.01em' }}>Heritage Shutters</span>
}

export default function HeritageShutters({
  funnelId,
  funnelSlug,
  clientId,
  stepId,
  branding = {},
  tracking = {},
  disableTracking = false,
}) {
  const [step, setStep] = useState(0)
  const [product, setProduct] = useState(null)
  const [homeowner, setHomeowner] = useState(null)
  const [zip, setZip] = useState('')
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [direction, setDirection] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const leadIdRef = useRef(null)
  const metaRef = useRef({})
  const inFlightRef = useRef(false)
  const sessionKey = `fs_lead_${funnelId}`
  const gtagId = tracking.gtagId

  const total = 4
  const canAdvance = useMemo(() => {
    if (step === 0) return !!product
    if (step === 1) return !!homeowner
    if (step === 2) return zip.length === 5
    if (step === 3) return !!(contact.name && contact.email && contact.phone)
    return false
  }, [step, product, homeowner, zip, contact])

  useEffect(() => {
    metaRef.current = captureMeta()
    if (disableTracking || !funnelId) return

    try { leadIdRef.current = sessionStorage.getItem(sessionKey) || null } catch {}

    const viewKey = `fs_view_${funnelId}`
    let alreadyViewed = false
    try { alreadyViewed = !!sessionStorage.getItem(viewKey) } catch {}
    if (!alreadyViewed) {
      let sid = ''
      try {
        sid = sessionStorage.getItem('fs_sid') || ''
        if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem('fs_sid', sid) }
      } catch {}
      fetch('/api/funnel-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnelId, clientId, stepId, eventType: 'page_view', sessionId: sid, meta: metaRef.current }),
      }).catch(() => {})
      try { sessionStorage.setItem(viewKey, '1') } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, funnelId, clientId, disableTracking])

  async function saveField(field, value) {
    if (disableTracking || !funnelId) return
    try {
      if (!leadIdRef.current) {
        const res = await fetch('/api/funnel-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', field, value, funnelId, clientId, stepId, meta: metaRef.current }),
        })
        const data = await res.json()
        if (data.success && data.id) {
          leadIdRef.current = data.id
          try { sessionStorage.setItem(sessionKey, data.id) } catch {}
        }
      } else {
        await fetch('/api/funnel-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: leadIdRef.current, field, value }),
        })
      }
    } catch (e) {
      console.warn('Lead save failed:', e)
    }
  }

  const advanceTimer = useRef(null)
  useEffect(() => () => clearTimeout(advanceTimer.current), [])

  function scheduleAdvance() {
    clearTimeout(advanceTimer.current)
    advanceTimer.current = setTimeout(() => {
      setDirection(1)
      setStep(s => Math.min(total - 1, s + 1))
    }, 600)
  }

  function chooseProduct(v)   { setProduct(v);   saveField('product', v);   scheduleAdvance() }
  function chooseHomeowner(v) { setHomeowner(v); saveField('homeowner', v); scheduleAdvance() }

  async function next() {
    clearTimeout(advanceTimer.current)
    if (!canAdvance) return
    setDirection(1)

    if (step === 2) {
      await saveField('zip', zip)
      setStep(s => s + 1)
      return
    }

    if (step === total - 1) {
      if (inFlightRef.current) return
      inFlightRef.current = true
      setSubmitting(true)
      await saveField('fullName', contact.name)
      await saveField('email', contact.email)
      await saveField('phone', contact.phone)
      if (leadIdRef.current && !disableTracking) {
        await fetch('/api/funnel-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: leadIdRef.current, status: 'new_lead', funnelId, stepId }),
        }).catch(() => {})
      }
      try { sessionStorage.removeItem(sessionKey) } catch {}

      const params = new URLSearchParams({ name: contact.name })
      const slug = funnelSlug || 'heritage-shutters-quote'
      window.location.href = `/f/${slug}/thanks?${params.toString()}`
      return
    }

    setStep(s => s + 1)
  }

  function back() {
    clearTimeout(advanceTimer.current)
    setDirection(-1)
    setStep(s => Math.max(0, s - 1))
  }

  const progress = step / (total - 1)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DESIGN_CSS }} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&display=swap" rel="stylesheet" />

      {gtagId && !disableTracking && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gtagId}');
          `}</Script>
        </>
      )}

      <div className="d-root">
        <div className="survey-shell survey-shell--centered" data-theme="copper">
          <main className="stage">
            <div className="center-logo">
              <Wordmark branding={branding} />
            </div>
            <header className="stage-top stage-top--centered">
              <div className="stage-eyebrow">Custom window treatments</div>
              <h1 className="stage-headline">
                Get a free quote on <span className="hl">custom shutters, blinds &amp; shades</span>{' '}
                <span style={{ whiteSpace: 'nowrap' }}>for your home.</span>
              </h1>
              <div className="progress-row" aria-hidden="true">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
                </div>
                <div className="progress-meta">{`Step ${step + 1} of ${total}`}</div>
              </div>
            </header>

            <section className="card">
              <div className="card-inner" key={step} data-direction={direction}>
                {step === 0 && (
                  <>
                    <StepHeader eyebrow="01 · What you want" title="What are you interested in?" />
                    <div className="opt-grid">
                      {PRODUCT.map((o, i) => (
                        <OptionTile key={o.id} option={o} index={i} selected={product === o.id}
                          onClick={() => chooseProduct(o.id)} />
                      ))}
                    </div>
                  </>
                )}
                {step === 1 && (
                  <>
                    <StepHeader eyebrow="02 · Your home" title="Do you own your home?" />
                    <div className="opt-grid">
                      {HOMEOWNER.map((o, i) => (
                        <OptionTile key={o.id} option={o} index={i} selected={homeowner === o.id}
                          onClick={() => chooseHomeowner(o.id)} />
                      ))}
                    </div>
                  </>
                )}
                {step === 2 && (
                  <>
                    <StepHeader eyebrow="03 · Location" title="What's your ZIP code?"
                      sub="So we can confirm we service your area." />
                    <ZipStep zip={zip} setZip={setZip} />
                  </>
                )}
                {step === 3 && (
                  <>
                    <StepHeader eyebrow="04 · Contact" title="Last step — how can we reach you?"
                      sub="One specialist, one call. We don't share your info with third parties." />
                    <ContactStep data={contact} setData={setContact} />
                  </>
                )}
              </div>

              <footer className="card-foot">
                {step > 0 ? (
                  <button type="button" className="btn-ghost" onClick={back}>
                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Back
                  </button>
                ) : <span />}
                <button type="button" className="btn-primary" onClick={next} disabled={!canAdvance || submitting}>
                  {step === total - 1 ? (submitting ? 'Sending…' : 'Get my free quote') : 'Continue'}
                  <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </footer>
            </section>

            <StatStrip />

            <footer className="stage-foot">
              <span>©2026 Heritage Shutters. All Rights Reserved.</span>
            </footer>
          </main>
        </div>
      </div>
    </>
  )
}
