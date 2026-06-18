'use client'

import { useState } from 'react'

const fmt$  = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt$0 = n => '$' + Math.round(n || 0).toLocaleString()
const pct   = n => (Math.round((n || 0) * 1000) / 10) + '%'

const DEFAULTS = {
  laborRate: 22,
  MAT: {
    foam:    { name: 'Foam (1" XLPE)',        unit: 'sq ft', cost: 0.85, stock: 1240, reorder: 600 },
    vinyl:   { name: 'Marine Vinyl (18oz)',   unit: 'sq ft', cost: 1.10, stock: 880,  reorder: 500 },
    magnet:  { name: 'Neodymium Disc Magnet', unit: 'each',  cost: 0.18, stock: 8400, reorder: 4000 },
    binding: { name: 'Edge Binding',          unit: 'ft',    cost: 0.25, stock: 520,  reorder: 800 },
    grommet: { name: 'Grommet / Snap',        unit: 'each',  cost: 0.12, stock: 2600, reorder: 1500 },
    thread:  { name: 'UV-Bonded Thread',      unit: 'unit',  cost: 0.30, stock: 9999, reorder: 1000 },
    pack:    { name: 'Box + Insert + Label',  unit: 'each',  cost: 2.40, stock: 430,  reorder: 300 },
  },
  SKUS: [
    { name: 'Polaris Ranger (With Wiper) 2016–2026', price: 129, ship: 9, feePct: 0.03, oh: 3.00, actualCAC: 58, bom: [['foam', 6], ['vinyl', 7], ['magnet', 14], ['binding', 18], ['grommet', 4], ['thread', 1], ['pack', 1]], steps: [['Cut foam', 6], ['Cut vinyl', 7], ['Set magnets', 8], ['Sew & bind', 18], ['QA', 3], ['Pack', 4]] },
    { name: 'Can-Am Defender (With Wiper) 2016–2026', price: 129, ship: 9, feePct: 0.03, oh: 3.00, actualCAC: 71, bom: [['foam', 6], ['vinyl', 7], ['magnet', 14], ['binding', 18], ['grommet', 4], ['thread', 1], ['pack', 1]], steps: [['Cut foam', 6], ['Cut vinyl', 7], ['Set magnets', 8], ['Sew & bind', 18], ['QA', 3], ['Pack', 4]] },
    { name: 'Polaris Xpedition 2024–2026', price: 149, ship: 11, feePct: 0.03, oh: 3.50, actualCAC: 64, bom: [['foam', 8], ['vinyl', 9], ['magnet', 18], ['binding', 22], ['grommet', 6], ['thread', 1], ['pack', 1]], steps: [['Cut foam', 8], ['Cut vinyl', 9], ['Set magnets', 11], ['Sew & bind', 22], ['QA', 4], ['Pack', 4]] },
    { name: 'CF Moto UFORCE U10', price: 139, ship: 10, feePct: 0.03, oh: 3.20, actualCAC: 96, bom: [['foam', 7], ['vinyl', 8], ['magnet', 16], ['binding', 20], ['grommet', 5], ['thread', 1], ['pack', 1]], steps: [['Cut foam', 7], ['Cut vinyl', 8], ['Set magnets', 10], ['Sew & bind', 20], ['QA', 3], ['Pack', 4]] },
    { name: 'Polaris Ranger XD 1500', price: 139, ship: 10, feePct: 0.03, oh: 3.20, actualCAC: 55, bom: [['foam', 7], ['vinyl', 8], ['magnet', 16], ['binding', 20], ['grommet', 5], ['thread', 1], ['pack', 1]], steps: [['Cut foam', 7], ['Cut vinyl', 8], ['Set magnets', 10], ['Sew & bind', 20], ['QA', 3], ['Pack', 4]] },
    { name: 'Forest River Rockwood Mini Lite 2018–2026', price: 99, ship: 8, feePct: 0.03, oh: 2.60, actualCAC: 42, bom: [['foam', 4], ['vinyl', 5], ['magnet', 10], ['binding', 14], ['grommet', 3], ['thread', 1], ['pack', 1]], steps: [['Cut foam', 4], ['Cut vinyl', 5], ['Set magnets', 6], ['Sew & bind', 14], ['QA', 2], ['Pack', 3]] },
    { name: 'Jayco Eagle *HORIZONTAL GLASS* 2024–2026', price: 115, ship: 9, feePct: 0.03, oh: 2.80, actualCAC: 108, bom: [['foam', 5], ['vinyl', 6], ['magnet', 12], ['binding', 16], ['grommet', 4], ['thread', 1], ['pack', 1]], steps: [['Cut foam', 5], ['Cut vinyl', 6], ['Set magnets', 7], ['Sew & bind', 16], ['QA', 3], ['Pack', 3]] },
  ],
}
const clone = (x) => JSON.parse(JSON.stringify(x))

