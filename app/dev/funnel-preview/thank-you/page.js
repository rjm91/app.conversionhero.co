'use client'

import { useEffect, useState } from 'react'
import { DESIGN_CSS } from '../design'

// ─── Google Ads conversion config ────────────────────────────────────────────
// Replace AW-XXXXXXXXXX and the conversion label below before going live.
const GOOGLE_ADS_ID = 'AW-XXXXXXXXXX'
const GOOGLE_ADS_CONVERSION_LABEL = 'AW-XXXXXXXXXX/XXXXXXXXXXXXXXXXX'

function CompleteCard({ city, firstName }) {
  return (
    <div className="complete">
      <div className="complete-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle cx="32" cy="32" r="30" fill="none" stroke="var(--brand)" strokeWidth="1.5" />
          <path d="M20 33 L29 41 L45 24" stroke="var(--brand)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2 className="complete-title">Your free quote is being prepared.</h2>
      <p className="complete-sub">
        {firstName ? <>Thanks, <strong>{firstName}</strong>. </> : null}
        A Synergy Home advisor will reach out as soon as possible to walk you through next steps for your whole-home generator quote{city ? <> in <strong>{city}</strong></> : null}.
      </p>
      <div className="complete-next">
        <div className="next-row"><span className="next-num">01</span><span className="next-label">Free phone consult <em>· today or tomorrow</em></span></div>
        <div className="next-row"><span className="next-num">02</span><span className="next-label">On-site walkthrough <em>· typically within a week</em></span></div>
        <div className="next-row"><span className="next-num">03</span><span className="next-label">Itemized quote, no obligation</span></div>
      </div>
      <div className="ty-actions">
        <a className="btn-primary" href="tel:+18595550100">
          Call us now
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 4.5C3 3.7 3.7 3 4.5 3H6L7 5L5.8 6.2C6.5 7.5 7.5 8.5 8.8 9.2L10 8L12 9V10.5C12 11.3 11.3 12 10.5 12C6.4 12 3 8.6 3 4.5Z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round"/></svg>
        </a>
      </div>
    </div>
  )
}

export default function ThankYouPage() {
  const [firstName, setFirstName] = useState('')
  const [city, setCity] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const name = (params.get('name') || '').trim()
    setFirstName(name.split(/\s+/)[0] || '')
    setCity(params.get('city') || '')

    // Fire Google Ads conversion pixel on page load
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'conversion', {
        send_to: GOOGLE_ADS_CONVERSION_LABEL,
        value: 1.0,
        currency: 'USD',
      })
    }
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DESIGN_CSS }} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&display=swap" rel="stylesheet" />

      {/* Google Ads gtag — replace ID before going live */}
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ADS_ID}');
          `,
        }}
      />

      <div className="d-root">
        <div className="survey-shell survey-shell--done">
          <main className="stage">
            <div className="mobile-logo">
              <img src="https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/synergy-logo.svg" alt="Synergy Home" />
            </div>
            <section className="card">
              <CompleteCard city={city} firstName={firstName} />
            </section>
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
