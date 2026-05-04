'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../../lib/supabase-browser'
import StepEditorDrawer from '../../../../../components/StepEditorDrawer'

export default function FunnelDetailPage() {
  const { clientId, id } = useParams()
  const [funnel, setFunnel] = useState(null)
  const [steps, setSteps] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [tab, setTab] = useState('steps')
  const [addingVariant, setAddingVariant] = useState(null)

  const [domain, setDomain] = useState('')
  const [domains, setDomains] = useState([])
  const [savingDomain, setSavingDomain] = useState(false)
  const [domainSaved, setDomainSaved] = useState(false)
  const [addingDomain, setAddingDomain] = useState(false)
  const [newDomain, setNewDomain] = useState('')

  const [headCode, setHeadCode] = useState('')
  const [savingHead, setSavingHead] = useState(false)
  const [headSaved, setHeadSaved] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

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
    } catch (e) {
      console.error('saveDomain failed:', e)
    } finally {
      setSavingDomain(false)
    }
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
    } catch (e) {
      console.error('saveHeadCode failed:', e)
    } finally {
      setSavingHead(false)
    }
  }

  async function saveName() {
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === funnel.name) {
      setEditingName(false)
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`/api/funnels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        setFunnel(f => ({ ...f, name: trimmed }))
      }
    } catch (e) {
      console.error('saveName failed:', e)
    } finally {
      setSavingName(false)
      setEditingName(false)
    }
  }

  async function saveStep(stepId, config) {
    const res = await fetch(`/api/funnel-steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })
    if (res.ok) {
      setEditing(null)
      load()
    }
  }

  async function addVariant(stepId) {
    setAddingVariant(stepId)
    const res = await fetch(`/api/funnel-steps/${stepId}/add-variant`, { method: 'POST' })
    if (res.ok) await load()
    setAddingVariant(null)
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>
  if (!funnel) return <div className="p-8 text-sm text-gray-400">Funnel not found.</div>

  const liveUrl = funnel.custom_domain && funnel.slug
    ? `https://${funnel.custom_domain}/f/${funnel.slug}`
    : `/f/${funnel.slug}`

  return (
    <div className="p-8 max-w-4xl">
      <Link href={`/control/${clientId}/funnels`} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
        ← All funnels
      </Link>

      <div className="mt-3 mb-6">
        {editingName ? (
          <input
            type="text"
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); saveName() }
              if (e.key === 'Escape') { setEditingName(false) }
            }}
            disabled={savingName}
            autoFocus
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
          <a href={liveUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
            {liveUrl}
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-white/10 mb-6">
        {[
          { id: 'steps', label: 'Steps' },
          { id: 'settings', label: 'Settings' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
              tab === t.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
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
            <span className="text-xs text-gray-400">{steps.length} step{steps.length === 1 ? '' : 's'}</span>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-white/5">
            {(() => {
              // Group steps: collect unique step_orders, then handle variant sub-rows
              const orders = [...new Set(steps.map(s => s.step_order))]
              return orders.map(order => {
                const group = steps.filter(s => s.step_order === order)
                const hasVariants = group.some(s => s.variant !== null)
                const representative = group[0]
                const path = representative.slug ? `/f/${funnel.slug}/${representative.slug}` : `/f/${funnel.slug}`
                const url = funnel.custom_domain ? `https://${funnel.custom_domain}${path}` : path

                return (
                  <div key={order}>
                    {/* Step header row */}
                    <div className="px-5 py-4 flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                        {order}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {hasVariants ? (group.find(s => s.variant === 'a')?.name?.replace(' — Variant A', '') || representative.name || representative.step_type) : (representative.name || representative.step_type)}
                          </p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400">
                            {representative.step_type}
                          </span>
                          {hasVariants && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                              A/B test
                            </span>
                          )}
                        </div>
                        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline mt-0.5 inline-block truncate">
                          {url} ↗
                        </a>
                      </div>
                      {!hasVariants && representative.step_type === 'survey' && (
                        <button
                          onClick={() => addVariant(representative.id)}
                          disabled={addingVariant === representative.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition disabled:opacity-50"
                        >
                          {addingVariant === representative.id ? 'Adding…' : '+ Add B variant'}
                        </button>
                      )}
                      {!hasVariants && (
                        <button
                          onClick={() => setEditing(representative)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition"
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    {/* Variant sub-rows */}
                    {hasVariants && group.map(variantStep => {
                      const convRate = variantStep.visitors > 0 ? (variantStep.leads / variantStep.visitors * 100).toFixed(1) : null
                      return (
                        <div key={variantStep.id} className="px-5 py-3 flex items-center gap-4 bg-gray-50/50 dark:bg-white/[0.015] border-t border-gray-100 dark:border-white/5">
                          <div className="w-8 flex-shrink-0 flex justify-center">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              variantStep.variant === 'a'
                                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                                : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                            }`}>
                              {variantStep.variant?.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{variantStep.name || `Variant ${variantStep.variant?.toUpperCase()}`}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {variantStep.visitors.toLocaleString()} visitor{variantStep.visitors !== 1 ? 's' : ''} · {variantStep.leads.toLocaleString()} lead{variantStep.leads !== 1 ? 's' : ''}
                              {convRate !== null && <span className="ml-1">· {convRate}% conv.</span>}
                            </p>
                          </div>
                          <button
                            onClick={() => setEditing(variantStep)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition"
                          >
                            Edit
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          {/* Custom Domain */}
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 px-5 py-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Custom Domain</h3>
              <button
                onClick={() => setAddingDomain(v => !v)}
                className="text-xs text-blue-500 hover:text-blue-600 transition"
              >
                + Register domain
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">Select the client's domain to point to this funnel.</p>

            {addingDomain && (
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newDomain}
                  onChange={e => setNewDomain(e.target.value.toLowerCase().trim())}
                  placeholder="synergyhome.co"
                  className="flex-1 text-sm px-3 py-2 border border-blue-400 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={e => { if (e.key === 'Enter') registerDomain() }}
                  autoFocus
                />
                <button onClick={registerDomain} className="px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">Add</button>
                <button onClick={() => setAddingDomain(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition">Cancel</button>
              </div>
            )}

            <div className="flex gap-2">
              <select
                value={domain}
                onChange={e => setDomain(e.target.value)}
                className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— No custom domain —</option>
                {domains.map(d => (
                  <option key={d.id} value={d.domain}>{d.domain}</option>
                ))}
              </select>
              <button
                onClick={() => saveDomain()}
                disabled={savingDomain}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition"
              >
                {domainSaved ? '✓ Saved' : savingDomain ? 'Saving…' : 'Save'}
              </button>
            </div>
            {domain && (
              <p className="text-xs text-gray-400 mt-2">
                Live at: <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{domain}</a>
              </p>
            )}
          </div>

          {/* Head Tracking Code */}
          <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Head Tracking Code</h3>
            <p className="text-xs text-gray-400 mb-3">
              Pasted on every page of the funnel. Use for Google Tag (gtag.js), Meta Pixel, etc.
            </p>
            <textarea
              value={headCode}
              onChange={e => setHeadCode(e.target.value)}
              spellCheck={false}
              placeholder={`<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=AW-XXXXXXX"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', 'AW-XXXXXXX');\n</script>`}
              className="w-full h-64 text-xs font-mono px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={saveHeadCode}
                disabled={savingHead}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition"
              >
                {headSaved ? '✓ Saved' : savingHead ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <StepEditorDrawer
          step={editing}
          onClose={() => setEditing(null)}
          onSave={(cfg) => saveStep(editing.id, cfg)}
        />
      )}
    </div>
  )
}
