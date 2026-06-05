'use client'

import { useState, useEffect, useRef } from 'react'
import Script from 'next/script'

const BRAND_LOGO = 'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/brand/logo-1780679768602.svg'
const TESTI_PHOTO = 'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/testi-hvac-chris-giebler.png'

// Variant B — direct single-step name/email/phone form. Synergy brand board.
const BRAND_CSS = `
.sf2-root{--navy:#262263;--navy-deep:#1a1747;--navy-soft:#353074;--yellow:#ffe600;--yellow-dk:#e6cf00;--green:#016838;--green-dk:#014f2a;--green-mid:#1f9d5c;--ink:#1c2233;--muted:#5b6478;--line:#e6e8f0;--sans:'Inter',system-ui,sans-serif;--display:'Poppins',system-ui,sans-serif;}
.sf2-root *{box-sizing:border-box;margin:0;padding:0;}
.sf2-root{font-family:var(--sans);color:#fff;-webkit-font-smoothing:antialiased;min-height:100vh;background:radial-gradient(1100px 600px at 50% -8%,var(--navy-soft) 0%,transparent 60%),linear-gradient(180deg,var(--navy) 0%,var(--navy-deep) 100%);}
.sf2-root .wrap{max-width:600px;margin:0 auto;padding:0 22px;}
.sf2-root .grad-bar{height:5px;background:linear-gradient(90deg,var(--green) 0%,var(--green-mid) 45%,var(--yellow) 100%);}
.sf2-root header{background:#fff;}
.sf2-root .topbar{max-width:1100px;margin:0 auto;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;}
.sf2-root .brand-logo{height:44px;width:auto;display:block;}
.sf2-root .btn-yellow{font-family:var(--display);font-weight:700;font-size:13.5px;border:none;border-radius:999px;padding:11px 20px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px;background:var(--yellow);color:var(--navy);transition:filter .12s;}
.sf2-root .btn-yellow:hover{filter:brightness(1.04);}
.sf2-root .hero{text-align:center;padding:46px 0 18px;position:relative;}
.sf2-root .eyebrow{display:inline-flex;align-items:center;gap:8px;background:rgba(255,230,0,.15);border:1px solid rgba(255,230,0,.38);color:var(--yellow);font-weight:700;font-size:12px;letter-spacing:.6px;text-transform:uppercase;padding:6px 13px;border-radius:999px;}
.sf2-root .hero h1{font-family:var(--display);font-weight:800;font-size:38px;line-height:1.12;letter-spacing:-.5px;margin:18px 0 14px;}
.sf2-root .hero h1 .hl{color:var(--yellow);}
.sf2-root .hero p.sub{font-size:16.5px;line-height:1.6;color:rgba(255,255,255,.82);max-width:520px;margin:0 auto;text-wrap:balance;}
.sf2-root .trust-row{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:22px;flex-wrap:wrap;}
.sf2-root .stars{color:var(--yellow);font-size:15px;letter-spacing:1px;}
.sf2-root .trust-item{font-size:12.5px;color:rgba(255,255,255,.82);font-weight:600;display:flex;align-items:center;gap:7px;}
.sf2-root .gdot{width:18px;height:18px;border-radius:50%;background:conic-gradient(#4285F4 0 25%,#34A853 0 50%,#FBBC05 0 75%,#EA4335 0);}
.sf2-root .form-wrap{padding:30px 0 56px;}
.sf2-root .card{background:#fff;color:var(--ink);border-radius:20px;box-shadow:0 28px 70px rgba(0,0,0,.4);overflow:hidden;position:relative;}
.sf2-root .card-top{height:5px;background:linear-gradient(90deg,var(--green) 0%,var(--green-mid) 50%,var(--yellow) 100%);}
.sf2-root .promo-ribbon{position:absolute;top:18px;right:-46px;transform:rotate(45deg);background:var(--yellow);color:var(--navy);font-family:var(--display);font-weight:800;font-size:12px;letter-spacing:.5px;padding:6px 56px;box-shadow:0 4px 10px rgba(0,0,0,.15);}
.sf2-root .card-body{padding:30px 30px 28px;}
.sf2-root .card-eyebrow{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--green-dk);text-align:center;}
.sf2-root .card-title{font-family:var(--display);font-weight:800;font-size:24px;color:var(--navy);text-align:center;margin:7px 0 4px;line-height:1.18;}
.sf2-root .card-note{font-size:13px;color:var(--muted);text-align:center;margin-bottom:22px;}
.sf2-root .field{display:flex;flex-direction:column;margin-bottom:14px;}
.sf2-root .field-label{font-size:12px;font-weight:700;color:var(--navy);margin-bottom:6px;}
.sf2-root .field-input{display:flex;align-items:center;border:1.5px solid var(--line);border-radius:12px;padding:0 13px;transition:border-color .14s;}
.sf2-root .field-input:focus-within{border-color:var(--green);}
.sf2-root .field-input svg{flex:none;color:var(--muted);}
.sf2-root .field-input input{width:100%;border:none;outline:none;padding:14px 11px;font-size:15.5px;font-family:var(--sans);color:var(--ink);background:none;}
.sf2-root .cta{width:100%;font-family:var(--display);font-weight:800;font-size:17px;border:none;border-radius:13px;padding:16px;margin-top:6px;background:var(--yellow);color:var(--navy);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 12px 26px rgba(255,230,0,.28);transition:filter .12s,transform .1s;}
.sf2-root .cta:hover{filter:brightness(1.04);transform:translateY(-1px);}
.sf2-root .cta:disabled{opacity:.5;cursor:not-allowed;box-shadow:none;transform:none;}
.sf2-root .reassure{display:flex;align-items:center;justify-content:center;gap:7px;font-size:12px;color:var(--muted);margin-top:14px;}
.sf2-root .reassure b{color:var(--green-dk);font-weight:700;}
.sf2-root .mini-trust{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:18px;padding-top:16px;border-top:1px solid var(--line);}
.sf2-root .mini-trust span{font-size:11.5px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:5px;}
.sf2-root .testi{background:#fff;color:var(--ink);padding:52px 0;}
.sf2-root .testi-inner{max-width:760px;margin:0 auto;text-align:center;padding:0 22px;}
.sf2-root .testi-divider{width:54px;height:4px;border-radius:999px;background:linear-gradient(90deg,var(--green),var(--yellow));margin:0 auto 20px;}
.sf2-root .testi-eyebrow{font-size:11.5px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--green-dk);}
.sf2-root .testi-stars{color:var(--yellow);font-size:22px;letter-spacing:3px;margin:13px 0 16px;-webkit-text-stroke:.5px var(--yellow-dk);}
.sf2-root .testi-quote{font-family:var(--display);font-weight:600;font-size:23px;line-height:1.42;color:var(--navy);letter-spacing:-.3px;}
.sf2-root .testi-quote .mark{color:var(--green);}
.sf2-root .testi-person{display:inline-flex;align-items:center;gap:13px;margin-top:24px;}
.sf2-root .testi-photo{width:52px;height:52px;border-radius:50%;object-fit:cover;border:3px solid var(--yellow);}
.sf2-root .testi-name{text-align:left;}
.sf2-root .testi-name b{display:block;font-family:var(--display);font-weight:700;color:var(--navy);font-size:15px;}
.sf2-root .testi-name span{display:block;font-size:12.5px;color:var(--muted);}
.sf2-root footer{background:var(--navy-deep);color:rgba(255,255,255,.6);font-size:12px;}
.sf2-root footer .f-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:10px;padding:20px 22px;flex-wrap:wrap;text-align:center;}
.sf2-root footer .dot{opacity:.4;}
@media (max-width:560px){.sf2-root .hero h1{font-size:30px;}}
`

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

