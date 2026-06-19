'use client'

import { useState, useRef } from 'react'

const TYPE = {
  Property: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  Business: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  Personal: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Finance:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
}
const RISK = { high: ['bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400', 'High'], medium: ['bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400', 'Medium'], low: ['bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400', 'Low'] }
// Category pill styles for the decoded list view
const CAT = {
  Term:        'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  Date:        'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  Obligation:  'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  'Watch-out': 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
}
// Flatten a document's decoded data into list-view rows.
function docRows(d) {
  return [
    ...d.terms.map(([field, detail]) => ({ cat: 'Term', field, detail })),
    ...d.dates.map(detail => ({ cat: 'Date', field: 'Deadline', detail })),
    ...d.you.map(detail => ({ cat: 'Obligation', field: 'You must', detail })),
    ...d.watch.map(detail => ({ cat: 'Watch-out', field: 'Risk', detail })),
  ]
}

const DOCS = [
  { title: 'Apartment Lease Agreement', type: 'Property', parties: 'You ↔ Bluegrass Property Mgmt', date: 'Signed Mar 2026', status: 'Needs review', risk: 'high',
    summary: "A 12-month lease for $1,450/mo. You're locked in until Feb 2027; breaking it early costs 2 months' rent. Rent is due on the 1st with a $75 late fee after the 5th.",
    terms: [['Term', '12 months, ends 2/28/2027'], ['Rent', '$1,450/mo, due 1st'], ['Deposit', '$1,450 (refundable)'], ['Early exit', "2 months' rent penalty"]],
    dates: ['Rent due 1st of each month', 'Renewal notice due by 12/31/2026', 'Lease ends 2/28/2027'],
    you: ['Pay rent on time', 'Give 60-day notice to leave', 'Keep renters insurance'],
    watch: ['Auto-renews unless you give 60-day notice', 'Only a 3-day window to fix a missed payment'] },
  { title: 'LLC Operating Agreement', type: 'Business', parties: 'ConversionHero LLC (you + 1 partner)', date: 'Filed Jan 2026', status: 'Needs review', risk: 'medium',
    summary: 'Sets up a 60/40 ownership split. Major decisions need both partners; profits distributed quarterly. A buy-sell clause governs what happens if a partner leaves.',
    terms: [['Ownership', 'You 60% / Partner 40%'], ['Decisions', 'Major = unanimous'], ['Profit split', 'Quarterly, by %'], ['Buy-sell', '90-day right of first refusal']],
    dates: ['Annual report due 4/15', 'Quarterly distributions'],
    you: ['Maintain capital contributions', 'File annual state report'],
    watch: ['"Major decisions" defined broadly — could slow you down', 'No clear dispute-resolution path'] },
  { title: 'Mutual Non-Disclosure Agreement', type: 'Business', parties: 'ConversionHero ↔ Synergy Home', date: 'Signed Jun 2026', status: 'Reviewed', risk: 'low',
    summary: "Standard mutual NDA. Both sides keep each other's confidential info secret for 3 years. No non-compete, no IP assignment — nothing unusual.",
    terms: [['Type', 'Mutual'], ['Duration', '3 years'], ['Carve-outs', 'Public / prior info']],
    dates: ['Confidentiality expires Jun 2029'],
    you: ["Don't share their confidential info", 'Return/destroy info on request'],
    watch: ['Covers verbal disclosures too'] },
  { title: 'Auto Loan Agreement', type: 'Finance', parties: 'You ↔ Bluegrass Credit Union', date: 'Signed 2024', status: 'Reviewed', risk: 'low',
    summary: '60-month loan at 6.9% APR. No prepayment penalty — you can pay it off early and save interest.',
    terms: [['Balance', '$18,400'], ['APR', '6.9%'], ['Term', '60 months'], ['Prepay', 'No penalty']],
    dates: ['Payment due 15th', 'Payoff ~2029'],
    you: ['Pay $364/mo', 'Keep full-coverage insurance'],
    watch: ['Repossession possible after 2 missed payments'] },
]

