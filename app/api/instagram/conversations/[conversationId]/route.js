export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { gateInstagramClient } from '../../../../../lib/instagram-api-auth'
import { getInstagramConnection, replyPolicy } from '../../../../../lib/instagram-messaging'

const CONVERSATION_FIELDS = [
  'id', 'instagram_scoped_user_id', 'thread_id', 'username', 'display_name',
  'profile_picture_url', 'first_message_at', 'last_message_at', 'last_inbound_at',
  'messaging_window_expires_at', 'human_agent_window_expires_at',
  'last_message_preview', 'last_message_direction', 'unread_count',
  'source_type', 'source_label', 'source_ref', 'meta_campaign_id',
  'meta_adset_id', 'meta_ad_id', 'native_referral',
].join(',')

const MESSAGE_FIELDS = [
  'id', 'instagram_message_id', 'sender_id', 'recipient_id', 'direction',
  'message_text', 'attachments', 'sent_at', 'is_read', 'status',
  'reply_to_message_id', 'source_type', 'source_ref', 'meta_campaign_id',
  'meta_adset_id', 'meta_ad_id', 'native_referral',
].join(',')

async function findConversation(db, clientId, conversationId) {
  return db
    .from('instagram_conversations')
    .select(CONVERSATION_FIELDS)
    .eq('client_id', clientId)
    .eq('id', conversationId)
    .maybeSingle()
}

export async function GET(request, { params }) {
  const clientId = request.nextUrl.searchParams.get('client_id')
  const gate = await gateInstagramClient(clientId)
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const [{ data: conversation, error: conversationError }, connection] = await Promise.all([
      findConversation(gate.db, clientId, params.conversationId),
      getInstagramConnection(gate.db, clientId),
    ])
    if (conversationError) throw conversationError
    if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })

    const { data: messages, error } = await gate.db
      .from('instagram_messages')
      .select(MESSAGE_FIELDS)
      .eq('client_id', clientId)
      .eq('conversation_id', conversation.id)
      .order('sent_at', { ascending: false })
      .limit(500)
    if (error) throw error

    return NextResponse.json({
      conversation: { ...conversation, reply_policy: replyPolicy(conversation, connection) },
      messages: (messages || []).reverse(),
    })
  } catch {
    return NextResponse.json({ error: 'Could not load this Instagram conversation.' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  let body
  try { body = await request.json() } catch { body = {} }
  const clientId = body.client_id
  const gate = await gateInstagramClient(clientId)
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { data: conversation, error: findError } = await findConversation(gate.db, clientId, params.conversationId)
  if (findError) return NextResponse.json({ error: 'Could not update this conversation.' }, { status: 500 })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })

  const now = new Date().toISOString()
  const [{ error: conversationError }, { error: messagesError }] = await Promise.all([
    gate.db.from('instagram_conversations')
      .update({ unread_count: 0, updated_at: now })
      .eq('client_id', clientId)
      .eq('id', conversation.id),
    gate.db.from('instagram_messages')
      .update({ is_read: true, updated_at: now })
      .eq('client_id', clientId)
      .eq('conversation_id', conversation.id)
      .eq('direction', 'inbound'),
  ])
  if (conversationError || messagesError) {
    return NextResponse.json({ error: 'Could not mark this conversation as read.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
