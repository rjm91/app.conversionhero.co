'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
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

function isAuthError(msg) {
  if (!msg) return false
  const m = msg.toLowerCase()
  return m.includes('401') || m.includes('unauthenticated') || m.includes('expired') ||
         m.includes('revoked') || m.includes('reconnect') || m.includes('[google ads oauth]') ||
         m.includes('invalid_grant') || m.includes('credentials')
}

const STATUS_OPTIONS = ['All', 'ENABLED', 'PAUSED']

export default function YouTubeAdsPage() {
  const { clientId } = useParams()
  const router       = useRouter()
  const searchParams = useSearchParams()

  const defaults = defaultDates()

  const saved      = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(`ytads_${clientId}`) || '{}') : {}
  const initStart  = searchParams.get('start')  || saved.start  || defaults.start
  const initEnd    = searchParams.get('end')    || saved.end    || defaults.end
  const initStatus = searchParams.get('status') || saved.status || 'All'

  const [startDate,    setStartDate]    = useState(initStart)
  const [endDate,      setEndDate]      = useState(initEnd)
  const [appliedStart, setAppliedStart] = useState(initStart)
  const [appliedEnd,   setAppliedEnd]   = useState(initEnd)

  const [campaigns,      setCampaigns]      = useState([])
  const [adGroups,       setAdGroups]       = useState([])
  const [ads,            setAds]            = useState([])
  const [chAttribution,  setChAttribution]  = useState({})   // campaign_id → count
  const [chAdGroupAttr,  setChAdGroupAttr]  = useState({})   // ad_group_id → count
  const [chAdAttr,       setChAdAttr]       = useState({})   // ad_id (utm_content) → count
  const [clientName,     setClientName]     = useState('')
  const [statusFilter,   setStatusFilter]   = useState(initStatus)
  const [loading,        setLoading]        = useState(true)
  const [syncing,        setSyncing]        = useState(false)
  const [syncedAt,       setSyncedAt]       = useState(null)
  const [error,          setError]          = useState(null)
  const [connected,      setConnected]      = useState(false)

  // Drill-down state: 'campaigns' → 'adGroups' → 'ads'
  const [view, setView]                     = useState('campaigns')
  const [selectedCampaign, setSelectedCampaign] = useState(null) // { campaign_id, campaign_name }
  const [selectedAdGroup, setSelectedAdGroup]   = useState(null) // { ad_group_id, ad_group_name }

  useEffect(() => {
    const oauthError = searchParams.get('google_ads_error')
    const oauthOk    = searchParams.get('google_ads_connected')
    if (oauthError) setError(decodeURIComponent(oauthError))
    if (oauthOk)    setConnected(true)
  }, [])

  function updateURL(start, end, status) {
    const params = new URLSearchParams({ start, end, status })
    router.replace(`?${params.toString()}`, { scroll: false })
    localStorage.setItem(`ytads_${clientId}`, JSON.stringify({ start, end, status }))
  }

  useEffect(() => {
    supabase
      .from('client')
      .select('client_name')
      .eq('client_id', clientId)
      .single()
      .then(({ data }) => { if (data) setClientName(data.client_name) })
  }, [clientId])

  const fetchAttribution = useCallback(async (start, end) => {
    const { data: leads } = await supabase
      .from('client_lead')
      .select('utm_campaign, utm_adgroup, utm_content')
      .eq('client_id', clientId)
      .neq('lead_status', 'in_progress')
      .gte('created_at', start)
      .lte('created_at', end + 'T23:59:59-12:00')

    const campaignMap = {}
    const adGroupMap = {}
    const adMap = {}
    if (leads?.length) {
      for (const row of leads) {
        const c = (row.utm_campaign || '').trim()
        const g = (row.utm_adgroup || '').trim()
        const a = (row.utm_content || '').trim()
        if (c) campaignMap[c] = (campaignMap[c] || 0) + 1
        if (g) adGroupMap[g] = (adGroupMap[g] || 0) + 1
        if (a) adMap[a] = (adMap[a] || 0) + 1
      }
    }
    setChAttribution(campaignMap)
    setChAdGroupAttr(adGroupMap)
    setChAdAttr(adMap)
  }, [clientId])

  const fetchCampaigns = useCallback(async (start, end) => {
    setLoading(true)
    setError(null)

    const [{ data, error: err }] = await Promise.all([
      supabase
        .from('client_yt_campaigns')
        .select('*')
        .eq('client_id', clientId)
        .ilike('campaign_name', `%${clientId}%`)
        .gte('date', start)
        .lte('date', end)
        .order('campaign_name', { ascending: true }),
      fetchAttribution(start, end),
    ])

    if (err) {
      setError('Failed to load campaigns.')
      setLoading(false)
      return
    }

    // Aggregate daily rows per campaign
    const map = {}
    for (const row of (data || [])) {
      const id = row.campaign_id
      if (!map[id]) {
        map[id] = {
          campaign_id: row.campaign_id, campaign_name: row.campaign_name,
          status: row.status, channel_type: row.channel_type, budget: row.budget,
          cost: 0, clicks: 0, conversions: 0, synced_at: row.synced_at,
        }
      }
      map[id].cost        += Number(row.cost)        || 0
      map[id].clicks      += Number(row.clicks)      || 0
      map[id].conversions += Number(row.conversions) || 0
      if (row.synced_at > map[id].synced_at) {
        map[id].budget    = row.budget
        map[id].status    = row.status
        map[id].synced_at = row.synced_at
      }
    }

    const aggregated = Object.values(map).map(c => ({
      ...c,
      cpc:                 c.clicks > 0      ? c.cost / c.clicks      : 0,
      cost_per_conversion: c.conversions > 0 ? c.cost / c.conversions : 0,
    }))

    setCampaigns(aggregated)
    if (aggregated.length > 0) setSyncedAt(aggregated[0].synced_at)
    setLoading(false)
  }, [clientId, fetchAttribution])

  // Fetch ad groups for a specific campaign
  const fetchAdGroups = useCallback(async (campaignId, start, end) => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('client_yt_ad_groups')
      .select('*')
      .eq('client_id', clientId)
      .eq('campaign_id', campaignId)
      .gte('date', start)
      .lte('date', end)
      .order('ad_group_name', { ascending: true })

    if (err) { setError('Failed to load ad groups.'); setLoading(false); return }

    const map = {}
    for (const row of (data || [])) {
      const id = row.ad_group_id
      if (!map[id]) {
        map[id] = {
          ad_group_id: row.ad_group_id, ad_group_name: row.ad_group_name,
          campaign_id: row.campaign_id, status: row.status,
          cost: 0, clicks: 0, conversions: 0, synced_at: row.synced_at,
        }
      }
      map[id].cost        += Number(row.cost)        || 0
      map[id].clicks      += Number(row.clicks)      || 0
      map[id].conversions += Number(row.conversions) || 0
      if (row.synced_at > map[id].synced_at) {
        map[id].status    = row.status
        map[id].synced_at = row.synced_at
      }
    }

    setAdGroups(Object.values(map).map(g => ({
      ...g,
      cpc:                 g.clicks > 0      ? g.cost / g.clicks      : 0,
      cost_per_conversion: g.conversions > 0 ? g.cost / g.conversions : 0,
    })))
    setLoading(false)
  }, [clientId])

  // Fetch ads for a specific ad group
  const fetchAds = useCallback(async (adGroupId, start, end) => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('client_yt_ads')
      .select('*')
      .eq('client_id', clientId)
      .eq('ad_group_id', adGroupId)
      .gte('date', start)
      .lte('date', end)
      .order('ad_name', { ascending: true })

    if (err) { setError('Failed to load ads.'); setLoading(false); return }

    const map = {}
    for (const row of (data || [])) {
      const id = row.ad_id
      if (!map[id]) {
        map[id] = {
          ad_id: row.ad_id, ad_name: row.ad_name, ad_type: row.ad_type,
          ad_group_id: row.ad_group_id, campaign_id: row.campaign_id, status: row.status,
          youtube_video_id: row.youtube_video_id || null,
          cost: 0, clicks: 0, conversions: 0, synced_at: row.synced_at,
        }
      }
      map[id].cost        += Number(row.cost)        || 0
      map[id].clicks      += Number(row.clicks)      || 0
      map[id].conversions += Number(row.conversions) || 0
      if (row.synced_at > map[id].synced_at) {
        map[id].status    = row.status
        map[id].synced_at = row.synced_at
      }
    }

    setAds(Object.values(map).map(a => ({
      ...a,
      cpc:                 a.clicks > 0      ? a.cost / a.clicks      : 0,
      cost_per_conversion: a.conversions > 0 ? a.cost / a.conversions : 0,
    })))
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    fetchCampaigns(appliedStart, appliedEnd)
  }, [fetchCampaigns, appliedStart, appliedEnd])

  function handleApply() {
    setAppliedStart(startDate)
    setAppliedEnd(endDate)
    updateURL(startDate, endDate, statusFilter)
    // Reset to campaigns view on date change
    setView('campaigns')
    setSelectedCampaign(null)
    setSelectedAdGroup(null)
  }

  function handleStatusChange(val) {
    setStatusFilter(val)
    updateURL(appliedStart, appliedEnd, val)
  }

  async function handleRefresh() {
    setSyncing(true)
    setError(null)
    setConnected(false)
    try {
      const res = await fetch(`/api/sync-youtube-ads?start=${appliedStart}&end=${appliedEnd}`)
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch {
        throw new Error(`Route returned HTTP ${res.status}. Response: ${text.slice(0, 200)}`)
      }
      if (!json.success) throw new Error(json.error || 'Sync failed')
      // Refresh current view
      if (view === 'ads' && selectedAdGroup) {
        await fetchAds(selectedAdGroup.ad_group_id, appliedStart, appliedEnd)
      } else if (view === 'adGroups' && selectedCampaign) {
        await fetchAdGroups(selectedCampaign.campaign_id, appliedStart, appliedEnd)
      } else {
        await fetchCampaigns(appliedStart, appliedEnd)
      }
    } catch (e) {
      setError('Sync failed: ' + e.message)
    }
    setSyncing(false)
  }

  function drillIntoCampaign(row) {
    setSelectedCampaign({ campaign_id: row.campaign_id, campaign_name: row.campaign_name })
    setView('adGroups')
    fetchAdGroups(row.campaign_id, appliedStart, appliedEnd)
  }

  function drillIntoAdGroup(row) {
    setSelectedAdGroup({ ad_group_id: row.ad_group_id, ad_group_name: row.ad_group_name })
    setView('ads')
    fetchAds(row.ad_group_id, appliedStart, appliedEnd)
  }

  function navToCampaigns() {
    setView('campaigns')
    setSelectedCampaign(null)
    setSelectedAdGroup(null)
  }

  function navToAdGroups() {
    setView('adGroups')
    setSelectedAdGroup(null)
    if (selectedCampaign) fetchAdGroups(selectedCampaign.campaign_id, appliedStart, appliedEnd)
  }

  function getChLeads(row) {
    if (view === 'ads') {
      return chAdAttr[row.ad_id] || 0
    }
    if (view === 'adGroups') {
      return chAdGroupAttr[row.ad_group_id] || 0
    }
    // Campaign level — match by campaign_id or fuzzy name match
    if (chAttribution[row.campaign_id]) return chAttribution[row.campaign_id]
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

  // Current data based on view
  const currentData = view === 'campaigns' ? campaigns : view === 'adGroups' ? adGroups : ads

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return currentData
    return currentData.filter(c => c.status === statusFilter)
  }, [currentData, statusFilter])

  const totals = useMemo(() => filtered.reduce((acc, row) => ({
    budget:   acc.budget  + (Number(row.budget)  || 0),
    cost:     acc.cost    + (Number(row.cost)    || 0),
    clicks:   acc.clicks  + (Number(row.clicks)  || 0),
    conv:     acc.conv    + (Number(row.conversions) || 0),
    chConv:   acc.chConv  + getChLeads(row),
  }), { budget: 0, cost: 0, clicks: 0, conv: 0, chConv: 0 }), [filtered, chAttribution, view])

  const totalCpc         = totals.clicks > 0 ? totals.cost / totals.clicks : 0
  const totalCostPerConv = totals.conv   > 0 ? totals.cost / totals.conv   : 0
  const totalChCost      = totals.chConv > 0 ? totals.cost / totals.chConv : 0

  const syncedLabel = syncing
    ? 'Syncing…'
    : syncedAt
      ? 'Last synced ' + new Date(syncedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Not yet synced'

  const reconnectUrl = `/api/google-ads/auth?return_to=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}`

  // Column config per view
  const nameLabel = view === 'campaigns' ? 'Campaign' : view === 'adGroups' ? 'Ad Group' : 'Ad'
  const showBudget = view === 'campaigns'

  function getRowName(row) {
    if (view === 'campaigns') return row.campaign_name
    if (view === 'adGroups') return row.ad_group_name
    return row.ad_name || `Ad ${row.ad_id}`
  }

  function getRowId(row) {
    if (view === 'campaigns') return row.campaign_id
    if (view === 'adGroups') return row.ad_group_id
    return row.ad_id
  }

  function handleRowClick(row) {
    if (view === 'campaigns') drillIntoCampaign(row)
    else if (view === 'adGroups') drillIntoAdGroup(row)
  }

  const isClickable = view !== 'ads'

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">YouTube Ads</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-0.5">{clientName}</p>
        </div>
      </div>

      {connected && (
        <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm px-4 py-3 rounded-lg">
          Google Ads reconnected successfully. Click <strong>Sync Now</strong> to pull the latest data.
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg">
          <p>{error}</p>
          {isAuthError(error) && (
            <a href={reconnectUrl} className="mt-2 inline-flex items-center gap-1.5 font-semibold underline underline-offset-2">
              Reconnect Google Ads →
            </a>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-[#171B33] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden">

        {/* Controls */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 dark:text-gray-500">{syncedLabel}</span>
            <button
              onClick={handleRefresh}
              disabled={syncing}
              className="text-sm font-medium border border-gray-200 dark:border-gray-600 px-4 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-gray-600 dark:text-gray-300 disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Start</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">End</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={handleApply}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition shadow-sm">
              Apply
            </button>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</label>
              <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700">
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Breadcrumb Navigation */}
        {view !== 'campaigns' && (
          <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm">
              <button onClick={navToCampaigns} className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Campaigns
              </button>
              {selectedCampaign && (
                <>
                  <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {view === 'adGroups' ? (
                    <span className="text-gray-700 dark:text-gray-200 font-medium truncate">{selectedCampaign.campaign_name}</span>
                  ) : (
                    <button onClick={navToAdGroups} className="text-blue-600 dark:text-blue-400 font-medium truncate max-w-[300px]">
                      {selectedCampaign.campaign_name}
                    </button>
                  )}
                </>
              )}
              {selectedAdGroup && view === 'ads' && (
                <>
                  <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-200 font-medium truncate">{selectedAdGroup.ad_group_name}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">
            Loading {nameLabel.toLowerCase()}s…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide min-w-[260px]">{nameLabel}</th>
                  {showBudget && (
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Budget / Day</th>
                  )}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Cost</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Clicks</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">CPC</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Conv.</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Cost / Conv.</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-blue-600 dark:text-[#4ad87d] bg-blue-50 dark:bg-transparent border-l border-blue-100 dark:border-white/10">
                    Conv. (CH Reported)
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-blue-600 dark:text-[#4ad87d] bg-blue-50 dark:bg-transparent">
                    Cost / Conv. (CH Reported)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((row, i) => {
                  const costPerConv = row.conversions > 0 ? Number(row.cost) / Number(row.conversions) : 0
                  const chLeads     = getChLeads(row)
                  const chCost      = chLeads > 0 ? Number(row.cost) / chLeads : 0
                  return (
                    <tr
                      key={i}
                      onClick={() => isClickable && handleRowClick(row)}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${isClickable ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.status === 'ENABLED' ? 'bg-green-500' : 'bg-gray-300'}`} />
                          {view === 'ads' && row.youtube_video_id && (
                            <img
                              src={`https://img.youtube.com/vi/${row.youtube_video_id}/default.jpg`}
                              alt=""
                              className="w-16 h-9 object-cover rounded flex-shrink-0"
                            />
                          )}
                          <div>
                            <span className={`font-medium ${isClickable ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-100'}`}>
                              {getRowName(row)}
                            </span>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 font-mono tracking-wide">
                              ID: {getRowId(row)}
                              {view === 'ads' && row.ad_type && <span className="ml-2 text-gray-400">({row.ad_type})</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      {showBudget && (
                        <td className="px-4 py-4 text-right text-gray-600 dark:text-gray-300">{fmtBudget(row.budget)}</td>
                      )}
                      <td className="px-4 py-4 text-right text-gray-600 dark:text-gray-300">{fmt$(row.cost)}</td>
                      <td className="px-4 py-4 text-right text-gray-600 dark:text-gray-300">{Number(row.clicks || 0).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-gray-600 dark:text-gray-300">{fmt$(row.cpc)}</td>
                      <td className="px-4 py-4 text-right text-gray-600 dark:text-gray-300">
                        {Number(row.conversions || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-600 dark:text-gray-300">{fmt$(costPerConv)}</td>
                      <td className="px-4 py-4 text-right font-semibold text-blue-700 dark:text-[#4ad87d] bg-blue-50 dark:bg-transparent border-l border-blue-100 dark:border-white/10">
                        {chLeads}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-blue-700 dark:text-[#4ad87d] bg-blue-50 dark:bg-transparent">
                        {chLeads > 0 ? fmt$(chCost) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {filtered.length > 0 && (
                <tfoot className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-white">Totals</td>
                    {showBudget && (
                      <td className="px-4 py-4 text-right font-bold text-gray-900 dark:text-white">{fmtBudget(totals.budget)}</td>
                    )}
                    <td className="px-4 py-4 text-right font-bold text-gray-900 dark:text-white">{fmt$(totals.cost)}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900 dark:text-white">{totals.clicks.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900 dark:text-white">{fmt$(totalCpc)}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900 dark:text-white">
                      {totals.conv.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900 dark:text-white">{fmt$(totalCostPerConv)}</td>
                    <td className="px-4 py-4 text-right font-bold text-blue-700 dark:text-[#4ad87d] bg-blue-50 dark:bg-transparent border-l border-blue-100 dark:border-white/10">{totals.chConv}</td>
                    <td className="px-4 py-4 text-right font-bold text-blue-700 dark:text-[#4ad87d] bg-blue-50 dark:bg-transparent">
                      {totals.chConv > 0 ? fmt$(totalChCost) : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm font-medium text-gray-400 dark:text-gray-500">No {nameLabel.toLowerCase()} data for this date range.</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Click <strong>Sync Now</strong> to pull data from Google Ads.</p>
          </div>
        )}
      </div>
    </div>
  )
}
