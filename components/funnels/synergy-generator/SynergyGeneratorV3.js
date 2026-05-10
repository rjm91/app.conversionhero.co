'use client'

import { useState, useEffect, useRef } from 'react'
import Script from 'next/script'
import { DESIGN_CSS } from './design'

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

function formatPhone(input) {
  const d = (input || '').replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

function StatStrip() {
  return (
    <div className="stat-strip">
      <div className="stat">
        <div className="stat-title">Authorized Generac Installer</div>
        <div className="stat-label">Factory-certified service</div>
      </div>
      <div className="stat-rule" />
      <div className="stat">
        <div className="stat-num">12<span>yrs</span></div>
        <div className="stat-label">Serving Lexington & Bluegrass area</div>
      </div>
      <div className="stat-rule" />
      <div className="stat">
        <div className="stat-num">700<span>+</span></div>
        <div className="stat-label">Generator installs</div>
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
        <img src="https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/testi-generator-kemS.png"
             alt="Kem S." style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
      <div>
        <blockquote>"Synergy service team members Dylan, Luke, and Austin. All of these individuals were top notch. Excellent job guys, thanks!"</blockquote>
        <figcaption>
          <strong>Kem S.</strong>
          <span>Lexington, KY</span>
        </figcaption>
      </div>
    </figure>
  )
}

export default function SynergyGeneratorV3({
  funnelId,
  funnelSlug,
  clientId,
  stepId,
  branding = {},
  tracking = {},
  disableTracking = false,
}) {
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [zip, setZip] = useState('')
  const [city, setCity] = useState('')
  const [zipErr, setZipErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const zipRef = useRef(null)

  const leadIdRef = useRef(null)
  const metaRef = useRef({})
  const inFlightRef = useRef(false)
  const sessionKey = `fs_lead_${funnelId}`
  const gtagId = tracking.gtagId

  const canSubmit = !!(
    contact.name && contact.email &&
    contact.phone.replace(/\D/g, '').length === 10 &&
    zip.length === 5
  )

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

  // Build suggestions from partial zip input
  const zipSuggestions = zip.length >= 1 && zip.length < 5
    ? Object.entries(KY_ZIPS)
        .filter(([code]) => code.startsWith(zip))
        .slice(0, 6)
    : []

  function onZipChange(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 5)
    setZip(v)
    setShowSuggestions(v.length >= 1 && v.length < 5)
    if (v.length === 5) {
      const c = KY_ZIPS[v] || ''
      setCity(c)
      setZipErr('')
      setShowSuggestions(false)
    } else { setCity(''); setZipErr('') }
  }

  function selectZip(code, cityName) {
    setZip(code)
    setCity(cityName)
    setZipErr('')
    setShowSuggestions(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit || inFlightRef.current) return
    inFlightRef.current = true
    setSubmitting(true)

    await saveField('zip', zip)
    if (city) await saveField('city', city)
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
      const slug = funnelSlug || 'generator-quote'
      window.location.href = `/f/${slug}/thanks?${params.toString()}`
    }
  }

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

      <style dangerouslySetInnerHTML={{ __html: `
        .v3-hero {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 48px;
          align-items: start;
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px 32px 40px;
        }

        /* ── Left: copy ─────────────────────────────── */
        .v3-copy .v3-eyebrow {
          font-family: var(--mono);
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-3);
          margin-bottom: 14px;
        }
        .v3-copy .v3-headline {
          font-family: var(--serif);
          font-size: clamp(2.4rem, 3.6vw, 3.2rem);
          font-weight: 400;
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin: 0 0 20px;
        }
        .v3-copy .v3-headline .hl {
          font-style: italic;
          font-weight: 500;
          color: var(--brand);
        }
        .v3-copy .v3-promo {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 8px;
          font-family: var(--sans);
          font-size: 16px;
          line-height: 1.55;
          color: var(--ink-2);
        }
        .v3-copy .v3-badge {
          display: inline-block;
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 4px;
          color: var(--brand);
          background: color-mix(in srgb, var(--brand) 12%, transparent);
          white-space: nowrap;
        }

        /* ── Right: form card ───────────────────────── */
        .v3-form-card {
          background: #fff;
          border: 1px solid #e8e8e8;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04);
        }
        .v3-form-head {
          text-align: center;
          padding: 20px 24px 0;
        }
        .v3-form-head h2 {
          font-family: var(--serif, 'Newsreader', Georgia, serif);
          font-size: 1.2rem;
          font-weight: 500;
          color: var(--fg, #1a1a1a);
          margin: 0 0 4px;
        }
        .v3-form-head p {
          font-size: 12.5px;
          color: #888;
          margin: 0;
          line-height: 1.4;
        }
        .v3-form-body {
          padding: 16px 24px 8px;
        }
        .v3-form-body .contact-grid { gap: 10px; }
        .v3-form-body .field input {
          padding: 9px 12px;
          font-size: 13.5px;
        }
        .v3-form-body .field-label {
          font-size: 9.5px;
          margin-bottom: 3px;
        }
        .v3-form-body .zip-field input {
          padding: 9px 12px;
          font-size: 13.5px;
        }
        .v3-form-body .zip-field {
          gap: 8px;
        }
        .v3-form-body .zip-status {
          padding-right: 14px;
          padding-left: 4px;
          font-size: 13px;
        }
        .v3-form-body .zip-coverage {
          font-size: 11px;
          margin-top: -2px;
        }
        .v3-form-body .check-row {
          font-size: 11.5px;
          margin-top: 2px;
        }
        .v3-form-foot {
          display: flex;
          justify-content: stretch;
          padding: 14px 24px 18px;
        }
        .v3-form-foot .btn-primary {
          width: 100%;
          justify-content: center;
          padding: 12px 20px;
          font-size: 14.5px;
        }

        /* ── Below: trust strip ─────────────────────── */
        .v3-trust {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 32px;
        }
        .v3-divider {
          border: none;
          border-top: 1px solid #e8e8e8;
          margin: 0 0 32px;
        }

        /* Zip autosuggest dropdown */
        .v3-zip-suggest {
          position: absolute;
          top: 100%;
          left: 0; right: 0;
          z-index: 20;
          margin: 4px 0 0;
          padding: 4px 0;
          list-style: none;
          background: #fff;
          border: 1px solid var(--line, #e5e5e5);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,.1);
          max-height: 200px;
          overflow-y: auto;
        }
        .v3-zip-suggest li {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 14px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .v3-zip-suggest li:hover {
          background: var(--brand-tint, #e6f2ec);
        }
        .v3-zs-code {
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          min-width: 48px;
        }
        .v3-zs-city {
          font-family: var(--sans);
          font-size: 13px;
          color: var(--ink-2);
        }

        /* Desktop: testimonial stays in left column, pulled up close to copy */
        .v3-hero > .v3-testimonial-wrap {
          grid-column: 1;
          margin-top: -28px;
        }
        .v3-hero > .v3-form-card {
          grid-column: 2;
          grid-row: 1 / 3;
        }

        /* Testimonial as standalone grid item */
        .v3-testimonial-wrap {
          display: block;
        }
        .v3-testimonial-wrap .testimonial {
          background: none;
          border: none;
          padding: 0;
          grid-template-columns: 100px 1fr;
          gap: 18px;
        }
        .v3-testimonial-wrap .testimonial-photo {
          width: 100px;
          height: 100px;
          border-radius: 12px;
        }

        @media (max-width: 768px) {
          .v3-hero {
            grid-template-columns: 1fr;
            gap: 28px;
            padding: 16px 20px 32px;
          }
          .v3-copy { order: 1; }
          .v3-hero > .v3-form-card { grid-column: 1; grid-row: auto; order: 2; }
          .v3-testimonial-wrap { display: block; order: 3; margin-top: 0; }
          .v3-trust { padding: 0 20px; }
        }
      `}} />

      <div className="d-root">
        <div className="survey-shell survey-shell--centered" data-theme="forest">
          <main className="stage">
            <div className="center-logo">
              <img src={branding.logoUrl || 'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/synergy-logo.svg'} alt="Synergy Home" />
            </div>

            <div className="v3-hero">
              {/* Left — copy + testimonial */}
              <div className="v3-copy">
                <div className="v3-eyebrow">Lexington &amp; Bluegrass area homeowners</div>
                <h1 className="v3-headline">
                  Get a free whole-home <span className="hl">generator quote</span>.
                </h1>
                <p className="v3-promo">
                  <span className="v3-badge">Spring Sale</span>
                  7-Year Parts &amp; Labor Warranty, 18 Months Same-As-Cash &amp; Financing Options Up To 10 Years.
                </p>
              </div>

              {/* Testimonial — separate grid item so it reorders under form on mobile */}
              <div className="v3-testimonial-wrap">
                <hr style={{ border: 'none', borderTop: '1px solid var(--line, #e5e5e5)', margin: '0 0 24px' }} />
                <Testimonial />
              </div>

              {/* Right — form */}
              <div className="v3-form-card">
                <form onSubmit={handleSubmit}>
                  <div className="v3-form-head">
                    <h2>Get your free quote</h2>
                    <p>No multi-step survey. We'll call to schedule your site visit.</p>
                  </div>

                  <div className="v3-form-body">
                    <div className="contact-grid">
                      <div className="field">
                        <label className="field-label" htmlFor="v3-name">Full name</label>
                        <input id="v3-name" type="text" placeholder="Jane Smith" value={contact.name}
                               onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor="v3-email">Email</label>
                        <input id="v3-email" type="email" placeholder="jane@email.com" value={contact.email}
                               onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor="v3-phone">Phone</label>
                        <input id="v3-phone" type="tel" placeholder="555-000-0000" value={contact.phone}
                               onChange={(e) => setContact({ ...contact, phone: formatPhone(e.target.value) })} maxLength={12} />
                      </div>
                      <div className="field" style={{ position: 'relative' }}>
                        <label className="field-label" htmlFor="v3-zip">ZIP code</label>
                        <div className={`zip-field ${zipErr ? 'error' : ''} ${city ? 'ok' : ''}`}>
                          <input id="v3-zip" ref={zipRef} type="text" inputMode="numeric" placeholder="40502"
                                 value={zip} onChange={onZipChange}
                                 onFocus={() => setShowSuggestions(zip.length >= 1 && zip.length < 5)}
                                 onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                 autoComplete="off" maxLength={5} />
                          <div className="zip-status">
                            {city ? (
                              <span className="zip-city">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M3 7.2L6 10L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                {city}, KY
                              </span>
                            ) : zip.length === 5 ? (
                              <span className="zip-err-msg">{zipErr}</span>
                            ) : (
                              <span className="zip-hint">5-digit US ZIP</span>
                            )}
                          </div>
                        </div>
                        {showSuggestions && zipSuggestions.length > 0 && (
                          <ul className="v3-zip-suggest">
                            {zipSuggestions.map(([code, cityName]) => (
                              <li key={code} onMouseDown={() => selectZip(code, cityName)}>
                                <span className="v3-zs-code">{code}</span>
                                <span className="v3-zs-city">{cityName}, KY</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="zip-coverage">
                        <span className="cov-dot" /> Serving Lexington, Frankfort, Georgetown &amp; surrounding areas
                      </div>
                      <label className="check-row">
                        <input type="checkbox" defaultChecked />
                        <span>I'd like a follow-up text from a Synergy advisor (no spam, no robocalls).</span>
                      </label>
                    </div>
                  </div>

                  <div className="v3-form-foot">
                    <button type="submit" className="btn-primary" disabled={!canSubmit || submitting}>
                      {submitting ? 'Sending…' : 'Get my free quote'}
                      <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Trust section — full width below hero */}
            <div className="v3-trust">
              <hr className="v3-divider" />
              <StatStrip />
            </div>

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