function InfoTip({ text }) {
  const [pos, setPos] = useState(null)
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(r.left + r.width / 2, 135), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 135)
    setPos({ x, y: r.bottom + 8 })
  }
  return (
    <span tabIndex={0} onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)} onClick={(e) => e.stopPropagation()}
      className="inline-grid place-items-center w-[15px] h-[15px] rounded-full bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400 text-[10px] font-bold cursor-help ml-1 align-middle hover:bg-blue-500 hover:text-white">?
      {pos && (
        <span style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateX(-50%)', zIndex: 80 }}
          className="pointer-events-none w-64 rounded-lg bg-gray-900 dark:bg-black text-white text-[12px] font-normal normal-case tracking-normal leading-snug px-3 py-2 shadow-xl ring-1 ring-white/10">{text}</span>
      )}
    </span>
  )
}

function Stepper({ value, step = 1, onChange, width = 'w-14' }) {
  const set = (v) => onChange(Math.max(0, Math.round((Number(v) || 0) * 100) / 100))
  return (
    <span className="inline-flex items-stretch h-9 rounded-lg overflow-hidden border border-gray-200 dark:border-white/15 bg-blue-50 dark:bg-blue-500/[0.06] align-middle focus-within:border-blue-500">
      <button type="button" tabIndex={-1} onClick={() => set((Number(value) || 0) - step)} className="w-8 flex-none text-blue-500 hover:bg-blue-500 hover:text-white text-lg leading-none transition border-r border-gray-200 dark:border-white/10">−</button>
      <input type="number" step={step} value={value} onChange={(e) => set(e.target.value)}
        className={`${width} bg-transparent text-center text-blue-600 dark:text-blue-300 font-bold text-[15px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`} />
      <button type="button" tabIndex={-1} onClick={() => set((Number(value) || 0) + step)} className="w-8 flex-none text-blue-500 hover:bg-blue-500 hover:text-white text-lg leading-none transition border-l border-gray-200 dark:border-white/10">+</button>
    </span>
  )
}

