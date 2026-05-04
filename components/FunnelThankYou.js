'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import s from './FunnelSurvey.module.css'

export default function FunnelThankYou({ funnelId, clientId, branding = {}, tracking = {}, stepConfig = {} }) {
  const gtagId = tracking.gtagId
  const title = stepConfig.title || "We've Got Your Info!"
  const message = stepConfig.message || 'Thanks — we will be in touch shortly.'
  const cta = stepConfig.cta || {}
  const conversionPixel = stepConfig.conversionPixel

  useEffect(() => {
    const sid = (() => {
      try { return sessionStorage.getItem('fs_sid') || '' } catch { return '' }
    })()
    fetch('/api/funnel-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funnelId, clientId, eventType: 'thank_you_view', sessionId: sid }),
    }).catch(() => {})
  }, [funnelId, clientId])

  const rootStyle = {
    '--fs-primary': branding.primaryColor || '#2e6e42',
    '--fs-primary-hover': branding.primaryColorHover || '#245737',
    '--fs-primary-light': branding.primaryColorLight || '#e8f5ed',
  }

  return (
    <div className={s.shell} style={rootStyle}>
      {conversionPixel && (
        <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: conversionPixel }} />
      )}
      {gtagId && (
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

      {branding.logoUrl && (
        <div className={s.brand}>
          <img src={branding.logoUrl} alt="" className={s.brandLogo} />
        </div>
      )}

      <div className={s.thankyou}>
        <div className={s.thankyouIcon}>✅</div>
        <div className={s.thankyouTitle}>{title}</div>
        <div
          className={s.thankyouMsg}
          dangerouslySetInnerHTML={{ __html: message.replace(/\n/g, '<br/>') }}
        />
        {cta.label && cta.href && (
          <a href={cta.href} className={s.ctaBtn} style={{ display: 'inline-block', marginTop: 24, textDecoration: 'none' }}>
            {cta.label}
          </a>
        )}
      </div>
    </div>
  )
}
