'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Script from 'next/script'

const BRAND_LOGO = 'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/brand/logo-1780679768602.svg'
const TESTI_PHOTO = 'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/testi-hvac-chris-giebler.png'

// Synergy Home brand board: navy #262263, yellow #FFE600, emerald #016838.
const BRAND_CSS = `
.sf-root{--navy:#262263;--navy-deep:#1a1747;--navy-soft:#353074;--yellow:#ffe600;--yellow-dk:#e6cf00;--green:#016838;--green-dk:#014f2a;--green-mid:#1f9d5c;--ink:#1c2233;--muted:#5b6478;--line:#e6e8f0;--sans:'Inter',system-ui,sans-serif;--display:'Poppins',system-ui,sans-serif;}
.sf-root *{box-sizing:border-box;margin:0;padding:0;}
.sf-root{font-family:var(--sans);color:var(--ink);background:#f4f5fa;-webkit-font-smoothing:antialiased;min-height:100vh;}
.sf-root .wrap{max-width:1180px;margin:0 auto;padding:0 24px;}
.sf-root .grad-bar{height:5px;background:linear-gradient(90deg,var(--green) 0%,var(--green-mid) 45%,var(--yellow) 100%);}
.sf-root header{background:#fff;}
.sf-root .topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 0;}
.sf-root .logo{display:flex;align-items:center;gap:11px;}
.sf-root .logo .brand-logo{height:46px;width:auto;display:block;}
.sf-root .btn{font-family:var(--display);font-weight:700;font-size:13.5px;border:none;border-radius:999px;padding:11px 20px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px;transition:transform .12s,filter .12s;}
.sf-root .btn:hover{transform:translateY(-1px);filter:brightness(1.03);}
.sf-root .btn-yellow{background:var(--yellow);color:var(--navy);}
.sf-root .hero{background:radial-gradient(900px 500px at 80% -10%,var(--navy-soft) 0%,transparent 60%),linear-gradient(180deg,var(--navy) 0%,var(--navy-deep) 100%);color:#fff;position:relative;overflow:hidden;}
.sf-root .hero::after{content:'';position:absolute;right:-120px;top:-120px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(255,230,0,.13),transparent 70%);}
.sf-root .hero-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:48px;padding:52px 0 60px;position:relative;z-index:1;align-items:start;}
.sf-root .eyebrow{display:inline-flex;align-items:center;gap:8px;background:rgba(255,230,0,.15);border:1px solid rgba(255,230,0,.38);color:var(--yellow);font-weight:700;font-size:12px;letter-spacing:.6px;text-transform:uppercase;padding:6px 13px;border-radius:999px;}
.sf-root .hero h1{font-family:var(--display);font-weight:800;font-size:42px;line-height:1.12;margin:18px 0 22px;letter-spacing:-.5px;}
.sf-root .hero h1 .hl{color:var(--yellow);}
.sf-root .hero p.sub{font-size:16.5px;line-height:1.6;color:rgba(255,255,255,.82);max-width:480px;}
.sf-root .promo-tag{display:inline-flex;align-items:center;gap:10px;margin-top:22px;background:#fff;color:var(--navy);border-radius:12px;padding:12px 16px;box-shadow:0 10px 30px rgba(0,0,0,.18);}
.sf-root .promo-tag .big{font-family:var(--display);font-weight:800;font-size:22px;color:var(--green-dk);}
.sf-root .promo-tag .small{font-size:12.5px;font-weight:600;line-height:1.25;}
.sf-root .promo-tag .small em{font-style:normal;color:var(--muted);display:block;font-weight:500;}
.sf-root .trust-row{display:flex;align-items:center;gap:18px;margin-top:26px;flex-wrap:wrap;}
.sf-root .stars{color:var(--yellow);font-size:15px;letter-spacing:1px;}
.sf-root .trust-item{font-size:12.5px;color:rgba(255,255,255,.8);font-weight:600;display:flex;align-items:center;gap:7px;}
.sf-root .gdot{width:18px;height:18px;border-radius:50%;background:conic-gradient(#4285F4 0 25%,#34A853 0 50%,#FBBC05 0 75%,#EA4335 0);}
.sf-root .card{background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(10,15,50,.35);overflow:hidden;}
.sf-root .card-top{background:linear-gradient(90deg,var(--green) 0%,var(--green-mid) 50%,var(--yellow) 100%);height:5px;}
.sf-root .card-body{padding:26px 26px 24px;}
.sf-root .progress{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;}
.sf-root .progress-track{flex:1;height:6px;background:var(--line);border-radius:999px;margin-right:14px;overflow:hidden;}
.sf-root .progress-fill{height:100%;background:linear-gradient(90deg,var(--green),var(--yellow));border-radius:999px;transition:width .35s ease;}
.sf-root .progress-meta{font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;}
.sf-root .q-eyebrow{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--green-dk);}
.sf-root .q-title{font-family:var(--display);font-weight:700;font-size:22px;color:var(--navy);margin:7px 0 18px;line-height:1.2;}
.sf-root .opts{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.sf-root .opt{text-align:left;border:1.5px solid var(--line);background:#fff;border-radius:13px;padding:15px;cursor:pointer;display:flex;gap:13px;align-items:center;transition:border-color .14s,box-shadow .14s,transform .1s;}
.sf-root .opt:hover{border-color:var(--green);box-shadow:0 6px 18px rgba(1,104,56,.16);transform:translateY(-1px);}
.sf-root .opt.sel{border-color:var(--green);background:#edf5f0;}
.sf-root .opt .ico{width:42px;height:42px;flex:none;border-radius:11px;background:var(--navy);display:grid;place-items:center;color:var(--yellow);}
.sf-root .opt .txt{display:flex;flex-direction:column;}
.sf-root .opt .lbl{display:block;font-family:var(--display);font-weight:700;font-size:14.5px;color:var(--navy);line-height:1.2;}
.sf-root .opt .desc{display:block;font-size:12px;color:var(--muted);margin-top:4px;line-height:1.35;}
.sf-root .card-foot{display:flex;align-items:center;justify-content:space-between;margin-top:20px;gap:12px;}
.sf-root .reassure{font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:6px;}
.sf-root .btn-ghost{background:none;border:none;color:var(--muted);font-family:var(--sans);font-weight:600;font-size:13.5px;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 4px;}
.sf-root .btn-ghost:hover{color:var(--navy);}
.sf-root .cta-next{font-family:var(--display);font-weight:800;font-size:15px;border:none;border-radius:12px;padding:13px 24px;background:var(--green);color:#fff;cursor:pointer;display:flex;align-items:center;gap:9px;box-shadow:0 8px 20px rgba(1,104,56,.3);transition:background .14s;}
.sf-root .cta-next:hover{background:var(--green-dk);}
.sf-root .cta-next:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;}
.sf-root .field{display:flex;flex-direction:column;margin-bottom:14px;}
.sf-root .field-label{font-size:12px;font-weight:700;color:var(--navy);margin-bottom:6px;}
.sf-root .field input,.sf-root .zip-field input{width:100%;border:1.5px solid var(--line);border-radius:11px;padding:13px 14px;font-size:15px;font-family:var(--sans);color:var(--ink);outline:none;transition:border-color .14s;}
.sf-root .field input:focus,.sf-root .zip-field input:focus{border-color:var(--green);}
.sf-root .check-row{display:flex;gap:9px;align-items:flex-start;font-size:12.5px;color:var(--muted);line-height:1.4;cursor:pointer;}
.sf-root .check-row input{margin-top:2px;accent-color:var(--green);}
.sf-root .zip-field-wrap{display:flex;flex-direction:column;gap:10px;}
.sf-root .zip-field{position:relative;}
.sf-root .zip-status{margin-top:7px;font-size:12.5px;min-height:16px;}
.sf-root .zip-city{color:var(--green-dk);font-weight:700;display:inline-flex;align-items:center;gap:5px;}
.sf-root .zip-hint{color:var(--muted);}
.sf-root .zip-coverage{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:8px;line-height:1.4;}
.sf-root .cov-dot{width:8px;height:8px;border-radius:50%;background:var(--green);flex:none;}
.sf-root .testi{background:#fff;padding:54px 0;}
.sf-root .testi-inner{max-width:820px;margin:0 auto;text-align:center;}
.sf-root .testi-eyebrow{font-size:11.5px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--green-dk);}
.sf-root .testi-stars{color:var(--yellow);font-size:22px;letter-spacing:3px;margin:14px 0 18px;-webkit-text-stroke:.5px var(--yellow-dk);}
.sf-root .testi-quote{font-family:var(--display);font-weight:600;font-size:25px;line-height:1.4;color:var(--navy);letter-spacing:-.3px;}
.sf-root .testi-quote .mark{color:var(--green);}
.sf-root .testi-person{display:inline-flex;align-items:center;gap:13px;margin-top:26px;}
.sf-root .testi-photo{width:54px;height:54px;border-radius:50%;object-fit:cover;border:3px solid var(--yellow);}
.sf-root .testi-name{text-align:left;}
.sf-root .testi-name b{display:block;font-family:var(--display);font-weight:700;color:var(--navy);font-size:15px;}
.sf-root .testi-name span{display:block;font-size:12.5px;color:var(--muted);}
.sf-root .testi-divider{width:54px;height:4px;border-radius:999px;background:linear-gradient(90deg,var(--green),var(--yellow));margin:0 auto 22px;}
.sf-root .brands{background:#fff;padding:26px 0;border-top:1px solid var(--line);}
.sf-root .brands .wrap{display:flex;align-items:center;justify-content:center;gap:44px;flex-wrap:wrap;}
.sf-root .brands .blabel{font-size:11.5px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-weight:700;}
.sf-root .brands .bname{font-family:var(--display);font-weight:800;font-size:19px;color:#9aa3b8;letter-spacing:.5px;}
.sf-root footer{background:var(--navy-deep);color:rgba(255,255,255,.65);font-size:12px;}
.sf-root footer .wrap{display:flex;align-items:center;justify-content:center;gap:10px;padding:20px 24px;flex-wrap:wrap;text-align:center;}
.sf-root footer .dot{opacity:.4;}
@media (max-width:880px){.sf-root .hero-grid{grid-template-columns:1fr;gap:34px;}.sf-root .hero h1{font-size:32px;}.sf-root .opts{grid-template-columns:1fr;}}
`

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