function Section({ icon, title, count, danger, open, onToggle, children }) {
  return (
    <div className={`border rounded-xl bg-white dark:bg-[#111528] overflow-hidden mb-3 ${danger ? 'border-rose-200 dark:border-rose-500/20' : 'border-gray-100 dark:border-white/[0.06]'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-[#161b30] transition">
        <span className="text-lg">{icon}</span>
        <span className="font-bold text-gray-900 dark:text-white">{title}</span>
        {count != null && <span className="text-xs text-gray-400 dark:text-gray-500 font-semibold bg-gray-100 dark:bg-white/5 rounded-full px-2 py-0.5">{count}</span>}
        <svg className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </button>
      {open && <div className="border-t border-gray-100 dark:border-white/[0.06] px-5 py-4">{children}</div>}
    </div>
  )
}

export default function LegalCenter({ clientName }) {
  const [open, setOpen] = useState({ docs: true, deadlines: true, actions: false, risks: false, people: false, glossary: false })
  const [docOpen, setDocOpen] = useState({})
  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }))

  // Upload area (front-end only — drag/drop, browse, or paste)
  const fileRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [pending, setPending] = useState([])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const fmtSize = (b) => b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'
  const addFiles = (fileList) => {
    const arr = Array.from(fileList || []).map(f => ({ name: f.name, size: f.size, type: (f.name.split('.').pop() || 'file').toUpperCase() }))
    if (arr.length) setPending(p => [...arr, ...p])
  }
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }
  const addPaste = () => { const t = pasteText.trim(); if (!t) return; setPending(p => [{ name: 'Pasted text', size: t.length, type: 'TEXT' }, ...p]); setPasteText(''); setPasteOpen(false) }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <span className="inline-block text-[10px] font-bold text-indigo-500 bg-indigo-500/12 rounded px-2 py-0.5 mb-1.5">LEGAL</span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Legal</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{clientName || 'ShieldTech'} — dump any legal document and it gets organized &amp; decoded into plain English.</p>
        </div>
      </div>

      {/* dump / upload zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-5 mb-3 flex items-center gap-4 cursor-pointer transition ${dragOver ? 'border-indigo-500 bg-indigo-100/70 dark:bg-indigo-500/[0.14]' : 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/[0.06] hover:border-indigo-400'}`}>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <span className="grid place-items-center w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0"><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg></span>
        <div className="flex-1">
          <p className="font-bold text-gray-900 dark:text-white">{dragOver ? 'Drop to add' : 'Dump anything here'}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Drag &amp; drop files, click to browse, or <button onClick={(e) => { e.stopPropagation(); setPasteOpen(o => !o) }} className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">paste text</button>. Auto-files &amp; decodes.</p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-500/15 rounded-lg px-4 py-2">Browse files</span>
      </div>

      {/* paste-text manual entry */}
      {pasteOpen && (
        <div className="mb-3 bg-white dark:bg-[#111528] border border-gray-100 dark:border-white/[0.06] rounded-xl p-4">
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4}
            placeholder="Paste a contract, agreement, or any legal text here…"
            className="w-full text-sm bg-gray-50 dark:bg-[#0d1020] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/40 text-gray-800 dark:text-gray-100" />
          <div className="flex gap-2 mt-2">
            <button onClick={addPaste} className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-1.5">Add text</button>
            <button onClick={() => { setPasteOpen(false); setPasteText('') }} className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-1.5">Cancel</button>
          </div>
        </div>
      )}

      {/* just-added queue */}
      {pending.length > 0 && (
        <div className="mb-5 space-y-2">
          {pending.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-white dark:bg-[#111528] border border-gray-100 dark:border-white/[0.06] rounded-lg px-4 py-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-lg bg-gray-100 dark:bg-white/5 text-[10px] font-bold text-gray-500 dark:text-gray-400 shrink-0">{f.type}</span>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 dark:text-white truncate">{f.name}</p><p className="text-xs text-gray-400">{fmtSize(f.size)}</p></div>
              <span className="text-[11px] font-semibold text-amber-600 bg-amber-100 dark:bg-amber-500/15 dark:text-amber-400 rounded-full px-2.5 py-1 animate-pulse">Queued for decoding</span>
              <button onClick={() => setPending(p => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">×</button>
            </div>
          ))}
          <p className="text-[11px] text-gray-400 dark:text-gray-600">UI preview — files aren't uploaded or decoded yet.</p>
        </div>
      )}

      {/* stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[['Documents', '4', 'text-gray-900 dark:text-white'], ['Need review', '2', 'text-amber-500'], ['Deadlines <30d', '2', 'text-rose-500'], ['Risk flags', '3', 'text-rose-500']].map(([l, v, c]) => (
          <div key={l} className="bg-white dark:bg-[#111528] rounded-xl border border-gray-100 dark:border-white/[0.06] px-4 py-3.5"><div className={`text-2xl font-extrabold ${c}`}>{v}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{l}</div></div>
        ))}
      </div>

      {/* Documents (vault) */}
      <Section icon="📁" title="Documents" count={`${DOCS.length}`} open={open.docs} onToggle={() => toggle('docs')}>
        <div className="space-y-2.5">
          {DOCS.map((d, i) => {
            const [rc, rl] = RISK[d.risk]; const isOpen = !!docOpen[i]
            const rows = docRows(d)
            return (
              <div key={i} className="border border-gray-100 dark:border-white/[0.06] rounded-lg overflow-hidden">
                <button onClick={() => setDocOpen(o => ({ ...o, [i]: !o[i] }))} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-gray-900 dark:text-white">{d.title}</span><span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${TYPE[d.type]}`}>{d.type}</span></div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{d.parties} · {d.date}</div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${rc}`}>{rl} risk</span>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-white/[0.06] px-4 py-4">
                    <div className="bg-indigo-50 dark:bg-indigo-500/[0.08] border border-indigo-100 dark:border-indigo-500/20 rounded-lg p-4 mb-4"><p className="text-[11px] font-bold uppercase tracking-wide text-indigo-500 mb-1">In plain English</p><p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{d.summary}</p></div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Decoded details</p>
                    <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-white/[0.06]">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-[#0d1020]">
                          <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                            <th className="py-2.5 px-4 font-semibold w-28">Category</th>
                            <th className="py-2.5 px-4 font-semibold w-40">Field</th>
                            <th className="py-2.5 px-4 font-semibold">Detail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-white/[0.06]">
                          {rows.map((r, j) => (
                            <tr key={j} className={`align-top ${r.cat === 'Watch-out' ? 'bg-rose-50/50 dark:bg-rose-500/[0.04]' : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'}`}>
                              <td className="py-2.5 px-4"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${CAT[r.cat]}`}>{r.cat}</span></td>
                              <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.field}</td>
                              <td className={`py-2.5 px-4 ${r.cat === 'Watch-out' ? 'text-rose-700 dark:text-rose-300' : 'text-gray-800 dark:text-gray-200'}`}>{r.detail}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <Section icon="⏰" title="Upcoming deadlines" count="2 <30d" open={open.deadlines} onToggle={() => toggle('deadlines')}>
        <div className="space-y-2">
          {[['Dec 31, 2026', 'Lease renewal notice (60-day)', 'Apartment Lease', 'text-rose-500'], ['Apr 15, 2026', 'LLC annual state report', 'LLC Operating Agreement', 'text-amber-500'], ['Monthly · 1st', 'Rent payment $1,450', 'Apartment Lease', 'text-gray-400']].map(([d, t, doc, c], i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-[#161b30]">
              <div className={`text-xs font-bold w-20 shrink-0 ${c}`}>{d}</div>
              <div className="flex-1"><div className="font-semibold text-gray-900 dark:text-white text-sm">{t}</div><div className="text-xs text-gray-400">{doc}</div></div>
              <button className="text-xs font-semibold text-indigo-500">Remind me</button>
            </div>
          ))}
        </div>
      </Section>

      <Section icon="✅" title="Action items" count="5 open" open={open.actions} onToggle={() => toggle('actions')}>
        <div className="space-y-1">
          {['Set a reminder for the lease renewal notice', 'File LLC annual report', 'Get renters insurance', 'Confirm security deposit terms in writing', 'Review buy-sell clause with partner'].map((a, i) => (
            <label key={i} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300 p-2 rounded hover:bg-gray-50 dark:hover:bg-white/[0.02] cursor-pointer"><span className="w-4 h-4 rounded border border-gray-300 dark:border-white/20" />{a}</label>
          ))}
        </div>
      </Section>

      <Section icon="⚠️" title="Risk flags" count="3" danger open={open.risks} onToggle={() => toggle('risks')}>
        <ul className="space-y-2 text-sm text-rose-700 dark:text-rose-300">
          <li>• Lease has a <b>3-day cure period</b> + auto-renew — <span className="text-gray-400">Apartment Lease</span></li>
          <li>• LLC "major decisions" defined broadly, no dispute path — <span className="text-gray-400">Operating Agreement</span></li>
          <li>• Auto loan allows repossession after 2 missed payments — <span className="text-gray-400">Auto Loan</span></li>
        </ul>
      </Section>

      <Section icon="👤" title="People &amp; parties" count="6" open={open.people} onToggle={() => toggle('people')}>
        <div className="flex flex-wrap gap-2">{['Bluegrass Property Mgmt', 'Synergy Home', 'ConversionHero LLC', 'Bluegrass Credit Union', 'Your business partner', 'Your attorney'].map(p => <span key={p} className="text-sm bg-gray-100 dark:bg-white/5 rounded-full px-3 py-1.5 text-gray-700 dark:text-gray-300">{p}</span>)}</div>
      </Section>

      <Section icon="📖" title="Your glossary" count="auto-built" open={open.glossary} onToggle={() => toggle('glossary')}>
        <div className="space-y-2">{[['Indemnify', "You cover their losses if it's your fault."], ['Acceleration', 'They can demand all remaining money at once.'], ['Right of first refusal', 'Partner gets first chance to buy before outsiders.'], ['Cure period', 'The window to fix a problem before penalties hit.']].map(([t, d]) => <div key={t} className="flex gap-3 text-sm"><span className="font-bold text-gray-900 dark:text-white w-40 shrink-0">{t}</span><span className="text-gray-600 dark:text-gray-300">{d}</span></div>)}</div>
      </Section>

      <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-4">UI preview · placeholder documents · decoding not yet wired</p>
    </div>
  )
}
