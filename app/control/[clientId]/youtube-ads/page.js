'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../../../lib/supabase'

function fmt$(n) {
  if (!n || n === 0) return '$0.00'
  return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtBudget(n) {
  if (!n || n === 0) return '$0'
  return '$' + Math.round(Number(n)).toLocaleString()
}

function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    start: start.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
  }
}

const STATUS_OPTIONS = ['All', 'ENABLED', 'PAUSED']

export default function YouTubeAdsPage() {
  const { clientId } = useParams()

  const defaults = defaultDates()
  const [startDate,    setStartDate]    = useState(defaults.start)
  const [endDate,      setEndDate]      = useState(defaults.end)
  const [appliedStart, setAppliedStart] = useState(defaults.start)
  const [appliedEnd,   setAppliedEnd]   = useState(defaults.end)

  const [campaigns,      setCampaigns]      = useState([])
  const [chAttribution,  setChAttribution]  = useState({}) // utm_campaign_value → lead count
  const [clientName,     setClientName]     = useState('')
  const [statusFilter,   setStatusFilter]   = useState('All')
  const [loading,        setLoading]        = useState(true)
  const [syncing,        setSyncing]        = useState(false)
  const [syncedAt,       setSyncedAt]       = useState(null)
  const [error,          setError]          = useState(null)

  // Fetch client name
  useEffect(() => {
    supabase
      .from('client')
      .select('client_name')
      .eq('client_id', clientId)
      .single()
      .then(({ data }) => { if (data) setClientName(data.client_name) })
  }, [clientId])

  // Fetch CH attribution: leads grouped by utm_campaign within date range
  const fetchAttribution = useCallback(async (start, end) => {
    // utm_campaign is a direct column on client_lead
    const { data: leads } = await supabase
      .from('client_lead')
      .select('utm_campaign')
      .eq('client_id', clientId)
      .gte('created_at', start)
      .lte('created_at', end + 'T23:59:59')
      .not('utm_campaign', 'is', null)

    // Build map of utm_campaign_value → count
    const map = {}
    if (leads?.length) {
      for (const row of leads) {
        const v = (row.utm_campaign || '').trim()
        if (v) map[v] = (map[v] || 0) + 1
      }
    }

    setChAttribution(map)
  }, [clientId])

  // Fetch campaigns from Supabase
  const fetchCampaigns = useCallback(async (start, end) => {
    setLoading(true)
    setError(null)

    const [{ data, error: err }] = await Promise.all([
      supabase
        .from('client_yt_campaigns')
        .select('*')
        .eq('client_id', clientId)
        .eq('date_range_start', start)
        .eq('date_range_end', end)
        .order('campaign_name', { ascending: true }),
      fetchAttribution(start, end),
    ])

    if (err) {
      setError('Failed to load campaigns.')
    } else {
      setCampaigns(data || [])
      if (data?.length > 0) setSyncedAt(data[0].synced_at)
    }
    setLoading(false)
  }, [clientId, fetchAttribution])

  useEffect(() => {
    fetchCampaigns(appliedStart, appliedEnd)
  }, [fetchCampaigns, appliedStart, appliedEnd])

  function handleApply() {
    setAppliedStart(startDate)
    setAppliedEnd(endDate)
  }

  async function handleRefresh() {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch(`/api/sync-youtube-ads?start=${appliedStart}&end=${appliedEnd}`)
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch {
        throw new Error(`Route returned HTTP ${res.status}. Response: ${text.slice(0, 200)}`)
      }
      if (!json.success) throw new Error(json.error || 'Sync failed')
      await fetchCampaigns(appliedStart, appliedEnd)
    } catch (e) {
      setError('Sync failed: ' + e.message)
    }
    setSyncing(false)
  }

  // Match a campaign row to a CH lead count
  // Tries: exact campaign_id match → partial name match
  function getChLeads(row) {
    // Try exact campaign_id match (utm_campaign set to numeric ID)
    if (chAttribution[row.campaign_id]) return chAttribution[row.campaign_id]

    // Try utm_campaign value that appears inside the campaign name
    for (const [utmVal, count] of Object.entries(chAttribution)) {
      if (
        row.campaign_name?.toLowerCase().includes(utmVal.toLowerCase()) ||
        utmVal.toLowerCase().includes(row.campaign_id)
      ) {
        return count
      }
    }
    return 0
  }

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return campaigns
    return campaigns.filter(c => c.status === statusFilter)
  }, [campaigns, statusFilter])

  const totals = useMemo(() => filtered.reduce((acc, row) => ({
    budget:   acc.budget  + (Number(row.budget)  || 0),
    cost:     acc.cost    + (Number(row.cost)    || 0),
    clicks:   acc.clicks  + (Number(row.clicks)  || 0),
    conv:     acc.conv    + (Number(row.conversions) || 0),
    chConv:   acc.chConv  + getChLeads(row),
  }), { budget: 0, cost: 0, clicks: 0, conv: 0, chConv: 0 }), [filtered, chAttribution])

  const totalCpc         = totals.clicks > 0 ? totals.cost / totals.clicks : 0
  const totalCostPerConv = totals.conv   > 0 ? totals.cost / totals.conv   : 0
  const totalChCost      = totals.chConv > 0 ? totals.cost / totals.chConv : 0

  const syncedLabel = syncing
    ? 'Syncing…'
    : syncedAt
      ? 'Last synced ' + new Date(syncedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Not yet synced'

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">YouTube Ads</h1>
          <p className="text-gray-400 text-sm mt-0.5">{clientName}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Controls */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{syncedLabel}</span>
            <button
              onClick={handleRefresh}
              disabled={syncing}
              className="text-sm font-medium border border-gray-200 px-4 py-1.5 rounded-lg hover:bg-gray-50 transition text-gray-600 disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Start</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">End</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={handleApply}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition shadow-sm">
              Apply
            </button>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading campaigns…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[260px]">Campaign</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Budget / Day</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Cost</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Clicks</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">CPC</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Conv.</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Cost / Conv.</th>
                  {/* CH Attribution */}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-blue-600 uppercase tracking-wide whitespace-nowrap bg-blue-50 border-l border-blue-100">
                    Conv. (CH Reported)
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-blue-600 uppercase tracking-wide whitespace-nowrap bg-blue-50">
                    Cost / Conv. (CH Reported)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((row, i) => {
                  const costPerConv = row.conversions > 0 ? Number(row.cost) / Number(row.conversions) : 0
                  const chLeads     = getChLeads(row)
                  const chCost      = chLeads > 0 ? Number(row.cost) / chLeads : 0
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.status === 'ENABLED' ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span className="text-gray-800 font-medium">{row.campaign_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right text-gray-600">{fmtBudget(row.budget)}</td>
                      <td className="px-4 py-4 text-right text-gray-600">{fmt$(row.cost)}</td>
                      <td className="px-4 py-4 text-right text-gray-600">{Number(row.clicks || 0).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-gray-600">{fmt$(row.cpc)}</td>
                      <td className="px-4 py-4 text-right text-gray-600">
                        {Number(row.conversions || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-600">{fmt$(costPerConv)}</td>
                      {/* CH columns */}
                      <td className="px-4 py-4 text-right font-semibold text-blue-700 bg-blue-50 border-l border-blue-100">
                        {chLeads}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-blue-700 bg-blue-50">
                        {chLeads > 0 ? fmt$(chCost) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {filtered.length > 0 && (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">Totals</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900">{fmtBudget(totals.budget)}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900">{fmt$(totals.cost)}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900">{totals.clicks.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900">{fmt$(totalCpc)}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900">
                      {totals.conv.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900">{fmt$(totalCostPerConv)}</td>
                    <td className="px-4 py-4 text-right font-bold text-blue-700 bg-blue-50 border-l border-blue-100">{totals.chConv}</td>
                    <td className="px-4 py-4 text-right font-bold text-blue-700 bg-blue-50">
                      {totals.chConv > 0 ? fmt$(totalChCost) : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm font-medium text-gray-400">No campaign data for this date range.</p>
            <p className="text-xs text-gray-300 mt-1">Click <strong>Sync Now</strong> to pull data from Google Ads.</p>
          </div>
        )}
      </div>
    </div>
  )
}
