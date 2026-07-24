export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { gateInstagramClient } from '../../../../lib/instagram-api-auth'
import {
  getInstagramConnection,
  normalizeMessageText,
  replyPolicy,
  sendInstagramReply,
} from '../../../../lib/instagram-messaging'

export async function POST(request) {
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const clientId = body.client_id
  const conversationId = body.conversation_id
  const text = normalizeMessageText(body.text)
  const gate = await gateInstagramClient(clientId)
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (!conversationId || !text) {
    return NextResponse.json({ error: 'A conversation and message are required.' }, { status: 400 })
  }

  try {
    const [{ data: conversation, error: conversationError }, connection] = await Promise.all([
      gate.db.from('instagram_conversations')
        .select('id, instagram_scoped_user_id, messaging_window_expires_at, human_agent_window_expires_at')
        .eq('client_id', clientId)
        .eq('id', conversationId)
        .maybeSingle(),
      getInstagramConnection(gate.db, clientId),
    ])
    if (conversationError) throw conversationError
    if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })

    const policy = replyPolicy(conversation, connection)
    if (!policy.can_reply) {
      return NextResponse.json({ error: policy.reason, reply_policy: policy }, { status: 409 })
    }

    const result = await sendInstagramReply(
      connection,
      conversation.instagram_scoped_user_id,
      text,
      policy.mode
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code }, { status: result.status })
    }

    const sentAt = new Date().toISOString()
    const { data, error } = await gate.db.rpc('ingest_instagram_message', {
      p_client_id: clientId,
      p_instagram_account_id: String(connection.instagram_account_id),
      p_igsid: String(conversation.instagram_scoped_user_id),
      p_thread_id: null,
      p_username: null,
      p_display_name: null,
      p_profile_picture_url: null,
      p_message_id: result.messageId,
      p_sender_id: String(connection.instagram_account_id),
      p_recipient_id: String(conversation.instagram_scoped_user_id),
      p_direction: 'outbound',
      p_message_text: result.text,
      p_attachments: [],
      p_sent_at: sentAt,
      p_status: 'sent',
      p_reply_to_message_id: null,
      p_source_type: null,
      p_source_label: null,
      p_source_ref: null,
      p_campaign_id: null,
      p_adset_id: null,
      p_ad_id: null,
      p_native_referral: {},
    })
    if (error) {
      // Meta accepted the message; report that truth even if local persistence
      // needs webhook-echo recovery. Do not encourage a duplicate retry.
      return NextResponse.json({
        sent: true,
        persisted: false,
        warning: 'Instagram sent the reply, but the local inbox has not confirmed it yet.',
        message: {
          instagram_message_id: result.messageId,
          direction: 'outbound',
          message_text: result.text,
          attachments: [],
          sent_at: sentAt,
          status: 'sent',
          is_read: false,
        },
      }, { status: 202 })
    }

    return NextResponse.json({
      sent: true,
      persisted: data?.[0]?.message_inserted !== false,
      message: {
        instagram_message_id: result.messageId,
        direction: 'outbound',
        message_text: result.text,
        attachments: [],
        sent_at: sentAt,
        status: 'sent',
        is_read: false,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Could not send this Instagram reply. Your draft was not cleared.' }, { status: 500 })
  }
}

