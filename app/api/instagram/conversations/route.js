export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { gateInstagramClient, publicConnection } from '../../../../lib/instagram-api-auth'
import { getInstagramConnection, replyPolicy } from '../../../../lib/instagram-messaging'

const LIST_FIELDS = [
  'id', 'instagram_scoped_user_id', 'thread_id', 'username', 'display_name',
  'profile_picture_url', 'first_message_at', 'last_message_at', 'last_inbound_at',
  'messaging_window_expires_at', 'human_agent_window_expires_at',
  'last_message_preview', 'last_message_direction', 'unread_count',
  'source_type', 'source_label', 'source_ref', 'meta_campaign_id',
  'meta_adset_id', 'meta_ad_id', 'native_referral',
].join(',')

function escapedLike(value) {
  return value.replace(/[,%_()]/g, char => `\\${char}`)
}

export async function GET(request) {
  const clientId = request.nextUrl.searchParams.get('client_id')
  const gate = await gateInstagramClient(clientId)
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const connection = await getInstagramConnection(gate.db, clientId)
    if (!connection || connection.status !== 'connected') {
      return NextResponse.json({ connection: publicConnection(connection), conversations: [] })
    }

    const rawSearch = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100)
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit')) || 100, 1), 200)
    let query = gate.db
      .from('instagram_conversations')
      .select(LIST_FIELDS)
      .eq('client_id', clientId)
      .order('last_message_at', { ascending: false })
      .limit(limit)
    if (rawSearch) {
      const search = escapedLike(rawSearch)
      query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%,last_message_preview.ilike.%${search}%`)
    }
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({
      connection: publicConnection(connection),
      conversations: (data || []).map(row => ({
        ...row,
        reply_policy: replyPolicy(row, connection),
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Could not load Instagram conversations.' }, { status: 500 })
  }
}

