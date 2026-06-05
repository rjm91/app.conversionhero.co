'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Script from 'next/script'
import { DESIGN_CSS } from '../synergy-generator/design'

const KY_ZIPS = {
  "40003": "Bagdad", "40076": "Waddy", "40324": "Georgetown", "40330": "Harrodsburg",
  "40336": "Irvine", "40342": "Lawrenceburg", "40347": "Midway", "40353": "Mount Sterling",
  "40356": "Nicholasville", "40359": "Owenton", "40361": "Paris", "40370": "Sadieville",
  "40372": "Salvisa", "40379": "Stamping Ground", "40383": "Versailles", "40385": "Waco",
  "40390": "Wilmore", "40391": "Winchester", "40403": "Berea", "40404": "Berea",
  "40444": "Lancaster", "40461": "Paint Lick", "40475": "Richmond",
  "40502": "Lexington", "40503": "Lexington", "40504": "Lexington", "40505": "Lexington",
  "40507": "Lexington", "40508": "Lexington", "40509": "Lexington", "40510": "Lexington",
  "40511": "Lexington", "40513": "Lexington", "40514": "Lexington", "40515": "Lexington",
  "40516": "Lexington", "40517": "Lexington", "40601": "Frankfort",
  "41010": "Corinth", "41031": "Cynthiana",
}

