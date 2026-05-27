'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/* ─── Static pipeline data (replace with Supabase queries later) ─── */
const PIPELINES = {
  clients: {
    title: 'Active Clients',
    count: 4,
    columns: ['Submitted','Status','Company Name','Industry','Location','Cash Collected','Campaigns','Total Ad Spend','Leads','Cost Per Lead','Completed Appts','Cost Per Appt','Customers','CAC',''],
    summaryMap: { 5: { value: '$333,800', color: 'green' }, 6: { value: '14' }, 7: { value: '$12,400' }, 8: { value: '247' }, 9: { value: '$50.20', dim: true }, 10: { value: '102' }, 11: { value: '$121.57', dim: true }, 12: { value: '36' }, 13: { value: '$344.44', dim: true } },
    rows: [
      ['3/10/2026', { badge: 'Active', color: 'green' }, { client: 'Comfort Pro HVAC', icon: '❄️', iconBg: 'rgba(34,197,94,0.15)' }, 'HVAC', 'Nashville, TN', { value: '$124,500', color: 'green' }, '5', '$4,200', { value: '87', bold: true }, '$48.28', '34', '$123.53', { value: '12', bold: true }, '$350.00', { link: 'View Dashboard →' }],
      ['1/15/2026', { badge: 'Active', color: 'green' }, { client: 'Pederson Funeral Home', icon: '⚶', iconBg: 'rgba(96,165,250,0.15)' }, 'Funeral', 'Rockford, MI', { value: '$89,200', color: 'green' }, '3', '$2,800', { value: '42', bold: true }, '$66.67', '18', '$155.56', { value: '7', bold: true }, '$400.00', { link: 'View Dashboard →' }],
      ['4/02/2026', { badge: 'Active', color: 'green' }, { client: 'ShieldTech', icon: '💻', iconBg: 'rgba(167,139,250,0.15)' }, 'E-comm', 'Phoenix, AZ', { value: '$67,800', color: 'green' }, '4', '$3,100', { value: '63', bold: true }, '$49.21', '28', '$110.71', { value: '9', bold: true }, '$344.44', { link: 'View Dashboard →' }],
      ['2/20/2026', { badge: 'Active', color: 'green' }, { client: 'Synergy Home', icon: '❄️', iconBg: 'rgba(34,197,94,0.15)' }, 'HVAC', 'Lexington, KY', { value: '$52,300', color: 'green' }, '2', '$2,300', { value: '55', bold: true }, '$41.82', '22', '$104.55', { value: '8', bold: true }, '$287.50', { link: 'View Dashboard →' }],
    ],
  },
  onboarding: {
    title: 'Onboarding',
    count: 2,
    columns: ['Submitted','Status','Company Name','Industry','Location','Contact','Deal Value','Service','Started','Next Milestone',''],
    summaryMap: { 6: { value: '$4,800/mo', color: 'green' } },
    rows: [
      ['5/24/2026', { stage: 'Account Setup', color: 'purple' }, 'BrightSmile Dental', 'Dental', 'Portland, OR', 'Dr. Amy Lin', { value: '$2,400/mo', bold: true }, 'Google Ads + Funnels', 'May 24', 'Ad account access', { link: 'View →' }],
      ['5/18/2026', { stage: 'Campaign Build', color: 'blue' }, 'Summit HVAC', 'HVAC', 'Atlanta, GA', 'David Chen', { value: '$2,400/mo', bold: true }, 'Google Ads', 'May 18', 'Launch campaigns', { link: 'View →' }],
    ],
  },
  sales: {
    title: 'Sales',
    count: 4,
    columns: ['Submitted','Lead Status','Appt Status','Sale Status','Company Name','Industry','Location','Contact','Email','Phone','Funnel','Deal Value','Service',''],
    summaryMap: { 11: { value: '$11,200/mo', color: 'green' } },
    rows: [
      ['5/18/2026', { stage: 'Qualified', color: 'purple' }, { stage: 'Appt Complete', color: 'green' }, { stage: 'Proposal Sent', color: 'blue' }, 'GreenScape Lawn', 'Lawn Care', 'Austin, TX', 'Mike Torres', 'mike@greenscape.com', '5129874532', '—', { value: '$3,200/mo', bold: true }, 'Google Ads + SEO', { link: 'View →' }],
      ['5/14/2026', { stage: 'Qualified', color: 'purple' }, { stage: 'Appt Complete', color: 'green' }, { stage: 'Negotiation', color: 'yellow' }, 'Elite Plumbing Co', 'Plumbing', 'Orlando, FL', 'Donna Park', 'donna@eliteplumb.com', '4073216789', '—', { value: '$2,800/mo', bold: true }, 'Google Ads', { link: 'View →' }],
      ['5/22/2026', { stage: 'Qualified', color: 'purple' }, { stage: 'Appt Complete', color: 'green' }, { stage: 'Proposal Sent', color: 'blue' }, 'FastTrack Auto', 'Auto Repair', 'Houston, TX', 'Carlos Reyes', 'carlos@fasttrack.com', '7135559012', '—', { value: '$2,600/mo', bold: true }, 'Google Ads + Funnels', { link: 'View →' }],
      ['5/20/2026', { stage: 'Contacted', color: 'blue' }, { stage: 'Appt Set', color: 'blue' }, '—', 'Peak Roofing', 'Roofing', 'Raleigh, NC', 'Jason Miles', 'jason@peakroof.com', '9195553847', '—', { value: '$2,600/mo', bold: true }, 'Full Service', { link: 'View →' }],
    ],
  },
  appointments: {
    title: 'Appointments',
    count: 5,
    columns: ['Submitted','Lead Status','Appt Status','Sale Status','Company Name','Industry','Location','Contact','Email','Phone','Funnel','Type','Date & Time',''],
    summaryMap: { 11: { value: '2 Complete, 3 Upcoming' } },
    rows: [
      ['5/18/2026', { stage: 'Qualified', color: 'purple' }, { stage: 'Appt Complete', color: 'green' }, { stage: 'Proposal Sent', color: 'blue' }, 'GreenScape Lawn', 'Lawn Care', 'Austin, TX', 'Mike Torres', 'mike@greenscape.com', '5129874532', '—', 'Discovery Call', 'May 23, 10:00 AM', { link: 'View →' }],
      ['5/14/2026', { stage: 'Qualified', color: 'purple' }, { stage: 'Appt Complete', color: 'green' }, { stage: 'Negotiation', color: 'yellow' }, 'Elite Plumbing Co', 'Plumbing', 'Orlando, FL', 'Donna Park', 'donna@eliteplumb.com', '4073216789', '—', 'Proposal Review', 'May 24, 2:00 PM', { link: 'View →' }],
      ['5/20/2026', { stage: 'Contacted', color: 'blue' }, { stage: 'Appt Set', color: 'blue' }, '—', 'BrightSmile Dental', 'Dental', 'Portland, OR', 'Dr. Amy Lin', 'amy@brightsmile.com', '5035558812', '—', 'Onboarding Kickoff', 'May 27, 11:00 AM', { link: 'View →' }],
      ['5/22/2026', { stage: 'Contacted', color: 'blue' }, { stage: 'Appt Set', color: 'blue' }, '—', 'FastTrack Auto', 'Auto Repair', 'Houston, TX', 'Carlos Reyes', 'carlos@fasttrack.com', '7135559012', '—', 'Discovery Call', 'May 28, 3:00 PM', { link: 'View →' }],
      ['5/20/2026', { stage: 'New', color: 'green' }, { stage: 'Appt Set', color: 'blue' }, '—', 'Peak Roofing', 'Roofing', 'Raleigh, NC', 'Jason Miles', 'jason@peakroof.com', '9195553847', '—', 'Follow Up', 'May 29, 10:30 AM', { link: 'View →' }],
    ],
  },
  leads: {
    title: 'Leads',
    count: 8,
    columns: ['Submitted','Lead Status','Appt Status','Sale Status','Company Name','Industry','Location','Contact','Email','Phone','Funnel',''],
    summaryMap: { 10: { value: '3 New, 1 Contacted, 1 Qualified' } },
    rows: [
      ['5/26/2026', { stage: 'New', color: 'green' }, '—', '—', 'FastTrack Auto', 'Auto Repair', 'Houston, TX', 'Carlos Reyes', 'carlos@fasttrack.com', '7135559012', '—', { link: 'View →' }],
      ['5/26/2026', { stage: 'New', color: 'green' }, '—', '—', 'Peak Roofing', 'Roofing', 'Raleigh, NC', 'Jason Miles', 'jason@peakroof.com', '9195553847', '—', { link: 'View →' }],
      ['5/25/2026', { stage: 'New', color: 'green' }, '—', '—', 'Zenith Wellness', 'Wellness', 'San Diego, CA', 'Rachel Kim', 'rachel@zenithwell.com', '6195554201', '—', { link: 'View →' }],
      ['5/23/2026', { stage: 'Contacted', color: 'blue' }, { stage: 'Appt Set', color: 'blue' }, '—', 'Apex Electric', 'Electrical', 'Memphis, TN', 'Tom Bradley', 'tom@apexelec.com', '9015557643', '—', { link: 'View →' }],
      ['5/21/2026', { stage: 'Qualified', color: 'purple' }, { stage: 'Appt Complete', color: 'green' }, '—', 'Prestige Homes', 'Real Estate', 'Scottsdale, AZ', 'Sandra Wells', 'sandra@prestige.com', '4805551290', '—', { link: 'View →' }],
    ],
  },
  prospects: {
    title: 'Prospects',
    count: 12,
    columns: ['Submitted','Status','Company Name','Industry','Location','Contact','Last Activity',''],
    summaryMap: { 6: { value: '2 Replied, 2 Outreach, 1 Research' } },
    rows: [
      ['5/25/2026', { stage: 'Replied', color: 'green' }, 'Summit HVAC', 'HVAC', 'Atlanta, GA', 'David Chen', 'Today — wants to chat', { link: 'View →' }],
      ['5/24/2026', { stage: 'Replied', color: 'green' }, 'Keystone Legal', 'Legal', 'Dallas, TX', 'Maria Gonzalez', 'Yesterday — interested', { link: 'View →' }],
      ['5/24/2026', { stage: 'Outreach Sent', color: 'blue' }, 'Riverside Dental', 'Dental', 'Tampa, FL', 'Dr. Patel', 'May 24 — email sent', { link: 'View →' }],
      ['5/23/2026', { stage: 'Outreach Sent', color: 'blue' }, 'ProBuild Contractors', 'Construction', 'Denver, CO', 'Steve Rawlings', 'May 23 — LinkedIn msg', { link: 'View →' }],
      ['5/22/2026', { stage: 'Researching', color: 'gray' }, 'ClearView Windows', 'Home Services', 'Charlotte, NC', '—', 'Identified May 22', { link: 'View →' }],
    ],
  },
}

