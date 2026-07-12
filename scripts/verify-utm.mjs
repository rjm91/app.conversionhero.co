#!/usr/bin/env node
// READ-ONLY: inspect how ShieldTech (ch069) orders are stamped with UTM data,
// and whether utm_campaign carries the numeric platform campaign_id (the join
// key the CH "Conv (CH)" column relies on). No writes.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv() {
  const env = {}
  try {
    for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
      let v = m[2].trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch {}
  return { ...env, ...process.env }
}
const env = loadEnv()
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const CLIENT = 'ch069'
const DAYS = Number(process.argv[2] || 45)
const since = new Date(Date.now() - DAYS * 864e5).toISOString()

// The platforms' known campaign IDs (from the campaign tables) — the exact
// values utm_campaign must equal for a CH match.
const [{ data: meta }, { data: goog }] = await Promise.all([
  db.from('client_meta_campaigns').select('campaign_id, campaign_name').eq('client_id', CLIENT),
  db.from('client_yt_campaigns').select('campaign_id, campaign_name').eq('client_id', CLIENT),
])
const metaIds = new Map((meta || []).map(c => [String(c.campaign_id), c.campaign_name]))
const googIds = new Map((goog || []).map(c => [String(c.campaign_id), c.campaign_name]))
const allIds = new Set([...metaIds.keys(), ...googIds.keys()])

const { data: orders, error } = await db.from('client_orders')
  .select('order_id, created_at, utm_source, utm_medium, utm_campaign, utm_content, shopify_data')
  .eq('client_id', CLIENT).gte('created_at', since).order('created_at', { ascending: false })
if (error) { console.error(error.message); process.exit(1) }

const isNumericId = (v) => /^\d{6,}$/.test(String(v || '').trim())
let withUtm = 0, numericCampaign = 0, matchedMeta = 0, matchedGoogle = 0, nonIdCampaign = 0
const samples = [], platformish = []
for (const o of orders) {
  const uc = (o.utm_campaign || '').trim()
  const src = (o.utm_source || '').toLowerCase()
  const sd = o.shopify_data || {}
  const paidish = /facebook|meta|instagram|fb|google|goog|adwords|gclid|fbclid/.test([src, o.utm_medium, uc, JSON.stringify(sd.first_utm || ''), JSON.stringify(sd.last_utm || '')].join(' ').toLowerCase())
  if (uc) withUtm++
  if (isNumericId(uc)) numericCampaign++
  if (metaIds.has(uc)) matchedMeta++
  else if (googIds.has(uc)) matchedGoogle++
  else if (uc && paidish && !isNumericId(uc)) { nonIdCampaign++; if (platformish.length < 12) platformish.push({ order: o.order_id, src, uc }) }
  if (samples.length < 15 && (uc || paidish)) samples.push({
    order: o.order_id, date: String(o.created_at).slice(0, 10),
    src: o.utm_source, med: o.utm_medium, campaign: uc,
    firstUtmCampaign: sd.first_utm?.campaign, lastUtmCampaign: sd.last_utm?.campaign,
    match: metaIds.has(uc) ? `META ✓ ${metaIds.get(uc)}` : googIds.has(uc) ? `GOOGLE ✓ ${googIds.get(uc)}` : isNumericId(uc) ? 'numeric-id (no campaign match)' : uc ? 'non-id value' : '—',
  })
}

console.log(`\n═══ UTM verification · ${CLIENT} · last ${DAYS}d ═══`)
console.log(`Orders scanned:            ${orders.length}`)
console.log(`  with any utm_campaign:   ${withUtm}`)
console.log(`  utm_campaign is a numeric ID: ${numericCampaign}`)
console.log(`  → matched a META campaign ID:   ${matchedMeta}`)
console.log(`  → matched a GOOGLE campaign ID: ${matchedGoogle}`)
console.log(`  paid-looking but utm_campaign is NOT an ID (would MISS): ${nonIdCampaign}`)
console.log(`\nKnown campaign IDs in tables — Meta: ${metaIds.size}, Google: ${googIds.size}`)
console.log(`Sample Meta IDs:   ${[...metaIds.keys()].slice(0, 4).join(', ') || '—'}`)
console.log(`Sample Google IDs: ${[...googIds.keys()].slice(0, 4).join(', ') || '—'}`)
console.log(`\n─── sample orders (utm-bearing / paid-looking) ───`)
for (const s of samples) console.log(JSON.stringify(s))
if (platformish.length) {
  console.log(`\n⚠ paid-looking orders whose utm_campaign is NOT a campaign ID (these undercount):`)
  for (const p of platformish) console.log(JSON.stringify(p))
}
console.log('')
