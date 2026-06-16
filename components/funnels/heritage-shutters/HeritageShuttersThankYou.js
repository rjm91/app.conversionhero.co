'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { DESIGN_CSS } from '../synergy-generator/design'

function Wordmark({ branding }) {
  if (branding.logoUrl) return <img src={branding.logoUrl} alt="Heritage Shutters" />
  return <span style={{ fontFamily: 'var(--serif, Newsreader, Georgia, serif)', fontSize: 24, fontWeight: 500, color: 'var(--brand-deep)', letterSpacing: '0.01em' }}>Heritage Shutters</span>
}

function CompleteCard({ firstName }) {
  return (
    <div className="complete">
      <div className="complete-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle cx="32" cy="32" r="30" fill="none" stroke="var(--brand)" strokeWidth="1.5" />
          <path d="M20 33 L29 41 L45 24" stroke="var(--brand)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2 className="complete-title">Your free quote request is in.</h2>
      <p className="complete-sub">
        {firstName ? <>Thanks, <strong>{firstName}</strong>. </> : null}
        A Heritage Shutters specialist will reach out as soon as possible to schedule your free in-home consultation.
      </p>
      <div className="complete-next">
        <div className="next-row"><span className="next-num">01</span><span className="next-label">Quick call to learn what you&apos;re after <em>· today or tomorrow</em></span></div>
        <div className="next-row"><span className="next-num">02</span><span className="next-label">Free in-home measure &amp; design <em>· at your convenience</em></span></div>
        <div className="next-row"><span className="next-num">03</span><span className="next-label">Custom quote, no obligation</span></div>
      </div>
    </div>
  )
}

export default function HeritageShuttersThankYou({
  funnelId,
  clientId,
  branding = {},
  tracking = {},
  stepConfig = {},
  disableTracking = false,
}) {
  const [firstName, setFirstName] = useState('')

  const gtagId = tracking.gtagId
  const conversionPixel = stepConfig.conversionPixel

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const name = (params.get('name') || '').trim()
    setFirstName(name.split(/\s+/)[0] || '')

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

      {conversionPixel && !disableTracking && (
        <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: conversionPixel }} />
      )}

      <div className="d-root">
        <div className="survey-shell survey-shell--done" data-theme="copper">
          <main className="stage">
            <div className="mobile-logo">
              <Wordmark branding={branding} />
            </div>
            <section className="card">
              <CompleteCard firstName={firstName} />
            </section>
            <footer className="stage-foot">
              <span>©2026 Heritage Shutters. All Rights Reserved.</span>
            </footer>
          </main>
        </div>
      </div>
    </>
  )
}