const PIPELINE_ORDER = ['clients', 'onboarding', 'sales', 'appointments', 'leads', 'prospects']

/* ─── Stage badge color map ─── */
const STAGE_COLORS = {
  green: 'bg-emerald-500/15 text-emerald-400',
  blue: 'bg-blue-500/15 text-blue-400',
  purple: 'bg-violet-500/15 text-violet-400',
  yellow: 'bg-amber-500/15 text-amber-400',
  gray: 'bg-gray-500/15 text-gray-400',
}

const SUMMARY_COLORS = {
  green: 'text-emerald-400',
  blue: 'text-blue-400',
}

/* ─── Cell renderer ─── */
function CellContent({ cell }) {
  if (cell === null || cell === undefined) return null
  if (typeof cell === 'string') return cell

  if (cell.badge) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold ${STAGE_COLORS[cell.color] || STAGE_COLORS.gray}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cell.color === 'green' ? 'bg-emerald-400' : cell.color === 'yellow' ? 'bg-amber-400' : 'bg-blue-400'}`} />
        {cell.badge}
      </span>
    )
  }

  if (cell.stage) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${STAGE_COLORS[cell.color] || STAGE_COLORS.gray}`}>
        {cell.stage}
      </span>
    )
  }

  if (cell.client) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: cell.iconBg }}>
          {cell.icon}
        </div>
        <span className="font-semibold text-white">{cell.client}</span>
      </div>
    )
  }

  if (cell.value) {
    const colorCls = cell.color === 'green' ? 'text-emerald-400' : ''
    const boldCls = cell.bold || cell.color ? 'font-semibold' : ''
    return <span className={`${colorCls} ${boldCls}`}>{cell.value}</span>
  }

  if (cell.link) {
    return <span className="text-blue-400 font-medium text-[13px] whitespace-nowrap cursor-pointer hover:text-blue-300">{cell.link}</span>
  }

  return null
}

