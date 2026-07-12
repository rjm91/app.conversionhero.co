// Agency live-data endpoint for the Schema view. READ-ONLY: never writes.
// Two modes:
//   ?counts=1                 → { counts: { <table>: <rowCount>, ... } } for all tables
//   ?table=<t>&limit=&offset= → { table, columns, rows, total } — a page of real rows
// Table names are WHITELISTED against the parsed schema (db/schema.md); an
// arbitrary table name is never interpolated into a query. Uses the service-role
// client (agency admins see everything), gated to agency users.

import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { isAgencyUser } from '../../../../lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Columns whose values we blank out if trivially present.
const SECRET_COLS = new Set(['access_token', 'refresh_token', 'secret', 'password'])

// Minimal schema.md parse: table name → { columns:[names], pk:<name|null> }.
// Kept local so this route whitelists tables/columns without importing the
// schema route (route files should only export handlers + config).
function parseTables(md) {
  const out = {}
  let cur = null
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    const h = line.match(/^##\s+`([^`]+)`/)
    if (h) { cur = { name: h[1], columns: [], pk: null }; out[h[1]] = cur; continue }
    if (!cur || line[0] !== '|') continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (cells.length < 5) continue
    const [col, , , , key] = cells
    if (col === 'Column' || col.startsWith('---') || col === '') continue
    cur.columns.push(col)
    if (/\bPK\b/.test(key) && !cur.pk) cur.pk = col
  }
  return out
}

function loadSchema() {
  const md = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.md'), 'utf8')
  return parseTables(md)
}

function redact(rows) {
  return rows.map(r => {
    let touched = false
    const copy = {}
    for (const k in r) {
      if (SECRET_COLS.has(k) && r[k] != null && r[k] !== '') { copy[k] = '••••'; touched = true }
      else copy[k] = r[k]
    }
    return touched ? copy : r
  })
}

export async function GET(request) {
  // Agency-users-only (mirrors app/api/agency/ask/route.js).
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!isAgencyUser(prof?.role)) return NextResponse.json({ error: 'Agency users only' }, { status: 403 })

  const url = new URL(request.url)

  let schema
  try { schema = loadSchema() }
  catch (e) { return NextResponse.json({ error: String(e?.message || e) }, { status: 500 }) }

  // ── counts mode: one head-only exact count per table, in parallel ──
  if (url.searchParams.get('counts')) {
    const names = Object.keys(schema)
    const results = await Promise.all(names.map(async (name) => {
      try {
        const { count, error } = await db.from(name).select('*', { count: 'exact', head: true })
        return [name, error ? null : (count ?? 0)]
      } catch { return [name, null] }
    }))
    const counts = {}
    for (const [name, c] of results) counts[name] = c
    return NextResponse.json({ counts })
  }

  // ── table page mode ──
  const table = url.searchParams.get('table')
  if (!table) return NextResponse.json({ error: 'table or counts required' }, { status: 400 })
  const meta = schema[table]                       // whitelist: must be a known table
  if (!meta) return NextResponse.json({ error: 'unknown table' }, { status: 400 })

  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10) || 25))
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0)

  // Order by a sensible column if the table has one.
  const orderCol = meta.columns.includes('created_at') ? 'created_at' : (meta.pk || null)
  const orderDesc = orderCol === 'created_at'

  try {
    let q = db.from(table).select('*', { count: 'exact' })
    if (orderCol) q = q.order(orderCol, { ascending: !orderDesc })
    q = q.range(offset, offset + limit - 1)
    const { data, count, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      table,
      columns: meta.columns,
      rows: redact(data || []),
      total: count ?? 0,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
