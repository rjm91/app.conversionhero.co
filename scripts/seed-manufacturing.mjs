// Seed a client's materials + SKU BOM from the two CSV exports in data/.
//   node scripts/seed-manufacturing.mjs ch069
// Idempotent (upserts). Run after the manufacturing migration.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const l of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
  let v = m[2].trim(); if (/^["'].*["']$/.test(v)) v = v.slice(1, -1); env[m[1]] = v
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const clientId = process.argv[2] || 'ch069'

const parseCsv = f => readFileSync(resolve(ROOT, f), 'utf8').trim().split('\n').map(r => r.split(','))
const num = s => parseFloat(String(s).replace(/[$,]/g, '')) || 0

;(async () => {
  // Materials
  const mat = parseCsv('data/ShieldTech - SKU Overview.xlsx - Material Cost Per Unit.csv')
  const materials = mat.slice(1).filter(r => r[0]).map(r => ({
    client_id: clientId, name: r[0].trim(), cost: num(r[1]), unit: /yard/i.test(r[2] || '') ? 'yard' : 'unit', notes: (r[2] || '').trim() || null,
  }))
  const { error: me } = await db.from('client_materials').upsert(materials, { onConflict: 'client_id,name' })
  console.log(me ? '✗ materials: ' + me.message : `✓ ${materials.length} materials`)

  // SKUs / BOM
  const sk = parseCsv('data/ShieldTech - SKU Overview.xlsx - SKU INFORMATION.csv')
  const H = sk[0].map(h => h.trim())
  const skus = sk.slice(1).filter(r => r[0]).map(r => {
    const bom = {}
    H.forEach((h, i) => { if (h !== 'parent_sku' && h !== 'SKU SIZE') bom[h] = r[i] })
    return { client_id: clientId, parent_sku: r[0].trim(), size: (r[H.indexOf('SKU SIZE')] || '').trim() || null, bom }
  })
  const { error: se } = await db.from('client_skus').upsert(skus, { onConflict: 'client_id,parent_sku' })
  console.log(se ? '✗ skus: ' + se.message : `✓ ${skus.length} SKUs`)
})().catch(e => { console.error('✗', e.message); process.exit(1) })
