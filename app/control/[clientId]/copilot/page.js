'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

/* ───────── Canvas renderers (generative UI keyed on tool name) ───────── */

const money = n => (n == null ? '—' : '$' + Math.round(n).toLocaleString())
const money2 = n => (n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const roas = n => (n == null ? '—' : Number(n).toFixed(1) + 'x')

function Tile({ label, value, accent, star }) {
  return (
    <div className={`rounded-xl border p-4 ${accent === 'moat' ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#141a2c]'}`}>
      <div className={`text-xl font-extrabold ${accent === 'green' || accent === 'moat' ? 'text-emerald-400' : accent === 'blue' ? 'text-blue-400' : 'text-gray-900 dark:text-white'}`}>{value}</div>
      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{star && <span className="text-emerald-400 mr-1">★</span>}{label}</div>
    </div>
  )
}

function MarginSummary({ r }) {
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Tile label="Revenue" value={money(r.revenue)} />
        <Tile label="Ad Spend" value={money(r.adSpend)} />
        <Tile label="Plain ROAS" value={roas(r.plainRoas)} />
        <Tile label="Margin-aware ROAS" value={roas(r.marginAwareRoas)} accent="moat" star />
        <Tile label="Orders" value={(r.orderCount || 0).toLocaleString()} />
        <Tile label="Attributed" value={(r.attributionRate ?? 0) + '%'} accent="green" star />
      </div>
      <div className="mt-3 rounded-lg border border-dashed border-gray-300 dark:border-white/15 bg-gray-50 dark:bg-[#10182a] p-3 text-xs text-gray-500 dark:text-gray-400">
        AOV {money2(r.aov)} · Est. contribution {money(r.estimatedContributionMargin)} · {r.assumptions?.note}
      </div>
    </div>
  )
}

function CampaignTable({ r }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/[0.07]">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-[#0d1020] text-[10.5px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="text-left px-4 py-2.5">Campaign</th>
            <th className="text-right px-4 py-2.5">Spend</th>
            <th className="text-right px-4 py-2.5">Attr. Rev</th>
            <th className="text-right px-4 py-2.5">Orders</th>
            <th className="text-right px-4 py-2.5 text-emerald-400">Margin ROAS</th>
          </tr>
        </thead>
        <tbody>
          {r.campaigns.map((c, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-white/[0.05]">
              <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">{c.campaign}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{money(c.spend)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">{money(c.attributedRevenue)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{c.orders}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-400">{roas(c.marginAwareRoas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[11px] text-gray-500 dark:text-gray-400">{r.assumptions?.note}</div>
    </div>
  )
}

function OrdersTable({ r }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/[0.07]">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-[#0d1020] text-[10.5px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="text-left px-4 py-2.5">Date</th>
            <th className="text-left px-4 py-2.5">Customer</th>
            <th className="text-left px-4 py-2.5">Campaign</th>
            <th className="text-right px-4 py-2.5">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {r.orders.map((o, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-white/[0.05]">
              <td className="px-4 py-2.5 text-gray-500">{o.date}</td>
              <td className="px-4 py-2.5">{o.customer || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{o.campaign || '— unattributed'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{money2(o.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CanvasArtifact({ entry }) {
  if (!entry) return null
  const titles = { getMarginSummary: 'Margin overview', getCampaignsByMargin: 'Campaigns by margin', getRecentOrders: 'Recent orders' }
  return (
    <div className="animate-[rise_.35s_ease]">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">{titles[entry.tool] || entry.tool}</div>
      {entry.tool === 'getMarginSummary' && <MarginSummary r={entry.result} />}
      {entry.tool === 'getCampaignsByMargin' && <CampaignTable r={entry.result} />}
      {entry.tool === 'getRecentOrders' && <OrdersTable r={entry.result} />}
    </div>
  )
}

/* ───────── Page (split view) ───────── */

const SUGGESTIONS = [
  'How are we doing this month?',
  'Which campaign has the best margin?',
  'Show me recent orders',
  'What should I scale?',
]

export default function CopilotPage() {
  const { clientId } = useParams()
  const [messages, setMessages] = useState([])     // {role, content}
  const [canvas, setCanvas] = useState(null)       // latest toolData entry
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const threadRef = useRef(null)

  useEffect(() => { threadRef.current?.scrollTo(0, threadRef.current.scrollHeight) }, [messages, loading])

  const send = useCallback(async (text) => {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setInput('')
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setLoading(true)
    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, messages: next.map(m => ({ role: m.role, content: m.content })) }),
      })
      const json = await res.json()
      if (json.error) {
        setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${json.error}` }])
      } else {
        setMessages(m => [...m, { role: 'assistant', content: json.text || '(no response)' }])
        if (Array.isArray(json.toolData) && json.toolData.length) setCanvas(json.toolData[json.toolData.length - 1])
      }
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, clientId])

  return (
    <div className="flex h-[calc(100vh-48px)] min-h-0">
      {/* LEFT — chat */}
      <div className="w-[400px] flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-white/[0.07] bg-gray-50 dark:bg-[#0d1120] min-h-0">
        <div className="px-4 py-3.5 border-b border-gray-200 dark:border-white/[0.07]">
          <div className="font-bold text-[14px] flex items-center gap-2 text-gray-900 dark:text-white">✦ Ecom Copilot</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Your AI CMO · margin-aware</div>
        </div>

        <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-0">
          {messages.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Ask about margin, campaigns, or orders for this client. Answers render on the right.
            </div>
          )}
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="ml-auto max-w-[90%] bg-blue-600 text-white px-3 py-2 rounded-[14px_14px_4px_14px] text-sm">{m.content}</div>
            ) : (
              <div key={i} className="max-w-[92%]">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Copilot</div>
                <div className="bg-white dark:bg-[#141a2c] border border-gray-200 dark:border-white/[0.07] px-3 py-2.5 rounded-[4px_14px_14px_14px] text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-100">{m.content}</div>
              </div>
            )
          ))}
          {loading && <div className="text-[11px] text-gray-400">Copilot is thinking…</div>}
        </div>

        {messages.length === 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} className="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-[#141a2c] border border-gray-200 dark:border-white/[0.07] rounded-full px-3 py-1.5 hover:border-blue-400 transition">{s}</button>
            ))}
          </div>
        )}

        <div className="p-3 border-t border-gray-200 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 bg-white dark:bg-[#141a2c] border border-gray-300 dark:border-white/15 rounded-xl px-3 py-2 focus-within:border-blue-500">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send() }}
              placeholder="Ask or tell the Copilot…"
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
            />
            <button onClick={() => send()} disabled={loading} className="w-8 h-8 rounded-lg bg-blue-600 text-white grid place-items-center disabled:opacity-50">→</button>
          </div>
        </div>
      </div>

      {/* RIGHT — generative canvas */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-white dark:bg-[#0b0e16]">
        <div className="max-w-[760px] mx-auto p-7">
          {canvas
            ? <CanvasArtifact entry={canvas} />
            : <div className="text-sm text-gray-400 dark:text-gray-500 mt-20 text-center">The Copilot will render charts, tables, and breakdowns here as you ask.</div>}
        </div>
      </div>

      <style jsx global>{`@keyframes rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  )
}
