import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function userCanAccessClient(user, clientId) {
  const db = adminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()
  if (!profile) return false
  if (profile.role === 'agency_admin' || profile.role === 'agency_standard') return true
  return profile.client_id === clientId
}

const SCRIPT_FIELDS = {
  type: 'object',
  properties: {
    vscript_title:           { type: 'string' },
    script_body:             { type: 'string' },
    vscript_status:          { type: 'string', description: 'e.g. draft, in_review, approved' },
    vscript_approval_status: { type: 'string', description: 'e.g. pending, approved, rejected' },
    vscript_type:            { type: 'string', description: 'e.g. Short Form, Long Form' },
    vscript_category:        { type: 'string' },
    vscript_writer:          { type: 'string' },
    vscript_state:           { type: 'string' },
    vscript_city:            { type: 'string' },
    vscript_launch_date:     { type: 'string', description: 'ISO date YYYY-MM-DD' },
    vscript_end_date:        { type: 'string', description: 'ISO date YYYY-MM-DD' },
  },
}

export const TOOL_DEFINITIONS = [
  {
    name: 'getClientSummary',
    description: 'Get a high-level snapshot of a client. Returns: clientName, totalLeads, leadsByStatus, totalScripts, scriptsByStatus, scriptsByApproval, totalAssets. Use for ANY question about counts, statuses, or overview.',
    input_schema: {
      type: 'object',
      properties: { clientId: { type: 'string' } },
      required: ['clientId'],
    },
  },
  {
    name: 'listScripts',
    description: 'List all video scripts for a client with id, title, status, approval status, type, writer, and launch date. Use this BEFORE proposing an update so you know which script id to target.',
    input_schema: {
      type: 'object',
      properties: { clientId: { type: 'string' } },
      required: ['clientId'],
    },
  },
  {
    name: 'getScript',
    description: 'Get the full contents of a single script (including script_body) by id. Use this when the user wants to revise a specific script and you need to see its current body.',
    input_schema: {
      type: 'object',
      properties: { scriptId: { type: 'string' } },
      required: ['scriptId'],
    },
  },
  {
    name: 'getAdSpend',
    description: 'Get Google Ads spend and performance metrics for a client over a date range. Returns: totalCost, totalClicks, totalConversions, avgCpc, costPerConversion, campaigns (array with per-campaign breakdown: campaign_name, cost, clicks, conversions, status). Use for any question about ad spend, budget, campaign cost, clicks, conversions, CPC, or cost-per-conversion. Dates default to the current month if not provided.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        startDate: { type: 'string', description: 'ISO date YYYY-MM-DD. Defaults to first day of current month.' },
        endDate:   { type: 'string', description: 'ISO date YYYY-MM-DD. Defaults to today.' },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'getAllClientsLeads',
    description: 'Agency-only. Get lead counts for ALL clients, ranked by total leads. Use for questions like "which client has the most leads?" or "compare leads across clients".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'getPaymentSummary',
    description: 'Agency-only. Get payment totals from client_payments table. Can filter by client_id and/or date range. Returns total amount collected, transaction count, and breakdown by client. Use for questions about payments, revenue, cash collected, or "which client has paid the most". When the user says "this month", use the first day of the current month as startDate and today as endDate.',
    input_schema: {
      type: 'object',
      properties: {
        clientId:  { type: 'string', description: 'Optional — omit to get totals across all clients.' },
        startDate: { type: 'string', description: 'ISO date YYYY-MM-DD. Optional — filter payments on or after this date.' },
        endDate:   { type: 'string', description: 'ISO date YYYY-MM-DD. Optional — filter payments on or before this date.' },
      },
    },
  },
  {
    name: 'proposeCreateScript',
    description: 'Propose creating a new video script. This does NOT write to the database — it returns a proposal that the user must approve in the UI. Always include vscript_title and script_body. Other fields are optional but encouraged.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        fields: SCRIPT_FIELDS,
      },
      required: ['clientId', 'fields'],
    },
  },
  {
    name: 'proposeUpdateScript',
    description: 'Propose updating an existing video script. This does NOT write to the database — it returns a proposal that the user must approve in the UI. Only include fields you want to change.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        scriptId: { type: 'string' },
        fields: SCRIPT_FIELDS,
      },
      required: ['clientId', 'scriptId', 'fields'],
    },
  },
]

const PROPOSAL_TOOLS = new Set(['proposeCreateScript', 'proposeUpdateScript'])
export function isProposalTool(name) { return PROPOSAL_TOOLS.has(name) }

