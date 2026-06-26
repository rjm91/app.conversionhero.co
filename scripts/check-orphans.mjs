#!/usr/bin/env node
/**
 * Pre-flight for adding client_id foreign keys: find rows whose client_id does
 * NOT match a real client (orphans) or is NULL. A FK can't be added while those
 * exist, so this tells us which tables are clean vs. need cleanup first.
 *
 *   node scripts/check-orphans.mjs
 *
 * Read-only. Uses SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function env() {
  const e = {}
  try {
    for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
      let v = m[2].trim(); if (/^["'].*["']$/.test(v)) v = v.slice(1, -1); e[m[1]] = v
    }
  } catch {}
  return { ...e, ...process.env }
}
const E = env()
const db = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const schema = JSON.parse(readFileSync(resolve(ROOT, 'db/schema.json'), 'utf8'))
const tablesWithClientId = schema.tables
  .map(t => ({ name: t.name, col: t.columns.find(c => c.name === 'client_id') }))
  .filter(t => t.col)

// valid client ids
const { data: clients, error: ce } = await db.from('client').select('client_id')
if (ce) { console.error('Cannot read client table:', ce.message); process.exit(1) }
const valid = new Set((clients || []).map(c => c.client_id))
const quotedList = '(' + [...valid].map(id => `"${id}"`).join(',') + ')'
console.log(`Valid clients: ${valid.size}\n`)

const clean = [], dirty = []
for (const t of tablesWithClientId) {
  const hasFk = !!t.col.fk
  // total rows
  const { count: total } = await db.from(t.name).select('client_id', { count: 'exact', head: true })
  // null client_id
  const { count: nulls } = await db.from(t.name).select('client_id', { count: 'exact', head: true }).is('client_id', null)
  // orphans: not null AND not in valid set
  let orphanCount = 0, samples = []
  if (valid.size) {
    const q = db.from(t.name).select('client_id', { count: 'exact', head: false }).not('client_id', 'is', null).not('client_id', 'in', quotedList).limit(8)
    const { data: orphRows, count } = await q
    orphanCount = count || 0
    samples = [...new Set((orphRows || []).map(r => r.client_id))]
  }
  const rec = { name: t.name, hasFk, total: total || 0, nulls: nulls || 0, orphanCount, samples }
  if ((nulls || 0) === 0 && orphanCount === 0) clean.push(rec); else dirty.push(rec)
}

const pad = s => String(s).padEnd(28)
console.log('── CLEAN (safe to add FK now) ──')
for (const r of clean) console.log(`  ✓ ${pad(r.name)} ${r.total} rows${r.hasFk ? '  [FK already exists]' : ''}`)
console.log('\n── NEEDS CLEANUP FIRST ──')
if (!dirty.length) console.log('  (none — everything is clean!)')
for (const r of dirty) {
  console.log(`  ✗ ${pad(r.name)} ${r.total} rows  · nulls: ${r.nulls}  · orphans: ${r.orphanCount}${r.samples.length ? '  e.g. ' + r.samples.join(', ') : ''}`)
}
console.log('')
