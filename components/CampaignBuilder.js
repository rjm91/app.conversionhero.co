'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  buildCsv, docCounts, RSA, MATCH_TYPES, STATUSES, BID_STRATEGIES,
  MAX_HEADLINES, MAX_DESCRIPTIONS, HEADLINE_MAX_LEN, DESC_MAX_LEN, PATH_MAX_LEN,
  DEFAULT_TRACKING,
} from '../lib/google-ads-csv'

const uid = () => Math.random().toString(36).slice(2, 10)

function newKeyword()  { return { id: uid(), text: '', matchType: 'Phrase' } }
function newAd()       { return { id: uid(), adType: RSA, headlines: [ {text:'',position:null}, {text:'',position:null}, {text:'',position:null} ], descriptions: [ {text:'',position:null}, {text:'',position:null} ], path1: '', path2: '', finalUrl: '' } }
function newAdGroup(n) { return { id: uid(), name: n || 'Ad group 1', keywords: [newKeyword()], ads: [newAd()] } }
function newCampaign() { return { id: uid(), name: 'New Campaign', status: 'Paused', bidStrategy: 'Maximize clicks', trackingTemplate: DEFAULT_TRACKING, adGroups: [newAdGroup()] } }

// Normalize a campaign drafted by the agent into a full doc campaign (assign
// ids, apply defaults, coerce headline/description strings to {text,position}).
function normalizeAgentCampaign(c) {
  const adGroups = (Array.isArray(c.adGroups) ? c.adGroups : []).map(g => ({
    id: uid(),
    name: g.name || 'Ad group 1',
    keywords: (Array.isArray(g.keywords) ? g.keywords : []).map(k => ({
      id: uid(),
      text: (typeof k === 'string' ? k : k.text) || '',
      matchType: MATCH_TYPES.includes(k.matchType) ? k.matchType : 'Phrase',
    })),
    ads: (Array.isArray(g.ads) ? g.ads : []).map(a => ({
      id: uid(), adType: RSA,
      headlines: (Array.isArray(a.headlines) ? a.headlines : []).map(h => ({ text: (typeof h === 'string' ? h : h.text) || '', position: null })),
      descriptions: (Array.isArray(a.descriptions) ? a.descriptions : []).map(d => ({ text: (typeof d === 'string' ? d : d.text) || '', position: null })),
      path1: a.path1 || '', path2: a.path2 || '', finalUrl: a.finalUrl || '',
    })),
  }))
  return {
    id: uid(),
    name: c.name || 'New Campaign',
    status: STATUSES.includes(c.status) ? c.status : 'Paused',
    bidStrategy: BID_STRATEGIES.includes(c.bidStrategy) ? c.bidStrategy : 'Maximize clicks',
    trackingTemplate: c.trackingTemplate || DEFAULT_TRACKING,
    adGroups: adGroups.length ? adGroups : [newAdGroup()],
  }
}

// ── small UI atoms ──────────────────────────────────────────────────────────
const inputCls = 'w-full bg-transparent text-gray-900 dark:text-white text-[12.5px] px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-white/5'

function CellInput({ value, onChange, placeholder, mono, className = '' }) {
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className={`${inputCls} ${mono ? 'font-mono text-[11.5px]' : ''} ${className}`} />
}

function MatchPill({ value, onChange }) {
  const color = value === 'Exact' ? 'text-emerald-400' : value === 'Phrase' ? 'text-amber-400' : 'text-blue-400'
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`bg-transparent text-[12px] font-semibold ${color} focus:outline-none cursor-pointer px-1`}>
      {MATCH_TYPES.map(m => <option key={m} value={m} className="bg-[#1c2138] text-white">{m}</option>)}
    </select>
  )
}

