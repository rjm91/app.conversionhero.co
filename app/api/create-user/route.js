import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    console.log('[create-user] URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('[create-user] Key set:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

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

    return NextResponse.json({ success: true, user: authData.user })
  } catch (err) {
    console.error('[create-user] Exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