export async function runTool({ name, input, user }) {
  if (name === 'getClientSummary') return getClientSummary({ clientId: input.clientId, user })
  if (name === 'listScripts')      return listScripts({ clientId: input.clientId, user })
  if (name === 'getScript')        return getScript({ scriptId: input.scriptId, user })
  if (name === 'getAdSpend')       return getAdSpend({ clientId: input.clientId, startDate: input.startDate, endDate: input.endDate, user })
  if (name === 'getAllClientsLeads')   return getAllClientsLeads({ user })
  if (name === 'getPaymentSummary')   return getPaymentSummary({ clientId: input.clientId, startDate: input.startDate, endDate: input.endDate, user })
  if (name === 'proposeCreateScript') return proposeCreateScript({ clientId: input.clientId, fields: input.fields, user })
  if (name === 'proposeUpdateScript') return proposeUpdateScript({ clientId: input.clientId, scriptId: input.scriptId, fields: input.fields, user })
  return { error: `Unknown tool: ${name}` }
}

async function getClientSummary({ clientId, user }) {
  if (!await userCanAccessClient(user, clientId)) return { error: 'Access denied for this client' }
  const db = adminClient()
  const [clientRes, leadsRes, scriptsRes, assetsRes] = await Promise.all([
    db.from('client').select('client_name').eq('client_id', clientId).single(),
    db.from('client_lead').select('lead_status').eq('client_id', clientId),
    db.from('client_video_scripts').select('vscript_status, vscript_approval_status').eq('client_id', clientId),
    db.from('client_asset').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
  ])
  const leadsByStatus = {}
  for (const l of leadsRes.data || []) {
    const k = l.lead_status || 'unknown'
    leadsByStatus[k] = (leadsByStatus[k] || 0) + 1
  }
  const scriptsByStatus = {}
  const scriptsByApproval = {}
  for (const s of scriptsRes.data || []) {
    scriptsByStatus[s.vscript_status || 'unknown'] = (scriptsByStatus[s.vscript_status || 'unknown'] || 0) + 1
    scriptsByApproval[s.vscript_approval_status || 'unknown'] = (scriptsByApproval[s.vscript_approval_status || 'unknown'] || 0) + 1
  }
  return {
    clientName: clientRes.data?.client_name || null,
    totalLeads: leadsRes.data?.length || 0,
    leadsByStatus,
    totalScripts: scriptsRes.data?.length || 0,
    scriptsByStatus,
    scriptsByApproval,
    totalAssets: assetsRes.count || 0,
  }
}

async function listScripts({ clientId, user }) {
  if (!await userCanAccessClient(user, clientId)) return { error: 'Access denied for this client' }
  const db = adminClient()
  const { data, error } = await db
    .from('client_video_scripts')
    .select('id, vscript_title, vscript_status, vscript_approval_status, vscript_type, vscript_writer, vscript_launch_date')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }
  return { scripts: data || [] }
}

async function getScript({ scriptId, user }) {
  const db = adminClient()
  const { data, error } = await db.from('client_video_scripts').select('*').eq('id', scriptId).single()
  if (error) return { error: error.message }
  if (!await userCanAccessClient(user, data.client_id)) return { error: 'Access denied for this script' }
  return { script: data }
}

async function getAdSpend({ clientId, startDate, endDate, user }) {
  if (!await userCanAccessClient(user, clientId)) return { error: 'Access denied for this client' }
  const today = new Date()
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const defaultEnd = today.toISOString().split('T')[0]
  const start = startDate || defaultStart
  const end = endDate || defaultEnd
  const db = adminClient()
  const { data, error } = await db
    .from('client_yt_campaigns')
    .select('campaign_name, status, cost, clicks, conversions, cpc, cost_per_conversion, date')
    .eq('client_id', clientId)
    .gte('date', start)
    .lte('date', end)
  if (error) return { error: error.message }
  const rows = data || []
  const byCampaign = {}
  for (const r of rows) {
    const key = r.campaign_name || 'Unknown'
    if (!byCampaign[key]) byCampaign[key] = { campaign_name: key, status: r.status, cost: 0, clicks: 0, conversions: 0 }
    byCampaign[key].cost += Number(r.cost) || 0
    byCampaign[key].clicks += Number(r.clicks) || 0
    byCampaign[key].conversions += Number(r.conversions) || 0
  }
  const campaigns = Object.values(byCampaign).sort((a, b) => b.cost - a.cost)
  const totalCost = campaigns.reduce((s, c) => s + c.cost, 0)
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0)
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0)
  return {
    dateRange: { start, end },
    totalCost: Number(totalCost.toFixed(2)),
    totalClicks,
    totalConversions: Number(totalConversions.toFixed(2)),
    avgCpc: totalClicks > 0 ? Number((totalCost / totalClicks).toFixed(2)) : 0,
    costPerConversion: totalConversions > 0 ? Number((totalCost / totalConversions).toFixed(2)) : 0,
    campaigns: campaigns.map(c => ({ ...c, cost: Number(c.cost.toFixed(2)), conversions: Number(c.conversions.toFixed(2)) })),
  }
}