const ISSUE = [
  { id: "moisture", label: "Moisture, mold, or musty smell", sub: "Damp air or odors coming from below" },
  { id: "cold",     label: "Cold floors & high energy bills",  sub: "Drafts and rooms that never feel comfortable" },
  { id: "sagging",  label: "Sagging or uneven floors",         sub: "Soft spots or floors that bounce" },
  { id: "seal",     label: "Just want it sealed / encapsulated", sub: "Protect my home before problems start" },
]
const CRAWL_STATE = [
  { id: "dirt",        label: "Bare dirt or gravel",      sub: "No barrier down there today" },
  { id: "old_barrier", label: "Old or torn vapor barrier", sub: "Existing plastic that's failing" },
  { id: "partial",     label: "Partially encapsulated",    sub: "Some work done, not finished" },
  { id: "unsure",      label: "Not sure",                  sub: "We'll check during the visit" },
]
const CRAWL_SIZE = [
  { id: "small",   label: "Under 1,000 sq ft",   sub: "Smaller footprint home" },
  { id: "medium",  label: "1,000 – 2,000 sq ft", sub: "Average-size home" },
  { id: "large",   label: "Over 2,000 sq ft",    sub: "Larger or multi-section home" },
  { id: "unknown", label: "Not sure",            sub: "We'll measure during the visit" },
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

function StatStrip() {
  return (
    <div className="stat-strip">
      <div className="stat">
        <div className="stat-title">Licensed &amp; Insured</div>
        <div className="stat-label">Certified crawlspace crews</div>
      </div>
      <div className="stat-rule" />
      <div className="stat">
        <div className="stat-num">12<span>yrs</span></div>
        <div className="stat-label">Serving Lexington &amp; Bluegrass area</div>
      </div>
      <div className="stat-rule" />
      <div className="stat">
        <div className="stat-num">2k<span>+</span></div>
        <div className="stat-label">Crawlspaces sealed</div>
      </div>
      <div className="stat-rule" />
      <div className="stat">
        <div className="stat-num">4.9<span>/5</span></div>
        <div className="stat-label">Homeowner rating</div>
      </div>
    </div>
  )
}

function Testimonial() {
  return (
    <figure className="testimonial">
      <div className="testimonial-photo" aria-hidden="true">
        <img src="https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/testi-hvac-chris-giebler.png"
             alt="Chris Giebler" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
      <div>
        <blockquote>"Their customer service is second to none! I will use no other company than Synergy Home from here on out. Highly recommended! Five stars all around!"</blockquote>
        <figcaption>
          <strong>Chris Giebler</strong>
          <span>Lexington, KY</span>
        </figcaption>
      </div>
    </figure>
  )
}

function ZipStep({ zip, setZip, city, setCity, error, setError }) {
  function onChange(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 5)
    setZip(v)
    if (v.length === 5) {
      const c = KY_ZIPS[v] || ''
      setCity(c)
      setError('')
    } else { setCity(''); setError('') }
  }
  return (
    <div className="zip-field-wrap">
      <div className={`zip-field ${error ? 'error' : ''} ${city ? 'ok' : ''}`}>
        <input id="zip-input" type="text" inputMode="numeric" placeholder="40502"
               value={zip} onChange={onChange} autoComplete="postal-code" maxLength={5} />
        <div className="zip-status">
          {city ? (
            <span className="zip-city">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7.2L6 10L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {city}, KY
            </span>
          ) : zip.length === 5 ? (
            <span className="zip-err-msg">{error}</span>
          ) : (
            <span className="zip-hint">5-digit US ZIP</span>
          )}
        </div>
      </div>
      <div className="zip-coverage">
        <span className="cov-dot" /> Serving Lexington, Frankfort, Georgetown, Versailles, Nicholasville, Winchester &amp; surrounding areas
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
          Phone <span style={{ fontFamily: 'var(--sans)', fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>For scheduling your free visit</span>
        </label>
        <input id="d-phone" type="tel" placeholder="555-000-0000" value={data.phone}
               onChange={(e) => setData({ ...data, phone: formatPhone(e.target.value) })} maxLength={12} />
      </div>
      <label className="check-row">
        <input type="checkbox" defaultChecked />
        <span>I'd like a follow-up text from a Synergy advisor (no spam, no robocalls).</span>
      </label>
    </div>
  )
}

export default function SynergySprayFoam({
  funnelId,
  funnelSlug,
  clientId,
  stepId,
  branding = {},
  tracking = {},
  disableTracking = false,
}) {
  const [step, setStep] = useState(0)
  const [issue, setIssue] = useState(null)
  const [crawlState, setCrawlState] = useState(null)
  const [crawlSize, setCrawlSize] = useState(null)
  const [zip, setZip] = useState('')
  const [city, setCity] = useState('')
  const [zipErr, setZipErr] = useState('')
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [direction, setDirection] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const leadIdRef = useRef(null)
  const metaRef = useRef({})
  const inFlightRef = useRef(false)
  const sessionKey = `fs_lead_${funnelId}`
  const gtagId = tracking.gtagId

  const total = 5
  const canAdvance = useMemo(() => {
    if (step === 0) return !!issue
    if (step === 1) return !!crawlState
    if (step === 2) return !!crawlSize
    if (step === 3) return zip.length === 5
    if (step === 4) return !!(contact.name && contact.email && contact.phone)
    return false
  }, [step, issue, crawlState, crawlSize, zip, contact])

  useEffect(() => {
    metaRef.current = captureMeta()
    if (disableTracking || !funnelId) return

    try {
      leadIdRef.current = sessionStorage.getItem(sessionKey) || null
    } catch {}

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
        body: JSON.stringify({
          funnelId, clientId, stepId, eventType: 'page_view', sessionId: sid, meta: metaRef.current,
        }),
      }).catch(() => {})
      try { sessionStorage.setItem(viewKey, '1') } catch {}
    }
  }, [sessionKey, funnelId, clientId, disableTracking])

  async function saveField(field, value) {
    if (disableTracking || !funnelId) return
    try {
      if (!leadIdRef.current) {
        const res = await fetch('/api/funnel-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create', field, value,
            funnelId, clientId, stepId, meta: metaRef.current,
          }),
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

  function chooseIssue(v) { setIssue(v);      saveField('issue', v);      scheduleAdvance() }
  function chooseState(v) { setCrawlState(v); saveField('crawlState', v); scheduleAdvance() }
  function chooseSize(v)  { setCrawlSize(v);  saveField('crawlSize', v);  scheduleAdvance() }

  async function next() {
    clearTimeout(advanceTimer.current)
    if (!canAdvance) return
    setDirection(1)

    if (step === 3) {
      await saveField('zip', zip)
      if (city) await saveField('city', city)
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

      const params = new URLSearchParams({ name: contact.name, city })
      if (disableTracking) {
        window.location.href = `/dev/funnel-preview/thank-you?${params.toString()}`
      } else {
        const slug = funnelSlug || 'spray-foam'
        window.location.href = `/f/${slug}/thanks?${params.toString()}`
      }
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
        <div className="survey-shell survey-shell--centered" data-theme="forest">
          <main className="stage">
            <div className="center-logo">
              <img src={branding.logoUrl || 'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/synergy-logo.svg'} alt="Synergy Home" />
            </div>
            <header className="stage-top stage-top--centered">
              <div className="stage-eyebrow">Lexington &amp; Bluegrass area homeowners</div>
              <h1 className="stage-headline">
                Stop losing money to a damp, drafty crawlspace — get a <span className="hl">free spray foam inspection</span> from Synergy Home.
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
                    <StepHeader eyebrow="01 · What's going on" title="What's the main issue with your crawlspace?" />
                    <div className="opt-grid">
                      {ISSUE.map((o, i) => (
                        <OptionTile key={o.id} option={o} index={i} selected={issue === o.id}
                          onClick={() => chooseIssue(o.id)} />
                      ))}
                    </div>
                  </>
                )}
                {step === 1 && (
                  <>
                    <StepHeader eyebrow="02 · Current state" title="What's the current state of your crawlspace?" />
                    <div className="opt-grid">
                      {CRAWL_STATE.map((o, i) => (
                        <OptionTile key={o.id} option={o} index={i} selected={crawlState === o.id}
                          onClick={() => chooseState(o.id)} />
                      ))}
                    </div>
                  </>
                )}
                {step === 2 && (
                  <>
                    <StepHeader eyebrow="03 · Size" title="Roughly how big is your crawlspace?" />
                    <div className="opt-grid">
                      {CRAWL_SIZE.map((o, i) => (
                        <OptionTile key={o.id} option={o} index={i} selected={crawlSize === o.id}
                          onClick={() => chooseSize(o.id)} />
                      ))}
                    </div>
                  </>
                )}
                {step === 3 && (
                  <>
                    <StepHeader eyebrow="04 · Location" title="Where are we coming to?"
                      sub="Serving Lexington and the Bluegrass Region." />
                    <ZipStep zip={zip} setZip={setZip} city={city} setCity={setCity}
                             error={zipErr} setError={setZipErr} />
                  </>
                )}
                {step === 4 && (
                  <>
                    <StepHeader eyebrow="05 · Contact" title="Last step — how can we reach you?"
                      sub="One advisor, one call. We don't share your info with third parties." />
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
                  {step === total - 1 ? (submitting ? 'Sending…' : 'Get my free inspection') : 'Continue'}
                  <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </footer>
            </section>

            <StatStrip />
            {step >= 3 && <Testimonial />}

            <footer className="stage-foot">
              <span>©2026 Synergy Home. All Rights Reserved.</span>
              <span className="dot">|</span>
              <span>Master HVAC License #HM06306</span>
              <span className="dot">|</span>
              <span>Electrical Business Contractor License #CE65736</span>
            </footer>
          </main>
        </div>
      </div>
    </>
  )
}
