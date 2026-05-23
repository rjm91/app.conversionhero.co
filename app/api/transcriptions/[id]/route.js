import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// GET — single transcription by ID
export async function GET(req, { params }) {
  const { id } = await params
  const { data, error } = await supabase
    .from('agency_transcriptions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE — remove a transcription
export async function DELETE(req, { params }) {
  const { id } = await params
  const { error } = await supabase
    .from('agency_transcriptions')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
