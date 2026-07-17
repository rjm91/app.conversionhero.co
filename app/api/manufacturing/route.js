export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../lib/supabase-server'
import { userCanAccessClient } from '../../../lib/access'
import { canonKey } from '../../../lib/cogs'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

async function gate(clientId) {
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  if (!clientId) return { error: 'clientId required', status: 400 }
  if (!await userCanAccessClient(user.id, clientId)) return { error: 'Forbidden', status: 403 }
  return { ok: true }
}

const num = s => parseFloat(String(s).replace(/[$,]/g, '')) || 0
// Minimal CSV parse (handles simple quoted fields).
function parseCsv(text) {
  const rows = []
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue
    const cells = []; let cur = '', q = false
    for (const ch of line) {
      if (ch === '"') q = !q
      else if (ch === ',' && !q) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    rows.push(cells.map(c => c.trim()))
  }
  return rows
}

// BOM lives as ROWS in client_sku_bom (one per SKU × component). Assemble the
// per-SKU bom object here so every consumer (COGS engine, dashboards, mission)
// keeps its existing shape. Paginated: 77 SKUs × 16 components > the 1,000-row
// PostgREST cap.
async function fetchBomBySku(db, clientId) {
  const bySku = {}
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('client_sku_bom')
      .select('parent_sku, component, qty, value').eq('client_id', clientId)
      .order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of (data || [])) (bySku[r.parent_sku] = bySku[r.parent_sku] || {})[r.component] = r.value ?? Number(r.qty)
    if (!data || data.length < 1000) break
  }
  return bySku
}

export async function GET(request) {
  const clientId = request.nextUrl.searchParams.get('client_id')
  const g = await gate(clientId)
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })
  const db = admin()
  const [{ data: materials }, { data: skus }, bomBySku] = await Promise.all([
    db.from('client_materials').select('name, cost, unit, notes').eq('client_id', clientId).order('name'),
    db.from('client_skus').select('parent_sku, size').eq('client_id', clientId).order('parent_sku'),
    fetchBomBySku(db, clientId),
  ])
  return NextResponse.json({ materials: materials || [], skus: (skus || []).map(s => ({ ...s, bom: bomBySku[s.parent_sku] || {} })) })
}

// Upload a sheet (CSV) → replace that table for the client.
export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const { clientId, type, csv } = body
  const g = await gate(clientId)
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })
  if (!csv || !['materials', 'skus'].includes(type)) return NextResponse.json({ error: 'type (materials|skus) + csv required' }, { status: 400 })

  const db = admin()
  const rows = parseCsv(csv)
  if (rows.length < 2) return NextResponse.json({ error: 'empty CSV' }, { status: 400 })
  const H = rows[0]

  try {
    if (type === 'materials') {
      const recs = rows.slice(1).filter(r => r[0]).map(r => ({
        client_id: clientId, name: r[0], cost: num(r[1]), unit: /yard/i.test(r[2] || '') ? 'yard' : 'unit', notes: (r[2] || '') || null,
      }))
      await db.from('client_materials').delete().eq('client_id', clientId)
      const { error } = await db.from('client_materials').insert(recs)
      if (error) throw error
      return NextResponse.json({ ok: true, count: recs.length })
    } else {
      // Headers are canonicalized to the snake_case BOM keys (canonKey), so it
      // doesn't matter how the spreadsheet spells them — "FiberTape",
      // "fiber tape", and "fiber_tape" all land as fiber_tape. The BOM is
      // stored as ROWS in client_sku_bom (numeric cells → qty, text → value).
      const skip = new Set(['parent_sku', 'sku_size', 'size'])
      const normH = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
      const sizeIdx = H.findIndex(h => ['sku_size', 'size'].includes(normH(h)))
      const skuRecs = []
      const bomRecs = []
      for (const r of rows.slice(1)) {
        if (!r[0]) continue
        const parent = String(r[0]).trim()
        skuRecs.push({ client_id: clientId, parent_sku: parent, size: (sizeIdx >= 0 ? r[sizeIdx] : null) || null })
        H.forEach((h, i) => {
          if (skip.has(normH(h))) return
          const val = String(r[i] ?? '').trim()
          if (val === '') return
          const isNum = !isNaN(Number(val))
          bomRecs.push({ client_id: clientId, parent_sku: parent, component: canonKey(h), qty: isNum ? Number(val) : null, value: isNum ? null : val })
        })
      }
      await db.from('client_sku_bom').delete().eq('client_id', clientId)
      await db.from('client_skus').delete().eq('client_id', clientId)
      const { error } = await db.from('client_skus').insert(skuRecs)
      if (error) throw error
      // Insert in chunks — a big sheet can exceed one request comfortably.
      for (let i = 0; i < bomRecs.length; i += 500) {
        const { error: be } = await db.from('client_sku_bom').insert(bomRecs.slice(i, i + 500))
        if (be) throw be
      }
      return NextResponse.json({ ok: true, count: skuRecs.length, bom_rows: bomRecs.length })
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
