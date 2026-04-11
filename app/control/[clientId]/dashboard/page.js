'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { dashboardData, clients } from '../../../lib/mockData'
import MetricCard from '../../../components/MetricCard'

function fmt$(n) { return '$' + Math.round(n).toLocaleString() }
function fmtPct(n) { return Math.round(n * 10) / 10 + '%' }

export default function DashboardPage() {
  const { clientId } = useParams()
  const client = clients.find(c => c.id === clientId)
  const data = dashboardData[clientId] || dashboardData['client001']

  const [startDate, setStartDate] = useState('2026-04-01')
  const [endDate, setEndDate] = useState('2026-04-09')

  if (!data) return <div className="p-8 text-gray-400">No data found for this client.</div>

  const costPerSet = data.appointmentsSet ? fmt$(data.adSpend / data.appointmentsSet) : '$0'
  const costPerAppt = data.appointmentsCompleted ? fmt$(data.adSpend / data.appointmentsCompleted) : '$0'

  const metrics = [
    { label: 'Ad Spend',       value: fmt$(data.adSpend),                                     color: 'text-blue-600' },
    { label: 'Leads',          value: data.leads,                                              color: 'text-orange-500' },
    { label: 'Cost / Lead',    value: fmt$(data.costPerLead),                                  color: 'text-orange-500' },
    { label: 'Appt Set',       value: data.appointmentsSet,                                    color: 'text-purple-600' },
    { label: 'Cost / Set',     value: costPerSet,                                              color: 'text-purple-600' },
    { label: 'Appt Set Rate',  value: fmtPct(data.apptSetRate),                                color: 'text-purple-600' },
    { label: 'Appointments',   value: data.appointmentsCompleted,                              color: 'text-indigo-500' },
    { label: 'Cost / Appt',    value: costPerAppt,                                             color: 'text-teal-500' },
    { label: 'Appt Run Rate',  value: fmtPct(data.apptCompletedRate),                          color: 'text-teal-500' },
    { label: 'Customers',      value: data.sales,                                              color: 'text-green-600' },
    { label: 'CAC',            value: fmt$(data.costPerSale),                                  color: 'text-green-600' },
    { label: 'Close Rate',     value: fmtPct(data.closeRate),                                  color: 'text-green-600' },
  ]

  const maxLeads = Math.max(...data.chartLeads)

  return (
    <div className="p-8">

      {/* Page Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">{client?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm shadow-sm">
            <span className="text-gray-400 text-xs">From</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-gray-700 outline-none text-sm"
            />
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm shadow-sm">
            <span className="text-gray-400 text-xs">To</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="text-gray-700 outline-none text-sm"
            />
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm">
            Apply
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {metrics.map((m, i) => (
          <MetricCard key={i} label={m.label} value={m.value} color={m.color} />
        ))}
      </div>

      {/* Bar Chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Leads Over Time</h2>
            <p className="text-xs text-gray-400 mt-0.5">Last 7 months</p>
          </div>
        </div>
        <div className="flex items-end gap-3" style={{ height: '140px' }}>
          {data.chartLabels.map((label, i) => {
            const pct = Math.round((data.chartLeads[i] / maxLeads) * 100)
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <span className="text-xs font-semibold text-gray-500">{data.chartLeads[i]}</span>
                <div
                  className="w-full bg-blue-500 rounded-t-lg transition-all hover:bg-blue-600"
                  style={{ height: `${pct}%` }}
                />
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
