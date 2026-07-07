#!/usr/bin/env node
// RLS verification matrix — run after each batch flip.
//
//   node scripts/rls-verify.mjs batch1
//   node scripts/rls-verify.mjs batch1 --before   (baseline check before the flip)
//
// Identities:
//   anon    — the browser with no session (anon key only)
//   service — server routes (service key, bypasses RLS)
//   user JWTs (batches 2+) — export RLS_JWT_<NAME>=<jwt> and add the name to
//   a batch's `users` list; requests send it as the Bearer token.
//
// The core assertion style: for every protected table, anon must see ZERO
// rows while service sees the true count — checking expected-NONZERO on the
// service side so "silently empty" (the 2026-07-06 blank-dashboard failure
// mode) can never read as a pass.

import { readFileSync } from 'fs'
import { resolve } from 'path'

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const BATCHES = {
  // Credential tables: RLS on, zero policies → anon sees nothing, service sees all.
  batch1: {
    tables: ['google_ads_tokens', 'qb_tokens', 'meta_connections', 'shopify_connections', 'integrations', 'blaztr_daily'],
    // mayBeEmpty: tables where a 0 service count is legitimate (nothing synced yet)
    mayBeEmpty: ['integrations'],
    users: [],
  },
  // Mission tables: tenant_select for authenticated (can_access_client); anon locked out.
  batch2: {
    tables: ['mission_findings', 'mission_decisions', 'mission_policies', 'client_daily_metrics'],
    mayBeEmpty: ['mission_policies'],
    users: [],
  },
  // Orders/leads core: tenant CRUD for authenticated; anon locked out.
  batch3a: {
    tables: ['client_orders', 'client_lead', 'client_lead_meta'],
    mayBeEmpty: ['client_lead_meta'],
    users: [],
  },
  // Campaign tables: tenant select only.
  batch3b: {
    tables: ['client_yt_campaigns', 'client_yt_ad_groups', 'client_yt_ads', 'client_meta_campaigns', 'client_klaviyo_campaigns'],
    mayBeEmpty: ['client_yt_ad_groups', 'client_yt_ads', 'client_klaviyo_campaigns'],
    users: [],
  },
  // Commerce/ops: select (+ billing insert/update).
  batch3c: {
    tables: ['client_materials', 'client_skus', 'client_payments', 'client_qb_payments', 'client_google_ads_account', 'client_billing'],
    mayBeEmpty: ['client_qb_payments', 'client_billing', 'client_google_ads_account'],
    users: [],
  },
  // Content & ops: CRUD on asset/folder/scripts; select elsewhere; self-scope user_activity.
  batch3d: {
    tables: ['client_asset', 'client_folder', 'client_video_scripts', 'client_avatar_videos', 'client_campaign_drafts', 'client_automations', 'client_domains', 'calendar_events', 'projects', 'project_tasks', 'user_activity'],
    mayBeEmpty: ['client_asset', 'client_folder', 'client_video_scripts', 'client_avatar_videos', 'client_campaign_drafts', 'client_automations', 'client_domains', 'calendar_events', 'projects', 'project_tasks', 'user_activity'],
    users: [],
  },
}

async function count(table, key, jwt) {
  const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${jwt || key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
    cache: 'no-store',
  })
  const range = res.headers.get('content-range') || ''
  const total = range.includes('/') ? range.split('/')[1] : null
  return { status: res.status, count: total === '*' ? null : Number(total) }
}

const batchName = process.argv[2] || 'batch1'
const before = process.argv.includes('--before')
const batch = BATCHES[batchName]
if (!batch) {
  console.error(`unknown batch "${batchName}" — known: ${Object.keys(BATCHES).join(', ')}`)
  process.exit(2)
}

let failures = 0
const rows = []
for (const t of batch.tables) {
  const svc = await count(t, SERVICE)
  const anon = await count(t, ANON)
  // 206 = Partial Content — PostgREST's normal reply when rows exceed the probe range.
  const okStatus = (s) => s === 200 || s === 206
  const svcOk = okStatus(svc.status) && (svc.count > 0 || batch.mayBeEmpty.includes(t))
  // Before the flip anon typically MATCHES service (RLS off) — informational.
  // After the flip anon must be 0 (RLS filters silently) or denied outright.
  const anonLocked = (okStatus(anon.status) && anon.count === 0) || anon.status === 401 || anon.status === 403 || anon.status === 404
  const pass = before ? svcOk : (svcOk && anonLocked)
  if (!pass) failures++
  rows.push({
    table: t,
    service: `${svc.status}/${svc.count ?? '?'}`,
    anon: `${anon.status}/${anon.count ?? '?'}`,
    result: before ? (svcOk ? 'BASELINE-OK' : 'BASELINE-FAIL') : (pass ? 'PASS' : 'FAIL'),
  })
  // User identities (batches 2+): each named JWT gets its own column of checks.
  for (const name of batch.users) {
    const jwt = process.env[`RLS_JWT_${name.toUpperCase()}`]
    if (!jwt) { rows.push({ table: t, service: '-', anon: '-', result: `SKIP (no RLS_JWT_${name.toUpperCase()})` }); continue }
    const u = await count(t, ANON, jwt)
    rows.push({ table: `${t} as ${name}`, service: '-', anon: `${u.status}/${u.count ?? '?'}`, result: 'INFO' })
  }
}

console.log(`\nRLS verify — ${batchName}${before ? ' (baseline, pre-flip)' : ''}`)
console.table(rows)
if (!before && failures === 0) console.log('✅ all locked: anon sees zero rows, service sees real data.')
if (failures > 0) { console.log(`❌ ${failures} failure(s)`); process.exit(1) }