async function getAllClientsLeads({ user }) {
  const db = adminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'agency_admin' && profile?.role !== 'agency_standard') return { error: 'Agency access required' }
  const [{ data: clients }, { data: leads }] = await Promise.all([
    db.from('client').select('client_id, client_name, status'),
    db.from('client_lead').select('client_id, lead_status'),
  ])
  const byClient = {}
  for (const l of leads || []) {
    if (!byClient[l.client_id]) byClient[l.client_id] = { total: 0, byStatus: {} }
    byClient[l.client_id].total++
    const s = l.lead_status || 'unknown'
    byClient[l.client_id].byStatus[s] = (byClient[l.client_id].byStatus[s] || 0) + 1
  }
  const result = (clients || []).map(c => ({
    clientId: c.client_id,
    clientName: c.client_name,
    status: c.status,
    totalLeads: byClient[c.client_id]?.total || 0,
    leadsByStatus: byClient[c.client_id]?.byStatus || {},
  })).sort((a, b) => b.totalLeads - a.totalLeads)
  return { clients: result }
}

async function getPaymentSummary({ clientId, startDate, endDate, user }) {
  const db = adminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'agency_admin' && profile?.role !== 'agency_standard') return { error: 'Agency access required' }
  let query = db.from('client_payments').select('client_id, amount, created_date')
  if (clientId)   query = query.eq('client_id', clientId)
  if (startDate)  query = query.gte('created_date', startDate)
  if (endDate)    query = query.lte('created_date', endDate)
  const { data, error } = await query
  if (error) return { error: error.message }
  const [{ data: clients }] = await Promise.all([
    db.from('client').select('client_id, client_name'),
  ])
  const nameMap = Object.fromEntries((clients || []).map(c => [c.client_id, c.client_name]))
  const byClient = {}
  for (const r of data || []) {
    const id = r.client_id
    if (!byClient[id]) byClient[id] = { clientId: id, clientName: nameMap[id] || id, total: 0, count: 0 }
    byClient[id].total += parseFloat(r.amount) || 0
    byClient[id].count++
  }
  const breakdown = Object.values(byClient)
    .map(c => ({ ...c, total: Number(c.total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total)
  const grandTotal = breakdown.reduce((s, c) => s + c.total, 0)
  return { grandTotal: Number(grandTotal.toFixed(2)), transactionCount: data?.length || 0, breakdown }
}

async function proposeCreateScript({ clientId, fields, user }) {
  if (!await userCanAccessClient(user, clientId)) return { error: 'Access denied for this client' }
  if (!fields?.vscript_title || !fields?.script_body) {
    return { error: 'vscript_title and script_body are required' }
  }
  return {
    proposalId: crypto.randomUUID(),
    action: 'createScript',
    clientId,
    fields,
    summary: `Create a new script titled "${fields.vscript_title}"`,
  }
}

async function proposeUpdateScript({ clientId, scriptId, fields, user }) {
  if (!await userCanAccessClient(user, clientId)) return { error: 'Access denied for this client' }
  const db = adminClient()
  const { data: current, error } = await db.from('client_video_scripts').select('*').eq('id', scriptId).single()
  if (error || !current) return { error: 'Script not found' }
  if (current.client_id !== clientId) return { error: 'Script does not belong to this client' }
  const diff = {}
  for (const k of Object.keys(fields || {})) {
    if (current[k] !== fields[k]) diff[k] = { from: current[k], to: fields[k] }
  }
  return {
    proposalId: crypto.randomUUID(),
    action: 'updateScript',
    clientId,
    scriptId,
    fields,
    diff,
    currentTitle: current.vscript_title,
    summary: `Update script "${current.vscript_title}" (${Object.keys(diff).length} field${Object.keys(diff).length === 1 ? '' : 's'} changed)`,
  }
}

export async function applyProposal({ action, clientId, scriptId, fields, user }) {
  if (!await userCanAccessClient(user, clientId)) return { error: 'Access denied for this client' }
  const db = adminClient()
  if (action === 'createScript') {
    const payload = { ...fields, client_id: clientId, updated_at: new Date().toISOString() }
    const { data, error } = await db.from('client_video_scripts').insert([payload]).select().single()
    if (error) return { error: error.message }
    return { ok: true, script: data }
  }
  if (action === 'updateScript') {
    const payload = { ...fields, updated_at: new Date().toISOString() }
    const { data, error } = await db.from('client_video_scripts').update(payload).eq('id', scriptId).select().single()
    if (error) return { error: error.message }
    return { ok: true, script: data }
  }
  return { error: `Unknown action: ${action}` }
}