const AREA = [
  { id: "attic",      label: "Attic",        sub: "Hot upstairs, ice dams, or high bills", icon: "attic" },
  { id: "crawlspace", label: "Crawlspace",   sub: "Damp, musty air or cold floors",        icon: "crawlspace" },
  { id: "whole_home", label: "Whole home",   sub: "Drafty and inefficient throughout",     icon: "home" },
  { id: "not_sure",   label: "Not sure yet", sub: "Help me find where I'm losing energy",  icon: "question" },
]
const GOAL = [
  { id: "bills",      label: "Lower my energy bills",        sub: "Heating and cooling cost too much", icon: "dollar" },
  { id: "comfort",    label: "Fix uneven / drafty rooms",    sub: "Some rooms never feel comfortable", icon: "thermo" },
  { id: "moisture",   label: "Stop moisture, mold, or odors", sub: "Damp or musty air in the home",    icon: "drop" },
  { id: "efficiency", label: "Just make my home efficient",  sub: "Seal and insulate before problems", icon: "leaf" },
]
const HOME_SIZE = [
  { id: "small",   label: "Under 1,500 sq ft",   sub: "Smaller home",            icon: "ruler" },
  { id: "medium",  label: "1,500 – 2,500 sq ft", sub: "Average-size home",        icon: "ruler" },
  { id: "large",   label: "Over 2,500 sq ft",    sub: "Larger or multi-level",    icon: "ruler" },
  { id: "unknown", label: "Not sure",            sub: "We'll measure on the visit", icon: "question" },
]