function Section({ icon, name, count, hint, open, onToggle, children }) {
  return (
    <div className="border border-gray-100 dark:border-white/[0.06] rounded-xl bg-white dark:bg-[#111528] overflow-hidden mb-5">
      <div onClick={onToggle} className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-[#161b30] transition">
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
        {icon}
        <div><span className="font-bold text-gray-900 dark:text-white">{name}</span>{count != null && <span className="text-xs text-gray-500 ml-1.5">{count}</span>}</div>
        {open && hint && <span className="ml-auto text-[11px] text-gray-400 hidden sm:block">{hint}</span>}
      </div>
      {open && <div className="border-t border-gray-100 dark:border-white/[0.06]">{children}</div>}
    </div>
  )
}

export default function ManufacturingCenter({ clientName }) {
  const [laborRate, setLaborRate] = useState(DEFAULTS.laborRate)
  const [MAT, setMAT] = useState(clone(DEFAULTS.MAT))
  const [SKUS, setSKUS] = useState(clone(DEFAULTS.SKUS))
  const [expanded, setExpanded] = useState(() => new Set())
  const [open, setOpen] = useState({ skus: true, materials: true, explainer: true })
  const toggleSec = (k) => setOpen(o => ({ ...o, [k]: !o[k] }))

  const toggle = (i) => setExpanded(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  const setMatField = (k, f, v) => setMAT(m => ({ ...m, [k]: { ...m[k], [f]: v } }))
  const setSkuPrice = (i, v) => setSKUS(s => s.map((x, j) => j === i ? { ...x, price: v } : x))
  const setBom = (i, j, v) => setSKUS(s => s.map((x, k) => k === i ? { ...x, bom: x.bom.map((b, n) => n === j ? [b[0], v] : b) } : x))
  const setStep = (i, j, v) => setSKUS(s => s.map((x, k) => k === i ? { ...x, steps: x.steps.map((b, n) => n === j ? [b[0], v] : b) } : x))
  const reset = () => { setLaborRate(DEFAULTS.laborRate); setMAT(clone(DEFAULTS.MAT)); setSKUS(clone(DEFAULTS.SKUS)); setExpanded(new Set()) }

  const calc = (s) => {
    const matCost = s.bom.reduce((t, [k, q]) => t + (MAT[k]?.cost || 0) * q, 0)
    const laborMin = s.steps.reduce((t, [, m]) => t + Number(m || 0), 0)
    const laborCost = laborMin / 60 * laborRate
    const cogs = matCost + laborCost + s.oh
    const fees = s.price * s.feePct
    const contribution = s.price - cogs - s.ship - fees
    return { matCost, laborMin, laborCost, cogs, fees, contribution, grossMargin: s.price ? (s.price - cogs) / s.price : 0, maxCAC: contribution,
      health: s.actualCAC <= contribution * 0.7 ? 'good' : s.actualCAC <= contribution ? 'ok' : 'bad' }
  }
  const usedBy = (key) => SKUS.filter(s => s.bom.some(([k]) => k === key)).length

  const calcs = SKUS.map(calc)
  const avgMargin = calcs.reduce((t, c) => t + c.grossMargin, 0) / (calcs.length || 1)
  const avgCOGS = calcs.reduce((t, c) => t + c.cogs, 0) / (calcs.length || 1)
  const avgMaxCAC = calcs.reduce((t, c) => t + c.maxCAC, 0) / (calcs.length || 1)
  const invValue = Object.values(MAT).reduce((t, m) => t + m.cost * m.stock, 0)

  // Factory floor → checkout aggregates (manufacturing margin → ad headroom → profit)
  const avgPrice = SKUS.reduce((t, s) => t + s.price, 0) / (SKUS.length || 1)
  const avgContribution = calcs.reduce((t, c) => t + c.contribution, 0) / (calcs.length || 1)
  const avgActualCAC = SKUS.reduce((t, s) => t + s.actualCAC, 0) / (SKUS.length || 1)
  const avgNet = calcs.reduce((t, c, i) => t + (c.contribution - SKUS[i].actualCAC), 0) / (calcs.length || 1)
  const breakEvenROAS = avgContribution > 0 ? avgPrice / avgContribution : 0
  const cacScale = Math.max(1, ...SKUS.map((s, i) => Math.max(calcs[i].maxCAC, s.actualCAC)))

  const KPI = [
    ['Active SKUs', String(SKUS.length), false, ''],
    ['Avg Gross Margin', pct(avgMargin), true, "Average of every SKU's (Price − COGS) ÷ Price."],
    ['Avg COGS / Unit', fmt$(avgCOGS), false, 'Average cost to build one cover across all SKUs.'],
    ['Avg Max CAC', fmt$(avgMaxCAC), false, 'Average ceiling on customer-acquisition cost.'],
    ['Inventory Value', fmt$0(invValue), false, 'Cash tied up in raw materials (Σ cost × on hand).'],
  ]
  const HEALTH = { good: ['bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400', 'Profitable'], ok: ['bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400', 'Tight'], bad: ['bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400', 'Over margin'] }
  const TH = 'px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      {/* header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <span className="inline-block text-[10px] font-bold text-blue-500 bg-blue-500/12 rounded px-2 py-0.5 mb-1.5">MANUFACTURING</span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manufacturing</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{clientName || 'ShieldTech'} — bill of materials, build process &amp; unit economics per SKU.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Labor rate<InfoTip text="What one hour of build labor costs you, fully loaded. Turns build-minutes into a labor $ cost." /></span>
            <span className="text-gray-400">$</span><Stepper value={laborRate} step={0.5} onChange={setLaborRate} width="w-14" /><span className="text-gray-500">/hr</span>
          </div>
          <button onClick={reset} className="text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 transition">↺ Reset</button>
        </div>
      </div>

      <div className="bg-blue-500/[0.06] border border-blue-500/20 rounded-xl px-4 py-3 mb-5 text-sm text-blue-700 dark:text-blue-200">
        💡 <b>Sandbox</b> — edit any blue number (material costs, recipe quantities, build minutes, prices) and watch COGS &amp; margins recalculate live. Hover any <span className="inline-grid place-items-center w-[15px] h-[15px] rounded-full bg-blue-500/20 text-blue-500 text-[10px] font-bold align-middle">?</span> to learn the term. <span className="text-blue-500/70">Costs are representative placeholders — swap in real numbers.</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {KPI.map(([l, v, g, tip]) => (
          <div key={l} className="bg-white dark:bg-[#111528] border border-gray-100 dark:border-white/[0.06] rounded-xl px-4 py-3.5">
            <div className={`text-2xl font-extrabold ${g ? 'text-[#34CC93]' : 'text-gray-900 dark:text-white'}`}>{v}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-0.5">{l}{tip && <InfoTip text={tip} />}</div>
          </div>
        ))}
      </div>

      {/* SKUs */}
      <Section
        icon={<span className="w-7 h-7 rounded-lg grid place-items-center text-white" style={{ background: 'linear-gradient(135deg,#34CC93,#1a9e6e)' }}><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg></span>}
        name="Cover SKUs" count={`${SKUS.length} SKUs`} hint="Click a SKU to open its recipe (BOM) & build process →"
        open={open.skus} onToggle={() => toggleSec('skus')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap min-w-[1040px]">
            <thead className="bg-gray-50 dark:bg-[#0d1020]">
              <tr>
                <th className={`${TH} text-left`}>SKU</th>
                <th className={`${TH} text-right`}>Price<InfoTip text="What the customer pays (from Shopify). Editable to test pricing." /></th>
                <th className={`${TH} text-right`}>Material<InfoTip text="Sum of every material in the recipe × its cost from the Materials table." /></th>
                <th className={`${TH} text-right`}>Labor<InfoTip text="Total build minutes ÷ 60 × labor rate." /></th>
                <th className={`${TH} text-right`}>COGS<InfoTip text="Cost of Goods Sold = Material + Labor + Overhead." /></th>
                <th className={`${TH} text-right text-[#34CC93] bg-[#34CC93]/[0.06]`}>Gross Margin<InfoTip text="(Price − COGS) ÷ Price. For products sold on paid ads you generally want 60%+." /></th>
                <th className={`${TH} text-right`}>Contribution<InfoTip text="Price − COGS − shipping − fees. Cash left for ads, fixed costs, and profit." /></th>
                <th className={`${TH} text-right`}>Max CAC<InfoTip text="The most you can spend to acquire one customer before losing money = contribution margin." /></th>
                <th className={`${TH} text-right`}>Actual CAC<InfoTip text="What you actually pay per customer — pulls from Meta + Google spend ÷ orders for this SKU (placeholder here)." /></th>
                <th className={`${TH} text-center`}>Health<InfoTip text="Green = Actual CAC well under Max CAC. Red = ad cost above the margin." /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.05]">
              {SKUS.map((s, i) => {
                const c = calcs[i]; const [hc, hl] = HEALTH[c.health]; const isOpen = expanded.has(i)
                const segs = [['Material', c.matCost, '#3b82f6'], ['Labor', c.laborCost, '#f59e0b'], ['Overhead', s.oh, '#a855f7'], ['Ship + Fees', s.ship + c.fees, '#64748b'], ['Contribution', Math.max(0, c.contribution), '#34CC93']]
                return (
                  <FragmentRow key={i}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3 cursor-pointer" onClick={() => toggle(i)}>
                        <span className="inline-flex items-center gap-2"><svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg><span className="font-medium text-gray-800 dark:text-white">{s.name}</span></span>
                      </td>
                      <td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1"><span className="text-gray-500">$</span><Stepper value={s.price} step={1} onChange={(v) => setSkuPrice(i, v)} /></span></td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{fmt$(c.matCost)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{fmt$(c.laborCost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 dark:text-gray-200">{fmt$(c.cogs)}</td>
                      <td className={`px-4 py-3 text-right font-bold bg-[#34CC93]/[0.04] ${c.grossMargin >= 0.6 ? 'text-[#34CC93]' : c.grossMargin >= 0.45 ? 'text-amber-500' : 'text-red-500'}`}>{pct(c.grossMargin)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{fmt$(c.contribution)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#34CC93]">{fmt$(c.maxCAC)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt$0(s.actualCAC)}</td>
                      <td className="px-4 py-3 text-center"><span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${hc}`}>{hl}</span></td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50 dark:bg-[#0d1020]/60"><td colSpan={10} className="px-4 py-4">
                        <div className="mb-4">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-2">How the ${s.price} price breaks down<InfoTip text="The full price split into where the money goes. The green slice (Contribution) is what's left for ads + profit." /></p>
                          <div className="flex w-full h-5 rounded-md overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                            {segs.map(([n, v, col]) => v > 0 ? <div key={n} title={`${n}: ${fmt$(v)}`} style={{ width: `${(v / s.price) * 100}%`, background: col }} className="h-full" /> : null)}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                            {segs.map(([n, v, col]) => <span key={n} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: col }} />{n} <span className="text-gray-700 dark:text-gray-300 font-semibold">{fmt$(v)}</span> <span className="text-gray-400 dark:text-gray-600">({pct(v / s.price)})</span></span>)}
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-2">Recipe · Bill of Materials<InfoTip text="Materials and quantities for one cover. Edit a quantity and the cost updates instantly." /></p>
                            <table className="w-full text-sm"><thead><tr className="text-[10px] uppercase text-gray-400"><th className="text-left pl-1 pb-1">Material</th><th className="text-right pb-1">Qty</th><th className="text-right pb-1">Cost/Unit</th><th className="text-right pb-1">Ext</th></tr></thead><tbody>
                              {s.bom.map(([k, q], j) => (
                                <tr key={j} className="text-gray-500 dark:text-gray-400"><td className="py-2 pl-1">{MAT[k].name}</td><td className="py-2 text-right"><span className="inline-flex items-center gap-1.5"><Stepper value={q} step={0.5} onChange={(v) => setBom(i, j, v)} width="w-12" /><span className="text-gray-400 dark:text-gray-600 text-xs">{MAT[k].unit}</span></span></td><td className="py-2 text-right">{fmt$(MAT[k].cost)}</td><td className="py-2 text-right text-gray-700 dark:text-gray-200">{fmt$(MAT[k].cost * q)}</td></tr>
                              ))}
                              <tr className="border-t border-gray-200 dark:border-white/10 font-semibold text-gray-900 dark:text-white"><td className="py-2 pl-1">Material total</td><td /><td /><td className="py-2 text-right">{fmt$(c.matCost)}</td></tr>
                            </tbody></table>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-2">Build Process · {c.laborMin} min<InfoTip text="Each step's time × labor rate = its labor cost. Edit the minutes to test process improvements." /></p>
                            <table className="w-full text-sm"><thead><tr className="text-[10px] uppercase text-gray-400"><th className="text-left pl-1 pb-1">Step</th><th className="text-right pb-1">Time</th><th className="text-right pb-1">Labor $</th></tr></thead><tbody>
                              {s.steps.map(([n, mn], j) => (
                                <tr key={j} className="text-gray-500 dark:text-gray-400"><td className="py-2 pl-1">{n}</td><td className="py-2 text-right"><span className="inline-flex items-center gap-1.5"><Stepper value={mn} step={1} onChange={(v) => setStep(i, j, v)} width="w-12" /><span className="text-gray-400 dark:text-gray-600 text-xs">min</span></span></td><td className="py-2 text-right text-gray-700 dark:text-gray-200">{fmt$(mn / 60 * laborRate)}</td></tr>
                              ))}
                              <tr className="border-t border-gray-200 dark:border-white/10 font-semibold text-gray-900 dark:text-white"><td className="py-2 pl-1">Labor total</td><td className="py-2 text-right">{c.laborMin} min</td><td className="py-2 text-right">{fmt$(c.laborCost)}</td></tr>
                              <tr className="text-gray-500 dark:text-gray-400"><td className="py-2 pl-1">+ Overhead</td><td /><td className="py-2 text-right">{fmt$(s.oh)}</td></tr>
                              <tr className="border-t border-gray-200 dark:border-white/10 font-bold text-[#34CC93]"><td className="py-2 pl-1">= COGS / unit</td><td /><td className="py-2 text-right">{fmt$(c.cogs)}</td></tr>
                            </tbody></table>
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </FragmentRow>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Materials */}
      <Section
        icon={<span className="w-7 h-7 rounded-lg grid place-items-center bg-blue-500/20 text-blue-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg></span>}
        name="Raw Materials & Inventory" hint="💡 Edit a Cost/Unit and every recipe above updates"
        open={open.materials} onToggle={() => toggleSec('materials')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap min-w-[860px]">
            <thead className="bg-gray-50 dark:bg-[#0d1020]"><tr>
              <th className={`${TH} text-left`}>Material</th><th className={`${TH} text-left`}>Unit</th>
              <th className={`${TH} text-right`}>Cost / Unit<InfoTip text="What one unit of this raw material costs. Flows into every SKU's COGS — edit it and watch margins move." /></th>
              <th className={`${TH} text-right`}>On Hand<InfoTip text="How much you have in stock. Operational only — does NOT change margins." /></th>
              <th className={`${TH} text-right`}>Inventory Value<InfoTip text="Cost/Unit × On Hand = cash tied up in this material." /></th>
              <th className={`${TH} text-center`}>Status</th>
              <th className={`${TH} text-right`}>Used by<InfoTip text="How many SKUs use this material — the ripple when you change its cost." /></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.05]">
              {Object.entries(MAT).map(([k, m]) => {
                const low = m.stock <= m.reorder, n = usedBy(k)
                return (
                  <tr key={k} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{m.name}</td>
                    <td className="px-4 py-3 text-gray-400">{m.unit}</td>
                    <td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1"><span className="text-gray-500">$</span><Stepper value={m.cost} step={0.05} onChange={(v) => setMatField(k, 'cost', v)} width="w-16" /></span></td>
                    <td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1.5"><Stepper value={m.stock} step={10} onChange={(v) => setMatField(k, 'stock', v)} width="w-16" /><span className="text-gray-400 dark:text-gray-600 text-xs">{m.unit}</span></span></td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 font-semibold">{fmt$0(m.cost * m.stock)}</td>
                    <td className="px-4 py-3 text-center"><span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${low ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>{low ? 'Reorder' : 'In stock'}</span></td>
                    <td className="px-4 py-3 text-right"><span className="text-[11px] font-semibold text-blue-500 bg-blue-500/10 rounded-full px-2.5 py-1">{n} SKU{n === 1 ? '' : 's'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* explainer */}
      <Section
        icon={<span className="w-7 h-7 rounded-lg grid place-items-center bg-[#34CC93]/15 text-[#34CC93]"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg></span>}
        name="Factory floor → checkout" count="margin → ad headroom → profit" open={open.explainer} onToggle={() => toggleSec('explainer')}>
        <div className="p-5 space-y-6">
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-3xl">Each cover's <b className="text-gray-800 dark:text-white">contribution margin</b> is the ceiling on what we can spend to acquire a customer (<b className="text-[#34CC93]">Max CAC</b>). <b className="text-gray-800 dark:text-white">Actual CAC</b> comes from the live Meta + Google ad data in this dashboard. The gap between them is your <b className="text-gray-800 dark:text-white">profit per order</b> — and your room to scale ad spend.</p>

          {/* blended unit economics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              ['Avg Order Value', fmt$(avgPrice), false, 'Average selling price across SKUs.'],
              ['Avg COGS', fmt$(avgCOGS), false, 'Average cost to build one cover.'],
              ['Avg Contribution', fmt$(avgContribution), false, 'Avg price − COGS − shipping − fees. The cash available per order before ad spend.'],
              ['Avg Actual CAC', fmt$(avgActualCAC), false, 'Average cost to acquire one customer (from ad data).'],
              ['Avg Net Profit / Order', fmt$(avgNet), avgNet >= 0, 'Contribution − Actual CAC. What you keep per order after ads.'],
              ['Break-even ROAS', breakEvenROAS ? breakEvenROAS.toFixed(2) + 'x' : '—', false, 'Revenue ÷ ad spend needed to break even = price ÷ contribution. Run above this to profit.'],
            ].map(([l, v, g, tip]) => (
              <div key={l} className="bg-gray-50 dark:bg-[#0d1020] rounded-lg px-3.5 py-3">
                <div className={`text-lg font-extrabold ${g ? 'text-[#34CC93]' : 'text-gray-900 dark:text-white'}`}>{v}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-0.5">{l}<InfoTip text={tip} /></div>
              </div>
            ))}
          </div>

          {/* per-SKU CAC headroom */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Ad-spend headroom by SKU<InfoTip text="Each bar = how much you can spend to acquire a customer (Max CAC). Slate = what you currently pay (Actual CAC); green = profit headroom left; red = you're paying more than the margin allows." /></p>
              <div className="flex items-center gap-3 text-[11px] text-gray-400">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-500" />Ad cost</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#34CC93]" />Profit headroom</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" />Over budget</span>
              </div>
            </div>
            <div className="space-y-2.5">
              {SKUS.map((s, i) => {
                const c = calcs[i]
                const maxC = Math.max(0, c.maxCAC)
                const net = c.contribution - s.actualCAC
                const over = net < 0
                const adPct = (Math.min(s.actualCAC, maxC) / cacScale) * 100
                const profitPct = over ? 0 : ((maxC - s.actualCAC) / cacScale) * 100
                const overPct = over ? ((s.actualCAC - maxC) / cacScale) * 100 : 0
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-48 shrink-0 text-xs text-gray-600 dark:text-gray-300 truncate">{s.name}</span>
                    <div className="flex-1 flex h-5 rounded-md overflow-hidden bg-gray-100 dark:bg-white/[0.04] ring-1 ring-black/5 dark:ring-white/10">
                      <div style={{ width: `${adPct}%`, background: '#64748b' }} title={`Ad cost (Actual CAC): ${fmt$(s.actualCAC)}`} />
                      {profitPct > 0 && <div style={{ width: `${profitPct}%`, background: '#34CC93' }} title={`Profit headroom: ${fmt$(maxC - s.actualCAC)}`} />}
                      {overPct > 0 && <div style={{ width: `${overPct}%`, background: '#ef4444' }} title={`Over budget: ${fmt$(s.actualCAC - maxC)}`} />}
                    </div>
                    <span className="w-28 shrink-0 text-right text-xs">
                      <span className={`font-bold ${over ? 'text-red-500' : 'text-[#34CC93]'}`}>{over ? '−' : '+'}{fmt$(Math.abs(net))}</span>
                      <span className="text-gray-400 dark:text-gray-600">/order</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}

// table rows can't be wrapped in a normal Fragment with key + multiple <tr>; helper keeps them grouped
function FragmentRow({ children }) { return <>{children}</> }
