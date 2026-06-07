// Google Ads Editor CSV — builds the exact "Campaign Import Template" format.
//
// The draft "doc" is the structured source of truth:
// {
//   campaigns: [{
//     id, name, status, bidStrategy, trackingTemplate,
//     adGroups: [{
//       id, name,
//       keywords: [{ id, text, matchType }],
//       ads:      [{ id, adType, headlines:[{text,position}], descriptions:[{text,position}], path1, path2, finalUrl }]
//     }]
//   }]
// }

// Campaign types the builder knows about. Only `ready` types can be built today;
// the rest are scaffolded until their Google Ads Editor template is wired up.
export const CAMPAIGN_TYPES = [
  { key: 'search',    label: 'Search',          ready: true,  note: 'Keywords + Responsive Search Ads.' },
  { key: 'shopping',  label: 'Shopping',        ready: false, note: 'Product groups tied to a Merchant Center feed — no keywords or headlines.' },
  { key: 'youtube',   label: 'YouTube',         ready: false, note: 'Video ads + audience targeting. Built around YouTube video assets.' },
  { key: 'pmax',      label: 'Performance Max',  ready: false, note: 'Asset groups (headlines, descriptions, images, videos) + audience signals — no keywords.' },
  { key: 'demandgen', label: 'Demand Gen',      ready: false, note: 'Creative-led asset + audience campaigns.' },
]

export const RSA = 'Responsive search ad'
export const MATCH_TYPES   = ['Exact', 'Phrase', 'Broad']
export const STATUSES      = ['Paused', 'Enabled']
export const BID_STRATEGIES = [
  'Maximize clicks', 'Maximize conversions', 'Maximize conversion value',
  'Target CPA', 'Target ROAS', 'Manual CPC',
]

export const MAX_HEADLINES    = 15
export const MAX_DESCRIPTIONS  = 4
export const HEADLINE_MAX_LEN  = 30
export const DESC_MAX_LEN      = 90
export const PATH_MAX_LEN      = 15

export const DEFAULT_TRACKING =
  '{lpurl}?utm_source=google&utm_medium=cpc&utm_term={keyword}&utm_campaign={_campaignname}'

// ── Exact header from the template (53 columns, blanks + spacing preserved) ──
export function csvHeader() {
  const head = [
    'Campaign ', '', '', 'Campaign  Status', '', 'Ad Group', 'Keyword',
    'Criterion Type', 'Bid strategy type', 'Tracking template',
    'Custom parameter', 'Ad type',
  ]
  for (let i = 1; i <= MAX_HEADLINES; i++)   head.push(`Headline ${i}`, `Headline ${i} position`)
  for (let i = 1; i <= MAX_DESCRIPTIONS; i++) head.push(`Description ${i}`, `Description ${i} position`)
  head.push('Path 1', 'Path 2', 'Final URL')
  return head
}

const COL = (() => {
  const h = csvHeader()
  return {
    width: h.length,
    campaign: 0, status: 3, adGroup: 5, keyword: 6, criterionType: 7,
    bidStrategy: 8, tracking: 9, adType: 11,
    headline: (i) => 12 + i * 2,          // i = 0..14
    headlinePos: (i) => 13 + i * 2,
    description: (i) => 42 + i * 2,        // i = 0..3
    descriptionPos: (i) => 43 + i * 2,
    path1: 50, path2: 51, finalUrl: 52,
  }
})()

function blankRow() { return new Array(COL.width).fill('') }

function escapeCell(v) {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// Flatten the doc into CSV rows (arrays of 53 cells). Campaign + Ad Group
// repeat on every row, as Google Ads Editor requires.
export function docToRows(doc) {
  const rows = []
  for (const c of doc?.campaigns || []) {
    const tracking = c.trackingTemplate || DEFAULT_TRACKING
    for (const g of c.adGroups || []) {
      for (const k of g.keywords || []) {
        if (!k.text?.trim()) continue
        const r = blankRow()
        r[COL.campaign] = c.name || ''
        r[COL.status] = c.status || 'Paused'
        r[COL.adGroup] = g.name || ''
        r[COL.keyword] = k.text
        r[COL.criterionType] = k.matchType || 'Broad'
        r[COL.bidStrategy] = c.bidStrategy || ''
        r[COL.tracking] = tracking
        rows.push(r)
      }
      for (const a of g.ads || []) {
        const heads = (a.headlines || []).filter(h => h.text?.trim())
        if (!heads.length) continue
        const r = blankRow()
        r[COL.campaign] = c.name || ''
        r[COL.status] = c.status || 'Paused'
        r[COL.adGroup] = g.name || ''
        r[COL.bidStrategy] = c.bidStrategy || ''
        r[COL.tracking] = tracking
        r[COL.adType] = a.adType || RSA
        heads.slice(0, MAX_HEADLINES).forEach((h, i) => {
          r[COL.headline(i)] = h.text
          if (h.position) r[COL.headlinePos(i)] = h.position
        })
        ;(a.descriptions || []).filter(d => d.text?.trim()).slice(0, MAX_DESCRIPTIONS).forEach((d, i) => {
          r[COL.description(i)] = d.text
          if (d.position) r[COL.descriptionPos(i)] = d.position
        })
        r[COL.path1] = a.path1 || ''
        r[COL.path2] = a.path2 || ''
        r[COL.finalUrl] = a.finalUrl || ''
        rows.push(r)
      }
    }
  }
  return rows
}

export function buildCsv(doc) {
  const lines = [csvHeader(), ...docToRows(doc)]
  return lines.map(row => row.map(escapeCell).join(',')).join('\r\n')
}

// Quick counts for the header summary.
export function docCounts(doc) {
  let campaigns = 0, adGroups = 0, keywords = 0, ads = 0
  for (const c of doc?.campaigns || []) {
    campaigns++
    for (const g of c.adGroups || []) {
      adGroups++
      keywords += (g.keywords || []).filter(k => k.text?.trim()).length
      ads += (g.ads || []).filter(a => (a.headlines || []).some(h => h.text?.trim())).length
    }
  }
  return { campaigns, adGroups, keywords, ads }
}
