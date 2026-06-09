'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'

const BRAND_LOGO = 'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/brand/logo-1780679768602.svg'

const BRAND_CSS = `
.sf-root{--navy:#262263;--navy-deep:#1a1747;--yellow:#ffe600;--green:#016838;--green-mid:#1f9d5c;--ink:#1c2233;--muted:#5b6478;--line:#e6e8f0;--sans:'Inter',system-ui,sans-serif;--display:'Poppins',system-ui,sans-serif;}
.sf-root *{box-sizing:border-box;margin:0;padding:0;}
.sf-root{font-family:var(--sans);color:var(--ink);background:linear-gradient(180deg,var(--navy) 0%,var(--navy-deep) 100%);min-height:100vh;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;}
.sf-root .wrap{max-width:680px;margin:0 auto;padding:0 24px;width:100%;}
.sf-root .grad-bar{height:5px;background:linear-gradient(90deg,var(--green) 0%,var(--green-mid) 45%,var(--yellow) 100%);}
.sf-root header{background:#fff;}
.sf-root .topbar{display:flex;align-items:center;justify-content:center;padding:16px 0;}
.sf-root .brand-logo{height:46px;width:auto;display:block;}
.sf-root .stage{flex:1;display:flex;align-items:center;justify-content:center;padding:54px 0;}
.sf-root .card{background:#fff;border-radius:20px;box-shadow:0 24px 60px rgba(10,15,50,.4);overflow:hidden;width:100%;}
.sf-root .card-top{height:5px;background:linear-gradient(90deg,var(--green) 0%,var(--green-mid) 50%,var(--yellow) 100%);}
.sf-root .card-body{padding:40px 36px 36px;text-align:center;}
.sf-root .mark{width:72px;height:72px;border-radius:50%;background:#edf5f0;display:grid;place-items:center;margin:0 auto 22px;}
.sf-root .title{font-family:var(--display);font-weight:800;font-size:27px;color:var(--navy);line-height:1.18;letter-spacing:-.4px;}
.sf-root .sub{font-size:15.5px;color:var(--muted);line-height:1.55;margin:14px auto 28px;max-width:460px;}
.sf-root .sub strong{color:var(--navy);}
.sf-root .next{text-align:left;max-width:430px;margin:0 auto 28px;display:flex;flex-direction:column;gap:12px;}
.sf-root .next-row{display:flex;align-items:center;gap:13px;}
.sf-root .next-num{width:30px;height:30px;flex:none;border-radius:8px;background:var(--navy);color:var(--yellow);font-family:var(--display);font-weight:800;font-size:13px;display:grid;place-items:center;}
.sf-root .next-label{font-size:14px;color:var(--ink);font-weight:500;}
.sf-root .next-label em{font-style:normal;color:var(--muted);}
.sf-root .call-btn{display:inline-flex;align-items:center;gap:9px;font-family:var(--display);font-weight:800;font-size:16px;background:var(--yellow);color:var(--navy);border-radius:12px;padding:14px 28px;text-decoration:none;box-shadow:0 10px 24px rgba(255,230,0,.25);}
.sf-root .call-btn:hover{filter:brightness(1.03);}
.sf-root footer{color:rgba(255,255,255,.6);font-size:12px;text-align:center;padding:22px 24px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;}
.sf-root footer .dot{opacity:.4;}
`

function CompleteCard({ city, firstName }) {
  return (
    <section className="card">
      <div className="card-top" />
      <div className="card-body">
        <div className="mark">
          <svg viewBox="0 0 64 64" width="56" height="56">
            <circle cx="32" cy="32" r="28" fill="none" stroke="#016838" strokeWidth="2" />
            <path d="M20 33 L29 41 L45 24" stroke="#016838" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="title">Your free spray foam inspection is booked.</h1>
        <p className="sub">
          {firstName ? <>Thanks, <strong>{firstName}</strong>. </> : null}
          A Synergy Home advisor will reach out as soon as possible to schedule your free spray foam insulation &amp; sealing inspection{city ? <> in <strong>{city}</strong></> : null}.
        </p>
        <div className="next">
          <div className="next-row"><span className="next-num">1</span><span className="next-label">Free phone consult <em>· today or tomorrow</em></span></div>
          <div className="next-row"><span className="next-num">2</span><span className="next-label">On-site home assessment <em>· typically within a week</em></span></div>
          <div className="next-row"><span className="next-num">3</span><span className="next-label">Honest recommendation, no obligation</span></div>
        </div>
        <a className="call-btn" href="tel:+18596870553">
          Call us now
          <svg width="15" height="15" viewBox="0 0 14 14"><path d="M3 4.5C3 3.7 3.7 3 4.5 3H6L7 5L5.8 6.2C6.5 7.5 7.5 8.5 8.8 9.2L10 8L12 9V10.5C12 11.3 11.3 12 10.5 12C6.4 12 3 8.6 3 4.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/></svg>
        </a>
      </div>
    </section>
  )
}

export default function SynergySprayFoamThankYou({
  funnelId,
  clientId,
  branding = {},
  tracking = {},
  stepConfig = {},
  disableTracking = false,
}) {
  const [firstName, setFirstName] = useState('')
  const [city, setCity] = useState('')

  const gtagId = tracking.gtagId
  const conversionPixel = stepConfig.conversionPixel
  const logoUrl = branding.logoUrl || BRAND_LOGO

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const name = (params.get('name') || '').trim()
    setFirstName(name.split(/\s+/)[0] || '')
    setCity(params.get('city') || '')

    if (disableTracking || !funnelId) return

    let sid = ''
    try { sid = sessionStorage.getItem('fs_sid') || '' } catch {}
    fetch('/api/funnel-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funnelId, clientId, eventType: 'thank_you_view', sessionId: sid }),
    }).catch(() => {})
  }, [funnelId, clientId, disableTracking])

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

      {conversionPixel && !disableTracking && (
        <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: conversionPixel }} />
      )}

      <div className="sf-root">
        <header>
          <div className="topbar">
            <img className="brand-logo" src={logoUrl} alt="Synergy Home" />
          </div>
        </header>
        <div className="grad-bar" />
        <div className="stage">
          <div className="wrap">
            <CompleteCard city={city} firstName={firstName} />
          </div>
        </div>
        <footer>
          <span>©2026 Synergy Home. All Rights Reserved.</span>
          <span className="dot">|</span>
          <span>Master HVAC License #HM06306</span>
          <span className="dot">|</span>
          <span>Serving Lexington &amp; the Bluegrass Region</span>
        </footer>
      </div>
    </>
  )
}