// ── main component ──────────────────────────────────────────────────────────
export default function CampaignBuilder({ clientId, clientName }) {
  const [doc, setDoc]         = useState({ campaigns: [] })
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [selected, setSelected]   = useState(null)   // { cid, gid, aid }
  const [glowIds, setGlowIds]     = useState(() => new Set()) // campaigns just added by the agent
  const skipSave = useRef(true)
  const saveTimer = useRef(null)
  const addedByProposal = useRef({}) // proposalId → [campaignId] for agent undo

  // load draft
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/campaign-drafts?clientId=${clientId}`)
        const data = await res.json()
        if (alive && res.ok) setDoc(data.doc?.campaigns ? data.doc : { campaigns: [] })
      } finally {
        if (alive) { setLoading(false); skipSave.current = true }
      }
    })()
    return () => { alive = false }
  }, [clientId])

  // debounced autosave
  useEffect(() => {
    if (loading) return
    if (skipSave.current) { skipSave.current = false; return }
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/campaign-drafts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, doc }),
        })
        setSaveState(res.ok ? 'saved' : 'error')
      } catch { setSaveState('error') }
    }, 900)
    return () => clearTimeout(saveTimer.current)
  }, [doc, clientId, loading])

  // agent → sheet: auto-fill campaigns the agent drafts, with glow + undo
  useEffect(() => {
    function onApply(e) {
      const { campaigns, proposalId } = e.detail || {}
      if (!Array.isArray(campaigns) || !campaigns.length) return
      const normalized = campaigns.map(normalizeAgentCampaign)
      const ids = normalized.map(c => c.id)
      if (proposalId) addedByProposal.current[proposalId] = ids
      setGlowIds(prev => { const s = new Set(prev); ids.forEach(i => s.add(i)); return s })
      setTimeout(() => setGlowIds(prev => { const s = new Set(prev); ids.forEach(i => s.delete(i)); return s }), 6000)
      setDoc(prev => ({ ...prev, campaigns: [...prev.campaigns, ...normalized] }))
    }
    function onUndo(e) {
      const ids = addedByProposal.current[e.detail?.proposalId]
      if (!ids) return
      setDoc(prev => ({ ...prev, campaigns: prev.campaigns.filter(c => !ids.includes(c.id)) }))
      delete addedByProposal.current[e.detail.proposalId]
    }
    window.addEventListener('campaign:apply', onApply)
    window.addEventListener('campaign:undo', onUndo)
    return () => {
      window.removeEventListener('campaign:apply', onApply)
      window.removeEventListener('campaign:undo', onUndo)
    }
  }, [])

  // immutable-ish mutation helper
  const update = useCallback((producer) => {
    setDoc(prev => { const next = structuredClone(prev); producer(next); return next })
  }, [])

  const findCamp = (next, cid) => next.campaigns.find(c => c.id === cid)
  const findGroup = (next, cid, gid) => findCamp(next, cid)?.adGroups.find(g => g.id === gid)
  const findAd = (next, cid, gid, aid) => findGroup(next, cid, gid)?.ads.find(a => a.id === aid)

  // campaign ops
  const addCampaign = () => update(n => { n.campaigns.push(newCampaign()) })
  const patchCampaign = (cid, patch) => update(n => Object.assign(findCamp(n, cid), patch))
  const deleteCampaign = (cid) => update(n => { n.campaigns = n.campaigns.filter(c => c.id !== cid) })
  // ad group ops
  const addAdGroup = (cid) => update(n => { const c = findCamp(n, cid); c.adGroups.push(newAdGroup(`Ad group ${c.adGroups.length + 1}`)) })
  const patchAdGroup = (cid, gid, patch) => update(n => Object.assign(findGroup(n, cid, gid), patch))
  const deleteAdGroup = (cid, gid) => update(n => { const c = findCamp(n, cid); c.adGroups = c.adGroups.filter(g => g.id !== gid) })
  // keyword ops
  const addKeyword = (cid, gid) => update(n => findGroup(n, cid, gid).keywords.push(newKeyword()))
  const patchKeyword = (cid, gid, kid, patch) => update(n => Object.assign(findGroup(n, cid, gid).keywords.find(k => k.id === kid), patch))
  const deleteKeyword = (cid, gid, kid) => update(n => { const g = findGroup(n, cid, gid); g.keywords = g.keywords.filter(k => k.id !== kid) })
  // ad ops
  const addAd = (cid, gid) => update(n => findGroup(n, cid, gid).ads.push(newAd()))
  const patchAd = (cid, gid, aid, patch) => update(n => Object.assign(findAd(n, cid, gid, aid), patch))
  const deleteAd = (cid, gid, aid) => update(n => { const g = findGroup(n, cid, gid); g.ads = g.ads.filter(a => a.id !== aid) })

  const counts = docCounts(doc)

  function downloadCsv() {
    const csv = buildCsv(doc)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const name = (clientName || clientId || 'campaigns').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    a.href = url; a.download = `${name}-google-ads-editor.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  const selectedAd = selected && findAd(doc, selected.cid, selected.gid, selected.aid)

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Loading campaign builder…</div>

  return (
    <div>
      {/* toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            A live sheet that mirrors the Google Ads Editor import. Edit cells directly, then download.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            <b className="text-gray-700 dark:text-gray-200">{counts.campaigns}</b> campaigns · <b className="text-gray-700 dark:text-gray-200">{counts.adGroups}</b> ad groups · <b className="text-gray-700 dark:text-gray-200">{counts.keywords}</b> keywords · <b className="text-gray-700 dark:text-gray-200">{counts.ads}</b> ads
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 w-16 text-right">
            {saveState === 'saving' && 'Saving…'}
            {saveState === 'saved'  && <span className="text-emerald-500">Saved ✓</span>}
            {saveState === 'error'  && <span className="text-red-500">Save failed</span>}
          </span>
          <button onClick={addCampaign}
            className="text-xs font-semibold text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 px-3 py-2 rounded-lg transition">
            + New campaign
          </button>
          <button onClick={downloadCsv} disabled={counts.campaigns === 0}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-[#06281c] font-bold text-xs px-4 py-2 rounded-lg transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
            Download CSV
          </button>
        </div>
      </div>

      {/* sheet */}
      <div className="border border-gray-200 dark:border-white/5 rounded-xl overflow-auto bg-white dark:bg-[#171B33]" style={{ maxHeight: 'calc(100vh - 380px)', minHeight: 320 }}>
        {counts.campaigns === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-gray-400 mb-3">No campaigns yet.</p>
            <button onClick={addCampaign} className="text-sm font-semibold text-blue-600 dark:text-blue-400">+ Create your first campaign</button>
          </div>
        ) : (
          <table className="text-[12.5px] border-collapse min-w-full whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#1c2138] text-gray-400">
                {['#','Campaign','Ad Group','Status','Keyword','Match','Bid strategy','Ad type','Headline 1','Headline 2','Headline 3','Final URL'].map((h, i) => (
                  <th key={i} className={`sticky top-0 z-10 bg-gray-50 dark:bg-[#1c2138] text-left font-bold text-[11px] uppercase tracking-wide px-3 py-2 border-b border-r border-gray-100 dark:border-white/5 ${i===0?'w-10 text-center':''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doc.campaigns.map(c => <CampaignRows key={c.id} c={c} glow={glowIds.has(c.id)}
                selected={selected} setSelected={setSelected}
                patchCampaign={patchCampaign} deleteCampaign={deleteCampaign}
                addAdGroup={addAdGroup} patchAdGroup={patchAdGroup} deleteAdGroup={deleteAdGroup}
                addKeyword={addKeyword} patchKeyword={patchKeyword} deleteKeyword={deleteKeyword}
                addAd={addAd} patchAd={patchAd} deleteAd={deleteAd} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* ad editor + preview */}
      {selectedAd && (
        <AdEditor ad={selectedAd} loc={selected}
          patchAd={patchAd} deleteAd={deleteAd} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

// ── one campaign's rows ─────────────────────────────────────────────────────
function CampaignRows({ c, glow, selected, setSelected, patchCampaign, deleteCampaign, addAdGroup, patchAdGroup, deleteAdGroup, addKeyword, patchKeyword, deleteKeyword, addAd, patchAd, deleteAd }) {
  const cellBase = 'border-b border-r border-gray-100 dark:border-white/5 align-middle'
  const glowCls = glow ? 'bg-violet-50 dark:bg-violet-500/10' : ''
  const muted = <span className="text-gray-300 dark:text-white/15 px-3">—</span>
  let campFirstDone = false
  const campMetaDone = { done: false } // campaign-level status/bid render once

  const rows = []
  c.adGroups.forEach((g, gi) => {
    let groupFirstDone = false
    const groupRowCount = g.keywords.length + g.ads.length
    const renderCampCell = () => {
      if (campFirstDone) return <td className={cellBase}></td>
      campFirstDone = true
      return (
        <td className={`${cellBase} sticky left-0 bg-white dark:bg-[#171B33] min-w-[180px]`}>
          <input value={c.name} onChange={e => patchCampaign(c.id, { name: e.target.value })}
            className={`${inputCls} font-bold text-blue-600 dark:text-blue-400`} />
        </td>
      )
    }
    const renderGroupCell = () => {
      if (groupFirstDone) return <td className={cellBase}></td>
      groupFirstDone = true
      return (
        <td className={`${cellBase} min-w-[150px]`}>
          <input value={g.name} onChange={e => patchAdGroup(c.id, g.id, { name: e.target.value })}
            className={`${inputCls} font-semibold`} />
        </td>
      )
    }
    // status/bid cells appear on the campaign's first row only
    const statusCell = (first) => first ? (
      <td className={cellBase}>
        <select value={c.status} onChange={e => patchCampaign(c.id, { status: e.target.value })}
          className="bg-transparent text-[12px] font-medium text-gray-500 dark:text-gray-300 focus:outline-none cursor-pointer px-2">
          {STATUSES.map(s => <option key={s} value={s} className="bg-[#1c2138] text-white">{s}</option>)}
        </select>
      </td>
    ) : <td className={cellBase}></td>
    const bidCell = (first) => first ? (
      <td className={cellBase}>
        <select value={c.bidStrategy} onChange={e => patchCampaign(c.id, { bidStrategy: e.target.value })}
          className="bg-transparent text-[12px] text-gray-500 dark:text-gray-300 focus:outline-none cursor-pointer px-2 max-w-[140px]">
          {BID_STRATEGIES.map(b => <option key={b} value={b} className="bg-[#1c2138] text-white">{b}</option>)}
        </select>
      </td>
    ) : <td className={cellBase}></td>

    g.keywords.forEach((k, ki) => {
      const first = !campMetaDone.done; campMetaDone.done = true
      const groupStart = ki === 0
      rows.push(
        <tr key={k.id} className={`group ${glowCls || 'hover:bg-gray-50/60 dark:hover:bg-white/[0.02]'} ${groupStart ? 'border-t border-gray-200 dark:border-white/10' : ''}`}>
          <td className={`${cellBase} text-center text-gray-300 dark:text-white/25 text-[11px]`}>{rows.length + 1}</td>
          {renderCampCell()}
          {renderGroupCell()}
          {statusCell(first)}
          <td className={`${cellBase} min-w-[180px]`}><CellInput value={k.text} mono onChange={v => patchKeyword(c.id, g.id, k.id, { text: v })} placeholder="keyword" /></td>
          <td className={cellBase}><MatchPill value={k.matchType} onChange={v => patchKeyword(c.id, g.id, k.id, { matchType: v })} /></td>
          {bidCell(first)}
          <td className={cellBase}>{muted}</td>
          <td className={cellBase}>{muted}</td>
          <td className={cellBase}>{muted}</td>
          <td className={cellBase}>{muted}</td>
          <td className={`${cellBase} relative`}>
            <button onClick={() => deleteKeyword(c.id, g.id, k.id)} title="Remove keyword"
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 px-3 transition">✕</button>
          </td>
        </tr>
      )
    })

    g.ads.forEach((a) => {
      const first = !campMetaDone.done; campMetaDone.done = true
      const isSel = selected?.aid === a.id
      const h = (i) => a.headlines?.[i]?.text || ''
      rows.push(
        <tr key={a.id} onClick={() => setSelected({ cid: c.id, gid: g.id, aid: a.id })}
          className={`group cursor-pointer ${isSel ? 'bg-blue-50 dark:bg-blue-500/10' : (glowCls || 'hover:bg-gray-50/60 dark:hover:bg-white/[0.02]')}`}>
          <td className={`${cellBase} text-center text-gray-300 dark:text-white/25 text-[11px]`}>{rows.length + 1}</td>
          {renderCampCell()}
          {renderGroupCell()}
          {statusCell(first)}
          <td className={cellBase}>{muted}</td>
          <td className={cellBase}>{muted}</td>
          {bidCell(first)}
          <td className={cellBase}><span className="text-[11px] font-semibold text-violet-500 dark:text-violet-400 px-2">RSA</span></td>
          <td className={`${cellBase} px-3 text-gray-700 dark:text-gray-200 max-w-[150px] truncate`}>{h(0) || <span className="text-gray-300 dark:text-white/20">—</span>}</td>
          <td className={`${cellBase} px-3 text-gray-700 dark:text-gray-200 max-w-[150px] truncate`}>{h(1) || <span className="text-gray-300 dark:text-white/20">—</span>}</td>
          <td className={`${cellBase} px-3 text-gray-700 dark:text-gray-200 max-w-[150px] truncate`}>{h(2) || <span className="text-gray-300 dark:text-white/20">—</span>}</td>
          <td className={`${cellBase} px-3 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] max-w-[160px] truncate`}>{a.finalUrl || <span className="text-gray-300 dark:text-white/20 font-sans">click to edit ↓</span>}</td>
        </tr>
      )
    })

    // per-group action row
    rows.push(
      <tr key={g.id + '-actions'} className="bg-gray-50/40 dark:bg-white/[0.015]">
        <td className={cellBase}></td>
        <td className={cellBase}></td>
        <td className={`${cellBase}`} colSpan={10}>
          <div className="flex items-center gap-3 px-2 py-1">
            <button onClick={() => addKeyword(c.id, g.id)} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">+ keyword</button>
            <button onClick={() => addAd(c.id, g.id)} className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:underline">+ ad</button>
            {c.adGroups.length > 1 && (
              <button onClick={() => deleteAdGroup(c.id, g.id)} className="text-[11px] text-gray-400 hover:text-red-500 ml-auto">delete ad group</button>
            )}
          </div>
        </td>
      </tr>
    )
  })

  // campaign footer action row
  rows.push(
    <tr key={c.id + '-cfoot'} className="bg-gray-100/60 dark:bg-white/[0.03] border-b-2 border-gray-200 dark:border-white/10">
      <td className={cellBase}></td>
      <td className={cellBase} colSpan={11}>
        <div className="flex items-center gap-4 px-2 py-1.5">
          <button onClick={() => addAdGroup(c.id)} className="text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:text-blue-500">+ Ad group</button>
          <span className="text-[11px] text-gray-300 dark:text-white/20">·</span>
          <button onClick={() => { if (confirm(`Delete campaign “${c.name}”?`)) deleteCampaign(c.id) }} className="text-[11px] text-gray-400 hover:text-red-500">Delete campaign</button>
        </div>
      </td>
    </tr>
  )

  return <>{rows}</>
}

// ── RSA editor + live preview ───────────────────────────────────────────────
function AdEditor({ ad, loc, patchAd, deleteAd, onClose }) {
  const setHeadline = (i, text) => patchAd(loc.cid, loc.gid, loc.aid, { headlines: ad.headlines.map((h, idx) => idx === i ? { ...h, text } : h) })
  const addHeadline = () => patchAd(loc.cid, loc.gid, loc.aid, { headlines: [...ad.headlines, { text: '', position: null }] })
  const rmHeadline = (i) => patchAd(loc.cid, loc.gid, loc.aid, { headlines: ad.headlines.filter((_, idx) => idx !== i) })
  const setDesc = (i, text) => patchAd(loc.cid, loc.gid, loc.aid, { descriptions: ad.descriptions.map((d, idx) => idx === i ? { ...d, text } : d) })
  const addDesc = () => patchAd(loc.cid, loc.gid, loc.aid, { descriptions: [...ad.descriptions, { text: '', position: null }] })
  const rmDesc = (i) => patchAd(loc.cid, loc.gid, loc.aid, { descriptions: ad.descriptions.filter((_, idx) => idx !== i) })

  const heads = (ad.headlines || []).map(h => h.text).filter(Boolean)
  const descs = (ad.descriptions || []).map(d => d.text).filter(Boolean)
  const previewTitle = heads.slice(0, 3).join(' | ') || 'Your headlines appear here'
  const previewDesc  = descs.slice(0, 2).join(' ') || 'Your descriptions appear here.'
  let domain = 'your-site.com'
  try { if (ad.finalUrl) domain = new URL(ad.finalUrl.startsWith('http') ? ad.finalUrl : `https://${ad.finalUrl}`).hostname.replace(/^www\./, '') } catch {}
  const pathDisplay  = [domain, ad.path1, ad.path2].filter(Boolean).join('/')
  const strength = heads.length >= 8 && descs.length >= 3 ? { label: 'Excellent', w: '100%' }
                 : heads.length >= 5 && descs.length >= 2 ? { label: 'Good', w: '70%' }
                 : heads.length >= 3 ? { label: 'Average', w: '45%' } : { label: 'Poor', w: '20%' }

  return (
    <div className="mt-4 bg-white dark:bg-[#171B33] border border-gray-200 dark:border-white/5 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-white/5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Responsive Search Ad</h3>
        <div className="flex items-center gap-3">
          <button onClick={() => { if (confirm('Delete this ad?')) { deleteAd(loc.cid, loc.gid, loc.aid); onClose() } }}
            className="text-xs text-gray-400 hover:text-red-500">Delete ad</button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
        {/* editor */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Headlines</span>
            <span className="text-[11px] text-gray-400">{heads.length} / {MAX_HEADLINES}</span>
          </div>
          <div className="space-y-1.5">
            {ad.headlines.map((h, i) => (
              <ChipField key={i} num={i+1} value={h.text} max={HEADLINE_MAX_LEN}
                onChange={v => setHeadline(i, v)} onRemove={ad.headlines.length > 1 ? () => rmHeadline(i) : null} />
            ))}
          </div>
          {ad.headlines.length < MAX_HEADLINES && (
            <button onClick={addHeadline} className="mt-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400">+ Add headline</button>
          )}

          <div className="flex items-center justify-between mb-2 mt-5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Descriptions</span>
            <span className="text-[11px] text-gray-400">{descs.length} / {MAX_DESCRIPTIONS}</span>
          </div>
          <div className="space-y-1.5">
            {ad.descriptions.map((d, i) => (
              <ChipField key={i} num={i+1} value={d.text} max={DESC_MAX_LEN}
                onChange={v => setDesc(i, v)} onRemove={ad.descriptions.length > 1 ? () => rmDesc(i) : null} />
            ))}
          </div>
          {ad.descriptions.length < MAX_DESCRIPTIONS && (
            <button onClick={addDesc} className="mt-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400">+ Add description</button>
          )}

          <div className="grid grid-cols-2 gap-2 mt-5">
            <Labeled label={`Path 1 (≤${PATH_MAX_LEN})`}><BareInput value={ad.path1} maxLength={PATH_MAX_LEN} onChange={v => patchAd(loc.cid, loc.gid, loc.aid, { path1: v })} placeholder="repair" /></Labeled>
            <Labeled label={`Path 2 (≤${PATH_MAX_LEN})`}><BareInput value={ad.path2} maxLength={PATH_MAX_LEN} onChange={v => patchAd(loc.cid, loc.gid, loc.aid, { path2: v })} placeholder="lexington" /></Labeled>
          </div>
          <div className="mt-2">
            <Labeled label="Final URL"><BareInput value={ad.finalUrl} mono onChange={v => patchAd(loc.cid, loc.gid, loc.aid, { finalUrl: v })} placeholder="https://example.com/page" /></Labeled>
          </div>
        </div>

        {/* preview */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Preview · how it can appear on Google</span>
          <div className="bg-white rounded-xl p-4 mt-2 border border-gray-200">
            <div className="flex items-center gap-1.5 text-[12px] text-[#202124]"><span className="font-bold">Ad</span><span className="text-[#5f6368]">·</span><span>{pathDisplay}</span></div>
            <div className="text-[18px] leading-snug text-[#1a0dab] mt-1 mb-1">{previewTitle}</div>
            <div className="text-[13px] text-[#4d5156] leading-relaxed">{previewDesc}</div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-[12px] text-gray-500 dark:text-gray-400">
            <span>Ad strength: <b className="text-gray-700 dark:text-gray-200">{strength.label}</b></span>
            <span className="inline-block w-20 h-1.5 rounded bg-gray-200 dark:bg-white/10 overflow-hidden">
              <span className="block h-full bg-emerald-500" style={{ width: strength.w }} />
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">Google rotates your headlines &amp; descriptions into different combinations — this is one example. More assets → stronger ads.</p>
        </div>
      </div>
    </div>
  )
}

function ChipField({ num, value, max, onChange, onRemove }) {
  const over = value.length > max
  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5">
      <span className="text-[10px] font-bold text-gray-400 w-4">{num}</span>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 bg-transparent text-[13px] text-gray-900 dark:text-white focus:outline-none" />
      <span className={`text-[10px] tabular-nums ${over ? 'text-red-500 font-bold' : 'text-gray-400'}`}>{value.length}/{max}</span>
      {onRemove && <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-xs">✕</button>}
    </div>
  )
}

function Labeled({ label, children }) {
  return <div><label className="block text-[11px] text-gray-400 mb-1">{label}</label>{children}</div>
}
function BareInput({ value, onChange, placeholder, maxLength, mono }) {
  return <input value={value} maxLength={maxLength} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className={`w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-[12.5px] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${mono ? 'font-mono text-[11.5px]' : ''}`} />
}
