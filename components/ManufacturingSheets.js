'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { buildCostBook, skuUnitCost } from '../lib/cogs'

const money = n => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ManufacturingSheets({ clientId, clientName }) {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('skus')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/manufacturing?client_id=${clientId}`, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
    else setData({ materials: [], skus: [] })
  }, [clientId])
  useEffect(() => { load() }, [load])

  const book = useMemo(() => buildCostBook(data?.materials || []), [data])
  const bomCols = useMemo(() => {
    const set = new Set()
    for (const s of data?.skus || []) for (const k of Object.keys(s.bom || {})) set.add(k)
    return [...set]
  }, [data])

  const onUpload = (type) => { setMsg(null); fileRef.current.dataset.type = type; fileRef.current.click() }
  const handleFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    const type = fileRef.current.dataset.type
    setBusy(true); setMsg(null)
    try {
      const csv = await f.text()
      const res = await fetch('/api/manufacturing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, type, csv }) })
      const j = await res.json()
      if (j.error) setMsg({ err: j.error })
      else { setMsg({ ok: `Uploaded ${j.count} ${type === 'materials' ? 'materials' : 'SKUs'}.` }); await load() }
    } catch (err) { setMsg({ err: err.message }) } finally { setBusy(false); e.target.value = '' }
  }

  if (!data) return <div className="p-8 text-sm text-gray-400">Loading manufacturing data…</div>

  const empty = data.materials.length === 0 && data.skus.length === 0

  return (
    <div className="p-8">
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Manufacturing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{clientName} · BOM → real per-SKU COGS, powering margin-aware ROAS.</p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#141a2c] p-0.5 text-[13px] font-semibold">
          {[['skus', `SKUs (${data.skus.length})`], ['materials', `Materials (${data.materials.length})`]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} className={`px-3.5 py-1.5 rounded-md transition ${tab === v ? 'bg-white dark:bg-blue-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{l}</button>
          ))}
        </div>
      </div>

      {msg && <div className={`mt-3 mb-4 text-sm rounded-lg px-3 py-2 ${msg.err ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>{msg.err || msg.ok}</div>}

      {empty && (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 dark:border-white/15 p-6 text-sm text-gray-500 dark:text-gray-400">
          No manufacturing data yet. Upload your two sheets (CSV) — the <b>Materials</b> tab takes the “Material Cost Per Unit” export, the <b>SKUs</b> tab takes the “SKU INFORMATION” export.
        </div>
      )}

      {/* ── MATERIALS ── */}
      {tab === 'materials' && (
        <div className="mt-4">
          <div className="flex justify-end mb-3">
            <button onClick={() => onUpload('materials')} disabled={busy} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{busy ? 'Uploading…' : '⬆ Upload materials CSV'}</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/[0.08]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#0d1020] text-[10.5px] uppercase tracking-wide text-gray-500">
                <tr><th className="text-left px-4 py-2.5">Material</th><th className="text-right px-4 py-2.5">Cost</th><th className="text-left px-4 py-2.5">Unit</th><th className="text-left px-4 py-2.5">Notes</th></tr>
              </thead>
              <tbody>
                {data.materials.map((m, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-white/[0.05]">
                    <td className="px-4 py-2.5 text-gray-800 dark:text-gray-100">{m.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(m.cost)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{m.unit}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{m.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SKUs / BOM ── */}
      {tab === 'skus' && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400">COGS computed live from the BOM × material costs (Black-vinyl variant shown).</p>
            <button onClick={() => onUpload('skus')} disabled={busy} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{busy ? 'Uploading…' : '⬆ Upload SKU CSV'}</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/[0.08]">
            <table className="w-full text-[13px] whitespace-nowrap">
              <thead className="bg-gray-50 dark:bg-[#0d1020] text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 dark:bg-[#0d1020]">Parent SKU</th>
                  <th className="text-left px-3 py-2">Size</th>
                  <th className="text-right px-3 py-2 text-emerald-600 dark:text-emerald-400">COGS</th>
                  {bomCols.map(c => <th key={c} className="text-right px-3 py-2">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.skus.map((s, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-white/[0.05] hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-800 dark:text-gray-100 sticky left-0 bg-white dark:bg-[#141a2c]">{s.parent_sku}</td>
                    <td className="px-3 py-2 text-gray-500">{s.size}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{money(skuUnitCost(s.bom, book, 'BK'))}</td>
                    {bomCols.map(c => <td key={c} className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{s.bom?.[c] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
