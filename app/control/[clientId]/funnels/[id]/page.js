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
  const [domain, setDomain] = useState('')
  const [savingDomain, setSavingDomain] = useState(false)
  const [domainSaved, setDomainSaved] = useState(false)

  async function load() {
    const supabase = createClient()
    const [{ data: f }, { data: st }] = await Promise.all([
      supabase.from('client_funnels').select('*').eq('id', id).single(),
      supabase.from('client_funnel_steps').select('*').eq('funnel_id', id).order('step_order'),
    ])
    setFunnel(f)
    setDomain(f?.custom_domain || '')
    setSteps(st || [])
    setLoading(false)
  }

  useEffect(() => { if (id) load() }, [id])

  async function saveDomain() {
    setSavingDomain(true)
    const supabase = createClient()
    await supabase.from('client_funnels').update({ custom_domain: domain || null }).eq('id', id)
    setSavingDomain(false)
    setDomainSaved(true)
    setTimeout(() => setDomainSaved(false), 2000)
    setFunnel(f => ({ ...f, custom_domain: domain || null }))
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

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>
  if (!funnel) return <div className="p-8 text-sm text-gray-400">Funnel not found.</div>

  const liveUrl = funnel.custom_domain
    ? `https://${funnel.custom_domain}`
    : `/f/${funnel.slug}`

  return (
    <div className="p-8 max-w-4xl">
      <Link href={`/control/${clientId}/funnels`} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
        ← All funnels
      </Link>

      <div className="mt-3 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{funnel.name}</h2>
        <a href={liveUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
          {liveUrl}
        </a>
      </div>

      {/* Custom Domain */}
      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 px-5 py-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Custom Domain</h3>
        <p className="text-xs text-gray-400 mb-3">Point the client's domain to this funnel. Add it to Vercel first, then enter it here.</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={domain}
            onChange={e => setDomain(e.target.value.toLowerCase().trim())}
            placeholder="synergyhome.co"
            className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={saveDomain}
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

      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Funnel Steps</h3>
          <span className="text-xs text-gray-400">{steps.length} step{steps.length === 1 ? '' : 's'}</span>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {steps.map(step => (
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
                  href={step.slug ? `/f/${funnel.slug}/${step.slug}` : `/f/${funnel.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-500 hover:underline mt-0.5 inline-block truncate"
                >
                  {step.slug ? `/f/${funnel.slug}/${step.slug}` : `/f/${funnel.slug}`} ↗
                </a>
              </div>
              <button
                onClick={() => setEditing(step)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </div>

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
