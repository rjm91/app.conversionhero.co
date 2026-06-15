import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendTemplateEmail, LOGIN_URL } from '../../../lib/email-templates'

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

    // Send the welcome email from the editable template — best-effort.
    let welcomeEmailSent = false
    let welcomeEmailError = null
    try {
      await sendTemplateEmail({
        key: 'welcome_user',
        to: email,
        vars: { first_name: full_name ? String(full_name).trim().split(' ')[0] : 'there', email, password, login_url: LOGIN_URL },
      })
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
