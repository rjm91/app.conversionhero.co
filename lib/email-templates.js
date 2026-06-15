import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const FROM = 'ConversionHero <notifications@send.conversionhero.co>'
export const LOGIN_URL = 'https://app.conversionhero.co/login'

// Registry of system emails: built-in default content + the variables each
// supports + sample values used for the preview. A row in email_templates
// overrides subject/html for that key.
export const EMAIL_TEMPLATES = {
  welcome_user: {
    key: 'welcome_user',
    name: 'Welcome — New User',
    description: 'Sent automatically when a new user account is created.',
    variables: ['first_name', 'email', 'password', 'login_url'],
    sample: { first_name: 'Jane', email: 'jane@example.com', password: 'Temp1234!', login_url: LOGIN_URL },
    subject: 'Your ConversionHero account is ready 🎉',
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:8px;color:#1f2937">
  <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:24px 28px">
    <h1 style="margin:0;color:#fff;font-size:20px">Welcome to ConversionHero 🎉</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px">
    <p style="font-size:15px;margin:0 0 16px">Hi {{first_name}},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">An account has been created for you on the ConversionHero dashboard. Here are your login details:</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin:0 0 22px;font-size:14px">
      <p style="margin:0 0 8px"><strong>Email:</strong> {{email}}</p>
      <p style="margin:0"><strong>Temporary password:</strong> <code style="background:#eef2ff;padding:2px 6px;border-radius:5px">{{password}}</code></p>
    </div>
    <a href="{{login_url}}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:9px">Log in to your dashboard →</a>
    <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:22px 0 0">For your security, please change your password after your first login (Account → Settings).</p>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin:18px 0 0">ConversionHero · This is an automated message.</p>
</div>`,
  },
}

// {{variable}} substitution (mirrors lib/automations.js).
export function render(str, vars = {}) {
  return String(str || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

// A template's current content = built-in default with any DB override applied.
export async function getTemplate(key) {
  const def = EMAIL_TEMPLATES[key]
  if (!def) return null
  const { data } = await admin().from('email_templates').select('subject, html').eq('key', key).maybeSingle()
  return { ...def, subject: data?.subject ?? def.subject, html: data?.html ?? def.html }
}

// All known templates merged with overrides — powers the management UI.
export async function listTemplates() {
  const { data } = await admin().from('email_templates').select('key, subject, html, updated_at')
  const overrides = Object.fromEntries((data || []).map(r => [r.key, r]))
  return Object.values(EMAIL_TEMPLATES).map(def => ({
    key: def.key,
    name: def.name,
    description: def.description,
    variables: def.variables,
    sample: def.sample,
    subject: overrides[def.key]?.subject ?? def.subject,
    html: overrides[def.key]?.html ?? def.html,
    updated_at: overrides[def.key]?.updated_at ?? null,
    customized: !!overrides[def.key],
  }))
}

export async function saveTemplate(key, { subject, html }) {
  const def = EMAIL_TEMPLATES[key]
  if (!def) throw new Error('Unknown template: ' + key)
  const { error } = await admin().from('email_templates').upsert(
    { key, name: def.name, subject, html, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  if (error) throw new Error(error.message)
}

export async function renderTemplate(key, vars) {
  const t = await getTemplate(key)
  if (!t) throw new Error('Unknown template: ' + key)
  return { subject: render(t.subject, vars), html: render(t.html, vars) }
}

// Render + send a system email via Resend.
export async function sendTemplateEmail({ key, to, vars }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not set')
  const { subject, html } = await renderTemplate(key, vars)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || `Email failed (${res.status})`)
  return json
}
