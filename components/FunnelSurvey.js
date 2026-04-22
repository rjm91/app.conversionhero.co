'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import s from './FunnelSurvey.module.css'

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
    adgroup: p.get('ad_group_id') || p.get('adgroup') || '',
    gclid: p.get('gclid') || '',
    wbraid: p.get('wbraid') || '',
    contact_id: p.get('contact_id') || '',
    device: p.get('device') || (/Mobi|Android/i.test(navigator.userAgent) ? 'm' : 'd'),
  }
}

export default function FunnelSurvey({ funnelId, funnelSlug, clientId, branding = {}, tracking = {}, stepConfig = {} }) {
  const steps = stepConfig.steps || []
  const headline = stepConfig.headline || {}
  const footer = stepConfig.footer || {}
  const gtagId = tracking.gtagId
  const thankYouUrl = branding.thankYouUrl

  const [currentStep, setCurrentStep] = useState(0)
  const [selections, setSelections] = useState({})
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const leadIdRef = useRef(null)
  const metaRef = useRef({})
  const inFlightRef = useRef(false)
  const sessionKey = `fs_lead_${funnelId}`

  useEffect(() => {
    metaRef.current = captureMeta()
    try {
      leadIdRef.current = sessionStorage.getItem(sessionKey) || null
    } catch {}

    // Fire a single page_view per browser session
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
          funnelId, clientId, eventType: 'page_view', sessionId: sid, meta: metaRef.current,
        }),
      }).catch(() => {})
      try { sessionStorage.setItem(viewKey, '1') } catch {}
    }
  }, [sessionKey, funnelId, clientId])

  const rootStyle = {
    '--fs-primary': branding.primaryColor || '#2e6e42',
    '--fs-primary-hover': branding.primaryColorHover || '#245737',
    '--fs-primary-light': branding.primaryColorLight || '#e8f5ed',
  }

  async function saveField(field, value) {
    try {
      if (!leadIdRef.current) {
        const res = await fetch('/api/funnel-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create', field, value,
            funnelId, clientId, meta: metaRef.current,
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

  function selectOption(step, value) {
    setSelections(prev => ({ ...prev, [step.id]: value }))
    saveField(step.id, value)
    if (step.autoNext) {
      setTimeout(() => goForward(), 350)
    }
  }

  function goForward() {
    setCurrentStep(i => Math.min(i + 1, steps.length - 1))
    setError(null)
  }
  function goBack() {
    setCurrentStep(i => Math.max(i - 1, 0))
    setError(null)
  }

  async function handleTextNext(step) {
    const val = (document.getElementById(`fs_${step.field.name}`)?.value || '').trim()
    if (!val) {
      setFieldErrors({ [step.field.name]: true })
      setTimeout(() => setFieldErrors({}), 1500)
      return
    }
    setSelections(prev => ({ ...prev, [step.field.name]: val }))
    await saveField(step.field.name, val)
    goForward()
  }

  async function handleContactSubmit(step) {
    if (inFlightRef.current) return
    const name = (document.getElementById('fs_fullName')?.value || '').trim()
    const email = (document.getElementById('fs_email')?.value || '').trim()
    const phone = (document.getElementById('fs_phone')?.value || '').trim()

    const errs = {}
    if (!name) errs.fullName = true
    if (!email) errs.email = true
    if (!phone) errs.phone = true
    if (Object.keys(errs).length) {
      setFieldErrors(errs)
      setTimeout(() => setFieldErrors({}), 2000)
      return
    }

    inFlightRef.current = true
    await saveField('fullName', name)
    await saveField('email', email)
    await saveField('phone', phone)
    if (leadIdRef.current) {
      await fetch('/api/funnel-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: leadIdRef.current, status: 'new_lead' }),
      })
    }
    try { sessionStorage.removeItem(sessionKey) } catch {}

    if (thankYouUrl) {
      window.location.href = thankYouUrl
    } else {
      const onCustomDomain = !window.location.pathname.startsWith('/f/')
      window.location.href = onCustomDomain ? '/thanks' : `/f/${funnelSlug}/thanks`
    }
    inFlightRef.current = false
  }

  const pct = Math.round((currentStep / steps.length) * 100)
  const step = steps[currentStep]

  return (
    <div className={s.shell} style={rootStyle}>
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

      <Header branding={branding} headline={headline} />

      <div className={s.progressWrap}>
        <div className={s.progressBar} style={{ width: `${pct}%` }} />
      </div>

      <div className={s.viewport}>
        <div className={`${s.card} ${s.cardActive}`} key={step?.id}>
          <div className={s.question}>{step?.question}</div>

          {step?.type === 'cards' && (
            <>
              <div className={`${s.optionGrid} ${s[`cols${step.cols || 3}`] || ''}`}>
                {step.options.map(opt => {
                  const selected = selections[step.id] === opt.value
                  return (
                    <div
                      key={opt.value}
                      className={`${s.optionCard} ${selected ? s.selected : ''}`}
                      onClick={() => selectOption(step, opt.value)}
                    >
                      {opt.img && (
                        <div className={s.optionImg}>
                          <img src={opt.img} alt={opt.label} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        </div>
                      )}
                      <div className={s.optionLabel}>{opt.label}</div>
                    </div>
                  )
                })}
              </div>
              {error && <p className={s.cardError}>Please select an option</p>}
              <button
                className={s.ctaBtn}
                onClick={() => {
                  if (!selections[step.id]) { setError(true); setTimeout(() => setError(null), 2500); return }
                  goForward()
                }}
              >
                {currentStep === 0 ? "LET'S START" : 'Next »'}
              </button>
              {currentStep > 0 && <button className={s.prevLink} onClick={goBack}>← Previous</button>}
            </>
          )}

          {step?.type === 'list' && (
            <>
              <div className={s.optionList}>
                {step.options.map(opt => {
                  const selected = selections[step.id] === opt.value
                  return (
                    <div
                      key={opt.value}
                      className={`${s.optionRow} ${selected ? s.selected : ''}`}
                      onClick={() => selectOption(step, opt.value)}
                    >
                      <span className={s.optionRowIcon}>{opt.icon}</span>
                      <span className={s.optionRowLabel}>{opt.label}</span>
                    </div>
                  )
                })}
              </div>
              {error && <p className={s.cardError}>Please select an option</p>}
              <button
                className={s.ctaBtn}
                onClick={() => {
                  if (!selections[step.id]) { setError(true); setTimeout(() => setError(null), 2500); return }
                  goForward()
                }}
              >Next »</button>
              {currentStep > 0 && <button className={s.prevLink} onClick={goBack}>← Previous</button>}
            </>
          )}

          {step?.type === 'text' && (
            <>
              <div className={s.inputGroup}>
                <label className={s.inputLabel} htmlFor={`fs_${step.field.name}`}>{step.field.label}</label>
                <input
                  className={`${s.inputField} ${fieldErrors[step.field.name] ? s.inputFieldError : ''}`}
                  id={`fs_${step.field.name}`}
                  name={step.field.name}
                  type="text"
                  inputMode={step.field.inputmode || 'text'}
                  placeholder={step.field.placeholder || ''}
                  maxLength={step.field.maxlength}
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleTextNext(step) }}
                />
              </div>
              <button className={s.ctaBtn} onClick={() => handleTextNext(step)}>{step.cta || 'Next »'}</button>
              {currentStep > 0 && <button className={s.prevLink} onClick={goBack}>← Previous</button>}
            </>
          )}

          {step?.type === 'contact' && (
            <>
              <div className={s.inputGroup}>
                <label className={s.inputLabel} htmlFor="fs_fullName">Full Name</label>
                <input className={`${s.inputField} ${fieldErrors.fullName ? s.inputFieldError : ''}`} id="fs_fullName" name="fullName" type="text" placeholder="Jane Smith" autoComplete="name" />
              </div>
              <div className={s.inputGroup}>
                <label className={s.inputLabel} htmlFor="fs_email">Email</label>
                <input className={`${s.inputField} ${fieldErrors.email ? s.inputFieldError : ''}`} id="fs_email" name="email" type="email" placeholder="jane@email.com" autoComplete="email" />
              </div>
              <div className={s.inputGroup}>
                <label className={s.inputLabel} htmlFor="fs_phone">Phone</label>
                <input className={`${s.inputField} ${fieldErrors.phone ? s.inputFieldError : ''}`} id="fs_phone" name="phone" type="tel" placeholder="(555) 000-0000" autoComplete="tel" inputMode="tel" />
              </div>
              <button className={s.ctaBtn} onClick={() => handleContactSubmit(step)}>{step.cta || 'Submit'}</button>
              {currentStep > 0 && <button className={s.prevLink} onClick={goBack}>← Previous</button>}
            </>
          )}
        </div>
      </div>

      <div className={s.stepCounter}>Step {currentStep + 1} of {steps.length}</div>

      <Footer footer={footer} branding={branding} />
    </div>
  )
}

