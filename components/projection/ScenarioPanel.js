'use client'

import InfoTip from './InfoTip'

const inputCls = 'border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 dark:bg-[#161b30] dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500'

const clampPct = (v) => Math.max(-100, Math.min(300, Math.round(Number(v) || 0)))

// What-if levers: per-platform budget pushes + dated event multipliers.
// Pure controlled UI — all math lives in forecast.js applyScenario().
export default function ScenarioPanel({ scenario, setScenario, platforms }) {
  const setBudget = (key, patch) => setScenario(s => ({ ...s, budget: { ...s.budget, [key]: { ...s.budget[key], ...patch } } }))
  const setEvent = (i, patch) => setScenario(s => ({ ...s, events: s.events.map((e, j) => j === i ? { ...e, ...patch } : e) }))
  const removeEvent = (i) => setScenario(s => ({ ...s, events: s.events.filter((_, j) => j !== i) }))
  const addEvent = (e) => setScenario(s => ({ ...s, events: [...s.events, e] }))

  const year = new Date().getFullYear()
  const addBlank = () => addEvent({ label: 'Promo', start: '', end: '', revMult: 1.3, spendMult: 1 })
  const addBfcm = () => addEvent({ label: 'BFCM', start: `${year}-11-24`, end: `${year}-12-01`, revMult: 2.5, spendMult: 1.5 })

  return (
    <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-8">

      {/* Budget levers */}
      <div>
        <p className={`${labelCls} mb-3`}>
          Ad Budget Push
          <InfoTip text="Scales each platform's projected daily spend from the chosen date onward. Spend scales exactly with the slider, but paid revenue responds with diminishing returns (set below) — doubling spend never doubles sales. Organic revenue is not affected by budget." />
        </p>
        <div className="space-y-3">
          {platforms.map(p => (
            <div key={p.key} className={`flex items-center gap-3 flex-wrap ${p.hasSpend ? '' : 'opacity-40'}`}>
              <span className="w-16 text-sm font-semibold text-gray-700 dark:text-gray-200">{p.label}</span>
              <input
                type="range" min={-100} max={300} step={5}
                value={scenario.budget[p.key]?.pct || 0}
                disabled={!p.hasSpend}
                onChange={e => setBudget(p.key, { pct: clampPct(e.target.value) })}
                className="flex-1 min-w-[120px] accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number" min={-100} max={300} step={5}
                  value={scenario.budget[p.key]?.pct || 0}
                  disabled={!p.hasSpend}
                  onChange={e => setBudget(p.key, { pct: clampPct(e.target.value) })}
                  className={`${inputCls} w-[72px] text-right tabular-nums`}
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
              <span className="text-xs text-gray-400">from</span>
              <input
                type="date"
                value={scenario.budget[p.key]?.from || ''}
                disabled={!p.hasSpend}
                onChange={e => setBudget(p.key, { from: e.target.value })}
                className={`${inputCls} text-xs`}
                title="Leave empty to apply across the whole horizon"
              />
              {!p.hasSpend && <span className="text-[11px] text-gray-400">no spend history</span>}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-5">
          <span className={labelCls}>
            Response Curve
            <InfoTip text="How strongly paid revenue responds to spend changes. 1.0 = doubling spend doubles paid revenue (optimistic — assumes zero saturation). 0.7 (default) = doubling spend lifts paid revenue ~62%. Lower it if the account is already saturated. After your first real budget push we can calibrate this from the actual before/after data." />
          </span>
          <input
            type="number" min={0.1} max={1.2} step={0.05}
            value={scenario.elasticity}
            onChange={e => setScenario(s => ({ ...s, elasticity: Math.max(0.1, Math.min(1.2, Number(e.target.value) || 0.7)) }))}
            className={`${inputCls} w-[72px] text-right tabular-nums`}
          />
        </div>
      </div>

      {/* Event calendar */}
      <div>
        <p className={`${labelCls} mb-3`}>
          Events &amp; Seasonality
          <InfoTip text="Date-ranged multipliers for things the model can't see in history — promos, launches, Black Friday. Sales × scales ALL revenue (paid + organic) on those days; Spend × scales ad spend. Multipliers stack if events overlap." />
        </p>
        {scenario.events.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No events yet — add a promo window or the Black Friday preset.</p>
        ) : (
          <div className="space-y-2 mb-3">
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_64px_64px_24px] gap-2 px-0.5">
              <span className="text-[10px] uppercase text-gray-400">Label</span>
              <span className="text-[10px] uppercase text-gray-400">Start</span>
              <span className="text-[10px] uppercase text-gray-400">End</span>
              <span className="text-[10px] uppercase text-gray-400 text-right">Sales ×<InfoTip text="Revenue multiplier on these days. 2.5 = expect 2.5× normal daily sales (a typical BFCM lift). Applies to paid and organic revenue." /></span>
              <span className="text-[10px] uppercase text-gray-400 text-right">Spend ×<InfoTip text="Ad-spend multiplier on these days, on top of any budget push. 1 = spend unchanged." /></span>
              <span />
            </div>
            {scenario.events.map((e, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_64px_64px_24px] gap-2 items-center">
                <input type="text" value={e.label || ''} onChange={ev => setEvent(i, { label: ev.target.value })} placeholder="Label" className={`${inputCls} text-xs`} />
                <input type="date" value={e.start || ''} onChange={ev => setEvent(i, { start: ev.target.value })} className={`${inputCls} text-xs`} />
                <input type="date" value={e.end || ''} onChange={ev => setEvent(i, { end: ev.target.value })} className={`${inputCls} text-xs`} />
                <input type="number" min={0} step={0.1} value={e.revMult} onChange={ev => setEvent(i, { revMult: ev.target.value })} className={`${inputCls} text-xs text-right tabular-nums`} />
                <input type="number" min={0} step={0.1} value={e.spendMult} onChange={ev => setEvent(i, { spendMult: ev.target.value })} className={`${inputCls} text-xs text-right tabular-nums`} />
                <button onClick={() => removeEvent(i)} title="Remove event" className="text-gray-400 hover:text-rose-500 text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={addBlank} className="text-xs font-semibold text-blue-600 dark:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg px-3 py-1.5 transition">+ Add event</button>
          <button onClick={addBfcm} className="text-xs font-semibold text-[#846CC5] bg-[#846CC5]/10 hover:bg-[#846CC5]/20 border border-[#846CC5]/20 rounded-lg px-3 py-1.5 transition">
            + Black Friday preset
            <InfoTip text={`Adds Nov 24 – Dec 1, ${year} with Sales ×2.5 and Spend ×1.5 — a typical BFCM week. Tune the multipliers to your own promo plan. (Tip: switch the horizon to “Through Dec 31” so the chart reaches it.)`} />
          </button>
        </div>
      </div>
    </div>
  )
}
