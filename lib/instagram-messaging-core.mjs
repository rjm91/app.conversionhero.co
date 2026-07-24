import crypto from 'node:crypto'

const MAX_MESSAGE_LENGTH = 1000

export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!rawBody || !signatureHeader || !appSecret) return false
  const [algorithm, suppliedHex] = signatureHeader.split('=')
  if (algorithm !== 'sha256' || !/^[a-f0-9]{64}$/i.test(suppliedHex || '')) return false
  const supplied = Buffer.from(suppliedHex, 'hex')
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest()
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
}

export function normalizeMessageText(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, MAX_MESSAGE_LENGTH) : null
}

export function cleanInstagramUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function sanitizeAttachments(items) {
  if (!Array.isArray(items)) return []
  return items.slice(0, 10).map(item => {
    const payload = item?.payload || {}
    return {
      type: String(item?.type || 'file').slice(0, 40),
      url: cleanInstagramUrl(payload.url),
      title: typeof item?.title === 'string' ? item.title.slice(0, 200) : null,
      sticker_id: payload.sticker_id ? String(payload.sticker_id).slice(0, 100) : null,
    }
  }).filter(item => item.url || item.sticker_id || item.title)
}

export function sanitizeReferral(referral) {
  if (!referral || typeof referral !== 'object') return {}
  const ads = referral.ads_context_data && typeof referral.ads_context_data === 'object'
    ? referral.ads_context_data
    : {}
  const cleaned = {
    source: referral.source ? String(referral.source).slice(0, 60) : null,
    type: referral.type ? String(referral.type).slice(0, 60) : null,
    ref: referral.ref ? String(referral.ref).slice(0, 500) : null,
    ad_id: referral.ad_id ? String(referral.ad_id).slice(0, 100) : null,
    campaign_id: referral.campaign_id || ads.campaign_id
      ? String(referral.campaign_id || ads.campaign_id).slice(0, 100)
      : null,
    adset_id: referral.adset_id || ads.adset_id
      ? String(referral.adset_id || ads.adset_id).slice(0, 100)
      : null,
    ads_context_data: Object.keys(ads).length ? {
      ad_title: typeof ads.ad_title === 'string' ? ads.ad_title.slice(0, 300) : null,
      photo_url: cleanInstagramUrl(ads.photo_url),
      video_url: cleanInstagramUrl(ads.video_url),
    } : null,
  }
  return Object.fromEntries(Object.entries(cleaned).filter(([, value]) => value != null))
}

export function sourceFromReferral(referral) {
  const source = String(referral?.source || '').toUpperCase()
  if (referral?.ad_id || source === 'ADS') return { type: 'ads', label: 'Ads' }
  if (source === 'SHOP') return { type: 'shop', label: 'Shop' }
  if (source || referral?.ref) return { type: 'referral', label: 'Referral' }
  return { type: 'organic', label: 'Organic' }
}

export function replyPolicy(conversation, connection, now = new Date()) {
  if (!connection || connection.status !== 'connected') {
    return { can_reply: false, mode: 'disconnected', reason: 'Instagram Messaging is not connected for this client.' }
  }
  const current = now.getTime()
  const standardEnd = conversation?.messaging_window_expires_at
    ? new Date(conversation.messaging_window_expires_at).getTime()
    : 0
  if (standardEnd > current) {
    return {
      can_reply: true,
      mode: 'standard',
      expires_at: conversation.messaging_window_expires_at,
      reason: null,
    }
  }
  const humanEnd = conversation?.human_agent_window_expires_at
    ? new Date(conversation.human_agent_window_expires_at).getTime()
    : 0
  if (connection.human_agent_enabled && humanEnd > current) {
    return {
      can_reply: true,
      mode: 'human_agent',
      expires_at: conversation.human_agent_window_expires_at,
      reason: null,
    }
  }
  return {
    can_reply: false,
    mode: 'expired',
    expires_at: conversation?.human_agent_window_expires_at || conversation?.messaging_window_expires_at || null,
    reason: connection.human_agent_enabled
      ? 'Meta’s 7-day human-agent reply window has expired. The customer must message again before you can reply.'
      : 'Meta’s 24-hour reply window has expired. The customer must message again before you can reply.',
  }
}

