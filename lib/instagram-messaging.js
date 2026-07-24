import 'server-only'

import { createClient } from '@supabase/supabase-js'
import {
  cleanInstagramUrl,
  normalizeMessageText,
  replyPolicy,
  sanitizeAttachments,
  sanitizeReferral,
  sourceFromReferral,
  verifyMetaSignature,
} from './instagram-messaging-core.mjs'

export {
  normalizeMessageText,
  replyPolicy,
  sanitizeAttachments,
  sanitizeReferral,
  sourceFromReferral,
  verifyMetaSignature,
}

const API_VERSION = process.env.META_INSTAGRAM_API_VERSION || 'v24.0'
const GRAPH_ROOT = process.env.META_INSTAGRAM_GRAPH_URL || 'https://graph.instagram.com'

export function instagramAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export function hasInstagramConversations(settings) {
  return settings?.instagram_conversations_enabled === true
}

export async function getInstagramConnection(db, clientId, fields = '*') {
  const { data, error } = await db
    .from('instagram_connections')
    .select(fields)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function fetchProfile(igsid, connection) {
  const params = new URLSearchParams({ fields: 'name,username,profile_pic' })
  const res = await fetch(`${GRAPH_ROOT}/${API_VERSION}/${encodeURIComponent(igsid)}?${params}`, {
    headers: { Authorization: `Bearer ${connection.access_token}` },
    cache: 'no-store',
  })
  if (!res.ok) return {}
  const json = await res.json()
  return {
    username: typeof json.username === 'string' ? json.username.slice(0, 100) : null,
    displayName: typeof json.name === 'string' ? json.name.slice(0, 200) : null,
    profilePictureUrl: cleanInstagramUrl(json.profile_pic),
  }
}

function webhookTimestamp(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return new Date().toISOString()
  const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

async function markSeenEvent(db, connection, event) {
  const igsid = event?.sender?.id === connection.instagram_account_id
    ? event?.recipient?.id
    : event?.sender?.id
  if (!igsid) return
  const { data: conversation } = await db
    .from('instagram_conversations')
    .select('id')
    .eq('client_id', connection.client_id)
    .eq('instagram_account_id', connection.instagram_account_id)
    .eq('instagram_scoped_user_id', String(igsid))
    .maybeSingle()
  if (!conversation) return
  await db.from('instagram_messages')
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('client_id', connection.client_id)
    .eq('conversation_id', conversation.id)
    .eq('direction', 'outbound')
    .lte('sent_at', webhookTimestamp(event.timestamp))
}

export async function ingestInstagramEvent(db, connection, event) {
  if (event?.read) {
    await markSeenEvent(db, connection, event)
    return { handled: true, type: 'read' }
  }

  const message = event?.message
  const messageId = message?.mid ? String(message.mid) : null
  const senderId = event?.sender?.id ? String(event.sender.id) : null
  const recipientId = event?.recipient?.id ? String(event.recipient.id) : null
  if (!messageId || !senderId || !recipientId) return { handled: false }

  if (message?.is_deleted) {
    await db.from('instagram_messages')
      .update({ status: 'deleted', message_text: null, attachments: [], updated_at: new Date().toISOString() })
      .eq('client_id', connection.client_id)
      .eq('instagram_message_id', messageId)
    return { handled: true, type: 'deleted' }
  }

  const outbound = senderId === String(connection.instagram_account_id)
  const igsid = outbound ? recipientId : senderId
  const referral = sanitizeReferral(message.referral || event.referral)
  const source = sourceFromReferral(referral)
  const sentAt = webhookTimestamp(event.timestamp)

  const { data: existing } = await db
    .from('instagram_conversations')
    .select('id, username, display_name, profile_picture_url')
    .eq('client_id', connection.client_id)
    .eq('instagram_account_id', connection.instagram_account_id)
    .eq('instagram_scoped_user_id', igsid)
    .maybeSingle()
  let profile = {}
  if (!existing?.username && !existing?.display_name) {
    profile = await fetchProfile(igsid, connection).catch(() => ({}))
  }

  const attachments = sanitizeAttachments(message.attachments)
  const status = message.is_unsupported ? 'unsupported' : (outbound ? 'sent' : 'received')
  const { data, error } = await db.rpc('ingest_instagram_message', {
    p_client_id: connection.client_id,
    p_instagram_account_id: String(connection.instagram_account_id),
    p_igsid: igsid,
    p_thread_id: event?.conversation?.id ? String(event.conversation.id) : null,
    p_username: profile.username || null,
    p_display_name: profile.displayName || null,
    p_profile_picture_url: profile.profilePictureUrl || null,
    p_message_id: messageId,
    p_sender_id: senderId,
    p_recipient_id: recipientId,
    p_direction: outbound ? 'outbound' : 'inbound',
    p_message_text: normalizeMessageText(message.text),
    p_attachments: attachments,
    p_sent_at: sentAt,
    p_status: status,
    p_reply_to_message_id: message.reply_to?.mid ? String(message.reply_to.mid) : null,
    p_source_type: Object.keys(referral).length ? source.type : null,
    p_source_label: Object.keys(referral).length ? source.label : null,
    p_source_ref: referral.ref || null,
    p_campaign_id: referral.campaign_id || null,
    p_adset_id: referral.adset_id || null,
    p_ad_id: referral.ad_id || null,
    p_native_referral: referral,
  })
  if (error) throw error
  return {
    handled: true,
    type: outbound ? 'outbound' : 'inbound',
    inserted: data?.[0]?.message_inserted === true,
  }
}

export async function ingestInstagramWebhook(payload) {
  if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) {
    return { entries: 0, events: 0, handled: 0 }
  }
  const db = instagramAdmin()
  let events = 0
  let handled = 0
  for (const entry of payload.entry) {
    const accountId = entry?.id ? String(entry.id) : null
    if (!accountId) continue
    const { data: connection } = await db
      .from('instagram_connections')
      .select('*')
      .eq('instagram_account_id', accountId)
      .eq('status', 'connected')
      .maybeSingle()
    if (!connection) continue
    for (const event of (entry.messaging || [])) {
      events += 1
      const result = await ingestInstagramEvent(db, connection, event)
      if (result.handled) handled += 1
    }
  }
  return { entries: payload.entry.length, events, handled }
}

function safeMetaFailure(status, json) {
  const code = json?.error?.code ? String(json.error.code) : null
  const subcode = json?.error?.error_subcode ? String(json.error.error_subcode) : null
  const expired = status === 400 && [code, subcode].some(value => ['10', '200', '2534014'].includes(value))
  return {
    status: expired ? 409 : (status >= 500 ? 502 : 422),
    code: code || 'meta_send_failed',
    message: expired
      ? 'Meta rejected this reply because the permitted messaging window or permission is unavailable.'
      : 'Instagram could not send this reply. The draft was kept; please try again.',
  }
}

export async function sendInstagramReply(connection, recipientId, text, mode = 'standard') {
  const normalized = normalizeMessageText(text)
  if (!normalized) return { ok: false, status: 400, code: 'empty_message', message: 'Enter a message before sending.' }

  const body = {
    recipient: { id: String(recipientId) },
    message: { text: normalized },
  }
  if (mode === 'human_agent') body.tag = 'HUMAN_AGENT'

  let res
  try {
    res = await fetch(`${GRAPH_ROOT}/${API_VERSION}/${encodeURIComponent(connection.instagram_account_id)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, status: 502, code: 'meta_unreachable', message: 'Instagram is temporarily unreachable. The draft was kept; please try again.' }
  }

  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error || !json.message_id) return { ok: false, ...safeMetaFailure(res.status, json) }
  return {
    ok: true,
    messageId: String(json.message_id),
    recipientId: String(json.recipient_id || recipientId),
    text: normalized,
  }
}
