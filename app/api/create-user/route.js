import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const LOGIN_URL = 'https://app.conversionhero.co/login'

// Sends a branded welcome email with login details via Resend.
async function sendWelcomeEmail({ email, full_name, password }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not set')
  const firstName = full_name ? String(full_name).trim().split(' ')[0] : 'there'
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:8px;color:#1f2937">
    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:24px 28px">
      <h1 style="margin:0;color:#fff;font-size:20px">Welcome to ConversionHero 🎉</h1>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px">
      <p style="font-size:15px;margin:0 0 16px">Hi ${firstName},</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px">An account has been created for you on the ConversionHero dashboard. Here are your login details:</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin:0 0 22px;font-size:14px">
        <p style="margin:0 0 8px"><strong>Email:</strong> ${email}</p>
        <p style="margin:0"><strong>Temporary password:</strong> <code style="background:#eef2ff;padding:2px 6px;border-radius:5px">${password}</code></p>
      </div>
      <a href="${LOGIN_URL}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:9px">Log in to your dashboard →</a>
      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:22px 0 0">For your security, please change your password after your first login (Account → Settings).</p>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:18px 0 0">ConversionHero · This is an automated message.</p>
  </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'ConversionHero <notifications@send.conversionhero.co>',
      to: email,
      subject: 'Your ConversionHero account is ready 🎉',
      html,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || `Email failed (${res.status})`)
  return json
}

export async function POST(request) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { email, password, full_name, role, client_id } = await request.json()

    if (!email || !password || !role || !client_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role, client_id },
    })

    if (authError) {
      console.error('[create-user] Auth error:', authError)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Insert profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name: full_name || null,
        role,
        client_id,
      })

    if (profileError) {
      // Rollback auth user if profile insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // Send the welcome email — don't fail user creation if the email errors.
    let welcomeEmailSent = false
    let welcomeEmailError = null
    try {
      await sendWelcomeEmail({ email, full_name, password })
      welcomeEmailSent = true
    } catch (e) {
      welcomeEmailError = e.message
      console.error('[create-user] welcome email failed:', e.message)
    }

    return NextResponse.json({ success: true, user: authData.user, welcomeEmailSent, welcomeEmailError })
  } catch (err) {
    console.error('[create-user] Exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
