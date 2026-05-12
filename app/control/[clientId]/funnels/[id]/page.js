'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../../lib/supabase-browser'
import StepEditorDrawer from '../../../../../components/StepEditorDrawer'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function convRate(step) {
  if (!step.visitors) return 0
  return step.leads / step.visitors
}

function isArchived(step) {
  return !!step.config?.archivedAt
}

function isPending(step) {
  // Only pending if never gone live: inactive, not archived, and has a challenger componentName with no traffic yet
  return !step.is_active && !isArchived(step) && !!step.config?.componentName && !step.visitors
}

function isPaused(step) {
  return !step.is_active && !isArchived(step) && !isPending(step)
}

function liveVariants(variants) {
  return variants.filter(v => v.is_active && !isArchived(v))
}

function getWinner(variants) {
  const live = liveVariants(variants)
  if (live.length < 2) return null
  // Only show a winner when there's actual data and a clear leader
  const withTraffic = live.filter(v => v.visitors > 0)
  if (withTraffic.length < 2) return null
  const best = withTraffic.reduce((b, v) => convRate(v) > convRate(b) ? v : b)
  // Don't declare a winner if rates are tied
  const others = withTraffic.filter(v => v.id !== best.id)
  if (others.every(v => convRate(v) === convRate(best))) return null
  return best
}

function getDelta(step, variants) {
  const live = liveVariants(variants)
  if (live.length < 2) return null
  const others = live.filter(v => v.id !== step.id)
  const maxOther = Math.max(...others.map(convRate))
  return convRate(step) - maxOther
}

function nextVariantLabel(variants) {
  const used = new Set(variants.map(v => v.variant).filter(Boolean))
  for (const l of ['a', 'b', 'c', 'd', 'e', 'f']) {
    if (!used.has(l)) return l
  }
  return 'c'
}

// Map funnel slug → component folder + default component name
const FUNNEL_COMPONENTS = {
  'generator-quote':      { folder: 'components/funnels/synergy-generator', base: 'SynergyGenerator' },
  'hvac-second-opinion':  { folder: 'components/funnels/synergy-hvac',      base: 'SynergyHVAC' },
}

function getFunnelComponent(funnel, winner) {
  const mapped = FUNNEL_COMPONENTS[funnel.slug]
  const base = winner?.config?.componentName || mapped?.base || 'Unknown'
  const folder = mapped?.folder || 'components/funnels'
  return { base, folder }
}