function TileIcon({ name }) {
  const p = {
    attic:      <><path d="M3 11L12 4l9 7" /><path d="M5 10v9h14v-9" /></>,
    crawlspace: <><path d="M4 18h16M4 18V9l8-5 8 5v9" /><path d="M8 18v-4h8v4" /></>,
    home:       <><path d="M3 10l9-7 9 7v10a1 1 0 01-1 1H4a1 1 0 01-1-1V10z" /><path d="M9 21v-7h6v7" /></>,
    question:   <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 014.5 1.5c0 1.5-2 2-2 3.5" /><path d="M12 17.5h.01" /></>,
    dollar:     <><path d="M12 3v18" /><path d="M16 7.5a3.5 3.5 0 00-3.5-2.5h-1A3 3 0 008 8c0 3 8 1.5 8 5a3 3 0 01-3 3h-1.5A3.5 3.5 0 018 13.5" /></>,
    thermo:     <><path d="M12 14V5a2 2 0 10-4 0v9a4 4 0 104 0z" /></>,
    drop:       <><path d="M12 3s6 6.5 6 11a6 6 0 11-12 0c0-4.5 6-11 6-11z" /></>,
    leaf:       <><path d="M5 19c0-7 6-13 14-13 0 8-6 14-14 14" /><path d="M5 19c3-3 6-5 9-6" /></>,
    ruler:      <><rect x="3" y="8" width="18" height="8" rx="1.5" /><path d="M7 8v3M11 8v4M15 8v3M19 8v4" /></>,
  }[name] || <><circle cx="12" cy="12" r="9" /></>
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p}</svg>
  )
}

