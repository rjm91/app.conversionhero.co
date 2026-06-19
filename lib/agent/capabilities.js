// Agent Capability Registry — the source of truth for the "Agent Access"
// governance UI (gated to agency_admin_security).
//
// This is DERIVED from the live tool registry (TOOL_DEFINITIONS in ./tools),
// so it can never drift: every tool the agent can actually call shows up here,
// and any tool missing human metadata is surfaced (group "Unclassified") instead
// of silently hidden. To document a new tool, add an entry to META below.

import { TOOL_DEFINITIONS } from './tools'

// Per-tool human annotations. `access` is 'read' or 'write'. `touches` is the
// plain-English data the tool reads or writes. `surface` is how a write reaches
// the user (on-screen form vs. a DB record they accept). `status` is 'live' or
// 'disabled' (v1 is read-only; the kill-switch lands in v2).
const META = {
  // ── Agreements ──
  proposeAgreement: {
    group: 'Agreements',
    what: 'Fills the on-screen Agreement Builder from a described deal. Does not save or send — you review and send.',
    access: 'write', touches: 'On-screen form only (no DB write)', surface: 'Agreement Builder',
  },
  // ── Campaigns ──
  proposeCampaign: {
    group: 'Campaigns',
    what: 'Builds Google Ads search campaigns into the on-screen campaign sheet. Does not publish to Google.',
    access: 'write', touches: 'On-screen sheet only (no DB write)', surface: 'Campaign Builder',
  },
  // ── Payments ──
  proposePayment: {
    group: 'Payments',
    what: 'Records a manual client payment (cash / check / Zelle). Opens the Record Payment modal pre-filled for you to confirm.',
    access: 'write', touches: 'client_payments', surface: 'Payments',
  },
  // ── Video Scripts ──
  proposeCreateScript: {
    group: 'Video Scripts',
    what: 'Proposes a new video script. Returns an Accept card — nothing is written until you approve.',
    access: 'write', touches: 'client_video_scripts', surface: 'Accept card',
  },
  proposeUpdateScript: {
    group: 'Video Scripts',
    what: 'Proposes edits to an existing video script. Accept card; nothing is written until you approve.',
    access: 'write', touches: 'client_video_scripts', surface: 'Accept card',
  },
  // ── Data & Reporting (read-only) ──
  getClientSummary: {
    group: 'Data & Reporting',
    what: 'Reads a high-level client snapshot: lead counts, script counts, statuses, assets.',
    access: 'read', touches: 'client, client_lead, client_video_scripts',
  },
  getAllClientsLeads: {
    group: 'Data & Reporting',
    what: 'Reads lead counts across all clients, ranked. Agency-only.',
    access: 'read', touches: 'client, client_lead',
  },
  getAdSpend: {
    group: 'Data & Reporting',
    what: 'Reads Google Ads spend and performance (cost, clicks, conversions, CPC) for a date range.',
    access: 'read', touches: 'Google Ads spend tables',
  },
  getPaymentSummary: {
    group: 'Data & Reporting',
    what: 'Reads payment totals and per-client breakdown. Agency-only.',
    access: 'read', touches: 'client_payments',
  },
  getBrandBoard: {
    group: 'Data & Reporting',
    what: "Reads a client's brand board: colors, logo, brand name, tagline, font.",
    access: 'read', touches: 'client branding',
  },
  listScripts: {
    group: 'Data & Reporting',
    what: "Lists a client's video scripts with id, title, status, approval, type, writer.",
    access: 'read', touches: 'client_video_scripts',
  },
  getScript: {
    group: 'Data & Reporting',
    what: 'Reads the full contents of a single video script by id.',
    access: 'read', touches: 'client_video_scripts',
  },
}

// Stable display order for groups.
const GROUP_ORDER = ['Agreements', 'Campaigns', 'Payments', 'Video Scripts', 'Data & Reporting', 'Unclassified']

// Build the capability manifest from the live registry.
export function getCapabilities() {
  const byGroup = {}
  for (const tool of TOOL_DEFINITIONS) {
    const m = META[tool.name] || {
      group: 'Unclassified',
      what: tool.description || '',
      access: 'read',
      touches: '—',
    }
    const entry = {
      name: tool.name,
      what: m.what,
      access: m.access,
      touches: m.touches,
      surface: m.surface || null,
      status: m.status || 'live',
    }
    ;(byGroup[m.group] = byGroup[m.group] || []).push(entry)
  }

  const groups = Object.keys(byGroup)
    .sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    .map(group => ({
      group,
      tools: byGroup[group],
      access: byGroup[group].some(t => t.access === 'write') ? 'write' : 'read',
    }))

  const totals = {
    tools: TOOL_DEFINITIONS.length,
    write: TOOL_DEFINITIONS.filter(t => (META[t.name]?.access || 'read') === 'write').length,
    read: TOOL_DEFINITIONS.filter(t => (META[t.name]?.access || 'read') === 'read').length,
  }

  return { groups, totals }
}