function buildPrompt({ winner, loser, componentName, hypothesis, funnel }) {
  const winConv  = winner.visitors ? (convRate(winner) * 100).toFixed(1) : '0.0'
  const loseConv = loser?.visitors  ? (convRate(loser)  * 100).toFixed(1) : '0.0'
  const { folder } = getFunnelComponent(funnel, winner)
  const winnerFile = (winner.config?.componentName || getFunnelComponent(funnel, winner).base) + '.js'

  return `Winner declared: Variant ${(winner.variant || 'b').toUpperCase()} (${winnerFile}) — ${winConv}% conv vs ${loseConv}%

Build challenger for ${funnel.client_id} / ${funnel.name}:
- Fork:       ${folder}/${winnerFile}
- Save as:    ${folder}/${componentName}.js
- Hypothesis: ${hypothesis || '[describe what you want to change or test]'}`
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function VariantPill({ label }) {
  const colors = {
    a: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    b: 'bg-amber-50  text-amber-600  dark:bg-amber-900/30  dark:text-amber-400',
    c: 'bg-green-50  text-green-600  dark:bg-green-900/30  dark:text-green-400',
    d: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  }
  return (
    <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${colors[label] || colors.c}`}>
      {label.toUpperCase()}
    </span>
  )
}

function ConvBar({ pct, variant }) {
  const fills = { a: 'bg-indigo-400', b: 'bg-amber-400', c: 'bg-green-400', d: 'bg-purple-400' }
  const w = Math.min(100, Math.round(pct * 10))
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="tabular-nums">{pct.toFixed(1)}%</span>
      <div className="w-12 h-1 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden flex-shrink-0">
        <div className={`h-full rounded-full ${fills[variant] || fills.c}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className={`relative inline-block w-8 h-[18px] ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} disabled={disabled} />
      <div className={`absolute inset-0 rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-white/20'}`} />
      <div className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[14px]' : ''}`} />
    </label>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      className={`text-[10px] px-2 py-1 rounded border transition ${
        copied
          ? 'border-green-500 text-green-400 bg-green-900/20'
          : 'border-slate-600 text-slate-400 bg-slate-700/50 hover:bg-slate-700 hover:text-slate-200'
      }`}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ─── AB Step Row ─────────────────────────────────────────────────────────────

function ABStepRow({ stepOrder, variants, funnel, onToggle, onAddChallenger, onEditStep, onResetStats }) {
  const winner    = getWinner(variants)
  const declWinner = variants.find(v => v.is_active && !isArchived(v) && liveVariants(variants).length < 2)
  const pending   = variants.find(isPending)
  const archived  = variants.filter(isArchived)
  const showAddChallenger = !pending && (liveVariants(variants).length <= 1 || !!declWinner)
  const { base: defaultBase } = getFunnelComponent(funnel)
  const componentName = pending?.config?.componentName || `${defaultBase}V2`

  // Check if challenger component file exists
  const [draftReady, setDraftReady] = useState(false)
  useEffect(() => {
    if (!pending) { setDraftReady(false); return }
    let cancelled = false
    async function check() {
      try {
        const res = await fetch(`/api/component-check?name=${encodeURIComponent(componentName)}`)
        const data = await res.json()
        if (!cancelled) setDraftReady(data.exists)
      } catch {}
    }
    check()
    const interval = setInterval(check, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [pending?.id, componentName])

  const prompt = pending ? buildPrompt({
    winner: declWinner || variants.find(v => v.is_active) || variants[0],
    loser:  archived[archived.length - 1] || null,
    componentName,
    hypothesis: pending.config?.hypothesis || '',
    funnel,
  }) : null

  return (
    <div className="px-5 py-4">
      {/* Step header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
          {stepOrder}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{funnel.name || 'Survey'}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400">survey</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 tracking-wide">A/B test</span>
        </div>
      </div>

      {/* Variant table */}
      <div className="border border-gray-100 dark:border-white/5 rounded-lg overflow-hidden ml-10">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-white/[0.02]">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-wider text-gray-400 w-36">Variant</th>
              <th className="text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-wider text-gray-400">URL</th>
              <th className="text-right px-3 py-2 font-semibold text-[10px] uppercase tracking-wider text-gray-400">Visitors</th>
              <th className="text-right px-3 py-2 font-semibold text-[10px] uppercase tracking-wider text-gray-400">Leads</th>
              <th className="text-right px-3 py-2 font-semibold text-[10px] uppercase tracking-wider text-gray-400 w-36">Conv. Rate</th>
              <th className="text-right px-3 py-2 font-semibold text-[10px] uppercase tracking-wider text-gray-400 w-24">Traffic</th>
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
            {variants.map(v => {
              const isWinner   = winner?.id === v.id
              const isDeclWin  = v.is_active && !isArchived(v) && liveVariants(variants).length < 2
              const arch       = isArchived(v)
              const pend       = isPending(v)
              const paused     = isPaused(v)
              const dim        = arch
              const live       = liveVariants(variants)
              const isOnlyLive = live.length === 1 && live[0].id === v.id
              const delta      = getDelta(v, variants)
              const pct        = convRate(v) * 100

              return (
                <tr
                  key={v.id}
                  className={
                    arch ? 'opacity-50 bg-gray-50 dark:bg-white/[0.01]' :
                    pend ? 'bg-amber-50/40 dark:bg-amber-900/5' :
                    paused ? 'opacity-70' :
                    (isWinner || isDeclWin) ? 'bg-green-50/60 dark:bg-green-900/10' : ''
                  }
                >
                  {/* Variant cell */}
                  <td className={`px-3 py-3 ${(isWinner || isDeclWin) ? 'border-l-2 border-green-500' : arch ? 'border-l-2 border-gray-300 dark:border-white/10' : pend ? 'border-l-2 border-amber-400' : ''}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <VariantPill label={v.variant || 'a'} />
                      {isWinner && delta !== null && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          ▲ +{(delta * 100).toFixed(1)}%
                        </span>
                      )}
                      {arch && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400">Archived</span>}
                      {pend && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">Pending</span>}
                      {paused && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400">Paused</span>}
                    </div>
                  </td>

                  {/* URL — variant-specific: slug-1, slug-2, etc. */}
                  <td className="px-3 py-3">
                    {(() => {
                      const varNum = (v.variant || 'a').charCodeAt(0) - 96 // a=1, b=2, c=3...
                      const varSlug = `${funnel.slug}-${varNum}`
                      const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost'
                      const href = isLocal
                        ? `/f/${varSlug}`
                        : funnel.custom_domain
                          ? `https://${funnel.custom_domain}/f/${varSlug}`
                          : `/f/${varSlug}`
                      const display = funnel.custom_domain && !isLocal
                        ? `${funnel.custom_domain}/f/${varSlug}`
                        : `/f/${varSlug}`
                      return (
                        <a
                          href={href}
                          target="_blank" rel="noreferrer"
                          className={`text-[11px] hover:underline truncate ${arch ? 'text-gray-300 dark:text-white/20 pointer-events-none' : 'text-blue-500'}`}
                        >
                          {display}
                        </a>
                      )
                    })()}
                  </td>

                  {/* Stats */}
                  <td className={`px-3 py-3 text-right tabular-nums ${dim ? 'text-gray-300 dark:text-white/20' : 'text-gray-700 dark:text-gray-300'}`}>{v.visitors ?? 0}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${dim ? 'text-gray-300 dark:text-white/20' : 'text-gray-700 dark:text-gray-300'}`}>{v.leads ?? 0}</td>
                  <td className={`px-3 py-3 text-right ${dim ? 'text-gray-300 dark:text-white/20' : 'text-gray-700 dark:text-gray-300'}`}>
                    <ConvBar pct={pct} variant={v.variant || 'a'} />
                  </td>

                  {/* Traffic toggle */}
                  <td className="px-3 py-3 text-right">
                    {pend ? (
                      <span className="text-[11px] text-amber-500">Pending</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className={`text-[11px] font-medium ${v.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                          {v.is_active ? 'On' : 'Off'}
                        </span>
                        <Toggle
                          checked={!!v.is_active}
                          disabled={isOnlyLive}
                          onChange={() => onToggle(v, !v.is_active)}
                        />
                        {isOnlyLive && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Champ</span>
                        )}
                        {paused && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400">Challenger</span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-3 py-3 text-right">
                    {pend ? (
                      <PendingActions step={v} variants={variants} funnel={funnel} onGoLive={() => onToggle(v, true)} />
                    ) : !arch && (v.visitors > 0 || v.leads > 0) ? (
                      <button
                        onClick={() => onResetStats(v)}
                        className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 dark:border-white/10 text-gray-400 hover:text-red-500 hover:border-red-300 dark:hover:border-red-500/30 transition"
                        title="Reset visitors & leads to 0"
                      >
                        Reset
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Prompt / Next Steps */}
        {pending && !draftReady && prompt && (
          <div className="bg-slate-900 px-4 py-3 border-t border-slate-800" style={{gridColumn: '1 / -1'}}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cursor prompt — paste this to build the challenger</span>
              <CopyButton text={prompt} />
            </div>
            <pre className="text-[11.5px] text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">{prompt}</pre>
          </div>
        )}
        {pending && !draftReady && (
          <div className="bg-amber-50/60 dark:bg-amber-900/5 border-t border-amber-100 dark:border-amber-900/20 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-500 mb-1">Waiting for build</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Paste the prompt above in your terminal to build <strong>{componentName}.js</strong>. This page will detect it automatically.
            </p>
          </div>
        )}
        {pending && draftReady && (
          <div className="bg-emerald-50/60 dark:bg-emerald-900/5 border-t border-emerald-100 dark:border-emerald-900/20 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 7.2L6 10L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Draft Ready
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{componentName}.js detected</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Next steps:</p>
            <ul className="text-xs text-gray-500 dark:text-gray-400 list-disc ml-4 mb-3 space-y-0.5">
              <li>Preview the challenger at the variant URL above</li>
              <li>Iterate on changes in your terminal until you're happy with it</li>
              <li>Click <strong>Go Live</strong> when you're ready to start the split test</li>
            </ul>
            <button
              onClick={() => onToggle(pending, true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition"
            >
              Go Live
            </button>
          </div>
        )}
      </div>

      {/* Traffic note + Add Challenger */}
      <div className="flex items-center justify-between mt-2 ml-10">
        <TrafficNote variants={variants} />
        {showAddChallenger && !pending && (
          <button
            onClick={() => onAddChallenger(stepOrder)}
            className="text-[11px] px-3 py-1.5 border border-dashed border-amber-400 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/10 transition font-medium"
          >
            ＋ Add Challenger
          </button>
        )}
      </div>
    </div>
  )
}

function PendingActions({ step, variants, onGoLive }) {
  const [c1, setC1] = useState(false)
  const [c2, setC2] = useState(false)
  return (
    <button
      onClick={onGoLive}
      disabled={!(c1 && c2)}
      className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed dark:disabled:bg-white/10 dark:disabled:text-white/30"
    >
      Go Live
    </button>
  )
}


function TrafficNote({ variants }) {
  const live = liveVariants(variants)
  if (live.length === 0) return null
  if (live.length === 1) {
    const w = variants.find(v => v.is_active && !isArchived(v))
    const archived = variants.filter(isArchived)
    return (
      <p className="text-[11px] text-gray-400">
        100% of traffic → <strong className="text-gray-600 dark:text-gray-300">Variant {(w?.variant || 'b').toUpperCase()}</strong>
        {archived.length > 0 && ' · Previous variant archived'}
      </p>
    )
  }
  return <p className="text-[11px] text-gray-400">Traffic split: <strong className="text-gray-600 dark:text-gray-300">50 / 50</strong></p>
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-[#171B33] rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function AddChallengerModal({ funnel, onConfirm, onClose }) {
  const mapped = FUNNEL_COMPONENTS[funnel?.slug]
  const defaultName = (mapped?.base || 'SynergyGenerator') + 'V3'
  const [name, setName] = useState(defaultName)
  const [hypothesis, setHypothesis] = useState('')

  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xl mb-4">⚡</div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Add New Challenger</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
          Register a challenger to test against the current winner. A Cursor prompt will be generated for you to build it.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Component Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={`e.g. ${defaultName}`}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <p className="text-[11px] text-gray-400 mt-1">Must match the React component filename you'll build in Cursor.</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">What are you testing next?</label>
            <textarea
              value={hypothesis}
              onChange={e => setHypothesis(e.target.value)}
              placeholder="e.g. Replace survey with a single lead capture form, keep zip validation..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">This becomes the hypothesis in your Cursor build prompt.</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 dark:bg-white/[0.02] flex justify-end gap-2 rounded-b-2xl">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition">Cancel</button>
        <button
          onClick={() => onConfirm({ name: name.trim(), hypothesis: hypothesis.trim() })}
          disabled={!name.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition"
        >
          Register Challenger
        </button>
      </div>
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FunnelDetailPage() {
  const { clientId, id } = useParams()
  const [funnel, setFunnel]   = useState(null)
  const [steps, setSteps]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [tab, setTab]         = useState('steps')

  const [domain, setDomain]           = useState('')
  const [domains, setDomains]         = useState([])
  const [savingDomain, setSavingDomain] = useState(false)
  const [domainSaved, setDomainSaved] = useState(false)
  const [addingDomain, setAddingDomain] = useState(false)
  const [newDomain, setNewDomain]     = useState('')

  const [headCode, setHeadCode]       = useState('')
  const [savingHead, setSavingHead]   = useState(false)
  const [headSaved, setHeadSaved]     = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft]     = useState('')
  const [savingName, setSavingName]   = useState(false)

  const [challengerModal, setChallengerModal] = useState(null) // { stepOrder }

  async function load() {
    const supabase = createClient()
    const [{ data: f }, { data: st }] = await Promise.all([
      supabase.from('client_funnels').select('*').eq('id', id).single(),
      supabase.from('client_funnel_steps').select('*').eq('funnel_id', id).order('step_order'),
    ])
    setFunnel(f)
    setDomain(f?.custom_domain || '')
    setHeadCode(f?.tracking?.headCode || '')
    setSteps(st || [])
    setLoading(false)
  }

  async function loadDomains() {
    const res = await fetch(`/api/client-domains?clientId=${clientId}`)
    const data = await res.json()
    setDomains(data.domains || [])
  }

  useEffect(() => { if (id) load() }, [id])
  useEffect(() => { if (clientId) loadDomains() }, [clientId])

  // Group steps by step_order
  const stepsByOrder = useMemo(() => {
    const map = {}
    for (const s of steps) {
      if (!map[s.step_order]) map[s.step_order] = []
      map[s.step_order].push(s)
    }
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([order, variants]) => ({ order: Number(order), variants }))
  }, [steps])

  function isABGroup(variants) {
    return variants.length > 1 || variants.some(v => v.variant != null)
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleToggle(step, newValue) {
    // If turning ON an archived variant, clear the archivedAt flag
    const wasArchived = !!step.config?.archivedAt
    const newConfig = wasArchived && newValue
      ? (() => { const c = { ...step.config }; delete c.archivedAt; return c })()
      : undefined

    setSteps(prev => prev.map(s => s.id === step.id
      ? { ...s, is_active: newValue, config: newConfig || s.config }
      : s
    ))

    const body = { is_active: newValue }
    if (newConfig) body.config = newConfig

    await fetch(`/api/funnel-steps/${step.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async function handleResetStats(step) {
    setSteps(prev => prev.map(s => s.id === step.id ? { ...s, visitors: 0, leads: 0 } : s))
    await fetch(`/api/funnel-steps/${step.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitors: 0, leads: 0 }),
    })
  }

  async function handleAddChallenger({ name, hypothesis }) {
    const { stepOrder } = challengerModal
    setChallengerModal(null)
    const variantLabel = nextVariantLabel(steps.filter(s => s.step_order === stepOrder))
    try {
      const res = await fetch('/api/funnel-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnel_id:  id,
          step_order: stepOrder,
          step_type:  'survey',
          variant:    variantLabel,
          is_active:  false,
          config: { componentName: name, hypothesis },
        }),
      })
      const data = await res.json()
      console.log('[handleAddChallenger] response:', res.status, data)
      if (data.success && data.step) {
        setSteps(prev => [...prev, data.step])
      } else {
        alert('Failed to register challenger: ' + (data.error || 'Unknown error'))
      }
    } catch (err) {
      console.error('[handleAddChallenger] fetch error:', err)
      alert('Network error registering challenger: ' + err.message)
    }
  }

  async function saveStep(stepId, config) {
    const res = await fetch(`/api/funnel-steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })
    if (res.ok) { setEditing(null); load() }
  }

  async function saveDomain(overrideDomain) {
    const val = (overrideDomain !== undefined ? overrideDomain : domain) || null
    setSavingDomain(true)
    try {
      const res = await fetch(`/api/funnels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_domain: val }),
      })
      if (res.ok) {
        setFunnel(f => ({ ...f, custom_domain: val }))
        setDomainSaved(true)
        setTimeout(() => setDomainSaved(false), 2000)
      }
    } finally { setSavingDomain(false) }
  }

  async function registerDomain() {
    if (!newDomain.trim()) return
    const cleaned = newDomain.toLowerCase().trim()
    await fetch('/api/client-domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, domain: cleaned }),
    })
    setNewDomain('')
    setAddingDomain(false)
    await loadDomains()
    setDomain(cleaned)
    await saveDomain(cleaned)
  }

  async function saveHeadCode() {
    setSavingHead(true)
    try {
      const merged = { ...(funnel.tracking || {}), headCode: headCode || null }
      const res = await fetch(`/api/funnels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking: merged }),
      })
      if (res.ok) {
        setFunnel(f => ({ ...f, tracking: merged }))
        setHeadSaved(true)
        setTimeout(() => setHeadSaved(false), 2000)
      }
    } finally { setSavingHead(false) }
  }

  async function saveName() {
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === funnel.name) { setEditingName(false); return }
    setSavingName(true)
    try {
      const res = await fetch(`/api/funnels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) setFunnel(f => ({ ...f, name: trimmed }))
    } finally { setSavingName(false); setEditingName(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>
  if (!funnel) return <div className="p-8 text-sm text-gray-400">Funnel not found.</div>

  const liveUrl = funnel.custom_domain && funnel.slug
    ? `https://${funnel.custom_domain}/f/${funnel.slug}`
    : `/f/${funnel.slug}`

  return (
    <div className="p-8 max-w-6xl">
      <Link href={`/control/${clientId}/funnels`} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
        ← All funnels
      </Link>

      <div className="mt-3 mb-6">
        {editingName ? (
          <input
            type="text" value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveName() } if (e.key === 'Escape') setEditingName(false) }}
            disabled={savingName} autoFocus
            className="text-lg font-semibold text-gray-900 dark:text-white bg-transparent border-b border-blue-500 focus:outline-none w-full max-w-lg"
          />
        ) : (
          <h2
            onClick={() => { setNameDraft(funnel.name || ''); setEditingName(true) }}
            className="text-lg font-semibold text-gray-900 dark:text-white cursor-text hover:bg-gray-50 dark:hover:bg-white/5 rounded px-1 -mx-1 inline-block"
            title="Click to rename"
          >
            {funnel.name}
          </h2>
        )}
        <div>
          <a href={liveUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">{liveUrl}</a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-white/10 mb-6">
        {[{ id: 'steps', label: 'Steps' }, { id: 'settings', label: 'Settings' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
              tab === t.id ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'steps' && (
        <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Funnel Steps</h3>
            <span className="text-xs text-gray-400">{stepsByOrder.length} step{stepsByOrder.length === 1 ? '' : 's'}</span>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-white/5">
            {stepsByOrder.map(({ order, variants }) => {
              if (isABGroup(variants)) {
                return (
                  <ABStepRow
                    key={order}
                    stepOrder={order}
                    variants={variants}
                    funnel={funnel}
                    onToggle={handleToggle}
                    onResetStats={handleResetStats}
                    onAddChallenger={(stepOrder) => setChallengerModal({ stepOrder })}
                    onEditStep={setEditing}
                  />
                )
              }
              // Simple step (no A/B)
              const step = variants[0]
              const path = step.slug ? `/f/${funnel.slug}/${step.slug}` : `/f/${funnel.slug}`
              const url  = funnel.custom_domain ? `https://${funnel.custom_domain}${path}` : path
              return (
                <div key={order} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300">{order}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{step.name || step.step_type}</p>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400">{step.step_type}</span>
                    </div>
                    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline mt-0.5 inline-block truncate">{url} ↗</a>
                  </div>
                  <button onClick={() => setEditing(step)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition">Edit</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          {/* Custom Domain */}
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 px-5 py-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Custom Domain</h3>
              <button onClick={() => setAddingDomain(v => !v)} className="text-xs text-blue-500 hover:text-blue-600 transition">+ Register domain</button>
            </div>
            <p className="text-xs text-gray-400 mb-3">Select the client's domain to point to this funnel.</p>
            {addingDomain && (
              <div className="flex gap-2 mb-3">
                <input type="text" value={newDomain} onChange={e => setNewDomain(e.target.value.toLowerCase().trim())} placeholder="synergyhome.co"
                  className="flex-1 text-sm px-3 py-2 border border-blue-400 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={e => { if (e.key === 'Enter') registerDomain() }} autoFocus />
                <button onClick={registerDomain} className="px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">Add</button>
                <button onClick={() => setAddingDomain(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition">Cancel</button>
              </div>
            )}
            <div className="flex gap-2">
              <select value={domain} onChange={e => setDomain(e.target.value)}
                className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— No custom domain —</option>
                {domains.map(d => <option key={d.id} value={d.domain}>{d.domain}</option>)}
              </select>
              <button onClick={() => saveDomain()} disabled={savingDomain}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition">
                {domainSaved ? '✓ Saved' : savingDomain ? 'Saving…' : 'Save'}
              </button>
            </div>
            {domain && <p className="text-xs text-gray-400 mt-2">Live at: <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{domain}</a></p>}
          </div>

          {/* Head Tracking Code */}
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Head Tracking Code</h3>
            <p className="text-xs text-gray-400 mb-3">Pasted on every page of the funnel. Use for Google Tag, Meta Pixel, etc.</p>
            <textarea value={headCode} onChange={e => setHeadCode(e.target.value)} spellCheck={false}
              placeholder={`<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=AW-XXXXXXX"></script>`}
              className="w-full h-48 text-xs font-mono px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
            <div className="flex justify-end mt-3">
              <button onClick={saveHeadCode} disabled={savingHead}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition">
                {headSaved ? '✓ Saved' : savingHead ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {challengerModal && (
        <AddChallengerModal
          funnel={funnel}
          onConfirm={handleAddChallenger}
          onClose={() => setChallengerModal(null)}
        />
      )}

      {editing && (
        <StepEditorDrawer step={editing} onClose={() => setEditing(null)} onSave={(cfg) => saveStep(editing.id, cfg)} />
      )}
    </div>
  )
}