function OptionTile({ option, selected, onClick }) {
  return (
    <button type="button" className={`opt ${selected ? 'sel' : ''}`} onClick={onClick}>
      <span className="ico"><TileIcon name={option.icon} /></span>
      <span className="txt">
        <span className="lbl">{option.label}</span>
        <span className="desc">{option.sub}</span>
      </span>
    </button>
  )
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

function ZipStep({ zip, setZip, city, setCity }) {
  function onChange(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 5)
    setZip(v)
    setCity(v.length === 5 ? (KY_ZIPS[v] || '') : '')
  }
  return (
    <div className="zip-field-wrap">
      <div className="zip-field">
        <input type="text" inputMode="numeric" placeholder="40502" value={zip}
               onChange={onChange} autoComplete="postal-code" maxLength={5} />
        <div className="zip-status">
          {city ? (
            <span className="zip-city">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7.2L6 10L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {city}, KY
            </span>
          ) : <span className="zip-hint">5-digit US ZIP</span>}
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
    <div>
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
        <label className="field-label" htmlFor="d-phone">Phone</label>
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
  const [area, setArea] = useState(null)
  const [goal, setGoal] = useState(null)
  const [homeSize, setHomeSize] = useState(null)
  const [zip, setZip] = useState('')
  const [city, setCity] = useState('')
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)

  const leadIdRef = useRef(null)
  const metaRef = useRef({})
  const inFlightRef = useRef(false)
  const sessionKey = `fs_lead_${funnelId}`
  const gtagId = tracking.gtagId

  const total = 5
  const canAdvance = useMemo(() => {
    if (step === 0) return !!area
    if (step === 1) return !!goal
    if (step === 2) return !!homeSize
    if (step === 3) return zip.length === 5
    if (step === 4) return !!(contact.name && contact.email && contact.phone)
    return false
  }, [step, area, goal, homeSize, zip, contact])

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
      setStep(s => Math.min(total - 1, s + 1))
    }, 450)
  }

  function chooseArea(v) { setArea(v);     saveField('area', v);     scheduleAdvance() }
  function chooseGoal(v) { setGoal(v);     saveField('goal', v);     scheduleAdvance() }
  function chooseSize(v) { setHomeSize(v); saveField('homeSize', v); scheduleAdvance() }

  async function next() {
    clearTimeout(advanceTimer.current)
    if (!canAdvance) return

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
      const slug = funnelSlug || 'spray-foam'
      window.location.href = `/f/${slug}/thanks?${params.toString()}`
      return
    }

    setStep(s => s + 1)
  }

  function back() {
    clearTimeout(advanceTimer.current)
    setStep(s => Math.max(0, s - 1))
  }

  const progress = step / (total - 1)
  const logoUrl = branding.logoUrl || BRAND_LOGO

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

      <div className="sf-root">
        {/* Header — logo + click-to-call only (no nav) */}
        <header>
          <div className="wrap">
            <div className="topbar">
              <div className="logo">
                <img className="brand-logo" src={logoUrl} alt="Synergy Home" />
              </div>
              <a className="btn btn-yellow" href="tel:+18596870553">
                <svg width="15" height="15" viewBox="0 0 14 14"><path d="M3 4.5C3 3.7 3.7 3 4.5 3H6L7 5L5.8 6.2C6.5 7.5 7.5 8.5 8.8 9.2L10 8L12 9V10.5C12 11.3 11.3 12 10.5 12C6.4 12 3 8.6 3 4.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/></svg>
                Call (859) 687-0553
              </a>
            </div>
          </div>
        </header>
        <div className="grad-bar" />

        {/* Hero — pitch + survey card */}
        <section className="hero">
          <div className="wrap">
            <div className="hero-grid">
              <div>
                <span className="eyebrow">★ Lexington &amp; Bluegrass Area Homeowners</span>
                <h1>Stop losing money to a drafty, poorly insulated home — get a <span className="hl">free spray foam inspection</span>.</h1>
                <p className="sub">Attic, crawlspace, or whole-home. Synergy Home's spray foam sealing keeps your home comfortable year-round and cuts your energy bills — from the team your neighbors already trust.</p>

                <div className="promo-tag">
                  <span className="big">20% OFF</span>
                  <span className="small">Spray Foam Insulation<em>Limited summer offer · expires 6/30/26</em></span>
                </div>

                <div className="trust-row">
                  <span className="trust-item"><span className="gdot" /> <span className="stars">★★★★★</span> 4.9 · 1,125+ Google reviews</span>
                  <span className="trust-item">⚡ 24/7 Emergency Service</span>
                  <span className="trust-item">✓ Transparent Pricing</span>
                </div>
              </div>

              {/* Survey card */}
              <div className="card">
                <div className="card-top" />
                <div className="card-body">
                  <div className="progress">
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${progress * 100}%` }} /></div>
                    <div className="progress-meta">{`Step ${step + 1} of ${total}`}</div>
                  </div>

                  {step === 0 && (
                    <>
                      <div className="q-eyebrow">01 · Where to seal</div>
                      <div className="q-title">Where are you looking to seal or insulate?</div>
                      <div className="opts">
                        {AREA.map(o => <OptionTile key={o.id} option={o} selected={area === o.id} onClick={() => chooseArea(o.id)} />)}
                      </div>
                    </>
                  )}
                  {step === 1 && (
                    <>
                      <div className="q-eyebrow">02 · Your goal</div>
                      <div className="q-title">What's the main thing you want to fix?</div>
                      <div className="opts">
                        {GOAL.map(o => <OptionTile key={o.id} option={o} selected={goal === o.id} onClick={() => chooseGoal(o.id)} />)}
                      </div>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <div className="q-eyebrow">03 · Home size</div>
                      <div className="q-title">Roughly how big is your home?</div>
                      <div className="opts">
                        {HOME_SIZE.map(o => <OptionTile key={o.id} option={o} selected={homeSize === o.id} onClick={() => chooseSize(o.id)} />)}
                      </div>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <div className="q-eyebrow">04 · Location</div>
                      <div className="q-title">Where are we coming to?</div>
                      <ZipStep zip={zip} setZip={setZip} city={city} setCity={setCity} />
                    </>
                  )}
                  {step === 4 && (
                    <>
                      <div className="q-eyebrow">05 · Contact</div>
                      <div className="q-title">Last step — how can we reach you?</div>
                      <ContactStep data={contact} setData={setContact} />
                    </>
                  )}

                  <div className="card-foot">
                    {step > 0 ? (
                      <button type="button" className="btn-ghost" onClick={back}>
                        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Back
                      </button>
                    ) : <span className="reassure">🔒 No spam · one quick call</span>}
                    <button type="button" className="cta-next" onClick={next} disabled={!canAdvance || submitting}>
                      {step === total - 1 ? (submitting ? 'Sending…' : 'Get my free inspection') : 'Continue'}
                      <svg width="15" height="15" viewBox="0 0 14 14"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="grad-bar" />

        {/* Testimonial */}
        <section className="testi">
          <div className="wrap">
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
          </div>
        </section>

        {/* Trust strip */}
        <section className="brands">
          <div className="wrap">
            <span className="blabel">Trusted equipment partners</span>
            <span className="bname">CARRIER</span>
            <span className="bname">Amana</span>
            <span className="bname">DAIKIN</span>
            <span className="bname">GENERAC</span>
          </div>
        </section>

        <footer>
          <div className="wrap">
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
