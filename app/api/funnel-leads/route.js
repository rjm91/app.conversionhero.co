import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { dispatchClientEvent } from '../../../lib/automations.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Map survey step IDs → client_lead_meta meta_key (snake_case)
const META_KEYS = {
  intent: 'intent',
  systemType: 'system_type',
  systemAge: 'system_age',
  // add new ones here as new services come online
}

// Fields that live on client_lead directly (core contact/UTM fields)
const CORE_FIELDS = new Set(['zip', 'fullName', 'email', 'phone'])

function genUUID() {
  return crypto.randomUUID()
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const { action, id, field, value, funnelId, clientId, meta = {}, status } = body
  const db = admin()

  // ─── CREATE: insert stub client_lead row on first interaction ───────────────
  if (action === 'create') {
    if (!clientId) return NextResponse.json({ success: false, error: 'clientId required' }, { status: 400 })

    const leadId = genUUID()
    const row = {
      lead_id: leadId,
      client_id: clientId,
      lead_status: 'in_progress',
      created_at: new Date().toISOString(),
      lp_url: meta.lpurl || null,
      utm_source: meta.utm_source || null,
      utm_medium: meta.utm_medium || null,
      utm_campaign: meta.utm_campaign || null,
      utm_content: meta.utm_content || null,
      utm_adgroup: meta.adgroup || null,
      gclid: meta.gclid || null,
      wbraid: meta.wbraid || null,
      device: meta.device || null,
      cache_buster: meta.cacheBuster || null,
    }

    const { error } = await db.from('client_lead').insert(row)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // Write the first field if supplied (survey answer → meta; contact → lead)
    if (field && value) {
      await writeField(db, leadId, field, value)
    }

    return NextResponse.json({ success: true, id: leadId })
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────
  if (action === 'update') {
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

    if (field) {
      const { error } = await writeField(db, id, field, value)
      if (error) return NextResponse.json({ success: false, error }, { status: 500 })
    }

    // On final submission: look up city/state from ZIP, mark complete, bump funnel counter
    if (status === 'new_lead') {
      const { data: lead } = await db.from('client_lead').select('zip_code').eq('lead_id', id).single()
      const loc = await lookupZip(lead?.zip_code)
      await db.from('client_lead').update({
        lead_status: 'New Lead',
        ...(loc.city ? { city: loc.city } : {}),
        ...(loc.state ? { state: loc.state } : {}),
      }).eq('lead_id', id)

      if (funnelId) {
        const { data } = await db.from('client_funnels').select('leads').eq('id', funnelId).single()
        if (data) await db.from('client_funnels').update({ leads: (data.leads || 0) + 1 }).eq('id', funnelId)
      }

      // Fire client-level automations (email notifications, etc).
      const { data: full } = await db
        .from('client_lead')
        .select('client_id, first_name, last_name, email, phone, city, state, zip_code, lp_url, utm_source, utm_medium, utm_campaign, utm_content, utm_adgroup, gclid, wbraid, device, cache_buster')
        .eq('lead_id', id)
        .single()
      let funnelMeta = null
      if (funnelId) {
        const { data: f } = await db.from('client_funnels').select('name, slug').eq('id', funnelId).single()
        funnelMeta = f || null
      }
      if (full?.client_id) {
        dispatchClientEvent(full.client_id, 'lead.created', {
          ...full,
          company: '',
          agency_funnels: funnelMeta,
        }).catch(err => console.error('[funnel-leads] dispatchClientEvent error', err))
      }
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: false, error: 'unknown action' }, { status: 400 })
}

async function lookupZip(zip) {
  if (!zip || !/^\d{5}$/.test(String(zip).trim())) return {}
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, { cache: 'no-store' })
    if (!res.ok) return {}
    const data = await res.json()
    const place = data?.places?.[0]
    return {
      city: place?.['place name'] || '',
      state: place?.['state abbreviation'] || place?.state || '',
    }
  } catch {
    return {}
  }
}

async function writeField(db, leadId, field, value) {
  // Core fields → client_lead columns
  if (CORE_FIELDS.has(field)) {
    const patch = {}
    if (field === 'fullName') {
      const [first, ...rest] = String(value).trim().split(/\s+/)
      patch.first_name = first || ''
      patch.last_name = rest.join(' ')
    } else if (field === 'zip') {
      patch.zip_code = value
    } else {
      patch[field] = value // email, phone
    }
    const { error } = await db.from('client_lead').update(patch).eq('lead_id', leadId)
    return { error: error?.message }
  }

  // Survey answers → client_lead_meta (upsert on lead_id + meta_key)
  const metaKey = META_KEYS[field] || field.replace(/([A-Z])/g, '_$1').toLowerCase()
  // Try update first, insert if none
  const { data: existing } = await db
    .from('client_lead_meta')
    .select('id')
    .eq('lead_id', leadId).eq('meta_key', metaKey).limit(1)

  if (existing && existing.length) {
    const { error } = await db.from('client_lead_meta')
      .update({ meta_value: value })
      .eq('id', existing[0].id)
    return { error: error?.message }
  }
  const { error } = await db.from('client_lead_meta')
    .insert({ lead_id: leadId, meta_key: metaKey, meta_value: value })
  return { error: error?.message }
}
