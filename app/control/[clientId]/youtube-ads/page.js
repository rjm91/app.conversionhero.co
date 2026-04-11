'use client'

import { useParams } from 'next/navigation'
import { useState, useMemo } from 'react'
import { youtubeData, clients } from '../../../lib/mockData'

function fmt$(n) {
  if (!n || n === 0) return '$0.00'
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtBudget(n) {
  return '$' + n.toLocaleString()
}

const STATUS_OPTIONS = ['All', 'Enabled', 'Paused']

export default function YouTubeAdsPage() {
  const { clientId } = useParams()
  const client = clients.find(c => c.id === clientId)
  const data = youtubeData[clientId] || youtubeData['client001']

  const [startDate, setStartDate] = useState('2026-03-01')
  const [endDate, setEndDate] = useState('2026-04-04')
  const [statusFilter, setStatusFilter] = useState('Enabled')
  const [refreshed, setRefreshed] = useState('just now')

  function handleRefresh() {
    setRefreshed('just now')
  }

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return data.campaigns
    return data.campaigns.filter(c => c.status === statusFilter.toLowerCase())
  }, [data, statusFilter])

  // Totals row
  const totals = useMemo(() => filtered.reduce((acc, row) => ({
    budget:       acc.budget       + row.budget,
    cost:         acc.cost         + row.cost,
    clicks:       acc.clicks       + row.clicks,
    conv:         acc.conv         + row.conv,
    chConv:       acc.chConv       + row.chConv,
  }), { budget: 0, cost: 0, clicks: 0, conv: 0, chConv: 0 }), [filtered])

  const totalCpc         = totals.clicks > 0 ? totals.cost / totals.clicks : 0
  const totalCostPerConv = totals.conv   > 0 ? totals.cost / totals.conv   : 0
  const totalChCost      = totals.chConv > 0 ? totals.cost / totals.chConv : 0

  return (
    <div className="p-8">

      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">YouTube Ads</h1>
          <p className="text-gray-400 text-sm mt-0.5">{client?.name}</p>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Table Controls */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-wrap gap-4">

          {/* Refresh */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Refreshed {refreshed}</span>
            <button
              onClick={handleRefresh}
              className="text-sm font-medium border border-gray-200 px-4 py-1.5 rounded-lg hover:bg-gray-50 transition text-gray-600"
            >
              Refresh
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[280px]">
                  Campaign
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  Budget
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  Cost
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  Clicks
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  CPC
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  Conv.
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  Cost / Conv.
                </th>
                {/* CH Attribution columns */}
                <th className="text-right px-4 py-3 text-xs font-semibold text-blue-600 uppercase tracking-wide whitespace-nowrap bg-blue-50 border-l border-blue-100">
                  Conv. (CH Reported)
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-blue-600 uppercase tracking-wide whitespace-nowrap bg-blue-50">
                  Cost / Conv. (CH Reported)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        row.status === 'enabled' ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                      <span className="text-gray-800 font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-gray-600">{fmtBudget(row.budget)}</td>
                  <td className="px-4 py-4 text-right text-gray-600">{fmt$(row.cost)}</td>
                  <td className="px-4 py-4 text-right text-gray-600">{row.clicks.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right text-gray-600">{fmt$(row.cpc)}</td>
                  <td className="px-4 py-4 text-right text-gray-600">{row.conv}</td>
                  <td className="px-4 py-4 text-right text-gray-600">{fmt$(row.costPerConv)}</td>
                  {/* CH columns */}
                  <td className="px-4 py-4 text-right font-semibold text-blue-700 bg-blue-50 border-l border-blue-100">
                    {row.chConv}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-blue-700 bg-blue-50">
                    {row.chCostPerConv > 0 ? fmt$(row.chCostPerConv) : '$0.00'}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Totals Row */}
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td className="px-6 py-4 text-sm font-bold text-gray-900">Totals</td>
                <td className="px-4 py-4 text-right font-bold text-gray-900">{fmtBudget(totals.budget)}</td>
                <td className="px-4 py-4 text-right font-bold text-gray-900">{fmt$(totals.cost)}</td>
                <td className="px-4 py-4 text-right font-bold text-gray-900">{totals.clicks.toLocaleString()}</td>
                <td className="px-4 py-4 text-right font-bold text-gray-900">{fmt$(totalCpc)}</td>
                <td className="px-4 py-4 text-right font-bold text-gray-900">{totals.conv}</td>
                <td className="px-4 py-4 text-right font-bold text-gray-900">{fmt$(totalCostPerConv)}</td>
                <td className="px-4 py-4 text-right font-bold text-blue-700 bg-blue-50 border-l border-blue-100">
                  {totals.chConv}
                </td>
                <td className="px-4 py-4 text-right font-bold text-blue-700 bg-blue-50">
                  {fmt$(totalChCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No campaigns match the selected status filter.</p>
          </div>
        )}
      </div>
    </div>
  )
}