export default function SynergySprayFoamV2({
  funnelId,
  funnelSlug,
  clientId,
  stepId,
  branding = {},
  tracking = {},
  disableTracking = false,
}) {
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)

  const leadIdRef = useRef(null)
  const metaRef = useRef({})
  const inFlightRef = useRef(false)
  const sessionKey = `fs_lead_${funnelId}`
  const gtagId = tracking.gtagId
  const logoUrl = branding.logoUrl || BRAND_LOGO

  const canSubmit = !!(contact.name && contact.email && contact.phone)

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

  async function handleSubmit(e) {
    e?.preventDefault()
    if (!canSubmit || inFlightRef.current) return
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

    const params = new URLSearchParams({ name: contact.name, city: '' })
    if (disableTracking) {
      window.location.href = `/dev/funnel-preview/thank-you?${params.toString()}`
    } else {
      const slug = funnelSlug || 'spray-foam'
      window.location.href = `/f/${slug}/thanks?${params.toString()}`
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BRAND_CSS }} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

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

      <div className="sf2-root">
        <header>
          <div className="topbar">
            <img className="brand-logo" src={logoUrl} alt="Synergy Home" />
            <a className="btn-yellow" href="tel:+18592031533">
              <svg width="15" height="15" viewBox="0 0 14 14"><path d="M3 4.5C3 3.7 3.7 3 4.5 3H6L7 5L5.8 6.2C6.5 7.5 7.5 8.5 8.8 9.2L10 8L12 9V10.5C12 11.3 11.3 12 10.5 12C6.4 12 3 8.6 3 4.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/></svg>
              Call (859) 203-1533
            </a>
          </div>
        </header>
        <div className="grad-bar" />

        <section className="hero">
          <div className="wrap">
            <span className="eyebrow">★ Lexington &amp; Bluegrass Area Homeowners</span>
            <h1>Cut your energy bills with a <span className="hl">free spray foam inspection</span>.</h1>
            <p className="sub">Attic, crawlspace, or whole-home sealing from the team your neighbors trust. Tell us where to reach you — we'll handle the rest.</p>
            <div className="trust-row">
              <span className="trust-item"><span className="gdot" /> <span className="stars">★★★★★</span> 4.9 · 1,125+ Google reviews</span>
              <span className="trust-item">⚡ 24/7 Emergency Service</span>
            </div>
          </div>
        </section>

        <section className="form-wrap">
          <div className="wrap">
            <form className="card" onSubmit={handleSubmit}>
              <div className="card-top" />
              <div className="promo-ribbon">20% OFF</div>
              <div className="card-body">
                <div className="card-eyebrow">Free · No obligation</div>
                <div className="card-title">Get your free inspection</div>
                <div className="card-note">One quick call — no pushy sales, transparent pricing.</div>

                <div className="field">
                  <label className="field-label" htmlFor="v2-name">Full name</label>
                  <div className="field-input">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round"/></svg>
                    <input id="v2-name" type="text" placeholder="Jane Smith" value={contact.name}
                           onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="v2-email">Email</label>
                  <div className="field-input">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6" strokeLinecap="round"/></svg>
                    <input id="v2-email" type="email" placeholder="jane@email.com" value={contact.email}
                           onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="v2-phone">Phone</label>
                  <div className="field-input">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4.5C5 3.7 5.7 3 6.5 3H9l1.5 4-2 1.8c1 2.2 2.5 3.7 4.7 4.7L14 14.5 18 16v2.5c0 .8-.7 1.5-1.5 1.5C9.6 20 5 15.4 5 8.5z" strokeLinejoin="round"/></svg>
                    <input id="v2-phone" type="tel" placeholder="555-000-0000" value={contact.phone}
                           onChange={(e) => setContact({ ...contact, phone: formatPhone(e.target.value) })} maxLength={12} />
                  </div>
                </div>

                <button type="submit" className="cta" disabled={!canSubmit || submitting}>
                  {submitting ? 'Sending…' : 'Get My Free Inspection'}
                  <svg width="16" height="16" viewBox="0 0 14 14"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>

                <div className="reassure">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round"/></svg>
                  <span>Your info is <b>private</b> — never shared or sold.</span>
                </div>

                <div className="mini-trust">
                  <span>✓ Licensed &amp; insured</span>
                  <span>✓ 12+ years local</span>
                  <span>✓ 2,000+ homes sealed</span>
                </div>
              </div>
            </form>
          </div>
        </section>

        <section className="testi">
          <div className="testi-inner">
            <div className="testi-divider" />
            <div className="testi-eyebrow">What Lexington homeowners say</div>
            <div className="testi-stars">★★★★★</div>
            <blockquote className="testi-quote">
              <span className="mark">“</span>Their customer service is second to none. I will use no other company than Synergy Home from here on out. Highly recommended — five stars all around!<span className="mark">”</span>
            </blockquote>
            <div className="testi-person">
              <img className="testi-photo" src={TESTI_PHOTO} alt="Chris Giebler" />
              <span className="testi-name"><b>Chris Giebler</b><span>Lexington, KY · Verified Google review</span></span>
            </div>
          </div>
        </section>

        <footer>
          <div className="f-inner">
            <span>©2026 Synergy Home. All Rights Reserved.</span>
            <span className="dot">|</span>
            <span>Master HVAC License #HM06306</span>
            <span className="dot">|</span>
            <span>Serving Lexington &amp; the Bluegrass Region</span>
          </div>
        </footer>
      </div>
    </>
  )
}
