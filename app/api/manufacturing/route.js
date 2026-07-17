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

export async function GET(request) {
  const clientId = request.nextUrl.searchParams.get('client_id')
  const g = await gate(clientId)
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status })
  const db = admin()
  const [{ data: materials }, { data: skus }] = await Promise.all([
    db.from('client_materials').select('name, cost, unit, notes').eq('client_id', clientId).order('name'),
    db.from('client_skus').select('parent_sku, size, bom').eq('client_id', clientId).order('parent_sku'),
  ])
  return NextResponse.json({ materials: materials || [], skus: skus || [] })
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
      // "fiber tape", and "fiber_tape" all land as fiber_tape. Numeric cells
      // become numbers; everything is trimmed.
      const skip = new Set(['parent_sku', 'sku_size', 'size'])
      const sizeIdx = H.findIndex(h => ['sku_size', 'size'].includes(String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')))
      const recs = rows.slice(1).filter(r => r[0]).map(r => {
        const bom = {}
        H.forEach((h, i) => {
          const key = canonKey(h)
          if (skip.has(String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'))) return
          const val = String(r[i] ?? '').trim()
          bom[key] = val !== '' && !isNaN(Number(val)) ? Number(val) : val
        })
        return { client_id: clientId, parent_sku: String(r[0]).trim(), size: (sizeIdx >= 0 ? r[sizeIdx] : null) || null, bom }
      })
      await db.from('client_skus').delete().eq('client_id', clientId)
      const { error } = await db.from('client_skus').insert(recs)
      if (error) throw error
      return NextResponse.json({ ok: true, count: recs.length })
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
