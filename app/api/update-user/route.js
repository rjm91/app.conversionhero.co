import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const { userId, full_name, role } = await request.json()
    if (!userId || !role) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

    // Update profiles table
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ full_name: full_name || null, role })
      .eq('id', userId)

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

    // Sync role to auth user_metadata so session reflects new role
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: full_name || null, role },
    })

    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
