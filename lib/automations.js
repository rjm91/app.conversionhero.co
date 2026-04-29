import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (u, o = {}) => fetch(u, { ...o, cache: 'no-store' }) },
    }
  )
}

function render(template, vars) {
  if (!template) return ''
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const val = key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), vars)
    return val == null ? '' : String(val)
  })
}

async function sendResend({ to, subject, html, fromName }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[automations] RESEND_API_KEY not set, skipping send')
    return { skipped: true }
  }
  const from = `${fromName || 'ConversionHero'} <notifications@send.conversionhero.co>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[automations] resend send failed', res.status, json)
    return { error: json?.message || `HTTP ${res.status}` }
  }
  return { id: json.id }
}

// Fire-and-forget event dispatch. Loads enabled automations matching the
// event's kind, runs each. Never throws — automation failures must not
// block the originating insert.
export async function dispatchEvent(event, payload) {
  try {
    const supabase = db()
    const { data: rules, error } = await supabase
      .from('agency_automations')
      .select('*')
      .eq('enabled', true)

    if (error) {
      console.error('[automations] load rules error', error.message)
      return
    }

    for (const rule of rules || []) {
      if (event === 'lead.created' && rule.kind === 'lead.notification.email') {
        await runLeadEmail(rule, payload)
      }
    }
  } catch (err) {
    console.error('[automations] dispatchEvent error', err)
  }
}

// Same as dispatchEvent but scoped to a specific client_id.
export async function dispatchClientEvent(clientId, event, payload) {
  if (!clientId) return
  try {
    const supabase = db()
    const { data: rules, error } = await supabase
      .from('client_automations')
      .select('*')
      .eq('client_id', clientId)
      .eq('enabled', true)

    if (error) {
      console.error('[automations] load client rules error', error.message)
      return
    }

    for (const rule of rules || []) {
      if (event === 'lead.created' && rule.kind === 'lead.notification.email') {
        await runLeadEmail(rule, payload)
      }
    }
  } catch (err) {
    console.error('[automations] dispatchClientEvent error', err)
  }
}

async function runLeadEmail(rule, lead) {
  const cfg = rule.config || {}
  const recipients = Array.isArray(cfg.recipients) ? cfg.recipients.filter(Boolean) : []
  if (recipients.length === 0) return

  // agency_leads stores tracking inside .meta jsonb; client_lead stores it
  // as flat columns. Merge meta first so explicit columns win.
  const meta = (lead.meta && typeof lead.meta === 'object') ? lead.meta : {}
  const vars = {
    ...meta,
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    email: lead.email || '',
    phone: lead.phone || '',
    company: lead.company || '',
    city: lead.city || '',
    state: lead.state || '',
    zip_code: lead.zip_code || '',
    funnel_name: lead.agency_funnels?.name || '',
    funnel_slug: lead.agency_funnels?.slug || '',
    lp_url: lead.lp_url || meta.lpurl || '',
    utm_source: lead.utm_source || meta.utm_source || '',
    utm_medium: lead.utm_medium || meta.utm_medium || '',
    utm_campaign: lead.utm_campaign || meta.utm_campaign || '',
    utm_content: lead.utm_content || meta.utm_content || '',
    ad_group_id: lead.utm_adgroup || meta.adgroup || meta.ad_group_id || '',
    gclid: lead.gclid || meta.gclid || '',
    wbraid: lead.wbraid || meta.wbraid || '',
    device: lead.device || meta.device || '',
    cache_buster: lead.cache_buster || meta.cacheBuster || '',
  }

  const subject = render(cfg.subject || 'New lead: {{first_name}} {{last_name}}', vars)
  const body = render(
    cfg.body ||
      'A new lead just came in:\n\n' +
        'Name: {{first_name}} {{last_name}}\n' +
        'Email: {{email}}\n' +
        'Phone: {{phone}}\n' +
        'Company: {{company}}\n' +
        'Funnel: {{funnel_name}}\n',
    vars
  )

  await sendResend({
    to: recipients,
    subject,
    html: body,
    fromName: cfg.from_name,
  })
}
