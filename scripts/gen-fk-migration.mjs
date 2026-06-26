#!/usr/bin/env node
/**
 * Generate the client_id foreign-key migration from the real schema snapshot.
 * For each table that has a client_id column but no FK on it, emit:
 *   - a safe orphan cleanup (null out non-matching client_ids, where allowed)
 *   - an ALTER TABLE ... ADD FOREIGN KEY (on delete cascade if NOT NULL, else set null)
 *
 * Reads db/schema.json (offline). Writes the .sql to stdout.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const schema = JSON.parse(readFileSync(resolve(ROOT, 'db/schema.json'), 'utf8'))

const targets = []
for (const t of schema.tables) {
  if (t.name === 'client') continue // the client table's client_id is its OWN primary key
  const col = t.columns.find(c => c.name === 'client_id')
  if (!col) continue
  if (col.fk) continue // already linked
  // NOTE: client_id may be this table's PK and still be a FK to client (1-to-1
  // extension table) — that's valid, so we do NOT exclude pk columns here.
  targets.push({ table: t.name, nullable: col.nullable })
}

const lines = []
lines.push('-- Wire the "loose" client-owned tables to the client table.')
lines.push('-- Generated from db/schema.json by scripts/gen-fk-migration.mjs.')
lines.push('-- Adds client_id → client.client_id foreign keys so relationships are')
lines.push('-- declared + enforced (and the Schema Map snaps into one tree).')
lines.push('--')
lines.push('-- Run this whole block in the Supabase SQL Editor. It is transactional:')
lines.push('-- if anything fails, nothing is applied.')
lines.push('')
lines.push('begin;')
lines.push('')
for (const { table, nullable } of targets) {
  // Conservative ON DELETE: nullable → SET NULL (unlink, keep the row).
  // NOT NULL → NO ACTION (omit clause): can't cascade-delete by accident; a
  // client delete that would orphan rows fails loudly instead of wiping data.
  const onDelete = nullable ? ' on delete set null' : ''
  lines.push(`-- ${table}  (client_id ${nullable ? 'nullable → ON DELETE SET NULL' : 'NOT NULL → NO ACTION'})`)
  if (nullable) {
    lines.push(`update public.${table} set client_id = null`)
    lines.push(`  where client_id is not null and client_id not in (select client_id from public.client);`)
  } else {
    // can't null a NOT NULL column — remove orphan rows (the scan found none here)
    lines.push(`delete from public.${table}`)
    lines.push(`  where client_id is not null and client_id not in (select client_id from public.client);`)
  }
  lines.push(`alter table public.${table}`)
  lines.push(`  drop constraint if exists ${table}_client_id_fkey,`)
  lines.push(`  add constraint ${table}_client_id_fkey`)
  lines.push(`  foreign key (client_id) references public.client(client_id)${onDelete};`)
  lines.push('')
}
lines.push('commit;')
lines.push('')

process.stdout.write(lines.join('\n'))
