'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function AgencyFunnelDetailPage() {
  const { id } = useParams()
  const [funnel, setFunnel] = useState(null)
  const [steps, setSteps] = useState([])
  const [loading, setLoading] = useState(true)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/agency-funnels/${id}`)
      const json = await res.json()
      setFunnel(json.funnel || null)
      setSteps(json.steps || [])
      setLoading(false)
    }
    if (id) load()
  }, [id])

  async function saveName() {
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === funnel.name) {
      setEditingName(false)
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`/api/agency-funnels/${id}`, {
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

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>
  if (!funnel) return <div className="p-8 text-sm text-gray-400">Funnel not found.</div>

  const liveUrl = `/p/${funnel.slug}`

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/control/funnels" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
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

      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Funnel Steps</h3>
          <span className="text-xs text-gray-400">{steps.length} step{steps.length === 1 ? '' : 's'}</span>
        </div>

        {steps.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-gray-400">No steps yet.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-white/5">
            {steps.map(step => {
              const path = step.slug ? `/p/${funnel.slug}/${step.slug}` : `/p/${funnel.slug}`
              return (
                <div key={step.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300">
                    {step.step_order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{step.name || step.step_type}</p>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400">
                        {step.step_type}
                      </span>
                    </div>
                    <a
                      href={path}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-500 hover:underline mt-0.5 inline-block truncate"
                    >
                      {path} ↗
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