/* ─── Column Resize Hook ─── */
function useColumnResize(tableRef, isCollapsed) {
  const initialized = useRef(false)

  useEffect(() => {
    if (isCollapsed || initialized.current) return
    const table = tableRef.current
    if (!table) return

    const colHeaderRow = table.querySelector('.col-headers')
    if (!colHeaderRow) return

    const ths = Array.from(colHeaderRow.querySelectorAll('th'))
    if (!ths.length) return

    // Capture natural widths
    const widths = ths.map(th => th.getBoundingClientRect().width)

    // Create colgroup
    const existing = table.querySelector('colgroup')
    if (existing) existing.remove()

    const colgroup = document.createElement('colgroup')
    widths.forEach(w => {
      const col = document.createElement('col')
      col.style.width = w + 'px'
      colgroup.appendChild(col)
    })
    table.insertBefore(colgroup, table.firstChild)

    ths.forEach(th => { th.style.width = ''; th.style.minWidth = '' })
    table.style.tableLayout = 'fixed'
    table.style.width = widths.reduce((a, b) => a + b, 0) + 'px'

    const cols = Array.from(colgroup.querySelectorAll('col'))

    ths.forEach((th, i) => {
      if (i === ths.length - 1) return
      // Don't add duplicate handles
      if (th.querySelector('.col-resize-handle')) return

      const handle = document.createElement('div')
      handle.className = 'col-resize-handle'
      handle.style.cssText = 'position:absolute;right:0;top:25%;bottom:25%;width:7px;cursor:col-resize;z-index:10;border-right:1px solid rgba(255,255,255,0.15);'
      th.style.position = 'relative'
      th.appendChild(handle)

      handle.addEventListener('mousedown', function (e) {
        e.preventDefault()
        e.stopPropagation()
        const startX = e.pageX
        const startColW = parseFloat(cols[i].style.width)
        const startTableW = parseFloat(table.style.width)
        handle.style.borderRightColor = 'rgba(59,130,246,0.7)'
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        function onMove(ev) {
          const dx = ev.pageX - startX
          const newW = Math.max(40, startColW + dx)
          const delta = newW - startColW
          cols[i].style.width = newW + 'px'
          table.style.width = (startTableW + delta) + 'px'
        }
        function onUp() {
          handle.style.borderRightColor = 'rgba(255,255,255,0.15)'
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      })
    })

    initialized.current = true
  }, [isCollapsed, tableRef])
}

/* ─── Accordion Pipeline Component ─── */
function PipelineAccordion({ id, pipeline, defaultCollapsed = true }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const tableRef = useRef(null)

  useColumnResize(tableRef, collapsed)

  const toggle = useCallback(() => setCollapsed(c => !c), [])

  const { title, count, columns, summaryMap, rows } = pipeline
  const titleColspan = 5

  return (
    <div className="mb-3 border border-white/[0.06] rounded-xl bg-[#1a1f36] overflow-hidden">
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
        <table ref={tableRef} className="w-full border-collapse" style={{ minWidth: columns.length > 10 ? '1200px' : undefined }}>
          <thead>
            {/* Header row with title + summary values */}
            <tr
              className="cursor-pointer select-none group"
              onClick={toggle}
            >
              <td
                colSpan={Math.min(titleColspan, columns.length)}
                className="py-3.5 px-5 border-b border-white/[0.06] whitespace-nowrap"
              >
                <span className={`inline-block text-xs text-gray-500 transition-transform duration-200 mr-2 ${collapsed ? '-rotate-90' : ''}`}>
                  ▾
                </span>
                <span className="text-[15px] font-bold text-white">{title}</span>
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 ml-2 rounded-full bg-white/[0.08] text-xs font-bold text-gray-400 align-middle">
                  {count}
                </span>
              </td>
              {columns.slice(titleColspan).map((_, i) => {
                const colIdx = titleColspan + i
                const summary = summaryMap[colIdx]
                if (!summary) return <td key={colIdx} className="py-3.5 px-4 border-b border-white/[0.06]" />
                const colorCls = summary.color ? (SUMMARY_COLORS[summary.color] || 'text-gray-300') : (summary.dim ? 'text-gray-500' : 'text-gray-200')
                return (
                  <td key={colIdx} className={`py-3.5 px-4 border-b border-white/[0.06] text-[13px] font-bold whitespace-nowrap ${colorCls}`}>
                    {summary.value}
                  </td>
                )
              })}
            </tr>

            {/* Column headers — hidden when collapsed */}
            {!collapsed && (
              <tr className="col-headers">
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className="text-left py-3 px-4 text-[11px] text-gray-500 uppercase tracking-wide font-semibold border-b border-white/[0.06] bg-white/[0.02] relative"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            )}
          </thead>

          {/* Data rows — hidden when collapsed */}
          {!collapsed && (
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-white/[0.02] transition-colors">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="py-3.5 px-4 text-[13px] text-gray-400 border-b border-white/[0.04] overflow-hidden text-ellipsis"
                    >
                      <CellContent cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  )
}

/* ─── Main Page ─── */
export default function ControlPage() {
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('ca_user')
    if (!stored) router.push('/login')
  }, [router])

  return (
    <div className="p-8">
      <div className="mb-1">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-blue-600/10 text-blue-400 mb-3">
          Agency Mode
        </span>
        <h1 className="text-2xl font-bold text-white">Agency Control Center</h1>
        <p className="text-gray-500 text-sm mt-1">Your agency pipeline at a glance. Click any section to expand.</p>
      </div>

      <div className="mt-6">
        {PIPELINE_ORDER.map((key, i) => (
          <PipelineAccordion
            key={key}
            id={key}
            pipeline={PIPELINES[key]}
            defaultCollapsed={i !== 0}
          />
        ))}
      </div>
    </div>
  )
}
