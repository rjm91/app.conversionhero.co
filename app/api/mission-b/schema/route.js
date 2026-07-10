// Mission B — schema graph source.
// Parses db/schema.md (the committed Supabase snapshot) into a relational model
// the client renders as a node/edge graph. READ-ONLY: reads one file with fs,
// never touches the database. Regenerate schema.md with `npm run db:schema`.

import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Which cluster a table belongs to — the legend/colour groups. Order matters:
// first match wins.
function domainOf(name) {
  if (name.startsWith('mission_')) return 'mission'          // the agent's brain
  if (name.includes('funnel')) return 'funnel'              // landing/funnel graph
  const billing = new Set([
    'agency_membership', 'client_membership', 'client_billing', 'client_payments',
    'client_qb_payments', 'google_ads_tokens', 'qb_tokens', 'meta_connections',
    'shopify_connections', 'profiles', 'role_change_audit', 'integrations',
  ])
  if (billing.has(name)) return 'billing'                   // auth · tokens · money
  const system = new Set(['dev_roadmap', 'plans', 'projects', 'project_tasks', 'user_activity'])
  if (system.has(name)) return 'system'
  if (name === 'agency' || name.startsWith('agency_') || name === 'blaztr_daily' || name === 'email_templates') return 'agency'
  if (name === 'client' || name.startsWith('client_') || name === 'calendar_events') return 'client'
  return 'system'
}

function parseSchema(md) {
  const lines = md.split('\n')
  const tables = []
  let cur = null
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = line.match(/^##\s+`([^`]+)`/)
    if (h) { cur = { name: h[1], domain: domainOf(h[1]), columns: [] }; tables.push(cur); continue }
    if (!cur || line[0] !== '|') continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (cells.length < 5) continue
    const [col, type, nul, , key] = cells
    if (col === 'Column' || col.startsWith('---') || col === '') continue
    const c = { name: col, type, nullable: /^yes$/i.test(nul), key: '' }
    const flags = []
    if (/\bPK\b/.test(key)) flags.push('PK')
    const fk = key.match(/FK\s*[→>-]+\s*([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/)
    if (fk) { flags.push('FK'); c.ref = { table: fk[1], col: fk[2] } }
    c.key = flags.join('+')
    cur.columns.push(c)
  }
  return tables
}

// Build edges: real foreign keys, plus "logical" tenant-spine links — columns
// literally named client_id / agency_id that carry the tenant id WITHOUT an
// enforced FK (e.g. the mission_* tables the agent writes). Drawing them makes
// the tenant spine explicit even where the DB doesn't enforce it.
function buildEdges(tables) {
  const names = new Set(tables.map(t => t.name))
  const edges = []
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.ref && names.has(c.ref.table)) {
        edges.push({ from: t.name, col: c.name, to: c.ref.table, toCol: c.ref.col, kind: 'fk' })
      } else if (!c.ref) {
        if (c.name === 'client_id' && t.name !== 'client' && names.has('client')) {
          edges.push({ from: t.name, col: 'client_id', to: 'client', toCol: 'client_id', kind: 'logical' })
        } else if (c.name === 'agency_id' && t.name !== 'agency' && names.has('agency')) {
          edges.push({ from: t.name, col: 'agency_id', to: 'agency', toCol: 'id', kind: 'logical' })
        }
      }
    }
  }
  return edges
}

export async function GET() {
  try {
    const file = path.join(process.cwd(), 'db', 'schema.md')
    const md = fs.readFileSync(file, 'utf8')
    const tables = parseSchema(md)
    const edges = buildEdges(tables)
    const fkCount = edges.filter(e => e.kind === 'fk').length
    return NextResponse.json({
      tables,
      edges,
      counts: { tables: tables.length, fk: fkCount, logical: edges.length - fkCount },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