function Header({ branding, headline }) {
  return (
    <>
      {branding.logoUrl && (
        <div className={s.brand}>
          <img src={branding.logoUrl} alt="" className={s.brandLogo} />
        </div>
      )}
      {(headline.eyebrow || headline.title) && (
        <div className={s.headline}>
          {headline.eyebrow && <h2>{headline.eyebrow}</h2>}
          {headline.title && <h1>{headline.title}</h1>}
        </div>
      )}
    </>
  )
}

function Footer({ footer, branding }) {
  if (!footer?.companyName && !branding?.logoUrl) return null
  return (
    <footer className={s.footer}>
      {branding.logoUrl && <img src={branding.logoUrl} alt="" className={s.brandLogo} />}
      {footer.companyName && <p className={s.footerText}>© {new Date().getFullYear()} {footer.companyName}. All rights reserved.</p>}
      {(footer.privacyUrl || footer.termsUrl) && (
        <div className={s.footerLinks}>
          {footer.privacyUrl && <a href={footer.privacyUrl} target="_blank" rel="noreferrer">Privacy Policy</a>}
          {footer.privacyUrl && footer.termsUrl && <span className={s.footerDivider}>·</span>}
          {footer.termsUrl && <a href={footer.termsUrl} target="_blank" rel="noreferrer">Terms of Service</a>}
        </div>
      )}
    </footer>
  )
}
