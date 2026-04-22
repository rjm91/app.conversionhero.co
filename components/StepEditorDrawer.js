'use client'

import { useState } from 'react'

export default function StepEditorDrawer({ step, onClose, onSave }) {
  const [config, setConfig] = useState(step.config || {})
  const [saving, setSaving] = useState(false)

  function update(path, value) {
    setConfig(prev => {
      const next = structuredClone(prev)
      let obj = next
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {}
        obj = obj[path[i]]
      }
      obj[path[path.length - 1]] = value
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    await onSave(config)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#171B33] w-full max-w-lg h-full overflow-y-auto shadow-2xl border-l border-gray-200 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-[#171B33] border-b border-gray-100 dark:border-white/5 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Edit {step.step_type}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Step {step.step_order}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {step.step_type === 'survey' && <SurveyEditor config={config} update={update} />}
          {step.step_type === 'thank_you' && <ThankYouEditor config={config} update={update} />}
        </div>

        <div className="sticky bottom-0 bg-gray-50 dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5 px-6 py-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

const inputCls = "w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"

function ThankYouEditor({ config, update }) {
  return (
    <>
      <Field label="Title">
        <input className={inputCls} value={config.title || ''} onChange={e => update(['title'], e.target.value)} />
      </Field>
      <Field label="Message" hint="Supports line breaks.">
        <textarea className={inputCls} rows={4} value={config.message || ''} onChange={e => update(['message'], e.target.value)} />
      </Field>
      <Field label="CTA button label (optional)">
        <input className={inputCls} value={config.cta?.label || ''} onChange={e => update(['cta', 'label'], e.target.value)} placeholder="e.g. Book a call" />
      </Field>
      <Field label="CTA button URL (optional)" hint="Use tel:+15555551234 for click-to-call.">
        <input className={inputCls} value={config.cta?.href || ''} onChange={e => update(['cta', 'href'], e.target.value)} placeholder="https://…" />
      </Field>
      <Field
        label="Conversion Pixel Code (optional)"
        hint="Fires on thank-you page load. Paste the Google Ads / Meta event snippet."
      >
        <textarea
          className={`${inputCls} font-mono text-xs h-40 resize-y`}
          spellCheck={false}
          value={config.conversionPixel || ''}
          onChange={e => update(['conversionPixel'], e.target.value)}
          placeholder={`<!-- Event snippet for Lead conversion page -->\n<script>\n  gtag('event', 'conversion', {'send_to': 'AW-XXXXXXX/XXXXXX'});\n</script>`}
        />
      </Field>
    </>
  )
}

function SurveyEditor({ config, update }) {
  const steps = config.steps || []
  return (
    <>
      <Field label="Eyebrow headline">
        <input className={inputCls} value={config.headline?.eyebrow || ''} onChange={e => update(['headline', 'eyebrow'], e.target.value)} />
      </Field>
      <Field label="Main headline">
        <input className={inputCls} value={config.headline?.title || ''} onChange={e => update(['headline', 'title'], e.target.value)} />
      </Field>

      <div className="pt-3 border-t border-gray-100 dark:border-white/5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Questions</h4>
        <div className="space-y-4">
          {steps.map((q, i) => (
            <div key={q.id || i} className="bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400">{q.type}</span>
                <span className="text-[11px] text-gray-400">{q.id}</span>
              </div>
              <input
                className={inputCls}
                value={q.question || ''}
                onChange={e => {
                  const next = [...steps]
                  next[i] = { ...q, question: e.target.value }
                  update(['steps'], next)
                }}
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">Full question/option editing coming soon — for now edit copy here; deep edits still happen in Supabase.</p>
      </div>
    </>
  )
}
